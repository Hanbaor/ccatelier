const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const {JSDOM} = require('jsdom');

const repo = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(repo, file), 'utf8');

// Render the actual template and shared SVG in memory: no Hexo/public output needed.
function studio(base) {
  const urlFor = route => base + route.replace(/^\//, '');
  const html = ejs.render(read('custom/redefine/nijika/studio.ejs'), {
    theme: {nijika: {studio_art: '/atelier/images/studio.webp'}},
    url_for: urlFor,
    nijika_art_srcset: route => `${urlFor(route)} 1916w`,
    partial: name => ejs.render(read(`custom/redefine/${name}.ejs`)),
  });
  return new JSDOM(html, {url: `https://ccatelier.test${base}studio/`});
}

for (const base of ['/', '/lab/']) {
  test(`studio entry uses a decorative shared SVG without changing its text name (${base})`, () => {
    const dom = studio(base);
    try {
      const doc = dom.window.document;
      const button = doc.querySelector('.studio-mast button[data-live-open]');
      assert.ok(button);
      assert.equal(button.type, 'button');
      assert.equal(button.textContent.trim(), '进入现场');
      assert.equal(button.hasAttribute('aria-label'), false);
      assert.equal(button.hasAttribute('aria-labelledby'), false);
      const arrows = button.querySelectorAll('svg.editorial-arrow');
      assert.equal(arrows.length, 1);
      const arrow = arrows[0];
      assert.equal(arrow.getAttribute('aria-hidden'), 'true');
      assert.equal(arrow.getAttribute('focusable'), 'false');
      assert.equal(arrow.parentElement.getAttribute('aria-hidden'), 'true');
      assert.equal(arrow.parentElement.parentElement, button);
      assert.equal(arrow.getAttribute('viewBox'), '0 0 24 24');
      assert.equal(arrow.querySelector('path').getAttribute('d'), 'M5 19 19 5M5 5h14v14');
      assert.equal(button.querySelectorAll('title, [title], [tabindex]').length, 0);
      assert.doesNotMatch(button.innerHTML, /↗|&lt;svg/);
      // Other correctly rendered Unicode arrows are deliberately unchanged.
      assert.equal(doc.querySelector('.studio-mast > a').textContent, '返回后台 ↗');
      assert.equal(doc.querySelector('.lighting-open').textContent, '调光台 ↗');
    } finally {dom.window.close();}
  });

  test(`studio entry preserves progressive enhancement and the no-script escape (${base})`, () => {
    const dom = studio(base);
    try {
      const doc = dom.window.document;
      assert.equal(doc.querySelector('[data-live-open]').hidden, true);
      assert.equal(doc.querySelector('.studio-console').hidden, true);
      assert.equal(doc.querySelectorAll('[hidden]').length, 2);
      assert.equal(doc.querySelectorAll('noscript').length, 1);
      const fallback = doc.querySelector('noscript');
      assert.match(fallback.textContent, /节奏实验室需要 JavaScript/);
      assert.equal(fallback.querySelector('a').getAttribute('href'), `${base}notes/`);
      assert.equal(fallback.querySelector('a').textContent, '笔记档案');
    } finally {dom.window.close();}
  });
}
