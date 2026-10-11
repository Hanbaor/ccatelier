const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),core=import('../source/atelier/js/research-sql-core.mjs'),suite=import('../source/atelier/js/research-sql-suite.mjs');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const engine=require('../source/atelier/vendor/sql.js/1.14.2/sql-wasm.js')({wasmBinary:fs.readFileSync(path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.wasm'))});
async function setup(){
 const html=require('ejs').render(fs.readFileSync(path.join(root,'custom/redefine/nijika/research.ejs'),'utf8'),{url_for:x=>'/'+x,partial:()=>''});
 const dom=new JSDOM(html,{url:'https://ccatelier.test/research/',pretendToBeVisual:true});
 const {initResearchSql}=await import('../source/atelier/js/research-sql.js');const calls=[],requests=[];let stops=0;
 const controller=initResearchSql(dom.window.document,{runnerFactory:()=>({run(...args){calls.push(args);const req=deferred();requests.push(req);return req.promise},stop(){stops++}})});
 const $=s=>dom.window.document.querySelector(s),editor=()=>$('[data-sql-case]:not([hidden]) [data-sql-editor]');
 return {dom,$,editor,controller,calls,requests,get stops(){return stops},close(){controller.stop();dom.window.close()}};
}
test('real pinned SQLite validates every published reference and rejects original-only memorized answers on variants',async()=>{
 const c=await core,{runSqlSuite}=await suite,SQL=await engine;let checked=0;
 const runner={run:(id,sql,data)=>Promise.resolve(c.runFixtureQuery(SQL,id,sql,data))};
 for(const fixture of c.SQL_CASES){
  const reference=await runSqlSuite({caseId:fixture.id,sql:fixture.reference,runner});
  assert.equal(reference.length,c.listSqlDatasets(fixture.id).length);assert.ok(reference.every(row=>row.state==='match'));checked+=reference.length;
  const hardcoded=fixture.expected.rows.map(row=>'SELECT '+row.map(value=>typeof value==='string'?"'"+value.replaceAll("'","''")+"'":String(value)).join(',')).join(' UNION ALL ');
  const overfit=await runSqlSuite({caseId:fixture.id,sql:hardcoded,runner});
  assert.equal(overfit[0].state,'match');assert.ok(overfit.slice(1).some(row=>row.state!=='match'),fixture.id);
  const candidate=await runSqlSuite({caseId:fixture.id,sql:fixture.candidate,runner});assert.equal(candidate[0].state,'different');
 }
 assert.equal(checked,9);
});
test('suite executes sequentially, captures SQL, preserves errors and truncated uncertainty, and stops on cancellation',async()=>{
 const {runSqlSuite}=await suite;const requests=[],calls=[],updates=[];let current=true;
 const pending=runSqlSuite({caseId:'empty-count',sql:'SELECT 1',runner:{run(...args){calls.push(args);const req=deferred();requests.push(req);return req.promise}},isCurrent:()=>current,onUpdate:rows=>updates.push(rows)});
 assert.equal(calls.length,1);requests[0].reject(Error('<bad query>'));await flush();assert.equal(calls.length,2);
 requests[1].resolve({columns:['x'],rows:[[1]],truncated:true});await flush();assert.equal(calls.length,3);
 current=false;requests[2].resolve({columns:['x'],rows:[],truncated:false});assert.equal(await pending,null);
 assert.equal(updates.at(-1)[0].state,'error');assert.equal(updates.at(-1)[1].state,'limited');assert.ok(calls.every(args=>args[1]==='SELECT 1'));assert.deepEqual(calls.map(args=>args[2]),['default','no-tracks','empty']);
 let started=false;assert.equal(await runSqlSuite({caseId:'empty-count',sql:'SELECT 1',runner:{run(){started=true}},isCurrent:()=>false}),null);assert.equal(started,false);
});
test('suite is folded and inert until requested; renders real counts and selects datasets without execution',async()=>{
 const s=await setup(),c=await core;try{
  assert.equal(s.calls.length,0);assert.equal(s.$('[data-sql-suite]').open,false);
  assert.equal(s.$('[data-sql-suite-output]').tabIndex,0);assert.equal(s.$('[data-sql-suite-output]').getAttribute('role'),'region');assert.match(s.$('[data-sql-suite-output]').getAttribute('aria-label'),/横向滚动/);
  const sql=s.editor().value,pending=s.controller.validateDatasets();await flush();assert.equal(s.calls.length,1);
  for(let i=0;i<3;i++){s.requests[i].resolve({...c.getSqlDataset('empty-count',s.calls[i][2]).expected,truncated:false});await flush();}
  await pending;assert.equal(s.calls.length,3);assert.ok(s.calls.every(args=>args[1]===sql));
  assert.match(s.$('[data-sql-suite-status]').textContent,/3 \/ 3.*当前 SQL.*固定样例.*不是普遍等价/);
  assert.doesNotMatch(s.$('[data-sql-suite-status]').textContent,/0 个不同|0 个因错误|未判断/);
  assert.equal(s.$('[data-sql-suite-output] table').tBodies[0].rows.length,3);
  s.$('[data-sql-suite-dataset="no-tracks"]').click();assert.equal(s.$('[data-sql-dataset]').value,'no-tracks');assert.equal(s.editor().value,sql);assert.equal(s.calls.length,3);
  s.$('[data-sql-suite-dataset="empty"]').click();assert.equal(s.$('[data-sql-dataset]').value,'empty');assert.equal(s.calls.length,3);
  assert.match(s.$('[data-sql-status]').textContent,/点击运行/);
  const old=s.$('[data-sql-suite-dataset="no-tracks"]');s.editor().value='SELECT 2';s.editor().dispatchEvent(new s.dom.window.Event('input'));old.click();assert.equal(s.$('[data-sql-dataset]').value,'empty');assert.equal(s.$('[data-sql-suite-output]').textContent,'');
 }finally{s.close()}
});
test('editing during lazy module load never starts SQLite',async()=>{
 const s=await setup();try{const pending=s.controller.validateDatasets();s.editor().value='SELECT 2';s.editor().dispatchEvent(new s.dom.window.Event('input'));await pending;assert.equal(s.calls.length,0);assert.equal(s.$('[data-sql-suite-output]').textContent,'');}finally{s.close()}
});
test('all invalidation paths terminate current suite and reject late results; normal run remains available',async()=>{
 for(const action of ['stop','edit','case','dataset','import','pagehide','dialog','run']){
  const s=await setup();try{
   const pending=s.controller.validateDatasets();await flush();assert.equal(s.calls.length,1);
   if(action==='stop')s.$('[data-sql-cancel]').click();
   if(action==='edit'){s.editor().value='SELECT 2';s.editor().dispatchEvent(new s.dom.window.Event('input'));}
   if(action==='case')s.controller.select('top-ties');
   if(action==='dataset'){s.$('[data-sql-dataset]').value='empty';s.$('[data-sql-dataset]').dispatchEvent(new s.dom.window.Event('change'));}
   if(action==='import')await s.controller.importFile({size:2,text:async()=>'{}'});
   if(action==='pagehide')s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));
   if(action==='dialog')s.dom.window.document.dispatchEvent(new s.dom.window.Event('atelier:dialog-open'));
   if(action==='run')s.controller.run();
   const count=s.calls.length,before=s.$('[data-sql-status]').textContent;
   s.requests[0].resolve({columns:['x'],rows:[[1]],truncated:false});await pending;
   assert.equal(s.calls.length,count,action);assert.equal(s.$('[data-sql-suite-output]').textContent,'',action);assert.equal(s.$('[data-sql-status]').textContent,before,action);assert.ok(s.stops>0,action);
   if(action!=='run'){s.controller.run();assert.equal(s.calls.length,2,action)}
  }finally{s.close()}
 }
});
test('rendered errors stay text-only and incomplete suites cannot be investigated',async()=>{
 const {renderSqlSuite}=await suite,s=await setup();try{
  renderSqlSuite(s.$('[data-sql-suite-output]'),[{id:'default',label:'original',state:'error',error:'<img src=x onerror=alert(1)>'},{id:'empty',label:'empty',state:'running'}],()=>assert.fail('cannot investigate during run'));
  assert.equal(s.$('[data-sql-suite-output] img'),null);assert.match(s.$('[data-sql-suite-output]').textContent,/<img/);assert.ok(s.$('[data-sql-suite-dataset]').disabled);
 }finally{s.close()}
});
test('suite starts by cancelling plan/minimizer and blocks competing optional jobs while it runs',async()=>{
 const c=await core;
 for(const operation of ['plan','minimize']){
  const s=await setup();try{
   const single=s.controller.run();s.requests[0].resolve({...c.getSqlCase('empty-count').expected,truncated:false});await single;
   if(operation==='plan'){const details=s.$('[data-sql-case]:not([hidden]) [data-sql-plan]');details.open=true;details.dispatchEvent(new s.dom.window.Event('toggle'));}
   else s.$('[data-sql-case]:not([hidden]) [data-sql-minimize-run]').click();
   assert.equal(s.calls.length,2);const stopped=s.stops,pending=s.controller.validateDatasets();await flush();assert.equal(s.stops,stopped+1);assert.equal(s.calls.length,3);
   s.$('[data-sql-case]:not([hidden]) [data-sql-minimize-run]').click();assert.equal(s.calls.length,3);
   s.requests[1].reject(Error('old operation failed'));await flush();assert.equal(s.calls.length,3);assert.match(s.$('[data-sql-status]').textContent,/跨数据集/);
   s.controller.stop();s.requests[2].resolve({columns:[],rows:[],truncated:false});await pending;
  }finally{s.close()}
 }
});
test('mixed errors, truncation and differences are announced as unjudged rather than passed',async()=>{
 const s=await setup();try{
  const pending=s.controller.validateDatasets();await flush();s.requests[0].reject(Error('read-only failure'));await flush();
  s.requests[1].resolve({columns:['x'],rows:[[1]],truncated:true});await flush();
  s.requests[2].resolve({columns:['x'],rows:[[1]],truncated:false});await pending;
  assert.match(s.$('[data-sql-suite-status]').textContent,/0 \/ 3.*1 个不同，2 个因错误或截断未判断/);
  assert.match(s.$('[data-sql-suite-output]').textContent,/read-only failure/);
  assert.match(s.$('[data-sql-suite-output]').textContent,/≥1 \/ 3/);
  assert.equal(s.$('[data-sql-suite-run]').disabled,false);
 }finally{s.close()}
});
test('shipped worker suite obeys timeout termination and recovers for all nine reference datasets',async()=>{
 const {Worker}=require('node:worker_threads'),{pathToFileURL}=require('node:url');
 const {createSqlRunner}=await import('../source/atelier/js/research-sql.js'),{runSqlSuite}=await suite,c=await core;
 const coreUrl=pathToFileURL(path.join(root,'source/atelier/js/research-sql-core.mjs')).href;
 const runtime=path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.js'),wasm=path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.wasm');
 const body=fs.readFileSync(path.join(root,'source/atelier/js/research-sql-worker.js'),'utf8').replace("import('./research-sql-core.mjs')",`import(${JSON.stringify(coreUrl)})`);
 const bootstrap=`const {parentPort}=require('node:worker_threads');global.self={location:{href:'https://ccatelier.test/atelier/js/research-sql-worker.js'},postMessage:data=>parentPort.postMessage(data)};global.importScripts=()=>{global.initSqlJs=()=>require(${JSON.stringify(runtime)})({wasmBinary:require('node:fs').readFileSync(${JSON.stringify(wasm)})})};parentPort.on('message',data=>self.onmessage({data}));\n${body}`;
 const instances=[];
 class Adapter{
  constructor(){this.worker=new Worker(bootstrap,{eval:true});this.terminated=false;instances.push(this);this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',()=>this.onerror?.({preventDefault(){}}));}
  postMessage(data){this.worker.postMessage(data)}
  terminate(){this.terminated=true;this.worker.terminate()}
 }
 const runner=createSqlRunner({WorkerClass:Adapter,queryMs:150});
 try{
  const errors=await runSqlSuite({caseId:'empty-count',sql:'WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n) SELECT SUM(x) FROM n',runner});
  assert.equal(errors.length,3);assert.ok(errors.every(row=>row.state==='error' && /超过/.test(row.error)));assert.equal(instances.length,3);assert.ok(instances.every(worker=>worker.terminated));
  for(const fixture of c.SQL_CASES){const results=await runSqlSuite({caseId:fixture.id,sql:fixture.reference,runner});assert.ok(results.every(row=>row.state==='match'));}
  assert.equal(instances.length,4);
 }finally{runner.stop()}
});


test('suite keeps its initial guidance short while preserving detailed limits in the existing boundaries disclosure',async()=>{
 const s=await setup();
 try{
  assert.equal(s.$('[data-sql-suite]>p').textContent,'用当前 SQL 检查本例全部数据集；结果只适用于这些样例。');
  assert.equal(s.$('[data-sql-suite-status]').textContent,'点击后验证当前 SQL。');
  const boundary=s.$('.sql-boundaries').textContent;
  assert.match(boundary,/最多 8 个固定数据集/);assert.match(boundary,/每个数据集限时 1.5 秒，载入另计/);
  assert.match(boundary,/比较值、重复次数与行顺序/);assert.match(boundary,/全部一致也不代表 SQL 普遍等价/);
 }finally{s.close()}
});
