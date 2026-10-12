const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),root=path.resolve(__dirname,'..');
const flush=()=>new Promise(resolve=>setTimeout(resolve,10));
async function setup(){
 const html=require('ejs').render(fs.readFileSync(path.join(root,'custom/redefine/nijika/research.ejs'),'utf8'),{url_for:x=>'/'+x,partial:()=>''});
 const dom=new JSDOM(html,{url:'https://example.test/research/',pretendToBeVisual:true}),doc=dom.window.document,calls=[],requests=[];let stops=0;
 const {initResearchSql}=await import('../source/atelier/js/research-sql.js');
 const controller=initResearchSql(doc,{runnerFactory:()=>({run(...args){calls.push(args);return new Promise((resolve,reject)=>requests.push({resolve,reject}))},stop(){stops++}})});
 const panel=()=>doc.querySelector('[data-sql-case]:not([hidden])');
 return {dom,doc,calls,requests,controller,panel,get stops(){return stops},editor:()=>panel().querySelector('[data-sql-editor]'),history:()=>panel().querySelector('[data-sql-history]'),close(){controller.stop();dom.window.close()}};
}
function edit(s,sql){s.editor().value=sql;s.editor().dispatchEvent(new s.dom.window.Event('input',{bubbles:true}))}
function dataset(s,id){const select=s.doc.querySelector('[data-sql-dataset]');select.value=id;select.dispatchEvent(new s.dom.window.Event('change',{bubbles:true}))}
async function complete(s,result={columns:['x'],rows:[[1]],truncated:false}){await Promise.all([s.controller.run(),Promise.resolve().then(()=>s.requests.at(-1).resolve(result))]);await flush()}
function choose(s,predicate){const select=s.history().querySelector('select'),option=Array.from(select.options).find(predicate);assert.ok(option);select.value=option.value;select.dispatchEvent(new s.dom.window.Event('change'));return option.value}
function restore(s){s.history().querySelector('[data-sql-history-restore]').click()}

test('history is lazy, folded, session-only, text-safe and restores exact SQL and dataset without execution',async()=>{
 const s=await setup();try{
  assert.equal(s.history(),null);assert.equal(s.calls.length,0);
  dataset(s,'no-tracks');edit(s,"SELECT '<img src=x onerror=alert(1)>' ORDER BY 1");const recorded=s.editor().value;
  await complete(s);assert.equal(s.history().open,false);assert.match(s.history().textContent,/当时/);assert.match(s.history().textContent,/刷新即清除/);assert.equal(s.history().querySelector('img'),null);assert.equal(s.history().querySelector('pre').textContent,recorded);
  dataset(s,'empty');edit(s,'SELECT 99');restore(s);
  assert.equal(s.editor().value,recorded);assert.equal(s.doc.querySelector('[data-sql-dataset]').value,'no-tracks');assert.equal(s.calls.length,1);
  assert.match(s.panel().querySelector('[data-sql-result-count]').textContent,/尚未运行/);assert.equal(s.panel().querySelector('[data-sql-plan]').hidden,true);assert.equal(s.panel().querySelector('[data-sql-minimize]').hidden,true);
  assert.match(s.doc.querySelector('[data-sql-status]').textContent,/尚未运行/);
  choose(s,option=>option.textContent.includes('替换前草稿'));restore(s);assert.equal(s.editor().value,'SELECT 99');assert.equal(s.doc.querySelector('[data-sql-dataset]').value,'empty');
  assert.equal(s.history().querySelector('select').options.length,2);restore(s);assert.equal(s.history().querySelector('select').options.length,2);
  assert.equal(s.dom.window.localStorage.length,0);assert.equal(s.dom.window.location.search,'');assert.equal(s.dom.window.location.hash,'');
 }finally{s.close()}
});

test('history preserves per-case drafts, records current run conclusions and collapses duplicate snapshots',async()=>{
 const s=await setup();try{
  await complete(s);await complete(s);assert.equal(s.history().querySelector('select').options.length,1);
  s.controller.select('top-ties');assert.equal(s.history(),null);edit(s,'SELECT 2');await complete(s,{columns:['x'],rows:[[2]],truncated:true});assert.match(s.history().textContent,/已截断 · 未判断/);
  s.controller.select('empty-count');assert.equal(s.history().querySelector('select').options.length,1);
  edit(s,'SELECT 7');await complete(s);assert.equal(s.history().querySelector('select').options.length,2);
  choose(s,option=>option.textContent.startsWith('#2'));restore(s);assert.match(s.editor().value,/COUNT\(\*\)/);
  s.controller.select('top-ties');assert.equal(s.editor().value,'SELECT 2');assert.equal(s.history().querySelector('select').options.length,1);
 }finally{s.close()}
});

