const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function render(name, root = '/') {
  return new JSDOM(ejs.render(read(`custom/redefine/nijika/${name}.ejs`), {
    url_for: value => root + value.replace(/^\//, ''),
    partial: value => read(`custom/redefine/${value}.ejs`)
  }));
}
test('coursework provides six independent native explorations, with verified inputs and output contracts', () => {
  const dom = render('projects');
  try {
    const doc = dom.window.document;
    const stages = [...doc.querySelectorAll('.project-process details')];
    assert.equal(stages.length, 6);
    for (const stage of stages) {
      assert.ok(stage.firstElementChild.matches('summary'));
      assert.ok(stage.querySelector('p').textContent.length > 10);
      assert.equal(stage.open, false);
      stage.open = true;
      assert.equal(stage.open, true);
      stage.open = false;
    }
    assert.match(doc.querySelector('.project-process-transformer').textContent, /src\/model.py.*src\/train.py[\s\S]*src\/translate.py[\s\S]*results\/test_pairs.txt/);
    assert.match(doc.querySelector('.project-process-rag').textContent, /来源片段.*选择题/);
    assert.equal(doc.querySelectorAll('script,button,iframe,canvas,[data-reveal]').length, 0);
    assert.match(doc.querySelector('.project-art figcaption').textContent, /CC ATELIER/);
    assert.equal(doc.querySelectorAll('h1').length, 1);
  } finally { dom.window.close(); }
});
test('research gives three readable hypotheses before the intact executable lab, even without JavaScript', () => {
  const dom = render('research', '/lab/');
  try {
    const doc = dom.window.document;
    const framing = doc.querySelector('.research-framing');
    assert.ok(framing.compareDocumentPosition(doc.querySelector('[data-sql-lab]')) & 4);
    const prompts = [...framing.querySelectorAll('details')];
    assert.equal(prompts.length, 3);
    for (const prompt of prompts) {
      assert.ok(prompt.querySelector('summary h3'));
      assert.equal(prompt.open, false);
      prompt.open = true;
      prompt.open = false;
    }
    assert.match(prompts[0].textContent, /COUNT\(\*\).*1.*COUNT\(t.id\).*0/);
    assert.match(prompts[1].textContent, /Blue.*Gold.*95/);
    assert.match(prompts[2].textContent, /NOT IN.*NULL.*NOT EXISTS/);
    assert.equal(doc.querySelectorAll('[data-sql-insight]').length, 3);
    assert.equal(doc.querySelectorAll('[data-sql-case]').length, 3);
    assert.equal(doc.querySelectorAll('[data-sql-editor][readonly]').length, 3);
    assert.equal(doc.querySelectorAll('script').length, 1, 'no initial JavaScript added');
    assert.equal(doc.querySelector('script').getAttribute('src'), '/lab/atelier/js/research-sql.js');
    const ids = [...doc.querySelectorAll('[id]')].map(el => el.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(doc.getElementById(framing.getAttribute('aria-labelledby')));
  } finally { dom.window.close(); }
});
test('editorial compositions reflow and expose focus without motion or fixed content heights', () => {
  const projects = read('source/atelier/css/projects.css');
  const research = read('source/atelier/css/research-sql.css');
  assert.match(projects, /\.project-intro \{display:grid;grid-template-columns:minmax\(0,\.85fr\)/);
  assert.match(projects, /\.project-coursework-list \{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(projects, /\.project-process summary:focus-visible/);
  assert.match(projects, /\.project-process details p[^}]*overflow-wrap:anywhere/);
  assert.match(research, /@media\(max-width:650px\)[\s\S]*\.research-questions \{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(research, /\.research-questions summary:focus-visible/);
  const editorial = research.split('/* Research editorial opening.')[1];
  assert.doesNotMatch(editorial, /\.sql-|animation:|visibility:hidden|opacity:0/);
});
test('native exploration affordances use the contrast-safe gold in both themes', () => {
  const projects = read('source/atelier/css/projects.css');
  const research = read('source/atelier/css/research-sql.css');
  assert.match(projects, /\.project-process summary:after\s*\{[^}]*color:var\(--yellow\)/);
  assert.match(research, /\.research-questions summary:after\s*\{[^}]*color:var\(--yellow\)/);
  const foundation = read('source/atelier/css/immersive.css');
  const themes = [...foundation.matchAll(/--bg:(#[\da-f]{6});--surface:(#[\da-f]{6});[\s\S]*?--yellow:(#[\da-f]{6})/gi)];
  assert.equal(themes.length, 2);
  const luminance = hex => hex.slice(1).match(/../g).map(x => parseInt(x,16)/255).map(x => x <= .04045 ? x/12.92 : ((x+.055)/1.055)**2.4).reduce((sum,x,i) => sum+x*[.2126,.7152,.0722][i],0);
  for (const [,bg,surface,gold] of themes) {
    for (const background of [bg,surface]) {
      const [hi,lo] = [luminance(gold),luminance(background)].sort((a,b)=>b-a);
      assert.ok((hi+.05)/(lo+.05)>=4.5, `${gold} on ${background} must exceed text contrast`);
    }
  }
  const source = read('custom/redefine/nijika/projects.ejs');
  assert.doesNotMatch(source, /不会上传材料|虚构评测|这里展示输出约定/);
});
