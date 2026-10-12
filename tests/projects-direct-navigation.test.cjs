const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function render(name, root) {
  return new JSDOM(ejs.render(read(`custom/redefine/nijika/${name}.ejs`), {
    url_for: value => root + value.replace(/^\//, ''),
    partial: value => read(`custom/redefine/${value}.ejs`),
    theme: { nijika: { github: 'https://github.com/Hanbaor', reading_art: 'atelier/images/v3/projects.webp' } },
    nijika_writing: () => [], nijika_art_srcset: () => '',
    page: { posts: { each() {} } }
  }), { url: `https://atelier.test${root}${name === 'cover' ? '' : name + '/'}` });
}
for (const root of ['/', '/lab/']) {
  test(`home and Notes link directly to their named, focusable project (${root})`, () => {
    const projects = render('projects', root), home = render('cover', root), notes = render('notes', root);
    try {
      const doc = projects.window.document;
      const links = [...home.window.document.querySelectorAll('.home-project-feature a[href*="projects/"]'), ...notes.window.document.querySelectorAll('.notes-path a[href*="projects/"]')];
      assert.equal(links.length, 3);
      assert.deepEqual(links.map(link => link.hash), ['#project-edurag', '#project-edurag', '#project-transformer']);
      for (const link of links) {
        assert.equal(link.pathname, root + 'projects/');
        assert.equal(link.search, '');
        const target = doc.getElementById(link.hash.slice(1));
        assert.ok(target.matches('h3[tabindex="-1"]'));
        assert.equal(target.closest('details'), null, 'deep links land on always-visible content');
        assert.equal(doc.querySelectorAll(`[id="${target.id}"]`).length, 1);
        target.focus();
        assert.equal(doc.activeElement, target, 'target supports native/programmatic focus without joining tab order');
      }
      assert.match(links[2].textContent, /Transformer.*德英翻译/);
      assert.equal(links[2].hasAttribute('data-notes-path-link'), false);
    } finally { projects.window.close(); home.window.close(); notes.window.close(); }
  });
}
test('EduRAG exposes a concise static flow and Transformer keeps its useful implementation disclosures', () => {
  const dom = render('projects', '/');
  try {
    const doc = dom.window.document, rag = doc.querySelector('.project-process-rag');
    assert.equal(rag.querySelectorAll('details,summary,button,a,[tabindex]').length, 0);
    assert.deepEqual([...rag.querySelectorAll('ol > li strong')].map(el => el.textContent), ['课程材料', '检索问答', '来源片段 ＋ 选择题']);
    assert.equal(rag.querySelectorAll('p').length, 0, 'do not repeat the synopsis under artificial disclosures');
    const transformer = doc.querySelector('.project-process-transformer');
    assert.equal(transformer.querySelectorAll('details').length, 3);
    assert.match(transformer.textContent, /configs\/transformer.yml/);
    assert.match(transformer.textContent, /src\/model.py/);
    assert.match(transformer.textContent, /results\/test_bleu.txt/);
    assert.equal(doc.querySelectorAll('.project-process-footnote').length, 0);
  } finally { dom.window.close(); }
});
test('static process rows wrap and stay visually distinct from interactive disclosure rows', () => {
  const dom = new JSDOM(`<style>${read('source/atelier/css/projects.css')}</style>`);
  try {
    const rules = [...dom.window.document.styleSheets[0].cssRules];
    const style = selector => rules.find(rule => rule.selectorText === selector).style;
    assert.equal(style('.project-process-rag li').getPropertyValue('flex-wrap'), 'wrap');
    assert.equal(style('.project-process-rag li+li').getPropertyValue('border-top'), '0');
    assert.equal(style('.project-process-rag li').getPropertyValue('cursor'), '');
    assert.equal(style('.project-process-rag li').getPropertyValue('height'), '');
    assert.equal(style('.project-process summary').getPropertyValue('min-height'), '44px');
  } finally { dom.window.close(); }
});
