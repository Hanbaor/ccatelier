const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),core=import('../source/atelier/js/research-sql-core.mjs');
const engine=require('../source/atelier/vendor/sql.js/1.14.2/sql-wasm.js')({wasmBinary:fs.readFileSync(path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.wasm'))});
const flush=()=>new Promise(resolve=>setTimeout(resolve,10));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{resolve,reject,promise}}
async function setup(){
 const html=require('ejs').render(fs.readFileSync(path.join(root,'custom/redefine/nijika/research.ejs'),'utf8'),{url_for:value=>'/'+value,partial:()=>''});
 const dom=new JSDOM(html,{url:'https://example.test/research/',pretendToBeVisual:true}),doc=dom.window.document,calls=[],requests=[];let stops=0,onState;
 const {initResearchSql}=await import('../source/atelier/js/research-sql.js');
 const controller=initResearchSql(doc,{runnerFactory:options=>{onState=options.onState;return {run(...args){calls.push(args);const d=deferred();requests.push(d);return d.promise},stop(){stops++}}}});
 const panel=()=>doc.querySelector('[data-sql-case]:not([hidden])'),details=()=>panel().querySelector('[data-sql-plan]');
 return{dom,doc,calls,requests,controller,panel,details,get stops(){return stops},state(value){onState(value)},close(){controller.stop();dom.window.close()}};
}
async function completed(s){s.controller.run();s.requests.at(-1).resolve({columns:['x'],rows:[[42]],truncated:false});await flush()}
const plan={columns:['id','parent','detail'],rows:[[2,0,'SCAN artists']],version:'3.49.1',truncated:false};

test('all nine datasets yield genuine EQP identical to the actual wrapped SELECT on the shipped WASM',async()=>{
 const {SQL_CASES,listSqlDatasets,getSqlDataset,explainFixtureQuery,SQL_LIMITS}=await core,SQL=await engine;let count=0;
 for(const item of SQL_CASES)for(const dataset of listSqlDatasets(item.id)){
  const fixture=getSqlDataset(item.id,dataset.id);
  for(const sql of [fixture.candidate,fixture.reference]){
   const actual=explainFixtureQuery(SQL,item.id,sql,dataset.id),db=new SQL.Database();
   try{
    db.run(`PRAGMA hard_heap_limit=${SQL_LIMITS.heapBytes}`);db.run(fixture.schema);
    for(const table of fixture.tables){const st=db.prepare(`INSERT INTO ${table.name} VALUES (${table.columns.map(()=>'?').join(',')})`);try{for(const row of table.rows)st.run(row)}finally{st.free()}}
    db.run('PRAGMA query_only=ON');
    const direct=db.exec(`EXPLAIN QUERY PLAN SELECT * FROM (\n${sql.trim()}\n) AS query_result LIMIT 101`)[0].values.map(([id,parent,,detail])=>[id,parent,detail]);
    assert.deepEqual(actual.rows,direct);assert.equal(actual.truncated,false);assert.equal(actual.version,'3.49.1');
   }finally{db.close()}
  }count++;
 }assert.equal(count,9);
 const scan=explainFixtureQuery(SQL,'empty-count','SELECT id,name FROM artists');
 const search=explainFixtureQuery(SQL,'empty-count','SELECT id,name FROM artists WHERE id=1');
 assert.ok(scan.rows.some(row=>row[2]==='SCAN artists'));
 assert.ok(search.rows.some(row=>/SEARCH artists USING INTEGER PRIMARY KEY/.test(row[2])));
});

test('explain retains the user whitelist, complete wrapper, readonly setup, and column limits',async()=>{
 const {explainFixtureQuery,runFixtureQuery,SQL_CASES}=await core,SQL=await engine;
 for(const sql of ['',null,15,'EXPLAIN QUERY PLAN SELECT 1','PRAGMA query_only=OFF','DELETE FROM artists',"ATTACH DATABASE 'x' AS x",'SELECT 1; SELECT 2',"SELECT ';'",'SELECT 1 -- ;','SELECT 1\0','SELECT '+ 'x'.repeat(4000),
 'WITH a AS (SELECT 1) DELETE FROM artists',"WITH a AS (SELECT 1) UPDATE artists SET name='Oops' RETURNING name",'SELECT 1) PRAGMA query_only=OFF --',"SELECT 1) UPDATE artists SET name='Oops' --","SELECT load_extension('x')",'SELECT * FROM pragma_query_only(0)',"SELECT 1) ATTACH DATABASE 'x' AS x --",'SELECT 1) SELECT 2 --','WITH changed AS (DELETE FROM artists RETURNING *) SELECT * FROM changed','SELECT '+Array.from({length:17},(_,i)=>i).join(',')]) assert.throws(()=>explainFixtureQuery(SQL,'empty-count',sql),String(sql));
 assert.throws(()=>explainFixtureQuery(SQL,'__proto__','SELECT 1'));
 assert.throws(()=>explainFixtureQuery(SQL,'empty-count','SELECT 1','constructor'));
 // EQP must not execute user expressions: an allocation exceeding the heap limit is only planned.
 assert.ok(explainFixtureQuery(SQL,'empty-count','SELECT randomblob(33554432)').rows.length);
 assert.ok(explainFixtureQuery(SQL,'empty-count',"SELECT 'DROP TABLE artists' AS text, NULL AS absent -- harmless comment").rows.length);
 assert.deepEqual(runFixtureQuery(SQL,'empty-count',SQL_CASES[0].reference).rows,SQL_CASES[0].expected.rows);
 const events=[];
 class Database extends SQL.Database {run(sql,...args){events.push(sql);return super.run(sql,...args)}prepare(sql,...args){events.push(sql);return super.prepare(sql,...args)}}
 explainFixtureQuery({Database},'empty-count','SELECT 1');
 assert.ok(events.includes('PRAGMA query_only = ON'));assert.ok(events.some(s=>s.startsWith('PRAGMA hard_heap_limit')));
 assert.ok(events.includes('SELECT * FROM (\nSELECT 1\n) AS query_result LIMIT 101'));
 assert.ok(events.includes('EXPLAIN QUERY PLAN SELECT * FROM (\nSELECT 1\n) AS query_result LIMIT 101'));
});

test('real WASM plan output caps at 64 nodes and marks clipped descriptions',async()=>{
 const {explainFixtureQuery}=await core,SQL=await engine;
 const many=explainFixtureQuery(SQL,'empty-count',Array.from({length:50},(_,i)=>`SELECT ${i}`).join(' UNION ALL '));
 assert.equal(many.rows.length,64);assert.equal(many.truncated,true);
 const long=explainFixtureQuery(SQL,'empty-count',`SELECT * FROM artists AS "${'a'.repeat(700)}"`);
 assert.ok(long.rows.some(row=>row[2].length===512));assert.equal(long.truncated,true);
});

test('plan is lazy, cached per completed run, text-safe, and errors preserve comparison',async()=>{
 const s=await setup();try{
  assert.equal(s.details().hidden,true);assert.equal(s.calls.length,0);
  await completed(s);assert.equal(s.details().hidden,false);assert.equal(s.details().open,false);assert.equal(s.calls.length,1);
  const status=s.doc.querySelector('[data-sql-status]').textContent,result=s.panel().querySelector('[data-sql-actual]').textContent;
  s.details().open=true;await flush();assert.equal(s.calls.length,2);assert.equal(s.calls[1][3],'explain');
  s.details().open=false;await flush();s.details().open=true;await flush();assert.equal(s.calls.length,2,'no duplicate while pending');
  s.requests[1].reject(new Error('计划超过 1.5 秒'));await flush();assert.match(s.details().textContent,/重试/);
  assert.equal(s.doc.querySelector('[data-sql-status]').textContent,status);assert.equal(s.panel().querySelector('[data-sql-actual]').textContent,result);
  s.details().open=false;await flush();s.details().open=true;await flush();
  s.state('loading');assert.equal(s.doc.querySelector('[data-sql-status]').textContent,status,'retry bootstrap leaves comparison intact');
  s.requests[2].resolve({...plan,rows:[[1,0,'<img src=x onerror=alert(1)>']],truncated:true});await flush();
  assert.equal(s.details().querySelector('img'),null);assert.match(s.details().textContent,/<img/);assert.match(s.details().textContent,/未完整显示/);
  s.details().open=false;await flush();s.details().open=true;await flush();assert.equal(s.calls.length,3,'cached successful plan');
  assert.equal(s.doc.querySelector('[data-sql-status]').textContent,status);
 }finally{s.close()}
});

test('all invalidation routes discard old plans and late plan success or failure without overwriting newer work',async()=>{
 for(const action of ['edit','case','dataset','import','restore','run','stop','pagehide','hidden','dialog'])for(const rejects of [false,true]){
  const s=await setup();try{
   // Establish reversible import state before creating the plan snapshot.
   const {createSqlSnapshot,serializeSqlSnapshot}=await import('../source/atelier/js/research-sql-snapshot.mjs');
   const text=serializeSqlSnapshot(createSqlSnapshot('empty-count','default','SELECT 1'));
   const file={size:text.length,text:async()=>text};
   if(action==='restore')await s.controller.importFile(file);
   await completed(s);s.details().open=true;await flush();const pending=s.requests.at(-1),old=s.details();
   if(action==='edit'){const field=s.panel().querySelector('[data-sql-editor]');field.value='SELECT 2';field.dispatchEvent(new s.dom.window.Event('input'))}
   if(action==='case')s.controller.select('top-ties');
   if(action==='dataset'){const select=s.doc.querySelector('[data-sql-dataset]');select.value='empty';select.dispatchEvent(new s.dom.window.Event('change'))}
   if(action==='import')await s.controller.importFile(file);
   if(action==='restore')s.doc.querySelector('[data-sql-restore-draft]').click();
   if(action==='run')s.controller.run();
   if(action==='stop')s.doc.querySelector('[data-sql-cancel]').click();
   if(action==='pagehide')s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));
   if(action==='hidden'){Object.defineProperty(s.doc,'hidden',{value:true});s.doc.dispatchEvent(new s.dom.window.Event('visibilitychange'))}
   if(action==='dialog')s.doc.dispatchEvent(new s.dom.window.Event('atelier:dialog-open'));
   const status=s.doc.querySelector('[data-sql-status]').textContent;
   rejects?pending.reject(new Error('late failure')):pending.resolve(plan);await flush();
   assert.equal(old.hidden,true,action);assert.equal(old.open,false,action);assert.equal(old.querySelector('[data-sql-plan-output]').textContent,'',action);assert.equal(old.querySelector('[data-sql-plan-status]').textContent,'',action);
   assert.equal(s.doc.querySelector('[data-sql-status]').textContent,status,action);assert.ok(s.stops>0,action);
   if(action==='run')assert.equal(s.doc.querySelector('[data-sql-run]').disabled,true,'late finally does not clear new run busy');
  }finally{s.close()}
 }
});

