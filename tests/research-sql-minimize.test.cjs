const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),core=import('../source/atelier/js/research-sql-core.mjs');
const engine=require('../source/atelier/vendor/sql.js/1.14.2/sql-wasm.js')({wasmBinary:fs.readFileSync(path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.wasm'))});
const flush=()=>new Promise(resolve=>setTimeout(resolve,5));
const popcount=x=>x.toString(2).replaceAll('0','').length;

test('real SQLite finds cardinality minima; every smaller subset is independently equal and exact evidence replays',async()=>{
 const c=await core,SQL=await engine;
 for(const [index,fixture] of c.SQL_CASES.entries()){
  const result=c.minimizeCounterexample(SQL,fixture.id,fixture.candidate);
  assert.equal(result.state,'witness');assert.equal(result.remainingRows,[1,2,2][index]);assert.equal(result.mask,[1,3,17][index]);
  assert.deepEqual(c.minimizeCounterexample(SQL,fixture.id,fixture.candidate),result,'deterministic traversal/tie break');
  for(let mask=0;mask<result.totalSubsets;mask++)if(popcount(mask)<result.remainingRows){
   const a=c.runFixtureQuery(SQL,fixture.id,fixture.candidate,'default',mask),b=c.runFixtureQuery(SQL,fixture.id,fixture.reference,'default',mask);
   assert.equal(c.compareResults(a,b).state,'match',`${fixture.id} smaller mask ${mask}`);
  }
  const replay=c.replayCounterexample(SQL,fixture.id,fixture.candidate,'default',result.mask);
  assert.deepEqual(replay.actual,result.actual);assert.deepEqual(replay.reference,result.reference);
  const db=new SQL.Database();try{
   const outputs=db.exec(result.script);
   // sql.js omits SELECT result sets with zero rows, so compare nonempty outputs.
   assert.deepEqual(outputs.slice(1).map(x=>({columns:x.columns,rows:x.values})),[result.actual,result.reference].filter(x=>x.rows.length).map(({columns,rows})=>({columns,rows})));
   assert.equal(db.exec('PRAGMA query_only')[0].values[0][0],1);
  }finally{db.close()}
 }
});

test('all nine published datasets exhaustively verify their reference without claiming general equivalence',async()=>{
 const c=await core,SQL=await engine;let count=0;
 for(const f of c.SQL_CASES)for(const d of c.listSqlDatasets(f.id)){
  const result=c.minimizeCounterexample(SQL,f.id,f.reference,d.id);
  assert.equal(result.state,'no-witness');assert.equal(result.tested,result.totalSubsets);assert.ok(result.tested<=64);count++;
 }
 assert.equal(count,9);
});

test('search preserves duplicate counts, NULL values, and order differences',async()=>{
 const c=await core,SQL=await engine;
 const duplicate=c.minimizeCounterexample(SQL,'empty-count','SELECT name, 0 AS tracks FROM artists UNION ALL SELECT name, 0 FROM artists ORDER BY name');
 assert.equal(duplicate.state,'witness');assert.equal(duplicate.remainingRows,1);assert.equal(duplicate.comparison.extra,1);
 const reverse=c.minimizeCounterexample(SQL,'null-exclusion','SELECT id,title FROM tracks WHERE NOT EXISTS (SELECT 1 FROM rehearsals WHERE track_id=tracks.id) ORDER BY id DESC');
 assert.equal(reverse.state,'witness');assert.equal(reverse.remainingRows,2);assert.equal(reverse.comparison.state,'order');
 const nullCase=c.minimizeCounterexample(SQL,'null-exclusion',c.getSqlCase('null-exclusion').candidate);
 assert.deepEqual(nullCase.tables[1].rows,[[2,null]]);
});

test('invalid queries, truncation, volatility and invalid masks never establish a minimum',async()=>{
 const c=await core,SQL=await engine;
 assert.throws(()=>c.minimizeCounterexample(SQL,'empty-count','DELETE FROM artists'));
 assert.equal(c.minimizeCounterexample(SQL,'empty-count','SELECT missing FROM artists ORDER BY 1').state,'inconclusive');
 const truncated=c.minimizeCounterexample(SQL,'empty-count','WITH RECURSIVE n AS (SELECT 1 AS x UNION ALL SELECT x+1 FROM n WHERE x<102) SELECT x FROM n ORDER BY x');
 assert.equal(truncated.state,'inconclusive');assert.match(truncated.reason,/截断/);
 assert.throws(()=>c.minimizeCounterexample(SQL,'empty-count','SELECT random() ORDER BY 1'),/不支持最小化/);
 for(const mask of [-1,64,NaN,'1',1.5])assert.throws(()=>c.replayCounterexample(SQL,'empty-count','SELECT 1','default',mask));
 assert.throws(()=>c.subsetTables({tables:[{rows:Array.from({length:7},()=>[])}]},0));
 assert.throws(()=>c.runFixtureQuery(SQL,'empty-count',"WITH x AS (SELECT 1) DELETE FROM artists",'default',0));
 assert.deepEqual(c.runFixtureQuery(SQL,'empty-count',c.SQL_CASES[0].reference).rows,c.SQL_CASES[0].expected.rows,'source fixtures unchanged');
});

async function setup(){
 const html=require('ejs').render(fs.readFileSync(path.join(root,'custom/redefine/nijika/research.ejs'),'utf8'),{url_for:x=>'/'+x,partial:()=>''});
 const dom=new JSDOM(html,{url:'https://example.test/research/',pretendToBeVisual:true}),doc=dom.window.document,requests=[],calls=[];let stops=0;
 const {initResearchSql}=await import('../source/atelier/js/research-sql.js');
 const controller=initResearchSql(doc,{runnerFactory:()=>({run(...args){calls.push(args);return new Promise((resolve,reject)=>requests.push({resolve,reject}))},stop(){stops++}})});
 const panel=()=>doc.querySelector('[data-sql-case]:not([hidden])'),details=()=>panel().querySelector('[data-sql-minimize]');
 return{dom,doc,controller,calls,requests,panel,details,get stops(){return stops},close(){controller.stop();dom.window.close()}};
}
async function complete(s){s.controller.run();s.requests.at(-1).resolve({columns:['x'],rows:[[42]],truncated:false});await flush()}

test('counterexample UI stays lazy, discloses scope, shows text-safe evidence, and replays the exact mask',async()=>{
 const s=await setup(),c=await core,SQL=await engine;try{
  assert.equal(s.details().hidden,true);assert.equal(s.calls.length,0);await complete(s);
  assert.equal(s.details().hidden,false);assert.equal(s.details().open,false);
  s.details().open=true;await flush();assert.equal(s.calls.length,1,'opening is not execution');
  assert.match(s.details().textContent,/确定性查询/);assert.match(s.details().textContent,/1.5 秒/);
  s.details().querySelector('[data-sql-minimize-run]').click();assert.equal(s.calls.at(-1)[3],'minimize');
  const result=c.minimizeCounterexample(SQL,c.SQL_CASES[0].id,c.SQL_CASES[0].candidate);
  s.requests.at(-1).resolve({...result,script:'<img src=x onerror=alert(1)>'});await flush();
  assert.equal(s.details().querySelector('img'),null);assert.match(s.details().querySelector('textarea').value,/<img/);
  assert.equal(s.details().querySelectorAll('table').length,4);assert.match(s.details().textContent,/6 → 1/);
  const button=s.details().querySelector('[data-sql-witness-replay]');assert.equal(button.hidden,false);button.click();
  assert.equal(s.calls.at(-1)[3],'witness');assert.equal(s.calls.at(-1)[4],1);
  s.requests.at(-1).resolve(result);await flush();assert.match(s.details().querySelector('[role=status]').textContent,/重放，结果一致/);
  button.click();s.requests.at(-1).resolve({...result,actual:{...result.actual,rows:[]}});await flush();assert.match(s.details().querySelector('[role=status]').textContent,/结果改变/);assert.equal(button.hidden,true);
 }finally{s.close()}
});

test('edit, dataset, case, stop and page lifecycle invalidate a running search and ignore late results',async()=>{
 for(const action of ['edit','dataset','case','stop','pagehide','dialog']){
  const s=await setup();try{
   await complete(s);const old=s.details();old.querySelector('[data-sql-minimize-run]').click();const pending=s.requests.at(-1);
   if(action==='edit'){const editor=s.panel().querySelector('[data-sql-editor]');editor.value='SELECT 1';editor.dispatchEvent(new s.dom.window.Event('input'))}
   if(action==='dataset'){const select=s.doc.querySelector('[data-sql-dataset]');select.value='empty';select.dispatchEvent(new s.dom.window.Event('change'))}
   if(action==='case')s.controller.select('top-ties');
   if(action==='stop')s.doc.querySelector('[data-sql-cancel]').click();
   if(action==='pagehide')s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));
   if(action==='dialog')s.doc.dispatchEvent(new s.dom.window.Event('atelier:dialog-open'));
   pending.resolve({state:'no-witness',tested:64});await flush();
   assert.equal(old.querySelector('[data-sql-minimize-output]').textContent,'');assert.ok(s.stops>0);assert.doesNotMatch(old.querySelector('[role=status]').textContent,/正在|所有行子集/);
  }finally{s.close()}
 }
});

test('one whole minimization shares a wall-clock deadline and worker termination, not per-subset timer resets',async()=>{
 const {createSqlRunner}=await import('../source/atelier/js/research-sql.js'),instances=[],timers=new Map();let serial=0;
 class FakeWorker{constructor(){instances.push(this)}postMessage(data){this.request=data}terminate(){this.terminated=true}emit(data){this.onmessage({data})}}
 const runner=createSqlRunner({WorkerClass:FakeWorker,setTimer(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id},clearTimer(id){timers.delete(id)}});
 const promise=runner.run('empty-count','SELECT 1','default','minimize'),failure=assert.rejects(promise,/超过 1.5 秒/);instances[0].emit({type:'ready'});
 assert.equal(instances[0].request.type,'minimize');assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,1500);
 [...timers.values()][0].fn();await failure;assert.equal(instances[0].terminated,true);
 const replay=runner.run('empty-count','SELECT 1','default','witness',17);instances[1].emit({type:'ready'});assert.equal(instances[1].request.subsetMask,17);
 const stopped=assert.rejects(replay,/已停止/);runner.stop();await stopped;assert.ok(instances[1].terminated);
});

