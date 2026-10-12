const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function render(name, section, prefix) {
  return ejs.render(read(`custom/redefine/nijika/${name}.ejs`), {
    nijika_section: () => section,
    url_for: value => prefix + String(value).replace(/^\//, '')
  });
}
for (const prefix of ['/', '/lab/']) {
  test(`chrome retains destinations, controls and current-section mapping (${prefix})`, () => {
    for (const [section, active] of [['cover', null], ['notes', 'notes'], ['series', 'notes'], ['practice', 'studio'], ['atelier', 'atelier'], ['about', null]]) {
      const dom = new JSDOM(render('header', section, prefix) + render('footer', section, prefix));
      const d = dom.window.document;
      assert.equal(d.querySelector('.brand').getAttribute('href'), prefix);
      assert.equal(d.querySelector('.brand').getAttribute('aria-label'), 'CC Atelier 首页');
      assert.deepEqual([...d.querySelectorAll('.header-navigation a')].map(a => a.getAttribute('href')), ['atelier','notes','studio','projects','research'].map(route => `${prefix}${route}/`));
      const current = d.querySelectorAll('.header-navigation [aria-current]');
      assert.equal(current.length, active ? 1 : 0);
      if (active) assert.equal(current[0].getAttribute('href'), `${prefix}${active}/`);
      for (const selector of ['[data-theme-toggle]', '.search-open', '.menu-open', '[data-help-open]', '.motion-toggle', '.rhythm-open', '#credits-open']) {
        const button = d.querySelector(selector);
        assert.ok(button);
        assert.equal(button.type, 'button');
        assert.ok(button.getAttribute('aria-label'));
      }
      assert.equal(d.querySelector('.footer-after-links').getAttribute('aria-label'), '站点链接');
      assert.deepEqual([...d.querySelectorAll('.footer-after-links a')].map(a => a.getAttribute('href')), [`${prefix}guestbook/`, `${prefix}atom.xml`]);
      dom.window.close();
    }
  });
}
test('the existing layout layer owns shared rhythm, neutral chrome and accessible targets', () => {
  const css = read('source/atelier/css/immersive.css');
  const catalog = read('source/atelier/css/content-catalog.css');
  const dom = new JSDOM(`<style>${css}</style><style>${catalog}</style>`);
  assert.equal(dom.window.document.styleSheets.length, 2);
  assert.match(css, /--page-start:48px/);
  assert.match(css, /--page-title:clamp\(36px,4\.4vw,64px\)/);
  assert.match(css, /--section-space:88px/);
  assert.match(css, /--page-start:28px;--page-end:48px;--section-space:48px/);
  assert.match(css, /--sans:'DM Sans',-apple-system/);
  assert.match(css, /\.theme-toggle-icon \{[^}]*width:44px;min-width:44px;height:44px;min-height:44px/);
  assert.match(css, /\.utility-controls \.icon-button \{width:44px;min-width:44px;height:44px;min-height:44px/);
  assert.match(css, /\.site-header \.icon-button,\.site-header \.menu-open \{height:44px;min-height:44px;min-width:44px;width:44px/);
  assert.match(css, /\.site-footer \.footer-after-links>button \{width:44px;min-height:44px/);
  assert.match(css, /:focus-visible \{outline:2px solid var\(--ink\);outline-offset:4px/);
  assert.doesNotMatch(css, /header-navigation[^{}]*\{[^}]*!important/);
  assert.match(css, /transform:translateY\(12px\);[^}]*transition:opacity \.28s ease,transform \.32s ease/);
  assert.match(catalog, /catalog-heading-v3>img \{[^}]*aspect-ratio:3 \/ 2/);
  assert.doesNotMatch(catalog, /catalog-heading-v3>img \{aspect-ratio:1\.3/);
  dom.window.close();
});
