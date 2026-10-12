'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const { JSDOM } = require('jsdom');
const urlFor = require('hexo-util').url_for;
const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'source/atelier/css/fonts.css'), 'utf8');
const head = fs.readFileSync(path.join(root, 'custom/redefine/nijika/head.ejs'), 'utf8');
const faces = [
  ['Barlow Condensed', 600, 'barlow-condensed-600'],
  ['DM Sans', 400, 'dm-sans-400'],
  ['DM Sans', 500, 'dm-sans-500'],
  ['DM Sans', 600, 'dm-sans-600']
];

test('four unchanged faces prefer genuine smaller WOFF2 files with original TTF fallback', () => {
  const blocks = css.match(/@font-face\{[^}]+\}/g);
  assert.equal(blocks.length, faces.length);
  for (const [i, [family, weight, stem]] of faces.entries()) {
    assert.equal(blocks[i], `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url('../fonts/${stem}.woff2') format('woff2'),url('../fonts/${stem}.ttf') format('truetype')}`);
    const dir = path.join(root, 'source/atelier/fonts');
    const woff = fs.readFileSync(path.join(dir, stem + '.woff2'));
    const ttf = fs.readFileSync(path.join(dir, stem + '.ttf'));
    assert.equal(woff.subarray(0, 4).toString(), 'wOF2');
    assert.equal(woff.readUInt32BE(8), woff.length, 'WOFF2 header length');
    assert.equal(woff.readUInt32BE(4), 0x00010000, 'TrueType outline flavor');
    assert.ok(woff.length < ttf.length);
  }
  for (const license of ['barlowcondensed-OFL.txt', 'dmsans-OFL.txt']) {
    assert.match(fs.readFileSync(path.join(root, 'source/atelier/fonts', license), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
  }
});

for (const prefix of ['/', '/lab/']) {
  test(`font preload and stylesheet resolve to the identical URL under ${prefix}`, () => {
    const hexo = { config: { root: prefix, url: 'https://example.test' + prefix } };
    const html = ejs.render(head, {
      page: { nijika: 'notes' }, theme: { nijika: { cover: '' } },
      is_post: () => false, is_home: () => false, is_archive: () => false,
      is_category: () => false, is_tag: () => false, is_page: () => true,
      nijika_page_metadata: () => ({ documentTitle: 'test', description: '', url: '' }),
      url_for: p => urlFor.call(hexo, p), open_graph: () => '', export_config: () => ''
    });
    const document = new JSDOM(html, { url: 'https://example.test' + prefix + 'notes/' }).window.document;
    const preloads = document.querySelectorAll('link[rel="preload"][as="font"]');
    assert.equal(preloads.length, 1);
    const preload = preloads[0];
    assert.equal(preload.type, 'font/woff2');
    assert.ok(preload.hasAttribute('crossorigin'));
    assert.equal(preload.getAttribute('crossorigin'), '', 'anonymous CORS matches font fetch');
    const stylesheet = [...document.querySelectorAll('link[rel="stylesheet"]')].find(n => n.href.endsWith('/atelier/css/fonts.css'));
    const preferred = css.match(/src:url\('([^']+)'\)/)[1];
    assert.equal(preload.href, new URL(preferred, stylesheet.href).href);
    assert.equal(new URL(preload.href).pathname, prefix + 'atelier/fonts/barlow-condensed-600.woff2');
    for (const [, , stem] of faces) {
      assert.equal(new URL('../fonts/' + stem + '.woff2', stylesheet.href).pathname,
        prefix + 'atelier/fonts/' + stem + '.woff2');
    }
  });
}
