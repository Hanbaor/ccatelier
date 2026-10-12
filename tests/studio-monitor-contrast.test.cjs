const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Defaults to a normal repository test. Environment overrides let reviewers run
// a staged candidate without touching frozen source or rebuilding the site.
const root = path.resolve(process.env.CC_CONTRAST_ROOT || path.join(__dirname, '..'));
const candidate = process.env.CC_STUDIO_CONTRAST_CANDIDATE;
const CSSOM = require(require.resolve('rrweb-cssom', { paths: [root] }));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const studio = candidate ? fs.readFileSync(path.resolve(candidate), 'utf8') : read('source/atelier/css/studio.css');
const immersive = read('source/atelier/css/immersive.css');
const suffixSelector = '.studio-monitor-title strong small';

// Intentionally narrow static declaration inspection, not computed browser CSS.
function declarations(css, selector, viewport = 1280) {
  const result = {};
  function visit(rules) {
    for (const rule of rules) {
      if (rule.media) {
        const maxWidth = rule.media.mediaText.match(/^\(max-width:\s*(\d+)px\)$/);
        if (maxWidth && viewport <= Number(maxWidth[1])) visit(rule.cssRules);
      } else if (rule.selectorText === selector && rule.style) {
        for (let i = 0; i < rule.style.length; i++) {
          const property = rule.style[i];
          result[property] = rule.style.getPropertyValue(property).trim();
        }
      }
    }
  }
  visit(CSSOM.parse(css).cssRules);
  return result;
}

function channels(hex) {
  assert.match(hex, /^#[0-9a-f]{6}$/i, 'Audit expects an opaque sRGB color');
  return [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
}

function luminance(hex) {
  return channels(hex)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
  return (values[1] + 0.05) / (values[0] + 0.05);
}

const themes = {
  light: 'body.nijika.light,body.nijika.light[data-section="atelier"]',
  dark: 'body.nijika:not(.light),body.nijika[data-section="atelier"]:not(.light)',
};

test('Studio suffix needs normal-text contrast at both its desktop and mobile sizes', () => {
  // WCAG large normal text starts at 24 CSS px (18pt). The inherited 500 weight
  // is not bold, so neither 23px desktop nor 16px mobile qualifies for 3:1.
  assert.equal(declarations(studio, suffixSelector, 1280)['font-size'], '23px');
  assert.equal(declarations(studio, suffixSelector, 390)['font-size'], '16px');
  assert.match(declarations(studio, '.studio-monitor-title strong').font, /^500\s/);
});

test('Studio fixed-dark monitor suffix passes 4.5:1 in each theme without changing gold hierarchy', () => {
  const monitor = declarations(studio, '.studio-monitor');
  const suffix = declarations(studio, suffixSelector);
  const counter = declarations(studio, '.studio-monitor-title strong');
  const caption = declarations(studio, '.studio-monitor-title>span:last-child');
  assert.equal(monitor.background, '#0d1112');
  assert.equal(counter.color, '#efca81', 'Keep the existing main gold counter');
  assert.equal(caption.color, '#9b937e', 'Keep the existing warm-gray caption');
  assert.equal(suffix.color, caption.color, 'Reuse the local monitor caption color');
  assert.ok(luminance(suffix.color) < luminance(counter.color));
  for (const theme of Object.keys(themes)) {
    assert.ok(contrast(suffix.color, monitor.background) >= 4.5, `${theme} suffix on fixed monitor fill`);
  }
  // The black inset shadow only darkens this fill. This is a fill reference,
  // not an invented pixel-sampled ratio for a gradient/image background.
  assert.match(monitor['box-shadow'], /^inset 0 2px 20px #0008$/);
  assert.ok(contrast('#6b6856', '#0d1112') < 4.5, 'Regression fixture must expose old failure');
  assert.ok(contrast('#6b6856', '#000000') < 4.5, 'Shadow cannot rescue the old foreground');
});

test('Actual semantic text tokens retain 4.5:1 on solid theme page and surface fills', () => {
  for (const [theme, selector] of Object.entries(themes)) {
    const palette = declarations(immersive, selector);
    for (const foreground of ['--ink', '--text', '--muted', '--yellow']) {
      for (const background of ['--bg', '--surface']) {
        assert.ok(
          contrast(palette[foreground], palette[background]) >= 4.5,
          `${theme}: ${foreground} against ${background} must remain readable`,
        );
      }
    }
  }
});

test('Generated Studio loads the audited theme after its route CSS, with no later monitor color override', () => {
  const html = read('public/studio/index.html');
  const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match => match[1]);
  const studioIndex = links.indexOf('/atelier/css/studio.css');
  const themeIndex = links.indexOf('/atelier/css/delivery-immersive.css');
  assert.ok(studioIndex >= 0 && themeIndex > studioIndex);
  const generatedTheme = read('public/atelier/css/delivery-immersive.css');
  for (const selector of Object.values(themes)) {
    const sourcePalette = declarations(immersive, selector);
    const generatedPalette = declarations(generatedTheme, selector);
    for (const name of ['--bg', '--surface', '--ink', '--text', '--muted', '--yellow']) {
      assert.equal(generatedPalette[name], sourcePalette[name], `${name}: generated theme must match source`);
    }
  }
  for (const href of links.slice(studioIndex + 1)) {
    const css = read(`public/${href.replace(/^\//, '')}`);
    // Conservative tripwire: broadened selectors targeting the fixed monitor
    // should trigger review rather than letting this static test assume a fill.
    assert.doesNotMatch(css, /[^{}]*studio-monitor[^{}]*\{[^{}]*(?:color|background|opacity)\s*:/);
  }
  if (!candidate) {
    const generated = read('public/atelier/css/studio.css');
    assert.equal(declarations(generated, suffixSelector).color, declarations(studio, suffixSelector).color);
  }
});
