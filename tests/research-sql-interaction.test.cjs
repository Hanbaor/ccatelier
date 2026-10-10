const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;return{promise:new Promise((a,b)=>{resolve=a;reject=b}),get resolve(){return resolve},get reject(){return reject}}};
const root=path.resolve(__dirname,'..');
async function setup(){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'public/research/index.html'),'utf8'),{url:'https://ccatelier.test/lab/research/',pretendToBeVisual:true});
 const {initResearchSql}=await import('../source/atelier/js/research-sql.js'),calls=[],requests=[];let stops=0;
 const runner={run(caseId,sql){const request=deferred();requests.push(request);calls.push({caseId,sql});return request.promise},stop(){stops++}};
 const controller=initResearchSql(dom.window.document,{runnerFactory:()=>runner});
 return{dom,doc:dom.window.document,controller,calls,requests,get stops(){return stops},status:()=>dom.window.document.querySelector('[data-sql-status]'),panel:()=>dom.window.document.querySelector('[data-sql-case]:not([hidden])')};
}

test('lab is idle until Run, runs edited SQL, marks differences, repairs and resets without auto-execution',async()=>{
 const {SQL_CASES}=await import('../source/atelier/js/research-sql-core.mjs'),s=await setup();
 try{
  assert.equal(s.calls.length,0);assert.equal(s.panel().dataset.sqlCase,'empty-count');assert.equal(s.panel().querySelector('[data-sql-editor]').readOnly,false);
  s.doc.querySelector('[data-sql-run]').click();assert.equal(s.calls.length,1);assert.ok(s.doc.querySelector('[data-sql-run]').disabled);
  s.requests[0].resolve({columns:['name','tracks'],rows:[['Aster',2],['Lumen',1],['Moss',1]],truncated:false});await flush();
  assert.match(s.status().textContent,/多出 1 行.*缺少 1 行/);assert.equal(s.panel().querySelectorAll('[data-diff="extra"]').length,1);assert.equal(s.panel().querySelectorAll('[data-diff="missing"]').length,1);
  s.panel().querySelector('[data-sql-use-reference]').click();assert.equal(s.calls.length,1);assert.equal(s.panel().querySelector('[data-sql-editor]').value,SQL_CASES[0].reference);assert.equal(s.panel().querySelectorAll('[data-diff]').length,0);
  s.doc.querySelector('[data-sql-run]').click();s.requests[1].resolve({...SQL_CASES[0].expected,truncated:false});await flush();assert.equal(s.status().textContent,'本例结果一致。');
  s.panel().querySelector('[data-sql-reset]').click();assert.equal(s.calls.length,2);assert.equal(s.panel().querySelector('[data-sql-editor]').value,SQL_CASES[0].candidate);
  s.doc.querySelector('[data-sql-select="top-ties"]').click();assert.equal(s.panel().dataset.sqlCase,'top-ties');assert.equal(s.calls.length,2);
 }finally{s.dom.window.close()}
});

test('case changes, edits, stop, pagehide and dialogs invalidate late results',async()=>{
 const {SQL_CASES}=await import('../source/atelier/js/research-sql-core.mjs'),s=await setup();
 try{
  s.controller.run();s.doc.querySelector('[data-sql-select="top-ties"]').click();s.requests[0].resolve({...SQL_CASES[0].expected,truncated:false});await flush();assert.doesNotMatch(s.status().textContent,/一致/);
  s.controller.run();const field=s.panel().querySelector('[data-sql-editor]');field.value='SELECT track, points FROM scores';field.dispatchEvent(new s.dom.window.Event('input',{bubbles:true}));s.requests[1].resolve({...SQL_CASES[1].expected,truncated:false});await flush();assert.match(s.status().textContent,/修改/);assert.doesNotMatch(s.panel().querySelector('[data-sql-actual]').textContent,/Blue/);
  s.controller.run();s.doc.querySelector('[data-sql-cancel]').click();s.requests[2].resolve({...SQL_CASES[1].expected,truncated:false});await flush();assert.match(s.status().textContent,/已停止/);
  s.controller.run();s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));s.requests[3].resolve({...SQL_CASES[1].expected,truncated:false});await flush();assert.match(s.status().textContent,/已停止/);
  s.controller.run();s.doc.dispatchEvent(new s.dom.window.Event('atelier:dialog-open'));s.requests[4].resolve({...SQL_CASES[1].expected,truncated:false});await flush();assert.match(s.status().textContent,/已停止/);assert.ok(s.stops>=5);
 }finally{s.dom.window.close()}
});

test('keyboard, errors, row caps and hostile result text remain explicit and safe',async()=>{
 const s=await setup();
 try{
  const field=s.panel().querySelector('[data-sql-editor]');
  field.value='SELECT 1;';s.controller.run();assert.equal(s.calls.length,0);assert.match(s.status().textContent,/分号/);
  field.value='SELECT 1';field.dispatchEvent(new s.dom.window.KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,isComposing:true,bubbles:true}));assert.equal(s.calls.length,0);
  field.dispatchEvent(new s.dom.window.KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}));assert.equal(s.calls.length,1);
  s.requests[0].reject(new Error('near "broken": syntax error'));await flush();assert.match(s.status().textContent,/syntax error/);assert.equal(s.doc.querySelector('[data-sql-run]').disabled,false);
  s.controller.run();s.requests[1].resolve({columns:['<img src=x onerror=alert(1)>'],rows:[['<script>alert(1)</script>']],truncated:false});await flush();assert.equal(s.panel().querySelector('[data-sql-actual] img,[data-sql-actual] script'),null);assert.match(s.panel().querySelector('[data-sql-actual]').textContent,/<script>/);
  s.controller.run();s.requests[2].resolve({columns:['x'],rows:[[1]],truncated:true});await flush();assert.match(s.status().textContent,/不作一致性判断/);
 }finally{s.dom.window.close()}
});

