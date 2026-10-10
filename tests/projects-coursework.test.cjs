const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function render(prefix = '/') {
  return new JSDOM(ejs.render(read('custom/redefine/nijika/projects.ejs'), {
    url_for: route => prefix + route.replace(/^\//, ''),
    partial: name => read(`custom/redefine/${name}.ejs`)
  }), { url: 'https://ccatelier.test/projects/' });
}
const repositories = ['https://github.com/Hanbaor/EduRAG', 'https://github.com/Hanbaor/transformer-assignment'];

test('real project EJS adds exactly two public coursework entries outside the closed main disclosure', () => {
  const dom = render();
  try {
    const doc = dom.window.document;
    const room = doc.querySelector('.project-case');
    const coursework = room.querySelector(':scope > .project-coursework');
    assert.equal(doc.querySelectorAll('h1').length, 1);
    assert.equal(doc.querySelector('h1').textContent, 'CC Atelier');
    assert.equal(coursework.querySelector('h2').textContent, '课程实践');
    assert.equal(coursework.previousElementSibling.tagName, 'DETAILS');
    assert.equal(coursework.previousElementSibling.open, false);
    assert.ok(coursework.nextElementSibling.classList.contains('project-reading'));
    assert.equal(coursework.querySelectorAll('.project-coursework-list > li').length, 2);
    assert.deepEqual([...coursework.querySelectorAll('h3')].map(el => el.textContent), ['EduRAG', 'Transformer']);
    assert.equal(room.querySelectorAll('img').length, 1, 'only the existing labeled illustration is shown');
    assert.equal(coursework.querySelectorAll('img,script,iframe,canvas,button,[hidden],[data-reveal]').length, 0);
    for (const section of room.querySelectorAll('section')) {
      const title = doc.getElementById(section.getAttribute('aria-labelledby'));
      assert.ok(title && section.contains(title));
    }
    const ids = [...doc.querySelectorAll('[id]')].map(el => el.id);
    assert.equal(new Set(ids).size, ids.length);
  } finally { dom.window.close(); }
});

test('coursework descriptions distinguish a prototype and a course experiment without invented results', () => {
  const dom = render();
  try {
    const rows = [...dom.window.document.querySelectorAll('.project-coursework-list > li')];
    assert.equal(rows[0].querySelector('.project-coursework-kind').textContent, '课程助教原型');
    assert.match(rows[0].querySelector('.project-coursework-body > p').textContent, /课程材料.*检索问答.*来源片段.*选择题.*自测/);
    assert.equal(rows[1].querySelector('.project-coursework-kind').textContent, '德英翻译课程实验');
    assert.match(rows[1].querySelector('.project-coursework-body > p').textContent, /编码器—解码器 Transformer.*德英翻译.*训练.*束搜索.*BLEU 评估流程/);
    for (const row of rows) {
      assert.equal(row.querySelectorAll('.project-coursework-body > p').length, 1);
      assert.equal(row.querySelectorAll('.project-coursework-stack > li').length, 3);
      assert.ok(row.querySelector('.project-coursework-stack').getAttribute('aria-label'));
      assert.doesNotMatch(row.textContent, /独立完成|全原创|生产级|低幻觉|Agent 平台|完整复现|论文|BLEU\s*[:：]?\s*\d|CARVE|DeerFlow|seekdb|oceanbase/i);
    }
    assert.deepEqual(rows.map(row => [...row.querySelectorAll('.project-coursework-stack > li')].map(el => el.textContent)), [
      ['Streamlit', 'LlamaIndex', 'FAISS'], ['PyTorch', 'Beam search', 'BLEU']
    ]);
  } finally { dom.window.close(); }
});

test('public source links are exact, descriptive, keyboard-native and protected in a new tab', () => {
  const dom = render();
  try {
    const links = [...dom.window.document.querySelectorAll('.project-coursework-source')];
    assert.deepEqual(links.map(link => link.href), repositories);
    for (const link of links) {
      assert.equal(link.tagName, 'A');
      assert.equal(link.target, '_blank');
      assert.equal(link.rel, 'noopener noreferrer');
      assert.match(link.getAttribute('aria-label'), /查看 .*公开源码/);
      assert.equal(link.querySelectorAll('svg.editorial-arrow[aria-hidden="true"]').length, 1);
      assert.equal(link.hasAttribute('tabindex'), false);
      assert.equal(new URL(link.href).hash, '');
    }
  } finally { dom.window.close(); }
});

test('real template keeps coursework external while internal links and assets respect a subdirectory', () => {
  const dom = render('/lab/');
  try {
    const doc = dom.window.document;
    assert.deepEqual([...doc.querySelectorAll('.project-coursework-source')].map(link => link.href), repositories);
    for (const el of doc.querySelectorAll('a[href^="/"],img[src]')) {
      assert.ok((el.getAttribute('href') || el.getAttribute('src')).startsWith('/lab/'));
    }
    assert.equal(doc.querySelectorAll('a[href="/lab/notes/"]').length, 1);
    assert.equal(doc.querySelectorAll('details[open]').length, 0);
  } finally { dom.window.close(); }
});

test('real EJS escapes attribute-breaking URL helper output without introducing executable markup', () => {
  const payload = '/lab/" onerror="alert(1)" data-injected="';
  const dom = render(payload);
  try {
    const doc = dom.window.document;
    assert.equal(doc.querySelectorAll('[onerror],[onclick],[data-injected],script').length, 0);
    assert.equal(doc.querySelector('.project-art img').getAttribute('src'), payload + 'atelier/images/v3/projects.webp');
    assert.deepEqual([...doc.querySelectorAll('.project-coursework-source')].map(link => link.href), repositories);
  } finally { dom.window.close(); }
});

test('coursework uses a borderless token-based layout, wrapping tags, mobile reflow and native focus styling', () => {
  const css = read('source/atelier/css/projects.css');
  const dom = new JSDOM(`<style>${css}</style>`);
  try {
    const rules = [...dom.window.document.styleSheets[0].cssRules];
    const coursework = rules.filter(rule => rule.selectorText?.startsWith('.project-coursework'));
    assert.ok(coursework.length >= 9);
    for (const rule of coursework) {
      assert.doesNotMatch(rule.style.cssText, /#[\da-f]{3,8}|background|box-shadow|border:/i);
      assert.ok(rule.selectorText.split(',').every(selector => selector.trim().startsWith('.project-coursework')));
    }
    assert.match(css, /\.project-coursework-stack\s*\{[^}]*flex-wrap:wrap/);
    assert.match(css, /\.project-coursework-source\s*\{[^}]*min-height:44px/);
    assert.match(css, /\.project-case a:focus-visible/);
    const mobile = rules.find(rule => rule.conditionText === '(max-width:760px)');
    assert.ok([...mobile.cssRules].some(rule => rule.selectorText === '.project-coursework-list>li' && rule.style.getPropertyValue('grid-template-columns') === 'minmax(0,1fr)'));
    assert.match(css, /\.project-coursework-list>li\s*\{break-inside:avoid\}/);
  } finally { dom.window.close(); }
});

test('project page metadata reflects the website and verified coursework without performance claims',()=>{
 const page=read('source/projects/index.md');
 assert.match(page,/description:.*CC Atelier.*EduRAG.*Transformer.*课程实践/);
 assert.match(page,/课程材料检索问答.*德英翻译实验/);
 assert.doesNotMatch(page,/生产级|独立原创|26\.78|领先/);
});