test('explain uses independent operation deadlines and terminates before a fresh-worker retry',async()=>{
 const {createSqlRunner}=await import('../source/atelier/js/research-sql.js'),instances=[],timers=new Map();let serial=0;
 class FakeWorker{constructor(){instances.push(this);this.messages=[]}postMessage(data){this.messages.push(data)}terminate(){this.terminated=true}emit(data){this.onmessage({data})}}
 const runner=createSqlRunner({WorkerClass:FakeWorker,setTimer(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id},clearTimer(id){timers.delete(id)}});
 const one=runner.run('empty-count','SELECT 1','default','explain'),failure=assert.rejects(one,/超过 1.5 秒/);
 assert.equal([...timers.values()][0].ms,10000);instances[0].emit({type:'ready'});
 assert.equal(instances[0].messages[0].type,'explain');assert.equal([...timers.values()][0].ms,1500);
 [...timers.values()][0].fn();await failure;assert.ok(instances[0].terminated);
 const two=runner.run('empty-count','SELECT 1','default','explain');instances[1].emit({type:'ready'});
 instances[0].emit({type:'result',id:2,result:{bad:true}});
 instances[1].emit({type:'result',id:instances[1].messages[0].id,result:plan});assert.deepEqual(await two,plan);
 assert.equal(timers.size,0);runner.stop();
});