function fakeWorkers(){
 const instances=[];
 class FakeWorker{constructor(url){this.url=url;this.messages=[];this.terminated=false;instances.push(this)}postMessage(data){this.messages.push(data)}terminate(){this.terminated=true}emit(data){this.onmessage({data})}}
 return{FakeWorker,instances};
}
function timers(){let serial=0;const scheduled=new Map();return{scheduled,setTimer(fn,ms){const id=++serial;scheduled.set(id,{fn,ms});return id},clearTimer(id){scheduled.delete(id)},fire(ms){const pair=Array.from(scheduled).find(([,value])=>value.ms===ms);assert.ok(pair,'timer '+ms);scheduled.delete(pair[0]);pair[1].fn()}}}

test('worker bootstrap is lazy, separate from query deadline, reused only after completion, and restarted after timeout',async()=>{
 const {createSqlRunner}=await import('../source/atelier/js/research-sql.js'),{FakeWorker,instances}=fakeWorkers(),time=timers();
 const runner=createSqlRunner({WorkerClass:FakeWorker,...time});assert.equal(instances.length,0);
 const one=runner.run('empty-count','SELECT 1');assert.equal(instances.length,1);assert.equal(instances[0].messages.length,0);assert.ok(Array.from(time.scheduled.values()).some(t=>t.ms===10000));
 instances[0].emit({type:'ready'});assert.equal(instances[0].messages.length,1);assert.ok(Array.from(time.scheduled.values()).some(t=>t.ms===1500));assert.ok(!Array.from(time.scheduled.values()).some(t=>t.ms===10000));
 const id=instances[0].messages[0].id;instances[0].emit({type:'result',id,result:{rows:[[1]],columns:['1']}});assert.deepEqual((await one).rows,[[1]]);assert.equal(time.scheduled.size,0);
 const two=runner.run('empty-count','SELECT 2'),failure=assert.rejects(two,/超过 1.5 秒/);assert.equal(instances.length,1);time.fire(1500);await failure;assert.ok(instances[0].terminated);
 const three=runner.run('top-ties','SELECT 3');assert.equal(instances.length,2);instances[0].emit({type:'result',id:2,result:{rows:[['stale']]}});instances[1].emit({type:'ready'});instances[1].emit({type:'result',id:instances[1].messages[0].id,result:{rows:[[3]],columns:['3']}});assert.deepEqual((await three).rows,[[3]]);
 runner.stop();assert.ok(instances[1].terminated);assert.equal(time.scheduled.size,0);
});

test('worker errors, unsupported browsers, repeated runs and bootstrap timeout settle and permit retry',async()=>{
 const {createSqlRunner}=await import('../source/atelier/js/research-sql.js'),{FakeWorker,instances}=fakeWorkers(),time=timers(),runner=createSqlRunner({WorkerClass:FakeWorker,...time});
 const first=runner.run('empty-count','SELECT 1'),aborted=assert.rejects(first,error=>error.cancelled===true);const second=runner.run('top-ties','SELECT 2');await aborted;assert.ok(instances[0].terminated);
 const failed=assert.rejects(second,/载入超时/);time.fire(10000);await failed;
 const third=runner.run('empty-count','SELECT 1'),loadFailure=assert.rejects(third,/未能载入/);instances[2].emit({type:'load-error'});await loadFailure;
 const fourth=runner.run('empty-count','SELECT 1'),runtimeFailure=assert.rejects(fourth,/运行中断/);instances[3].onerror({preventDefault(){}});await runtimeFailure;
 await assert.rejects(createSqlRunner({WorkerClass:null}).run('empty-count','SELECT 1'),/不支持 Worker/);
});

test('actual SQLite worker can be terminated during an unbounded query and a fresh worker recovers',async()=>{
 const {Worker}=require('node:worker_threads'),{pathToFileURL}=require('node:url');
 const {createSqlRunner}=await import('../source/atelier/js/research-sql.js');
 const coreUrl=pathToFileURL(path.join(root,'source/atelier/js/research-sql-core.mjs')).href;
 const runtime=path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.js'),wasm=path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.wasm');
 // Adapt only browser transport/loading; execute the shipped worker body and WASM.
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
  const simple=await runner.run('empty-count','SELECT COUNT(*) AS n FROM artists');assert.deepEqual(simple.rows,[[3]]);
  await assert.rejects(runner.run('empty-count','WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n) SELECT SUM(x) FROM n'),/超过/);
  assert.ok(instances[0].terminated);
  const recovered=await runner.run('top-ties','SELECT track, points FROM scores WHERE points=95 ORDER BY track');assert.deepEqual(recovered.rows,[['Blue',95],['Gold',95]]);assert.equal(instances.length,2);
 }finally{runner.stop()}
});
