const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),core=import('../source/atelier/js/research-sql-core.mjs'),snap=import('../source/atelier/js/research-sql-snapshot.mjs');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
async function setup(){
 const html=require('ejs').render(fs.readFileSync(path.join(root,'custom/redefine/nijika/research.ejs'),'utf8'),{url_for:value=>'/'+value,partial:()=>''});
 const dom=new JSDOM(html,{url:'https://ccatelier.test/research/',pretendToBeVisual:true});
 const {initResearchSql}=await import('../source/atelier/js/research-sql.js');
 const calls=[],requests=[];let stops=0;
 const controller=initResearchSql(dom.window.document,{runnerFactory:()=>({run(...args){calls.push(args);const request=deferred();requests.push(request);return request.promise},stop(){stops++}})});
 const doc=dom.window.document,$=sel=>doc.querySelector(sel),panel=()=> $('[data-sql-case]:not([hidden])'),editor=()=>panel().querySelector('[data-sql-editor]');
 return{dom,doc,$,panel,editor,controller,calls,requests,get stops(){return stops},close(){controller.stop();dom.window.close()}};
}
async function file(caseId='top-ties',datasetId='unique',sql='SELECT draft'){
 const {createSqlSnapshot,serializeSqlSnapshot}=await snap,text=serializeSqlSnapshot(createSqlSnapshot(caseId,datasetId,sql));
 return{size:Buffer.byteLength(text),text:async()=>text};
}

