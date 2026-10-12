const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),{Worker}=require('node:worker_threads'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),js=path.join(root,'source/atelier/js');
const core=import('../source/atelier/js/research-sql-core.mjs'),report=import('../source/atelier/js/research-sql-report.mjs');
const runtime=path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.js'),wasm=path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.wasm');
const engine=require(runtime)({wasmBinary:fs.readFileSync(wasm)});
const flush=()=>new Promise(r=>setTimeout(r,10));
async function observed(caseId,sql,datasetId='default') {
 const c=await core,SQL=await engine,fixture=c.getSqlDataset(caseId,datasetId),db=new SQL.Database();
 const sqliteVersion=db.exec('SELECT sqlite_version()')[0].values[0][0];db.close();
 return {...c.runFixtureQuery(SQL,caseId,sql,datasetId),runEvidence:{caseId,datasetId,sql,engine:c.SQL_ENGINE,sqliteVersion,reference:c.runFixtureQuery(SQL,caseId,fixture.reference,datasetId),referenceCheckedAgainstFixture:true,queryMs:1500,loadMs:10000}};
}
function adapter(){
 const body=fs.readFileSync(path.join(js,'research-sql-worker.js'),'utf8').replace("import('./research-sql-core.mjs')",`import(${JSON.stringify(pathToFileURL(path.join(js,'research-sql-core.mjs')).href)})`);
 const bootstrap=`const {parentPort}=require('node:worker_threads');global.self={location:{href:'https://test/worker.js'},postMessage:data=>parentPort.postMessage(data)};global.importScripts=()=>{global.initSqlJs=()=>require(${JSON.stringify(runtime)})({wasmBinary:require('node:fs').readFileSync(${JSON.stringify(wasm)})})};parentPort.on('message',data=>self.onmessage({data}));\n${body}`;
 return class Adapter{constructor(){this.worker=new Worker(bootstrap,{eval:true});this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',()=>this.onerror?.({preventDefault(){}}))}postMessage(data){this.worker.postMessage(data)}terminate(){this.worker.terminate()}};
}
async function setup(){
 const html=require('ejs').render(fs.readFileSync(path.join(root,'custom/redefine/nijika/research.ejs'),'utf8'),{url_for:v=>'/'+v,partial:()=>''});
 const dom=new JSDOM(html,{url:'https://ccatelier.test/research/',pretendToBeVisual:true}),requests=[],blobs=[],revoked=[],downloads=[],releases=[];
 const originalTimer=dom.window.setTimeout.bind(dom.window);dom.window.setTimeout=(fn,ms,...args)=>{if(ms===30000){releases.push(fn);return -releases.length}return originalTimer(fn,ms,...args)};
 dom.window.URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:test-'+blobs.length};dom.window.URL.revokeObjectURL=url=>revoked.push(url);
 dom.window.HTMLAnchorElement.prototype.click=function(){downloads.push({href:this.href,filename:this.download})};
 const {initResearchSql}=await import('../source/atelier/js/research-sql.js');
 const controller=initResearchSql(dom.window.document,{runnerFactory:()=>({run(...args){return new Promise((resolve,reject)=>requests.push({args,resolve,reject}))},stop(){}})});
 const $=s=>dom.window.document.querySelector(s),panel=()=> $('[data-sql-case]:not([hidden])'),editor=()=>panel().querySelector('[data-sql-editor]'),button=()=>panel().querySelector('[data-sql-export-record]');
 return {dom,$,panel,editor,button,controller,requests,blobs,revoked,downloads,releases,async run(){const pending=controller.run(),q=requests.at(-1);q.resolve(await observed(...q.args));await pending},async text(){return new Promise((resolve,reject)=>{const r=new dom.window.FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsText(blobs.at(-1))})},close(){controller.stop();dom.window.close()}};
}
test('all thirteen original dataset observations produce immutable typed bounded records',async()=>{
 const c=await core,r=await report;let count=0;
 for(const fixture of c.SQL_CASES) for(const data of c.listSqlDatasets(fixture.id)){
  count++;const sql='  '+fixture.candidate+'\n',result=await observed(fixture.id,sql,data.id),record=r.createSqlRunRecord({caseId:fixture.id,datasetId:data.id,sql,result});
  assert.equal(record.execution.submittedSql,sql);assert.ok(Object.isFrozen(record.actual.rows));
  assert.equal(record.execution.executedSql,`SELECT * FROM (\n${sql.trim()}\n) AS query_result LIMIT 101`);
  assert.deepEqual(record.comparison,c.compareResults(result,c.getSqlDataset(fixture.id,data.id).expected));assert.equal(record.comparisonSemantics.columnLabels,false);
  const serialized=r.serializeSqlRunRecord(record);assert.ok(Buffer.byteLength(serialized)<=r.SQL_REPORT_LIMIT);
  const before=serialized;result.rows.push(['mutation']);result.runEvidence.reference.rows.push(['mutation']);assert.equal(r.serializeSqlRunRecord(record),before);
 }assert.equal(count,13);
});
test('real SQLite special numbers, NULL and text retain observed types without changing comparator',async()=>{
 const r=await report,c=await core,sql="SELECT 1e999 AS inf, -1e999 AS neg, NULL AS n, 'NULL' AS t, '1' AS str, 1 AS num";
 const result=await observed('empty-count',sql),record=r.createSqlRunRecord({caseId:'empty-count',datasetId:'default',sql,result});
 assert.deepEqual(JSON.parse(r.serializeSqlRunRecord(record)).actual.rows[0],[{type:'number',value:'Infinity'},{type:'number',value:'-Infinity'},{type:'null',value:null},{type:'string',value:'NULL'},{type:'string',value:'1'},{type:'number',value:1}]);
 assert.deepEqual(record.comparison,c.compareResults(result,c.SQL_CASES[0].expected));
 for(const value of [-0,NaN]){result.rows[0][0]=value;const special=r.createSqlRunRecord({caseId:'empty-count',datasetId:'default',sql,result});assert.equal(special.actual.rows[0][0].value,Object.is(value,-0)?'-0':'NaN')}
});
test('aliases, order and duplicate observations preserve existing comparison semantics',async()=>{
 const r=await report,c=await core;
 for(const sql of ["SELECT name AS other, COUNT(t.id) AS other2 FROM artists a LEFT JOIN tracks t ON t.artist_id=a.id GROUP BY a.id,name ORDER BY a.id", c.SQL_CASES[0].reference.replace('ORDER BY a.id','ORDER BY a.id DESC'),"SELECT 'Aster' AS name, 2 AS tracks UNION ALL SELECT 'Aster', 2"]){
  const result=await observed('empty-count',sql),record=r.createSqlRunRecord({caseId:'empty-count',datasetId:'default',sql,result});assert.deepEqual(record.comparison,c.compareResults(result,c.SQL_CASES[0].expected));
 }
});
test('rejects truncation, mismatched evidence, oversized shape/cells and unsupported imports; enforces UTF-8 byte cap',async()=>{
 const r=await report,sql='SELECT 1',base=await observed('empty-count',sql),build=result=>r.createSqlRunRecord({caseId:'empty-count',datasetId:'default',sql,result});
 for(const alter of [x=>x.truncated=true,x=>delete x.runEvidence,x=>x.runEvidence.sql='SELECT 2',x=>x.runEvidence.reference.truncated=true,x=>x.rows=[[new Uint8Array(1)]],x=>x.rows=[['x'.repeat(513)]],x=>x.columns=Array(17).fill('n')]){const x=structuredClone(base);alter(x);assert.throws(()=>build(x))}
 const limited=await observed('empty-count','WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<105) SELECT x FROM n');assert.equal(limited.truncated,true);assert.throws(()=>r.createSqlRunRecord({caseId:'empty-count',datasetId:'default',sql:limited.runEvidence.sql,result:limited}));
 assert.throws(()=>r.serializeSqlRunRecord(JSON.parse(r.serializeSqlRunRecord(build(base)))));
 base.columns=Array(16).fill('n');base.rows=Array.from({length:100},()=>Array(16).fill('界'.repeat(512)));assert.throws(()=>r.serializeSqlRunRecord(build(base)),/1 MiB/);
});
test('actual worker returns observed reference/runtime version; timeout rejects and fresh worker recovers',async()=>{
 const {createSqlRunner}=await import('../source/atelier/js/research-sql.js'),c=await core,r=await report;
 const runner=createSqlRunner({WorkerClass:adapter(),queryMs:600,loadMs:10000});
 try{for(const fixture of c.SQL_CASES)for(const data of c.listSqlDatasets(fixture.id)){
  const result=await runner.run(fixture.id,fixture.candidate,data.id);assert.deepEqual(result.runEvidence.reference,{...c.getSqlDataset(fixture.id,data.id).expected,truncated:false});
  assert.match(result.runEvidence.sqliteVersion,/^\d+\.\d+\.\d+$/);assert.equal(r.createSqlRunRecord({caseId:fixture.id,datasetId:data.id,sql:fixture.candidate,result}).limits.queryMs,600);
 }
 await assert.rejects(runner.run('empty-count','SELECT invalid_column'),/invalid_column/);
 await assert.rejects(runner.run('empty-count','WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n) SELECT sum(x) FROM n'),/超过/);
 const result=await runner.run('empty-count','SELECT 1e999');assert.equal(result.rows[0][0],Infinity);assert.ok(result.runEvidence.reference);
 const plan=await runner.run('empty-count','SELECT 1','default','explain');assert.equal(plan.runEvidence,undefined);assert.ok(plan.version);
 }finally{runner.stop()}
});
test('controller adds one quiet hidden native action in the actual-result heading; completed export captures exact immutable run',async()=>{
 const s=await setup();try{
 assert.equal(s.button().hidden,true);assert.equal(s.button().parentElement,s.panel().querySelector('.sql-result-heading'));assert.equal(s.panel().querySelector('.sql-comparison').nextElementSibling,s.panel().querySelector('[data-sql-plan]'));
 const sql=s.editor().value,pending=s.controller.run(),q=s.requests.at(-1),result=await observed(...q.args);q.resolve(result);await pending;
 assert.equal(s.button().hidden,false);s.button().focus();s.button().click();assert.equal(s.dom.window.document.activeElement,s.button());
 const first=await s.text(),parsed=JSON.parse(first);assert.equal(parsed.execution.submittedSql,sql);assert.match(s.downloads[0].filename,/^cc-atelier-run-/);
 result.rows[0][0]='altered';s.button().click();assert.equal(await s.text(),first);await flush();assert.equal(s.revoked.length,0);assert.equal(s.releases.length,2);s.releases.forEach(fn=>fn());assert.equal(s.revoked.length,2);
 assert.match(s.$('[data-sql-status]').textContent,/已发起/);assert.match(s.panel().querySelector('[data-sql-result-count]').textContent,/SQLite/);assert.equal(s.panel().querySelector('[data-sql-actual] tbody').rows.length,3);
 }finally{s.close()}
});
test('download URL/Blob/click failures clean up, preserve observed record and permit retry',async()=>{
 for(const kind of ['url','blob','click','null']){const s=await setup();try{
 await s.run();const w=s.dom.window,original=kind==='url'?w.URL.createObjectURL:kind==='blob'?w.Blob:w.HTMLAnchorElement.prototype.click;
 if(kind==='url')w.URL.createObjectURL=()=>{throw Error('URL failure')};if(kind==='blob')w.Blob=class{constructor(){throw Error('Blob failure')}};if(kind==='click')w.HTMLAnchorElement.prototype.click=()=>{throw Error('Click failure')};if(kind==='null')w.HTMLAnchorElement.prototype.click=()=>{throw null};
 s.button().click();assert.equal(s.button().hidden,false);assert.match(s.$('[data-sql-status]').textContent,/保留.*重试/);assert.equal(s.dom.window.document.querySelectorAll('a[download]').length,0);await flush();if(kind==='click'||kind==='null')assert.equal(s.revoked.length,1);assert.equal(s.releases.length,0);
 if(kind==='url')w.URL.createObjectURL=original;if(kind==='blob')w.Blob=original;if(kind==='click'||kind==='null')w.HTMLAnchorElement.prototype.click=original;
 s.button().click();assert.equal(s.downloads.length,1);assert.equal(JSON.parse(await s.text()).execution.submittedSql,s.editor().value);
 }finally{s.close()}}
});
test('edits, reset, reference, case, dataset, import, rerun and suite invalidate action; programmatic edits cannot export stale SQL',async()=>{
 for(const action of ['edit','reset','reference','case','dataset','import','run','suite','programmatic']){const s=await setup();try{
 await s.run();
 if(action==='edit'){s.editor().value='SELECT 2';s.editor().dispatchEvent(new s.dom.window.Event('input'))}
 if(action==='reset')s.panel().querySelector('[data-sql-reset]').click();
 if(action==='reference')s.panel().querySelector('[data-sql-use-reference]').click();
 if(action==='case')s.controller.select('top-ties');
 if(action==='dataset'){s.$('[data-sql-dataset]').value='empty';s.$('[data-sql-dataset]').dispatchEvent(new s.dom.window.Event('change'))}
 if(action==='import'){const snap=await import('../source/atelier/js/research-sql-snapshot.mjs'),text=snap.serializeSqlSnapshot(snap.createSqlSnapshot('top-ties','unique','SELECT 2'));await s.controller.importFile({size:Buffer.byteLength(text),text:async()=>text})}
 if(action==='run')s.controller.run();if(action==='suite')s.controller.validateDatasets();
 if(action==='programmatic'){s.editor().value='SELECT 2';s.button().click()}
 assert.equal(s.button().hidden,true,action);assert.equal(s.downloads.length,0);
 }finally{s.close()}}
});
test('pending stale, failed, stopped, hidden and truncated runs never expose an export action',async()=>{
 for(const action of ['edit','case','dataset','stop','pagehide','programmatic','error','truncated']){const s=await setup();try{
 const pending=s.controller.run(),q=s.requests.at(-1);
 if(action==='edit'){s.editor().value='SELECT 2';s.editor().dispatchEvent(new s.dom.window.Event('input'))}
 if(action==='case')s.controller.select('top-ties');
 if(action==='dataset'){s.$('[data-sql-dataset]').value='empty';s.$('[data-sql-dataset]').dispatchEvent(new s.dom.window.Event('change'))}
 if(action==='stop')s.$('[data-sql-cancel]').click();if(action==='pagehide')s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));if(action==='programmatic')s.editor().value='SELECT 2';
 const result=await observed(...q.args);if(action==='truncated')result.truncated=true;
 if(action==='error')q.reject(Error('failed'));else q.resolve(result);await pending;assert.equal(s.button().hidden,true,action);
 }finally{s.close()}}
});
test('share-load and reversible restore clear prior records; rejected draft import preserves current record',async()=>{
 const s=await setup();try{
 await s.run();await s.controller.importFile({size:8,text:async()=>'{broken'});assert.equal(s.button().hidden,false);
 const snap=await import('../source/atelier/js/research-sql-snapshot.mjs'),share=await import('../source/atelier/js/research-sql-share.mjs');
 s.dom.window.location.hash=share.encodeSqlShare(snap.createSqlSnapshot('empty-count','default','SELECT 2'));
 await flush();await flush();s.$('[data-sql-incoming-load]').click();assert.equal(s.button().hidden,true);assert.equal(s.editor().value,'SELECT 2');
 await s.run();assert.equal(s.button().hidden,false);s.$('[data-sql-restore-draft]').click();assert.equal(s.button().hidden,true);
 }finally{s.close()}
});
test('missing evidence leaves ordinary results intact; executed plan failure does not replace or erase completed record',async()=>{
 const s=await setup();try{
 const pending=s.controller.run(),q=s.requests.at(-1),result=await observed(...q.args);delete result.runEvidence;q.resolve(result);await pending;
 assert.equal(s.button().hidden,true);assert.match(s.$('[data-sql-status]').textContent,/结果不同/);
 await s.run();s.button().click();const before=await s.text();
 const details=s.panel().querySelector('[data-sql-plan]');details.open=true;await flush();s.requests.at(-1).reject(Error('plan failed'));await flush();
 s.button().click();assert.equal(await s.text(),before);assert.equal(s.button().hidden,false);
 }finally{s.close()}
});

test('existing result heading retains wrapping and distinct result label/count without CSS additions',async()=>{
 const s=await setup();try{
 const style=s.dom.window.document.createElement('style');style.textContent=fs.readFileSync(path.join(root,'source/atelier/css/research-sql.css'),'utf8');s.dom.window.document.head.append(style);
 await s.run();const heading=s.panel().querySelector('.sql-result-heading'),computed=s.dom.window.getComputedStyle(heading);
 assert.equal(computed.display,'flex');assert.equal(computed.flexWrap,'wrap');assert.equal(heading.querySelector('h5').textContent,'实际结果');assert.match(heading.querySelector('[data-sql-result-count]').textContent,/SQLite.*3 行/);assert.equal(s.button().textContent,'导出运行记录');assert.equal(s.button().type,'button');
 }finally{s.close()}
});
