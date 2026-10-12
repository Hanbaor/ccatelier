'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const sharp = require('sharp'), { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('source/atelier/css/personal-home.css');
const cover = read('custom/redefine/nijika/cover.ejs');
const scenes = [
  { name: 'notes', selector: '.home-note-art', file: 'v2/notes', position: 'center top',
    desktop: 1.72, phone: 1.65, protectedTop: 15, protectedBottom: 870 },
  { name: 'rehearsal', selector: '.home-afterhours-art', file: 'v5/practice-room', position: 'center 20%',
    desktop: 1.8, phone: 1.7, protectedTop: 60, protectedBottom: 805 }
];

// Read actual declarations across the width cascade. This is a source/layout
// contract, not a browser render. Subject landmarks were reviewed in full images:
// notes: ahoge through notebook; rehearsal: ahoge, hands, sticks and main drum faces.
function stylesAt(width, selector, hover = false) {
  const dom = new JSDOM(`<style>${css}</style>`), result = new Map();
  function visit(rules) {
    for (const rule of rules) {
      if (rule.type === 4) {
        if (/prefers-|print/.test(rule.conditionText) || (/hover/.test(rule.conditionText) && !hover)) continue;
        const max = rule.conditionText.match(/max-width:\s*(\d+)px/);
        const min = rule.conditionText.match(/min-width:\s*(\d+)px/);
        if ((!max || width <= +max[1]) && (!min || width >= +min[1])) visit(rule.cssRules);
      } else if (rule.selectorText?.split(',').map(value => value.trim()).includes(selector)) {
        for (let index = 0; index < rule.style.length; index++) {
          const name = rule.style[index];
          result.set(name, rule.style.getPropertyValue(name));
        }
      }
    }
  }
  try { visit(dom.window.document.styleSheets[0].cssRules); return result; }
  finally { dom.window.close(); }
}

for (const scene of scenes) test(`${scene.name} homepage crop protects subject landmarks at desktop and phone ratios`, async () => {
  assert.ok(cover.includes(`atelier/images/${scene.file}.webp`), 'contract follows the live cover asset');
  for (const suffix of ['', '-960']) {
    const metadata = await sharp(path.join(root, `source/atelier/images/${scene.file}${suffix}.webp`)).metadata();
    assert.deepEqual([metadata.width, metadata.height], suffix ? [960, 640] : [1536, 1024]);
    assert.equal(metadata.format, 'webp');
    const candidateScale = metadata.width / 1536;
    for (const width of [320, 390, 760, 761, 1024, 1440]) {
      const container = stylesAt(width, `.personal-home ${scene.selector}`);
      const image = stylesAt(width, `.personal-home ${scene.selector} img`);
      assert.equal(image.get('object-fit'), 'cover');
      assert.equal(image.get('object-position'), scene.position);
      assert.equal(image.get('transform-origin'), 'center 20%');
      const ratio = Number(container.get('aspect-ratio'));
      assert.equal(ratio, width <= 760 ? scene.phone : scene.desktop);
      const visibleHeight = metadata.width / ratio;
      const positionY = scene.position.endsWith('top') ? 0 : parseFloat(scene.position.split(' ')[1]) / 100;
      const top = (metadata.height - visibleHeight) * positionY;
      assert.ok(top <= scene.protectedTop * candidateScale, `${width}px keeps ahoge and headroom`);
      assert.ok(top + visibleHeight >= scene.protectedBottom * candidateScale, `${width}px keeps hands and working surface`);
      // Derive hover geometry from actual CSS, not assumed zoom constants.
      const hover = stylesAt(width, `.personal-home ${scene.selector}:hover img`, true);
      const hoverScale = Number(hover.get('transform').match(/^scale\(([^)]+)\)$/)[1]);
      const originY = parseFloat(image.get('transform-origin').split(' ')[1]) / 100;
      const hoverTop = top + visibleHeight * originY * (1 - 1 / hoverScale);
      const hoverBottom = hoverTop + visibleHeight / hoverScale;
      assert.ok(hoverTop <= scene.protectedTop * candidateScale, `${width}px hover keeps ahoge`);
      assert.ok(hoverBottom >= scene.protectedBottom * candidateScale, `${width}px hover keeps hands and working surface`);
    }
  }
});

test('existing subtle hover zoom and reduced-motion escape stay in place', () => {
  assert.equal(stylesAt(1440, '.personal-home .home-note-art:hover img', true).get('transform'), 'scale(1.025)');
  assert.equal(stylesAt(1440, '.personal-home .home-project-art:hover img', true).get('transform'), 'scale(1.035)');
  assert.equal(stylesAt(1440, '.personal-home .home-afterhours-art:hover img', true).get('transform'), 'scale(1.035)');
  assert.match(css, /\.motion-off \.personal-home \.home-note-art img[^}]*transform:none/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)[^}]*home-note-art img[^}]*transform:none/);
});