test('shipped worker executes minimization and exact replay through the bounded runner',async()=>{
 const {Worker}=require('node:worker_threads'),{pathToFileURL}=require('node:url'),{createSqlRunner}=await import('../source/atelier/js/research-sql.js');
 const body=fs.readFileSync(path.join(root,'source/atelier/js/research-sql-worker.js'),'utf8').replace("import('./research-sql-core.mjs')",`import(${JSON.stringify(pathToFileURL(path.join(root,'source/atelier/js/research-sql-core.mjs')).href)})`);
 const bootstrap=`const {parentPort}=require('node:worker_threads');global.self={location:{href:'https://example.test/worker.js'},postMessage:data=>parentPort.postMessage(data)};global.importScripts=()=>{global.initSqlJs=()=>require(${JSON.stringify(path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.js'))})({wasmBinary:require('node:fs').readFileSync(${JSON.stringify(path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.wasm'))})})};parentPort.on('message',data=>self.onmessage({data}));\n${body}`;
 class Adapter{constructor(){this.worker=new Worker(bootstrap,{eval:true});this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',()=>this.onerror?.({preventDefault(){}}))}postMessage(data){this.worker.postMessage(data)}terminate(){this.worker.terminate()}}
 const runner=createSqlRunner({WorkerClass:Adapter}),c=await core;
 try{
  for(const fixture of c.SQL_CASES){
   const result=await runner.run(fixture.id,fixture.candidate,'default','minimize');assert.equal(result.state,'witness');
   const replay=await runner.run(fixture.id,fixture.candidate,'default','witness',result.mask);assert.deepEqual(replay.actual,result.actual);assert.deepEqual(replay.reference,result.reference);
  }
  const failure=runner.run('empty-count','WITH RECURSIVE n AS (SELECT 1 AS x UNION ALL SELECT x+1 FROM n) SELECT sum(x) FROM n ORDER BY 1','default','minimize');
  await assert.rejects(failure,/超过 1.5 秒/);
  assert.equal((await runner.run('empty-count',c.SQL_CASES[0].candidate,'default','minimize')).state,'witness','fresh worker recovers after actual runaway SQL');
 }finally{runner.stop()}
});

test('conservative SQL gate rejects volatile/stateful/metadata calls and quote/comment evasions while allowing safe literals',async()=>{
 const c=await core,SQL=await engine;
 const unsupported=[
  'SELECT current_timestamp ORDER BY 1','SELECT CURRENT_DATE ORDER BY 1','SELECT current_time ORDER BY 1',
  "SELECT date('now') ORDER BY 1",'SELECT random() ORDER BY 1','SELECT random/**/() ORDER BY 1',
  'SELECT "random"() ORDER BY 1','SELECT [random]() ORDER BY 1','SELECT `random`() ORDER BY 1',"SELECT 'random'() ORDER BY 1",
  'SELECT changes() ORDER BY 1','SELECT total_changes() ORDER BY 1','SELECT last_insert_rowid() ORDER BY 1',
  'SELECT * FROM pragma_hard_heap_limit ORDER BY 1','SELECT * FROM "pragma_query_only" ORDER BY 1','SELECT name FROM sqlite_master ORDER BY 1',
  'SELECT sqlite_version() ORDER BY 1','SELECT ? ORDER BY 1','SELECT id,name FROM artists',
  'SELECT name, 0 FROM artists) AS q /*','SELECT name, 0 FROM artists ORDER BY 1 /*',
  'SELECT name, 0 FROM artists) AS q --\nORDER BY 1','WITH c(x) AS (SELECT 1) SELECT x FROM c ORDER BY 1'
 ];
 for(const sql of unsupported)assert.throws(()=>c.minimizeCounterexample(SQL,'empty-count',sql),/不支持最小化/,sql);
 const safe=c.minimizeCounterexample(SQL,'empty-count',"SELECT 'random() /* CURRENT_TIMESTAMP' AS harmless ORDER BY 1");assert.equal(safe.state,'witness');
 const safeQuoted=c.minimizeCounterexample(SQL,'empty-count','SELECT "count"(*) FROM artists ORDER BY 1');assert.equal(safeQuoted.state,'witness');
 assert.equal(c.runFixtureQuery(SQL,'empty-count','SELECT current_timestamp').rows.length,1,'ordinary Run remains unchanged');
 assert.equal(c.runFixtureQuery(SQL,'empty-count','SELECT * FROM pragma_hard_heap_limit').rows[0][0],16777216);
 assert.throws(()=>c.runFixtureQuery(SQL,'empty-count','SELECT name, 0 FROM artists) AS q /*','default',9),'subset path also requires standalone SQLite preparation');
});

test('exported witness reproduces setup and both nonempty outputs in a fresh independent SQLite process',async()=>{
 const c=await core,SQL=await engine,{execFileSync}=require('node:child_process');
 const result=c.minimizeCounterexample(SQL,'empty-count',c.SQL_CASES[0].candidate);
 const loader=path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.js');
 const code=`(async()=>{const SQL=await require(${JSON.stringify(loader)})();const db=new SQL.Database();const before=db.exec('PRAGMA hard_heap_limit')[0].values[0][0];const result=db.exec(require('node:fs').readFileSync(0,'utf8'));process.stdout.write(JSON.stringify({before,result}));db.close()})().catch(e=>{console.error(e);process.exitCode=1})`;
 const replay=JSON.parse(execFileSync(process.execPath,['-e',code],{input:result.script,encoding:'utf8'}));
 assert.equal(replay.before,0,'fresh runtime must not inherit earlier heap configuration');
 assert.deepEqual(replay.result[0],{columns:['hard_heap_limit'],values:[[16777216]]});
 assert.deepEqual(replay.result.slice(1),[result.actual,result.reference].map(({columns,rows})=>({columns,values:rows})));
 assert.equal(replay.result.length,3,'heap setup and both query results must remain independently executable');
});
