const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),core=import('../source/atelier/js/research-sql-core.mjs');
const engine=require('../source/atelier/vendor/sql.js/1.14.2/sql-wasm.js')({wasmBinary:fs.readFileSync(path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.wasm'))});

test('independent one-to-many joins multiply rows; primary-key counts preserve each entity',async()=>{
 const c=await core,SQL=await engine,f=c.getSqlCase('join-fanout');
 assert.equal(f.tables.reduce((sum,t)=>sum+t.rows.length,0),6);
 assert.deepEqual(c.runFixtureQuery(SQL,f.id,f.candidate).rows,[['Aster',4,4],['Moss',0,0]]);
 assert.deepEqual(c.runFixtureQuery(SQL,f.id,f.reference).rows,[['Aster',2,2],['Moss',0,0]]);
 assert.deepEqual(c.runFixtureQuery(SQL,f.id,`SELECT t.id, r.id FROM artists AS a
 LEFT JOIN tracks AS t ON t.artist_id=a.id
 LEFT JOIN rehearsals AS r ON r.artist_id=a.id WHERE a.id=1 ORDER BY t.id,r.id`).rows,[[101,1],[101,2],[102,1],[102,2]]);
 assert.match(f.insight,/主键/);assert.match(f.insight,/不能推广为 SUM/);
 assert.deepEqual(c.SQL_LIMITS,{queryChars:4000,rows:100,columns:16,cellChars:512,heapBytes:16777216,planRows:64,planDetailChars:512});
});

test('fanout variants expose accidental agreement, wrong title deduplication, and lost outer rows',async()=>{
 const c=await core,SQL=await engine,f=c.getSqlCase('join-fanout');
 const expected={default:[['Aster',2,2],['Moss',0,0]],'one-each':[['Aster',1,1],['Moss',0,0]],'same-title':[['Aster',2,2],['Moss',0,0]],'no-rehearsals':[['Aster',2,0],['Moss',0,0]]};
 for(const [id,rows] of Object.entries(expected)){
  assert.deepEqual(c.getSqlDataset(f.id,id).expected.rows,rows);
  assert.deepEqual(c.runFixtureQuery(SQL,f.id,f.reference,id).rows,rows);
 }
 const titleCount=f.reference.replace('DISTINCT t.id','DISTINCT t.title');
 assert.deepEqual(c.runFixtureQuery(SQL,f.id,titleCount,'default').rows,expected.default);
 assert.deepEqual(c.runFixtureQuery(SQL,f.id,titleCount,'same-title').rows,[['Aster',1,2],['Moss',0,0]]);
 assert.deepEqual(c.runFixtureQuery(SQL,f.id,f.reference.replaceAll('LEFT JOIN','JOIN'),'no-rehearsals').rows,[]);
 const {runSqlSuite}=await import('../source/atelier/js/research-sql-suite.mjs');
 const runner={run:(id,sql,dataset)=>Promise.resolve(c.runFixtureQuery(SQL,id,sql,dataset))};
 const results=await runSqlSuite({caseId:f.id,sql:f.candidate,runner});
 assert.deepEqual(results.map(row=>row.state),['different','match','different','match']);
 const wrong=await runSqlSuite({caseId:f.id,sql:titleCount,runner});
 assert.deepEqual(wrong.map(row=>row.state),['match','match','different','match']);
});

test('fanout has an exact four-row minimum and replay retains all three tables',async()=>{
 const c=await core,SQL=await engine,f=c.getSqlCase('join-fanout'),result=c.minimizeCounterexample(SQL,f.id,f.candidate);
 assert.equal(result.state,'witness');assert.equal(result.remainingRows,4);assert.equal(result.mask,29);assert.equal(result.tested,46);assert.equal(result.totalSubsets,64);
 assert.deepEqual(result.tables.map(t=>t.rows),[[[1,'Aster']],[[101,1,'Blue'],[102,1,'Gold']],[[1,1]]]);
 assert.deepEqual(result.actual.rows,[['Aster',2,2]]);assert.deepEqual(result.reference.rows,[['Aster',2,1]]);
 assert.deepEqual(c.replayCounterexample(SQL,f.id,f.candidate,'default',29).comparison,result.comparison);
 const db=new SQL.Database();try{assert.deepEqual(db.exec(result.script).slice(1).map(r=>r.values),[result.actual.rows,result.reference.rows]);assert.equal(db.exec('PRAGMA query_only')[0].values[0][0],1)}finally{db.close()}
});

test('adding fanout preserves old v1 case identities and draft/share import contracts',async()=>{
 const c=await core,s=await import('../source/atelier/js/research-sql-snapshot.mjs'),share=await import('../source/atelier/js/research-sql-share.mjs');
 assert.equal(c.SQL_CASE_REVISION,1);assert.equal(c.SQL_ENGINE,'sql.js@1.14.2');
 assert.deepEqual(c.SQL_CASES.map(f=>f.id),['empty-count','top-ties','null-exclusion','join-fanout']);
 for(const [id,datasets] of Object.entries({'empty-count':['default','no-tracks','empty'],'top-ties':['default','unique','empty'],'null-exclusion':['default','no-null','empty-rehearsals']})){
  assert.deepEqual(c.listSqlDatasets(id).map(d=>d.id),datasets);
  for(const datasetId of datasets){
   const old={format:'cc-atelier-sql',version:1,engine:'sql.js@1.14.2',caseId:id,caseRevision:1,datasetId,datasetRevision:1,sql:'SELECT original draft'};
   assert.deepEqual(s.parseSqlSnapshot(JSON.stringify(old)),old);
   assert.deepEqual(share.decodeSqlShare(share.encodeSqlShare(old)),old);
  }
 }
});
