const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const template = read('custom/redefine/nijika/projects.ejs');
const routes = ['research/#sql-lab-title', 'writing/csdn-124338541/#permutation-trace', 'studio/#rhythm-desk'];
function render(prefix) {
  return new JSDOM(ejs.render(template, {
    url_for: route => prefix + route.replace(/^\//, ''),
    partial: name => read(`custom/redefine/${name}.ejs`)
  }));
}

test('working experiments are native direct links after the hero, outside implementation and coursework', () => {
  for (const prefix of ['/', '/lab/']) {
    const dom = render(prefix);
    try {
      const doc = dom.window.document;
      const section = doc.querySelector('.project-experiments');
      assert.ok(section.previousElementSibling.classList.contains('project-intro'));
      assert.ok(section.nextElementSibling.classList.contains('project-implementation'));
      assert.equal(section.querySelector('h2').id, section.getAttribute('aria-labelledby'));
      assert.equal(section.querySelector('h2').textContent, '在本站试试');
      const links = [...section.querySelectorAll('a')];
      assert.deepEqual(links.map(a => a.getAttribute('href')), routes.map(route => prefix + route));
      for (const link of links) {
        assert.equal(link.querySelectorAll('h3').length, 1);
        assert.equal(link.querySelectorAll('p').length, 1);
        assert.ok(link.querySelector('p').textContent.length < 30, 'a single short description');
        assert.equal(link.querySelectorAll('svg.editorial-arrow[aria-hidden="true"]').length, 1);
        assert.equal(link.hasAttribute('onclick'), false);
        assert.equal(link.hasAttribute('tabindex'), false);
      }
      assert.equal(section.querySelectorAll('script,button,canvas,iframe,details,[hidden]').length, 0);
      assert.equal(doc.querySelectorAll('a[href$="#permutation-trace"]').length, 1, 'move rather than duplicate the article demo');
      for (const id of ['154834561', '124387071', '124460411']) {
        assert.ok(doc.querySelector(`.project-reading a[href="${prefix}writing/csdn-${id}/"]`));
      }
      assert.equal(doc.querySelectorAll('.project-coursework-source').length, 2);
      assert.equal(doc.querySelectorAll('.project-source-links a').length, 5);
    } finally { dom.window.close(); }
  }
});

test('experiment descriptions stay within the actual SQL, semantic trace and MIDI boundaries', () => {
  const dom = render('/');
  try {
    const descriptions = [...dom.window.document.querySelectorAll('.project-experiment-list p')].map(p => p.textContent);
    assert.match(descriptions[0], /查询.*计划.*小数据行子集反例/);
    assert.match(descriptions[1], /对照 C\+\+ 原文.*前进或倒带.*回溯/);
    assert.match(descriptions[2], /编排与分享.*音符、力度与节奏.*MIDI/);
    const section = dom.window.document.querySelector('.project-experiments');
    assert.doesNotMatch(section.textContent, /普适|等价证明|最先进|论文成果|模型评测|在线执行 C\+\+|真实调试器|DAW|混音导出|音色导出/);
    assert.match(read('source/atelier/js/research-sql-minimize.mjs'), /2 \*\* totalRows/);
    assert.match(read('source/atelier/js/research-sql-minimize.mjs'), /export function replayCounterexample/);
    assert.match(read('source/atelier/js/permutation-demo-core.mjs'), /No source is executed/);
    assert.match(read('source/atelier/js/studio-midi.mjs'), /export function encodeMidi/);
    assert.match(read('custom/redefine/nijika/studio.ejs'), /音色、效果与混音不随文件保存/);
  } finally { dom.window.close(); }
});

test('experiment index is theme-token based, borderless, touch sized and rearranges on narrow screens', () => {
  const css = read('source/atelier/css/projects.css');
  const dom = new JSDOM(`<style>${css}</style>`);
  try {
    const rules = [...dom.window.document.styleSheets[0].cssRules];
    const links = rules.find(rule => rule.selectorText === '.project-experiment-list a');
    assert.equal(links.style.getPropertyValue('min-height'), '44px');
    const description = rules.find(rule => rule.selectorText === '.project-experiment-list p');
    assert.match(description.style.getPropertyValue('font'), /13px/);
    assert.equal(description.style.getPropertyValue('color'), 'var(--muted)');
    const grid = rules.find(rule => rule.selectorText === '.project-experiment-list');
    assert.equal(grid.style.getPropertyValue('grid-template-columns'), 'repeat(3,minmax(0,1fr))');
    const mobile = rules.filter(rule => rule.conditionText === '(max-width:760px)').flatMap(rule => [...rule.cssRules]);
    assert.ok(mobile.some(rule => rule.selectorText === '.project-experiment-list' && rule.style.getPropertyValue('grid-template-columns') === 'minmax(0,1fr)'));
    for (const rule of rules.filter(rule => rule.selectorText?.startsWith('.project-experiment'))) {
      assert.equal(rule.style.getPropertyValue('border'), '');
      assert.equal(rule.style.getPropertyValue('background'), '');
      assert.equal(rule.style.getPropertyValue('white-space'), '', 'do not truncate narrow-screen descriptions');
    }
    assert.match(css, /\.project-case a:focus-visible/);
  } finally { dom.window.close(); }
});
