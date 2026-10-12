const test=require('node:test'),assert=require('node:assert/strict');
const modulePromise=import('../source/atelier/js/research-sql.js');

async function setup(){
 const {createSqlRunner}=await modulePromise,instances=[],scheduled=new Map(),states=[];let serial=0;
 class Worker{
  constructor(){this.messages=[];this.terminated=false;instances.push(this)}
  postMessage(data){if(this.postError)throw this.postError;this.messages.push(data)}
  terminate(){this.terminated=true}
  emit(data){this.onmessage({data})}
 }
 const runner=createSqlRunner({WorkerClass:Worker,onState:state=>states.push(state),setTimer(fn,ms){const id=++serial;scheduled.set(id,{fn,ms});return id},clearTimer(id){scheduled.delete(id)}});
 return{runner,instances,scheduled,states};
}
const observe=promise=>{const outcome={};promise.then(value=>{outcome.value=value},error=>{outcome.error=error});return outcome};
const result={columns:['n'],rows:[[1]],truncated:false};
function complete(worker){worker.emit({type:'result',id:worker.messages.at(-1).id,result})}
function staleEvents(worker){
 worker.emit({type:'ready'});
 worker.emit({type:'load-error'});
 worker.emit({type:'result',id:1,result:{stale:true}});
 worker.onerror({preventDefault(){}});
 worker.onmessageerror();
}

test('postMessage failure after asynchronous ready rejects immediately and releases its deadline',async()=>{
 const s=await setup(),failure=new Error('injected postMessage failure');
 const outcome=observe(s.runner.run('empty-count','SELECT 1')),worker=s.instances[0];worker.postError=failure;
 try{
  assert.doesNotThrow(()=>worker.emit({type:'ready'}),'ready is outside run()’s synchronous try/catch');
  await Promise.resolve();
  assert.equal(outcome.error,failure,'the original error must settle the request before any timer fires');
  assert.equal(worker.terminated,true);assert.equal(s.scheduled.size,0);assert.equal(s.states.at(-1),'idle');
  const retry=s.runner.run('empty-count','SELECT 1'),replacement=s.instances[1];
  assert.ok(replacement,'an immediate retry creates a fresh worker');
  staleEvents(worker);assert.equal(replacement.messages.length,0);assert.equal(replacement.terminated,false);
  replacement.emit({type:'ready'});complete(replacement);assert.deepEqual(await retry,result);
  assert.equal(s.scheduled.size,0);
 }finally{s.runner.stop()}
});

test('postMessage failure on an already-ready worker rejects immediately and allows retry',async()=>{
 const s=await setup();
 try{
  const first=s.runner.run('empty-count','SELECT 1'),worker=s.instances[0];worker.emit({type:'ready'});complete(worker);await first;
  const failure=new Error('warm postMessage failure');worker.postError=failure;
  await assert.rejects(s.runner.run('empty-count','SELECT 1'),error=>error===failure);
  assert.equal(worker.terminated,true);assert.equal(s.scheduled.size,0);
  const retry=s.runner.run('empty-count','SELECT 1'),replacement=s.instances[1];
  staleEvents(worker);replacement.emit({type:'ready'});complete(replacement);assert.deepEqual(await retry,result);
 }finally{s.runner.stop()}
});

for(const kind of ['load-error','error','messageerror'])test(`${kind} releases the worker; stale events cannot affect an immediate retry`,async()=>{
 const s=await setup();
 try{
  const failed=s.runner.run('empty-count','SELECT 1'),rejected=assert.rejects(failed,/SQLite/),worker=s.instances[0];
  if(kind==='load-error')worker.emit({type:kind});
  else if(kind==='error')worker.onerror({preventDefault(){}});
  else worker.onmessageerror();
  assert.equal(worker.terminated,true);assert.equal(s.scheduled.size,0);
  const retry=s.runner.run('empty-count','SELECT 1'),replacement=s.instances[1];
  staleEvents(worker);assert.equal(replacement.messages.length,0);assert.equal(replacement.terminated,false);assert.equal(s.scheduled.size,1);
  replacement.emit({type:'ready'});staleEvents(worker);assert.equal(replacement.messages.length,1);assert.equal(replacement.terminated,false);
  complete(replacement);await rejected;assert.deepEqual(await retry,result);assert.equal(s.scheduled.size,0);
 }finally{s.runner.stop()}
});
