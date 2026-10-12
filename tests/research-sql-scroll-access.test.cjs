'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ejs=require('ejs');
const {JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(path.resolve(__dirname,'..',p),'utf8');
const markup=()=>ejs.render(read('custom/redefine/nijika/research.ejs'),{url_for:p=>'/'+p,partial:()=>''});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function geometry(node,width,height=100){let size={width,height};Object.defineProperties(node,{clientWidth:{get:()=>100},scrollWidth:{get:()=>size.width},clientHeight:{get:()=>100},scrollHeight:{get:()=>size.height}});return (width,height=100)=>{size={width,height};};}
test('server-rendered fixture and expected tables offer named keyboard fallback, empty actual output does not',()=>{
 const dom=new JSDOM(markup()),doc=dom.window.document;
 try{for(const node of doc.querySelectorAll('.sql-table-wrap,[data-sql-expected]')){assert.equal(node.tabIndex,0);assert.equal(node.getAttribute('role'),'region');assert.match(node.getAttribute('aria-label'),/可滚动/);assert.ok(node.querySelector('table'));}
 for(const node of doc.querySelectorAll('[data-sql-actual]'))assert.equal(node.hasAttribute('tabindex'),false);
 assert.match(read('source/atelier/css/research-sql.css'),/\.sql-lab :is\(\.sql-table-wrap,\.sql-result,\.sql-plan-table\):focus-visible\s*\{outline:2px solid var\(--sql-accent\)/);
 }finally{dom.window.close();}
});
test('only measured overflow gets Tab entry; focus survives shrinking until blur; observer lifecycle survives bfcache',async()=>{
 const {initSqlScrollRegions}=await import('../source/atelier/js/research-sql.js');
 const dom=new JSDOM('<section><button>Next</button><div class="sql-result" aria-label="实际结果"><table><tr><td>Rows</td></tr></table></div><div class="sql-result">Empty</div></section>',{pretendToBeVisual:true});
 const {window}=dom,doc=window.document,host=doc.querySelector('section'),node=host.querySelector('.sql-result'),set=geometry(node,200),observed=new Set();let callback,disconnects=0;
 window.ResizeObserver=class{constructor(fn){callback=fn}observe(n){observed.add(n)}unobserve(n){observed.delete(n)}disconnect(){observed.clear();disconnects++}};
 const controller=initSqlScrollRegions(host);
 try{
 assert.equal(node.tabIndex,0);assert.equal(host.lastElementChild.hasAttribute('tabindex'),false);assert.ok(observed.has(node.querySelector('table')));
 node.focus();set(100);callback();assert.equal(doc.activeElement,node);assert.equal(node.tabIndex,0);
 host.querySelector('button').focus();await tick();assert.equal(node.hasAttribute('tabindex'),false);
 set(100,500);callback();assert.equal(node.tabIndex,0);
 const replacement=doc.createElement('div');replacement.className='sql-plan-table';replacement.innerHTML='<table><caption>SQLite 原始计划节点</caption><tr><td>SCAN</td></tr></table>';geometry(replacement,100,400);node.replaceWith(replacement);await tick();
 assert.equal(replacement.tabIndex,0);assert.match(replacement.getAttribute('aria-label'),/SQLite 原始计划节点/);assert.equal(observed.has(node),false);
 replacement.querySelector('caption').textContent='参考输出 · 3 行';await tick();assert.match(replacement.getAttribute('aria-label'),/参考输出 · 3 行/);assert.doesNotMatch(replacement.getAttribute('aria-label'),/SQLite/);
 window.dispatchEvent(new window.Event('pagehide'));assert.equal(observed.size,0);assert.equal(disconnects,1);callback();assert.equal(observed.size,0,'late resize callback cannot reconnect after pagehide');
 window.dispatchEvent(new window.Event('pageshow'));assert.equal(replacement.tabIndex,0);assert.ok(observed.has(replacement));
 replacement.replaceChildren();await tick();assert.equal(replacement.hasAttribute('tabindex'),false);
 }finally{controller.stop();dom.window.close();}
});
test('real dataset replacement, results, and plan rendering receive named focusable scroll regions',async()=>{
 const {initResearchSql}=await import('../source/atelier/js/research-sql.js');
 const dom=new JSDOM(markup(),{url:'https://example.test/research/',pretendToBeVisual:true}),doc=dom.window.document,win=dom.window;
 // Deterministic geometry exercises the policy, not browser pixel layout.
 Object.defineProperties(win.HTMLElement.prototype,{clientHeight:{get(){return 100}},scrollHeight:{get(){return this.matches('.sql-result,.sql-plan-table,.sql-table-wrap')&&this.querySelector('table')?400:100}}});
 const controller=initResearchSql(doc,{runnerFactory:()=>({stop(){},async run(caseId,sql,datasetId,mode){return mode==='explain'?{columns:['id','parent','detail'],rows:[[1,0,'SCAN artists']],version:'3.49.1'}:{columns:['name','tracks'],rows:[['A',2]],truncated:false};}})});
 try{
 assert.equal(typeof win.ResizeObserver,'undefined','case/dataset paths must work without ResizeObserver');
 await tick();let panel=doc.querySelector('[data-sql-case]:not([hidden])');
 assert.equal(panel.querySelector('.sql-table-wrap').tabIndex,0);assert.match(panel.querySelector('.sql-table-wrap').getAttribute('aria-label'),/空集计数：artists/);
 await controller.run();await tick();assert.equal(panel.querySelector('[data-sql-actual]').tabIndex,0);assert.match(panel.querySelector('[data-sql-actual]').getAttribute('aria-label'),/实际结果/);
 const details=panel.querySelector('[data-sql-plan]');details.open=true;details.dispatchEvent(new win.Event('toggle'));await tick();await tick();
 assert.equal(details.querySelector('.sql-plan-table').tabIndex,0);assert.match(details.querySelector('.sql-plan-table').getAttribute('aria-label'),/空集计数：SQLite 原始计划节点/);
 controller.select('top-ties');await tick();panel=doc.querySelector('[data-sql-case]:not([hidden])');assert.match(panel.querySelector('.sql-table-wrap').getAttribute('aria-label'),/并列第一：scores/);assert.equal(panel.querySelector('[data-sql-actual]').hasAttribute('tabindex'),false);
 const select=doc.querySelector('[data-sql-dataset]'),oldTable=panel.querySelector('.sql-table-wrap');select.selectedIndex=1;select.dispatchEvent(new win.Event('change'));await tick();
 assert.notEqual(panel.querySelector('.sql-table-wrap'),oldTable);assert.equal(panel.querySelector('.sql-table-wrap').tabIndex,0);assert.match(panel.querySelector('.sql-table-wrap').getAttribute('aria-label'),/并列第一：scores/);
 }finally{win.dispatchEvent(new win.Event('pagehide'));controller.stop();dom.window.close();}
});