test('all nine immutable built-in combinations execute expected reference and candidate boundaries',async()=>{
 const {SQL_CASES,listSqlDatasets,getSqlDataset,runFixtureQuery,compareResults}=await core;
 const SQL=await require('../source/atelier/vendor/sql.js/1.14.2/sql-wasm.js')({wasmBinary:fs.readFileSync(path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.wasm'))});
 let count=0;
 for(const item of SQL_CASES)for(const dataset of listSqlDatasets(item.id)){
  count++;const fixture=getSqlDataset(item.id,dataset.id);
  assert.ok(Object.isFrozen(fixture.tables[0].rows));
  const reference=runFixtureQuery(SQL,item.id,fixture.reference,dataset.id);
  assert.deepEqual(reference,{...fixture.expected,truncated:false});
  const state=compareResults(runFixtureQuery(SQL,item.id,fixture.candidate,dataset.id),fixture.expected).state;
  assert.equal(state,dataset.id==='default'||dataset.id==='no-tracks'?'different':'match',item.id+'/'+dataset.id);
 }
 assert.equal(count,9);
 assert.throws(()=>getSqlDataset('__proto__','default'));
 assert.throws(()=>getSqlDataset('top-ties','constructor'));
 assert.throws(()=>getSqlDataset('top-ties','default',2));
 assert.deepEqual(runFixtureQuery(SQL,'null-exclusion','SELECT track_id FROM rehearsals ORDER BY id').rows,[[102],[null]]);
});

test('snapshot round trips preserve exact incomplete, empty and Unicode draft text',async()=>{
 const {SQL_CASES,listSqlDatasets}=await core,{createSqlSnapshot,serializeSqlSnapshot,parseSqlSnapshot}=await snap;
 for(const item of SQL_CASES)for(const dataset of listSqlDatasets(item.id))for(const sql of ['', 'SELECT  中文\n  FROM', 'SELECT 1;', 'x'.repeat(4000)]){
  const value=createSqlSnapshot(item.id,dataset.id,sql),text=serializeSqlSnapshot(value);
  assert.deepEqual(parseSqlSnapshot(text),value);assert.equal(serializeSqlSnapshot(parseSqlSnapshot(text)),text);
 }
});

test('snapshot rejects size, schema, version and prototype attacks without accepting arbitrary SQL setup',async()=>{
 const {createSqlSnapshot,serializeSqlSnapshot,parseSqlSnapshot,validateSqlSnapshot,SQL_SNAPSHOT_LIMIT}=await snap;
 const original=createSqlSnapshot('empty-count','default','SELECT 1');
 for(const value of [null,[],1,'a',{}, {...original,schema:'DROP TABLE x'},{...original,expected:[]},{...original,version:2},{...original,engine:'https://evil/'},{...original,caseRevision:undefined},{...original,datasetRevision:'1'},{...original,caseId:'__proto__'},{...original,datasetId:'constructor'},{...original,sql:null},{...original,sql:'x'.repeat(4001)},{...original,sql:'SELECT\0'},Object.assign(Object.create({}),original)])assert.throws(()=>validateSqlSnapshot(value));
 assert.throws(()=>parseSqlSnapshot('{broken'));
 assert.throws(()=>parseSqlSnapshot(JSON.stringify(original).replace('{','{"__proto__":{},')));
 const text=serializeSqlSnapshot(original),padded=text+' '.repeat(SQL_SNAPSHOT_LIMIT-Buffer.byteLength(text));
 assert.deepEqual(parseSqlSnapshot(padded),original);assert.throws(()=>parseSqlSnapshot(padded+' '));
 assert.throws(()=>parseSqlSnapshot('界'.repeat(12000)),/32 KiB/);
});

test('import preserves all current drafts for reversible restore and never starts a query',async()=>{
 const s=await setup();try{
  s.editor().value='SELECT original unfinished';s.editor().dispatchEvent(new s.dom.window.Event('input'));
  s.controller.select('top-ties');s.editor().value='SELECT old target';s.editor().dispatchEvent(new s.dom.window.Event('input'));s.controller.select('empty-count');
  await s.controller.importFile(await file('top-ties','unique','SELECT imported'));
  assert.equal(s.calls.length,0);assert.equal(s.panel().dataset.sqlCase,'top-ties');assert.equal(s.editor().value,'SELECT imported');assert.equal(s.$('[data-sql-dataset]').value,'unique');
  assert.match(s.$('[data-sql-status]').textContent,/尚未运行.*可恢复/);
  assert.equal(s.panel().querySelector('[data-sql-fixture="scores"] tbody tr:nth-child(2) td:last-child').textContent,'94');
  s.editor().value='SELECT edited imported';s.editor().dispatchEvent(new s.dom.window.Event('input'));
  s.$('[data-sql-restore-draft]').click();assert.equal(s.panel().dataset.sqlCase,'empty-count');assert.equal(s.editor().value,'SELECT original unfinished');
  s.controller.select('top-ties');assert.equal(s.editor().value,'SELECT old target');assert.equal(s.$('[data-sql-dataset]').value,'default');
  s.$('[data-sql-restore-draft]').click();assert.equal(s.editor().value,'SELECT edited imported');assert.equal(s.$('[data-sql-dataset]').value,'unique');assert.equal(s.calls.length,0);
 }finally{s.close()}
});

test('old file reads cannot overwrite newer imports, edits, case or dataset changes, Run, or pagehide',async()=>{
 for(const action of ['import','edit','case','dataset','run','pagehide','dialog']){
  const s=await setup();try{
   const old=deferred(),pending=s.controller.importFile({size:100,text:()=>old.promise});
   if(action==='import')await s.controller.importFile(await file('null-exclusion','no-null','SELECT newest'));
   if(action==='edit'){s.editor().value='SELECT newest';s.editor().dispatchEvent(new s.dom.window.Event('input'));}
   if(action==='case')s.controller.select('null-exclusion');
   if(action==='dataset'){s.$('[data-sql-dataset]').value='empty';s.$('[data-sql-dataset]').dispatchEvent(new s.dom.window.Event('change'));}
   if(action==='run')s.controller.run();
   if(action==='pagehide')s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));
   if(action==='dialog')s.doc.dispatchEvent(new s.dom.window.Event('atelier:dialog-open'));
   const before={id:s.panel().dataset.sqlCase,sql:s.editor().value,data:s.$('[data-sql-dataset]').value,status:s.$('[data-sql-status]').textContent};
   old.resolve(await (await file()).text());await pending;
   assert.deepEqual({id:s.panel().dataset.sqlCase,sql:s.editor().value,data:s.$('[data-sql-dataset]').value,status:s.$('[data-sql-status]').textContent},before,action);
  }finally{s.close()}
 }
});

test('invalid or unreadable import retains current draft, data and result; oversized files are not read',async()=>{
 const s=await setup();try{
  s.controller.run();s.requests[0].resolve({columns:['x'],rows:[[42]],truncated:false});await flush();
  const sql=s.editor().value,result=s.panel().querySelector('[data-sql-actual]').textContent;let read=false;
  for(const bad of [{size:32769,text:()=>{read=true;return Promise.resolve('{}')}},{size:2,text:async()=>'{x'},{size:2,text:async()=>{throw Error('read failed')}},{size:1,text:async()=>' '.repeat(32769)}]){
   await s.controller.importFile(bad);assert.equal(s.editor().value,sql);assert.equal(s.$('[data-sql-dataset]').value,'default');assert.equal(s.panel().querySelector('[data-sql-actual]').textContent,result);
  }
  assert.equal(read,false);assert.equal(s.calls.length,1);assert.equal(s.$('[data-sql-restore-draft]').hidden,true);
 }finally{s.close()}
});

test('import cancels running results; dataset selection preserves SQL and empty expected has readable zero rows',async()=>{
 const {getSqlCase}=await core,s=await setup();try{
  s.controller.run();await s.controller.importFile(await file('top-ties','empty','SELECT * FROM scores'));
  s.requests[0].resolve({...getSqlCase('empty-count').expected,truncated:false});await flush();
  assert.equal(s.panel().querySelector('[data-sql-result-count]').textContent,'尚未运行');assert.match(s.panel().querySelector('[data-sql-expected]').textContent,/0 行/);
  s.controller.run();assert.deepEqual(s.calls[1],['top-ties','SELECT * FROM scores','empty']);
  s.requests[1].resolve({columns:['track','points'],rows:[],truncated:false});await flush();assert.match(s.$('[data-sql-status]').textContent,/不代表所有数据/);
  s.$('[data-sql-dataset]').value='unique';s.$('[data-sql-dataset]').dispatchEvent(new s.dom.window.Event('change'));
  assert.equal(s.editor().value,'SELECT * FROM scores');assert.equal(s.calls.length,2);assert.equal(s.panel().querySelector('[data-sql-result-count]').textContent,'尚未运行');
 }finally{s.close()}
});

test('export downloads exact local draft, revokes URL and does not execute; file input can be reused',async()=>{
 const {parseSqlSnapshot}=await snap,s=await setup();try{
  let blob,download,revoked;const urls=s.dom.window.URL;
  urls.createObjectURL=value=>{blob=value;return'blob:local-test'};urls.revokeObjectURL=value=>{revoked=value};
  s.dom.window.HTMLAnchorElement.prototype.click=function(){download=this.download};
  s.editor().value='SELECT 中文\n incomplete';s.controller.exportDraft();
  const text=await new Promise((resolve,reject)=>{const reader=new s.dom.window.FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsText(blob)});
  assert.equal(parseSqlSnapshot(text).sql,s.editor().value);assert.equal(download,'cc-atelier-empty-count-default-v1.json');assert.equal(s.calls.length,0);
  await new Promise(resolve=>setTimeout(resolve,10));assert.equal(revoked,'blob:local-test');
  const text2=await (await file()).text(),input=s.$('[data-sql-file]');Object.defineProperty(input,'files',{configurable:true,value:[new s.dom.window.File([text2],'draft.json',{type:'application/json'})]});
  input.dispatchEvent(new s.dom.window.Event('change'));await new Promise(resolve=>setTimeout(resolve,20));assert.equal(s.editor().value,'SELECT draft');assert.equal(input.value,'');
  s.editor().value='changed';input.dispatchEvent(new s.dom.window.Event('change'));await new Promise(resolve=>setTimeout(resolve,20));assert.equal(s.editor().value,'SELECT draft');assert.equal(s.calls.length,0);
 }finally{s.close()}
});

test('all nine dataset selections render their complete trusted rows and expected rows without extra case panels',async()=>{
 const {SQL_CASES,listSqlDatasets,getSqlDataset}=await core,s=await setup();try{
  assert.equal(s.doc.querySelectorAll('[data-sql-case]').length,3);
  for(const item of SQL_CASES){s.controller.select(item.id);
   for(const dataset of listSqlDatasets(item.id)){
    const fixture=getSqlDataset(item.id,dataset.id);s.$('[data-sql-dataset]').value=dataset.id;s.$('[data-sql-dataset]').dispatchEvent(new s.dom.window.Event('change'));
    for(const table of fixture.tables){
     const node=s.panel().querySelector(`[data-sql-fixture="${table.name}"]`);
     assert.deepEqual(Array.from(node.querySelectorAll('thead th'),cell=>cell.textContent),table.columns);
     assert.deepEqual(Array.from(node.querySelectorAll('tbody tr'),row=>Array.from(row.cells,cell=>cell.textContent)),table.rows.map(row=>row.map(value=>value===null?'NULL':String(value))));
    }
    assert.deepEqual(Array.from(s.panel().querySelectorAll('[data-sql-expected] tbody tr'),row=>Array.from(row.cells).slice(1).map(cell=>cell.textContent)),fixture.expected.rows.map(row=>row.map(value=>value===null?'NULL':String(value))));
    assert.equal(s.panel().querySelector('.sql-reference-panel .sql-result-heading span').textContent,`${fixture.expected.rows.length} 行`);
   }
  }
  assert.equal(s.calls.length,0);
 }finally{s.close()}
});