test('bounded history preserves oldest selected record and displaced draft during restoration without cycles',async()=>{
 const s=await setup();try{
  for(let i=0;i<15;i++){edit(s,`SELECT ${i}`);await complete(s)}
  assert.equal(s.history().querySelector('select').options.length,12);
  const oldest=choose(s,option=>option===s.history().querySelector('select').options[11]);
  assert.equal(s.history().querySelector('pre').textContent,'SELECT 3');edit(s,'SELECT 999');restore(s);assert.equal(s.editor().value,'SELECT 3');assert.equal(s.history().querySelector('select').value,oldest);
  for(let i=0;i<3;i++){
   choose(s,option=>option.textContent.includes('替换前草稿'));restore(s);assert.equal(s.editor().value,'SELECT 999');
   choose(s,option=>option.value===oldest);restore(s);assert.equal(s.editor().value,'SELECT 3');
  }
  assert.equal(s.history().querySelector('select').options.length,12);
  edit(s,'x'.repeat(4001));restore(s);assert.equal(s.editor().value.length,4001);assert.match(s.history().querySelector('[role=status]').textContent,/先缩短/);
 }finally{s.close()}
});

test('restore cancels in-flight query and pending import; late results cannot replace restored draft',async()=>{
 const s=await setup();try{
  edit(s,'SELECT 1');await complete(s);edit(s,'SELECT 2');s.controller.run();const pending=s.requests.at(-1),stops=s.stops;
  let resolveFile;const imported=s.controller.importFile({size:20,text:()=>new Promise(resolve=>{resolveFile=resolve})});
  restore(s);assert.ok(s.stops>stops);assert.equal(s.editor().value,'SELECT 1');
  pending.resolve({columns:['x'],rows:[[999]],truncated:false});
  const {serializeSqlSnapshot,createSqlSnapshot}=await import('../source/atelier/js/research-sql-snapshot.mjs');
  resolveFile(serializeSqlSnapshot(createSqlSnapshot('top-ties','empty','SELECT 888')));await imported;await flush();
  assert.equal(s.editor().value,'SELECT 1');assert.equal(s.panel().dataset.sqlCase,'empty-count');assert.match(s.panel().querySelector('[data-sql-result-count]').textContent,/尚未运行/);assert.equal(s.history().querySelector('select').options.length,2);
 }finally{s.close()}
});

test('newer edits and case navigation survive lazy recording; cancelled and failed runs are not recorded',async()=>{
 const s=await setup();try{
  s.controller.run();s.requests.at(-1).reject(new Error('failed'));await flush();assert.equal(s.history(),null);
  const run=s.controller.run();s.requests.at(-1).resolve({columns:['x'],rows:[[1]],truncated:false});await run;
  edit(s,'SELECT 77');s.controller.select('top-ties');await flush();assert.equal(s.panel().dataset.sqlCase,'top-ties');assert.equal(s.history(),null);
  s.controller.select('empty-count');assert.equal(s.editor().value,'SELECT 77');assert.equal(s.history().querySelector('select').options.length,1);
  s.controller.run();s.controller.stop();s.requests.at(-1).resolve({columns:['x'],rows:[[2]],truncated:false});await flush();assert.equal(s.history().querySelector('select').options.length,1);
 }finally{s.close()}
});

test('tablet comparison stacks complete query/result panels at the 900px breakpoint',()=>{
 const css=fs.readFileSync(path.join(root,'source/atelier/css/research-sql.css'),'utf8');
 assert.match(css,/@media\(max-width:900px\)\s*\{\s*\.sql-lab[^\n]*\.sql-comparison\s*\{grid-template-columns:minmax\(0,1fr\);gap:16px\}/);
 const source=fs.readFileSync(path.join(root,'source/atelier/js/research-sql.js'),'utf8');assert.match(source,/import\('\.\/research-sql-history\.mjs'\)/);assert.doesNotMatch(source,/^import .* from ['"].*history/m);
});

test('fanout history restores its dataset without execution and stays isolated from earlier cases',async()=>{
 const s=await setup();try{
  const {getSqlCase,runFixtureQuery}=await import('../source/atelier/js/research-sql-core.mjs');
  const SQL=await require('../source/atelier/vendor/sql.js/1.14.2/sql-wasm.js')({wasmBinary:fs.readFileSync(path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.wasm'))});
  edit(s,'SELECT older draft');s.controller.select('join-fanout');assert.equal(s.calls.length,0);assert.equal(s.history(),null);
  const f=getSqlCase('join-fanout');dataset(s,'same-title');edit(s,f.reference);
  await complete(s,runFixtureQuery(SQL,f.id,f.reference,'same-title'));assert.equal(s.calls.length,1);assert.match(s.history().textContent,/一致/);
  dataset(s,'no-rehearsals');edit(s,f.candidate);restore(s);
  assert.equal(s.editor().value,f.reference);assert.equal(s.doc.querySelector('[data-sql-dataset]').value,'same-title');assert.equal(s.calls.length,1);
  assert.match(s.doc.querySelector('[data-sql-status]').textContent,/尚未运行/);
  s.controller.select('empty-count');assert.equal(s.editor().value,'SELECT older draft');assert.equal(s.history(),null);
  s.controller.select('join-fanout');assert.equal(s.editor().value,f.reference);assert.equal(s.history().querySelector('select').options.length,2);assert.equal(s.calls.length,1);
 }finally{s.close()}
});
