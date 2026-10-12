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
test('coursework keeps a static material flow and three substantive native implementation explorations', () => {
  const dom = render('projects');
  try {
    const doc = dom.window.document;
    const stages = [...doc.querySelectorAll('.project-process details')];
    assert.equal(stages.length, 3);
    assert.equal(doc.querySelectorAll('.project-process-rag ol > li').length, 3);
    assert.equal(doc.querySelectorAll('.project-process-rag details').length, 0);
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
    assert.equal(doc.querySelectorAll('script,iframe,canvas,[data-reveal]').length, 0);
    const retrieval = doc.querySelector('[data-project-retrieval]');
    assert.equal(doc.querySelectorAll('[data-project-retrieval]').length, 1);
    assert.equal(retrieval.parentElement, doc.querySelector('.project-case'));
    assert.equal(retrieval.nextElementSibling, doc.querySelector('.project-implementation'));
    assert.equal(retrieval.parentElement.closest('details'), null);
    assert.equal(retrieval.open, false);
    const form = retrieval.querySelector('form[hidden]'), submit = form?.querySelector('button[type="submit"]');
    assert.ok(form); assert.ok(submit);
    assert.deepEqual([...doc.querySelectorAll('button')], [submit]);
    assert.deepEqual([...doc.querySelectorAll('[hidden]')], [form]);
    assert.match(doc.querySelector('.project-art figcaption').textContent, /CC ATELIER/);
    assert.equal(doc.querySelectorAll('h1').length, 1);
  } finally { dom.window.close(); }
});
for (const root of ['/', '/lab/']) test(`research leads directly to intact executable examples without duplicate prompts (${root})`, () => {
  const dom = render('research', root);
  try {
    const doc = dom.window.document;
    const opening = doc.querySelector('.personal-research-opening');
    const link = opening.querySelector('.personal-research-link');
    assert.equal(link.getAttribute('href'), '#sql-lab-title');
    assert.match(link.textContent, /打开 SQL 实验/);
    const target = doc.getElementById('sql-lab-title');
    assert.equal(target.getAttribute('tabindex'), '-1');
    target.focus(); assert.equal(doc.activeElement, target);
    assert.equal(doc.querySelectorAll('.research-framing,.research-questions').length, 0);
    assert.equal(opening.nextElementSibling.className, 'personal-research-caption');
    assert.equal(opening.nextElementSibling.nextElementSibling, doc.querySelector('[data-sql-lab]'));
    assert.equal(opening.querySelectorAll('details').length, 0);
    assert.doesNotMatch(doc.querySelector('.personal-research-caption').textContent, /展开上方/);
    assert.equal(doc.querySelectorAll('[data-sql-insight]').length, 4);
    assert.equal(doc.querySelectorAll('[data-sql-case]').length, 4);
    assert.equal(doc.querySelectorAll('[data-sql-editor][readonly]').length, 4);
    assert.equal(doc.querySelectorAll('[data-sql-expected] table').length, 4);
    assert.deepEqual([...doc.querySelectorAll('[data-sql-select]')].map(node => node.textContent.trim().slice(2)), ['空集计数','并列第一','空值陷阱','关联倍增']);
    assert.deepEqual([...doc.querySelectorAll('script')].map(node => node.getAttribute('src')), [
      root + 'atelier/js/research-sql.js', root + 'atelier/js/research-local-table.js'
    ], 'the optional local table has an isolated route entry; the built-in entry stays first');
    const localTable = doc.querySelector('[data-local-lab]');
    assert.ok(localTable);
    assert.equal(localTable.open, false);
    assert.equal(localTable.previousElementSibling, doc.querySelector('[data-sql-lab]'));
    assert.equal(localTable.querySelector('[data-sql-editor],[data-sql-case],[data-sql-lab]'), null);
    const ids = [...doc.querySelectorAll('[id]')].map(el => el.id);
    assert.equal(new Set(ids).size, ids.length);
  } finally { dom.window.close(); }
});
test('editorial compositions reflow and expose focus without motion or fixed content heights', () => {
  const projects = read('source/atelier/css/projects.css');
  const research = read('source/atelier/css/research-sql.css');
  assert.match(projects, /\.project-intro \{display:grid;grid-template-columns:minmax\(0,\.85fr\)/);
  assert.match(projects, /\.project-coursework-list \{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(projects, /\.project-process summary:focus-visible/);
  assert.match(projects, /\.project-process details p[^}]*overflow-wrap:anywhere/);
  assert.match(research, /@media\(max-width:650px\)[\s\S]*\.personal-research-opening \{grid-template-columns:minmax\(0,1fr\)/);
  assert.doesNotMatch(research, /\.research-framing|\.research-questions/);
  const editorial = research.split('/* Research editorial opening.')[1];
  assert.doesNotMatch(editorial, /\.sql-|animation:|visibility:hidden|opacity:0/);
});
test('native exploration affordances use the contrast-safe gold in both themes', () => {
  const projects = read('source/atelier/css/projects.css');
  const research = read('source/atelier/css/research-sql.css');
  assert.match(projects, /\.project-process summary:after\s*\{[^}]*color:var\(--yellow\)/);
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
