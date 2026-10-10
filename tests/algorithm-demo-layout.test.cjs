const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const css=read('source/atelier/css/algorithm-demo.css');
function fixture(){
 // JSDOM checks cascade contracts only; widths, wrapping and contrast need browser QA.
 return new JSDOM(`<style>details>summary{list-style:none}details[open]>summary{background:#a6a6a620}details>summary::marker{display:none}</style>
 <style>${read('source/atelier/css/content.css')}</style><style>${read('source/atelier/css/reader.css')}</style><style>${css}</style>
 <div class="reading-studio"><div class="article-body markdown-body">
 <table id="ordinary"><tbody><tr><td>Article table</td></tr></tbody></table>
 <details class="algorithm-demo"><summary>示例拆解</summary><div class="algorithm-demo-body"><p class="algorithm-demo-note">Note</p><p>Explanation</p>
 <div data-demo-controls hidden><label>示例 <select><option>[3, 2, 4] · target = 6</option></select></label><p data-demo-state>i = 0</p>
 <table class="algorithm-demo-table"><caption>哈希表状态（按键排序展示，不代表桶顺序）</caption><thead><tr><th>键</th><th>保存值</th></tr></thead><tbody><tr><td>3</td><td>0</td></tr></tbody></table>
 <p data-demo-message>Step</p><div class="algorithm-demo-controls"><button>上一步</button><span>1 / 7</span><button>下一步</button></div></div>
 <p class="algorithm-demo-note">Complexity</p></div></details></div></div>`);
}
test('walkthrough restores native table layout and a left-aligned caption without changing other tables',()=>{
 const dom=fixture(),{document:doc}=dom.window,style=selector=>dom.window.getComputedStyle(doc.querySelector(selector));
 try{
  assert.equal(style('.algorithm-demo-table').display,'table');
  assert.equal(style('.algorithm-demo-table').tableLayout,'fixed');
  assert.equal(style('.algorithm-demo-table').width,'100%');
  assert.equal(style('.algorithm-demo-table').maxWidth,'32rem');
  assert.equal(style('caption').textAlign,'left');
  assert.equal(style('.algorithm-demo-table th').minWidth,'0');
  assert.equal(style('#ordinary').display,'block');
 }finally{dom.window.close();}
});
test('summary stays lightweight in both states and body spacing overrides article prose',()=>{
 const dom=fixture(),{document:doc}=dom.window,style=selector=>dom.window.getComputedStyle(doc.querySelector(selector));
 try{
  const details=doc.querySelector('details');assert.equal(details.open,false);
  assert.equal(style('summary').display,'list-item');
  assert.equal(style('summary').minHeight,'44px');
  assert.equal(style('summary').backgroundColor,'rgba(0, 0, 0, 0)');
  details.open=true;
  assert.equal(style('summary').backgroundColor,'rgba(0, 0, 0, 0)');
  assert.equal(style('summary').listStyleType,'disclosure-open');
  assert.equal(style('.algorithm-demo-body>p:nth-child(2)').marginTop,'0.75rem');
  assert.equal(style('[data-demo-controls]').display,'none');
 }finally{dom.window.close();}
});
test('layout declares narrow-column safeguards, theme tokens and keyboard focus without motion',()=>{
 const dom=fixture();try{
  const sheet=dom.window.document.styleSheets[3],rules=[...sheet.cssRules];
  for(const rule of rules)assert.match(rule.selectorText,/algorithm-demo/,'all rules stay local to the demo');
  const ruleFor=selector=>rules.find(rule=>rule.selectorText===selector).style;
  assert.equal(ruleFor('.algorithm-demo button,.algorithm-demo select').getPropertyValue('max-width'),'100%');
  assert.equal(ruleFor('.algorithm-demo button,.algorithm-demo select').getPropertyValue('min-width'),'0');
  assert.equal(ruleFor('.algorithm-demo [data-demo-controls]>label').getPropertyValue('flex-wrap'),'wrap');
  assert.equal(ruleFor('.algorithm-demo .algorithm-demo-controls').getPropertyValue('flex-wrap'),'wrap');
  assert.equal(ruleFor('.article-body.markdown-body .algorithm-demo-table :is(th,td)').getPropertyValue('overflow-wrap'),'anywhere');
  assert.equal(ruleFor('.article-body.markdown-body .algorithm-demo-table :is(th,td)').getPropertyValue('border'),'0');
  assert.match(ruleFor('.algorithm-demo .algorithm-demo-note').color,/var\(--muted/);
  assert.match(css,/:focus-visible\s*\{outline:2px solid currentColor;outline-offset:3px\}/);
  assert.doesNotMatch(css,/animation\s*:|transition\s*:/);
 }finally{dom.window.close();}
});