test('shipped worker performs real EQP for all datasets and rejects invalid SQL and revisions',async()=>{
 const {Worker}=require('node:worker_threads'),{pathToFileURL}=require('node:url'),{createSqlRunner}=await import('../source/atelier/js/research-sql.js');
 const body=fs.readFileSync(path.join(root,'source/atelier/js/research-sql-worker.js'),'utf8').replace("import('./research-sql-core.mjs')",`import(${JSON.stringify(pathToFileURL(path.join(root,'source/atelier/js/research-sql-core.mjs')).href)})`);
 const bootstrap=`const {parentPort}=require('node:worker_threads');global.self={location:{href:'https://example.test/worker.js'},postMessage:data=>parentPort.postMessage(data)};global.importScripts=()=>{global.initSqlJs=()=>require(${JSON.stringify(path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.js'))})({wasmBinary:require('node:fs').readFileSync(${JSON.stringify(path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.wasm'))})})};parentPort.on('message',data=>self.onmessage({data}));\n${body}`;
 class Adapter{constructor(){this.worker=new Worker(bootstrap,{eval:true});this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',()=>this.onerror?.({preventDefault(){}}))}postMessage(data){this.worker.postMessage(data)}terminate(){this.worker.terminate()}}
 const runner=createSqlRunner({WorkerClass:Adapter});
 try{
  const {SQL_CASES,listSqlDatasets,explainFixtureQuery}=await core,SQL=await engine;
  for(const fixture of SQL_CASES)for(const data of listSqlDatasets(fixture.id))assert.deepEqual(await runner.run(fixture.id,fixture.reference,data.id,'explain'),explainFixtureQuery(SQL,fixture.id,fixture.reference,data.id));
  await assert.rejects(runner.run('empty-count','EXPLAIN SELECT 1','default','explain'),/SELECT/);
  await assert.rejects(runner.run('empty-count','SELECT 1','constructor','explain'),/数据集/);
  assert.deepEqual(await runner.run('empty-count','SELECT 1','default','explain'),explainFixtureQuery(SQL,'empty-count','SELECT 1'));
 }finally{runner.stop()}
 const raw=new Adapter();
 try{
  await new Promise((resolve,reject)=>{raw.onmessage=({data})=>{if(data.type==='ready')resolve()};raw.onerror=reject});
  const result=new Promise(resolve=>{raw.onmessage=({data})=>resolve(data)});
  raw.postMessage({type:'explain',id:1,caseId:'empty-count',datasetId:'default',caseRevision:2,datasetRevision:1,sql:'SELECT 1'});
  assert.match((await result).error,/版本/);
 }finally{raw.terminate()}
});

test('explain rejects incomplete prepared SQL and closes its database on all boundary errors',async()=>{
 const {explainFixtureQuery}=await core;
 for(const mode of ['candidate-tail','plan-tail','shape','types']){
  let closed=false,freed=false;
  class Database{
   run(){}exec(sql){return [{values:[[sql.includes('query_only')?1:'3.49.1']]}]}
   close(){closed=true}
   prepare(sql){let stepped=false;const isPlan=sql.startsWith('EXPLAIN');return{run(){},free(){freed=true},getSQL(){return (mode==='candidate-tail'&&!isPlan||mode==='plan-tail'&&isPlan)?'partial':sql},getColumnNames(){return isPlan?(mode==='shape'?['id']:['id','parent','aux','detail']):['x']},step(){if(stepped)return false;stepped=true;return true},get(){return[1,0,0,42]}}}
  }
  assert.throws(()=>explainFixtureQuery({Database},'empty-count','SELECT 1'),mode);assert.equal(closed,true,mode);assert.equal(freed,true,mode);
 }
});

test('plan live announcements stay short and separate from browsable metadata and table output',async()=>{
 const s=await setup();try{
  await completed(s);
  const details=s.details(),status=details.querySelector('[data-sql-plan-status]'),output=details.querySelector('[data-sql-plan-output]');
  assert.equal(status.getAttribute('role'),'status');assert.equal(status.getAttribute('aria-live'),'polite');assert.equal(status.getAttribute('aria-atomic'),'true');assert.ok(status.classList.contains('sr-only'));
  assert.equal(output.closest('[aria-live],[role="status"],[role="alert"]'),null);
  details.open=true;await flush();assert.equal(status.textContent,'正在读取 SQLite 执行计划。');assert.match(output.textContent,/正在读取/);
  s.requests.at(-1).reject(new Error('long technical error '.repeat(15)));await flush();
  assert.equal(details.querySelector('[data-sql-plan-status]'),status,'live node remains stable');
  assert.equal(status.textContent,'执行计划读取失败。收起后展开可重试。');assert.match(output.textContent,/long technical error/);
  details.open=false;await flush();details.open=true;await flush();
  s.requests.at(-1).resolve({...plan,rows:Array.from({length:64},(_,i)=>[i,0,'SCAN '+ 'x'.repeat(507)]),truncated:true});await flush();
  assert.equal(status.textContent,'执行计划已载入，显示 64 个节点。计划未完整显示。');assert.equal(status.querySelector('table'),null);
  assert.equal(output.querySelectorAll('tbody tr').length,64);assert.equal(output.querySelector('table').closest('[aria-live],[role="status"],[role="alert"]'),null);
  details.open=false;await flush();details.open=true;await flush();assert.equal(s.calls.length,3);assert.equal(details.querySelector('[data-sql-plan-status]'),status);
  const field=s.panel().querySelector('[data-sql-editor]');field.value='SELECT 2';field.dispatchEvent(new s.dom.window.Event('input'));
  assert.equal(status.textContent,'');assert.equal(output.textContent,'');assert.equal(details.hidden,true);
 }finally{s.close()}
});

test('every case places its closed optional plan after the comparison as a full-width sibling',async()=>{
 const s=await setup();try{
  for(const node of s.doc.querySelectorAll('[data-sql-case]')){
   const details=node.querySelector('[data-sql-plan]'),comparison=node.querySelector('.sql-comparison');
   assert.equal(node.querySelectorAll('[data-sql-plan]').length,1);
   assert.equal(details.parentElement,node);assert.equal(comparison.nextElementSibling,details);
   assert.equal(details.closest('.sql-query-panel,.sql-comparison'),null);
   assert.equal(details.hidden,true);assert.equal(details.open,false);
   assert.equal(details.querySelector('summary').textContent,'当前查询的 SQLite 执行计划');
   assert.equal(details.querySelectorAll(':scope > p').length,1);
   assert.match(details.querySelector(':scope > p').textContent,/SELECT.*LIMIT 101.*不证明结果正确或速度更快/);
   assert.equal(details.querySelector('a').href,'https://www.sqlite.org/eqp.html');
   assert.equal(details.querySelector('[data-sql-plan-output]').closest('[aria-live],[role="status"]'),null);
   assert.ok(details.querySelector('[data-sql-plan-status].sr-only[aria-live="polite"]'));
  }
  const {SQL_CASES}=await core;
  for(const fixture of SQL_CASES){
   s.controller.select(fixture.id);await completed(s);s.details().open=true;await flush();
   assert.equal(s.calls.at(-1)[0],fixture.id);assert.equal(s.calls.at(-1)[3],'explain');
   s.requests.at(-1).resolve(plan);await flush();assert.match(s.details().textContent,new RegExp(fixture.label));
  }
 }finally{s.close()}
});
