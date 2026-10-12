'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { parse } = require('rrweb-cssom');
const { expandStylesheetURLs } = require('../tools/build-shared-stylesheets.cjs');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const selector = '.personal-home.home-edition .personal-actions > a:focus-visible';

// Follow the generated route's delivery order, expanding bundles to current
// source so this focused test does not require a build or mutate public/.
function routeStyles(document, width) {
  const result = [];
  const urls = expandStylesheetURLs([...document.querySelectorAll('link[rel=stylesheet]')].map(link => link.getAttribute('href')));
  function visit(rules) {
    for (const rule of rules) {
      if (rule.type === 4) {
        if (/print|hover|prefers-|forced-colors/.test(rule.conditionText)) continue;
        const max = rule.conditionText.match(/max-width:\s*(\d+)px/);
        const min = rule.conditionText.match(/min-width:\s*(\d+)px/);
        if ((!max || width <= +max[1]) && (!min || width >= +min[1])) visit(rule.cssRules);
      } else if (rule.selectorText) result.push(rule);
    }
  }
  for (const url of urls) {
    const file = 'source' + new URL(url, 'https://example.test').pathname;
    if (fs.existsSync(path.join(root, file))) visit(parse(read(file)).cssRules);
  }
  return result;
}
const matches = (element, rule) => {
  try { return element.matches(rule.selectorText.replaceAll(':focus-visible', '[data-test-focus]')); }
  catch { return false; }
};
function contrast(a, b) {
  const luminance = hex => hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

test('actual homepage CTA focus uses warm gold on the dark hero in both themes', () => {
  for (const width of [320, 390, 760, 761, 1440]) for (const light of [true, false]) {
    const dom = new JSDOM(read('public/index.html'));
    try {
      const document = dom.window.document;
      document.body.classList.toggle('light', light);
      document.body.classList.toggle('light-mode', light);
      document.body.classList.toggle('dark-mode', !light);
      const rules = routeStyles(document, width);
      const hero = document.querySelector('.personal-home.home-edition .personal-hero');
      const background = rules.filter(rule => matches(hero, rule) && rule.style.background).at(-1).style.background;
      assert.equal(background, '#081321');
      const ctas = [...hero.querySelectorAll('.personal-actions > a')];
      assert.equal(ctas.length, 2);
      for (const link of ctas) {
        link.setAttribute('data-test-focus', '');
        const matching = rules.filter(rule => matches(link, rule));
        const focus = matching.filter(rule => rule.selectorText.includes(':focus-visible'));
        const ring = focus.filter(rule => rule.style['outline-color']).at(-1);
        assert.equal(ring.selectorText, selector);
        assert.equal(ring.style['outline-color'], '#f1c555');
        // The more-specific color-only rule preserves the existing geometry.
        const base = focus.filter(rule => rule.style.outline).at(-1);
        assert.equal(base.style.outline, '2px solid var(--yellow)');
        assert.equal(base.style['outline-offset'], '6px');
        assert.equal(matching.filter(rule => rule.style.outline || rule.style['outline-color']).at(-1), ring);
        assert.ok(contrast(ring.style['outline-color'], background) >= 3);
        link.removeAttribute('data-test-focus');
      }
      const rule = rules.find(rule => rule.selectorText === selector);
      assert.deepEqual([...Array(rule.style.length)].map((_, i) => rule.style[i]), ['outline-color']);
      document.querySelectorAll('a,button,svg').forEach(element => element.setAttribute('data-test-focus', ''));
      assert.deepEqual([...document.querySelectorAll('*')].filter(element => matches(element, rule)), ctas,
        'only the two hero CTA links receive this color, not other links, controls or SVGs');
    } finally { dom.window.close(); }
  }
});

test('hero focus override cannot match the other main routes', () => {
  for (const route of ['projects', 'notes', 'about', 'atelier']) {
    const dom = new JSDOM(read(`public/${route}/index.html`));
    try {
      const document = dom.window.document;
      document.querySelectorAll('a').forEach(link => link.setAttribute('data-test-focus', ''));
      assert.equal(document.querySelectorAll(selector.replace(':focus-visible', '[data-test-focus]')).length, 0, route);
    } finally { dom.window.close(); }
  }
});
