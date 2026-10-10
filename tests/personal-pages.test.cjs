const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const {JSDOM} = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function render(name, root='/') {
  return new JSDOM(ejs.render(read(`custom/redefine/nijika/${name}.ejs`), {
    url_for: value=>root+value.replace(/^\//,''),
    partial: name=>read(`custom/redefine/${name}.ejs`),
    theme:{nijika:{github:'https://github.com/Hanbaor'}},
    nijika_writing:()=>[{title:'STL 容器',path:'writing/csdn-124387071/'}]
  }));
}
test('about is a personal introduction, with real directions and no statistics or hidden opening',()=>{
  const dom=render('about');
  try {
    const doc=dom.window.document;
    assert.equal(doc.querySelectorAll('h1').length,1);
    assert.equal(doc.querySelector('h1').textContent,'CC.');
    assert.match(doc.querySelector('.personal-directions').textContent,/AI Agent.*Database.*Text-to-SQL/);
    assert.equal(doc.querySelectorAll('.about-counts,[data-stat],[data-reveal]').length,0);
    assert.ok(doc.querySelector('a[href="https://github.com/Hanbaor"][rel="noopener noreferrer"]'));
    assert.ok(doc.querySelector('.personal-about-notes a[href="/writing/csdn-124387071/"]'));
    assert.match(doc.querySelector('img').alt,/主题.*插画/);
  } finally {dom.window.close();}
});
test('research separates interests from the teaching example and preserves static SQL cases',()=>{
  const dom=render('research','/lab/');
  try {
    const doc=dom.window.document;
    assert.match(doc.querySelector('.personal-research-opening').textContent,/研究[\s\S]*Database.*Text-to-SQL/);
    assert.match(doc.querySelector('.personal-research-caption').textContent,/SQL 教学示例/);
    assert.equal(doc.querySelectorAll('[data-sql-case]').length,3);
    assert.equal(doc.querySelectorAll('[data-sql-editor][readonly]').length,3);
    assert.equal(doc.querySelectorAll('[data-sql-expected] table').length,3);
    assert.equal(doc.querySelectorAll('.personal-research-opening [data-reveal]').length,0);
    for(const item of doc.querySelectorAll('img[src],a[href^="/"],link[href],script[src]')) {
      assert.ok((item.getAttribute('src')||item.getAttribute('href')).startsWith('/lab/'));
    }
  } finally {dom.window.close();}
});
test('personal page styles are scoped, visible without scripts and responsive without motion',()=>{
  const css=read('source/atelier/css/personal-pages.css');
  const dom=new JSDOM(`<style>${css}</style>`);
  try {
    function check(rules) {for(const rule of rules) {
      if(rule.cssRules) check(rule.cssRules);
      else assert.ok(rule.selectorText.split(',').every(s=>/^\.(personal-|room-research)/.test(s.trim())),rule.selectorText);
    }}
    check(dom.window.document.styleSheets[0].cssRules);
    assert.match(css,/:focus-visible/);
    assert.match(css,/@media\(max-width:650px\)/);
    assert.doesNotMatch(css,/animation:|opacity:0|visibility:hidden|\.sql-/);
  } finally {dom.window.close();}
});
