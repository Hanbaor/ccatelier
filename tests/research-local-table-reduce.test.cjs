const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Worker}=require('node:worker_threads'),{once}=require('node:events'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),base=path.join(root,'source/atelier/js');
const core=import('../source/atelier/js/research-local-table-core.mjs'),reduce=import('../source/atelier/js/research-local-table-reduce.mjs');
const runtime=path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.js'),wasm=path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.wasm');
const engine=require(runtime)({wasmBinary:fs.readFileSync(wasm)});
const table=rows=>({headers:['值'],columns:['c1'],rows:rows.map(value=>[String(value)])});
const A='SELECT COUNT(*) AS n FROM local_data ORDER BY n',B='SELECT COUNT(*) + 1 AS n FROM local_data ORDER BY n';
const context=async()=>({c:await core,r:await reduce,SQL:await engine});
const expectCode=code=>error=>error.code===code&&!error.message.includes('private_secret');
function instrument(SQL,transform=()=>{}) {
 const stats={opened:0,closed:0,selects:0,standalone:0};
 const wrapped={Database:class {
  constructor(){stats.opened++;this.db=new SQL.Database()}
  run(...args){return this.db.run(...args)} exec(...args){return this.db.exec(...args)}
  prepare(sql){const statement=this.db.prepare(sql);if(sql.startsWith('SELECT * FROM (\n')){stats.selects++;transform(statement,sql,stats.selects)}else if(/^(SELECT|WITH)\b/.test(sql))stats.standalone++;return statement}
  close(){stats.closed++;return this.db.close()}
 }};
 return {wrapped,stats};
}

test('source subsets preserve rowid aliases, text, duplicate records and SELECT * shape',async()=>{
 const {c,SQL}=await context(),t=table(['first','中','', '9223372036854775807','中']);
 const sql='SELECT rowid,oid,_rowid_,* FROM local_data ORDER BY rowid';
 const pair=c.runLocalTablePair(SQL,t,sql,sql,{sourceIndices:[1,3,4]});
 assert.deepEqual(pair.a.rows.map(row=>row.map(cell=>cell.value)),[['2','2','2','中'],['4','4','4','9223372036854775807'],['5','5','5','中']]);
 assert.deepEqual(c.runLocalTablePair(SQL,t,'SELECT * FROM local_data','SELECT * FROM local_data',{sourceIndices:[]}).a.columns,['c1']);
 for(const indices of [[1,1],[2,1],[-1],[5],[0.5],new Array(1),null])assert.throws(()=>c.runLocalTablePair(SQL,t,sql,sql,{sourceIndices:indices}),c.LocalTableError);
 const full=c.runLocalTablePair(SQL,t,sql,sql);assert.deepEqual(full,c.runLocalTablePair(SQL,t,sql,sql,{sourceIndices:[0,1,2,3,4]}));
});

test('500 real source rows reduce to the original row 500 without renumbered evidence; replay uses two fresh pairs',async()=>{
 const {c,r,SQL}=await context(),t=table(Array.from({length:500},(_,i)=>i===499?'中':'same'));
 const a='SELECT c1 FROM local_data WHERE rowid = 500 ORDER BY rowid',b='SELECT c1 FROM local_data WHERE rowid = 500 AND c1 <> \'中\' ORDER BY rowid';
 const expected=c.runLocalTablePair(SQL,t,a,b),{wrapped,stats}=instrument(SQL);
 const witness=r.reduceLocalDifference(wrapped,t,a,b,expected);
 assert.equal(witness.status,'reduced');assert.deepEqual(witness.sourceIndices,[499]);assert.equal(witness.pair.comparison.state,'different');
 assert.ok(witness.candidateChecks<=64);assert.equal(stats.selects,witness.candidateChecks*4);assert.equal(stats.opened,stats.closed);assert.equal(stats.standalone,stats.selects);
 const before=stats.selects,replayed=r.replayLocalDifference(wrapped,t,a,b,witness);assert.equal(replayed.status,'replayed');assert.deepEqual(replayed.pair,witness.pair);assert.equal(stats.selects-before,4);
 assert.equal(t.rows.length,500);assert.deepEqual(t.rows[499],['中']);
 const originalFirst=t.rows[0][0];t.rows[0][0]='mutated after search';assert.equal(witness.provenance.table.rows[0][0],originalFirst);assert.throws(()=>r.replayLocalDifference(SQL,t,a,b,witness),expectCode('invalid-witness'));t.rows[0][0]=originalFirst;
 const changedHeader=structuredClone(t);changedHeader.headers[0]='new header';assert.throws(()=>r.replayLocalDifference(SQL,changedHeader,a,b,witness),expectCode('invalid-witness'));
 const renumbered=c.runLocalTablePair(SQL,table(['中']),a,b);assert.equal(renumbered.comparison.state,'match');
});

test('empty source subset is a valid witness, all checks are doubled including final verification, integers remain typed',async()=>{
 const {c,r,SQL}=await context(),t=table(['','中','中','9223372036854775807']),{wrapped,stats}=instrument(SQL);
 const a='SELECT 9223372036854775807 AS x ORDER BY x',b='SELECT 9223372036854775807.0 AS x ORDER BY x';
 const witness=r.reduceLocalDifference(wrapped,t,a,b,c.runLocalTablePair(SQL,t,a,b));
 assert.deepEqual(witness.sourceIndices,[]);assert.equal(witness.candidateChecks,3);assert.equal(stats.selects,12);assert.equal(witness.pair.a.rows[0][0].type,'integer');assert.equal(witness.pair.b.rows[0][0].type,'real');
 assert.equal(r.replayLocalDifference(SQL,t,a,b,witness).status,'replayed');
 for(const change of [w=>w.candidateChecks=-1,w=>w.unknownCandidates='1',w=>w.budgetExhausted='false',w=>w.originalRows=99,w=>w.pair.comparison.actualMarks=['same'],w=>w.pair.comparison.missing=99,w=>w.provenance.table.rows[0][0]='changed']){const bad=structuredClone(witness);change(bad);assert.throws(()=>r.replayLocalDifference(SQL,t,a,b,bad),expectCode('invalid-witness'))}
 assert.throws(()=>r.replayLocalDifference(SQL,t,a+' -- changed',b,witness),expectCode('invalid-witness'));
 const empty=table([]);assert.equal(r.reduceLocalDifference(SQL,empty,a,b,c.runLocalTablePair(SQL,empty,a,b)).status,'not-found');
});

test('order witnesses preserve multiplicity and category; different cannot degrade to order',async()=>{
 const {c,r,SQL}=await context(),t=table(['中','','中']);
 const a='SELECT c1 FROM local_data ORDER BY c1 ASC',b='SELECT c1 FROM local_data ORDER BY c1 DESC';
 const witness=r.reduceLocalDifference(SQL,t,a,b,c.runLocalTablePair(SQL,t,a,b));assert.equal(witness.pair.comparison.state,'order');assert.equal(witness.sourceIndices.length,2);
 const b2="SELECT CASE WHEN 3 = (SELECT COUNT(*) FROM local_data) THEN 'different' ELSE c1 END AS c1 FROM local_data ORDER BY c1 DESC";
 const different=r.reduceLocalDifference(SQL,t,a,b2,c.runLocalTablePair(SQL,t,a,b2));assert.equal(different.status,'not-found');assert.equal(different.pair.comparison.state,'different');
});

test('non-monotonic count 2/5 search returns reproducible evidence without minimality claims',async()=>{
 const {c,r,SQL}=await context(),t=table([1,2,3,4,5]);
 const a='SELECT COUNT(*) IN (2,5) AS x FROM local_data ORDER BY x',b='SELECT 0 AS x ORDER BY x';
 const witness=r.reduceLocalDifference(SQL,t,a,b,c.runLocalTablePair(SQL,t,a,b));assert.equal(witness.sourceIndices.length,2);assert.equal(witness.pair.comparison.state,'different');
 for(const key of ['minimal','oneMinimal','globalMinimum','equivalent'])assert.equal(key in witness,false);
});

test('64 candidate cap includes unsuccessful empty, baseline and final checks',async()=>{
 const {c,r,SQL}=await context(),t=table(Array(80).fill('x'));
 const a='SELECT COUNT(*) = 80 AS n FROM local_data ORDER BY n',b='SELECT 0 AS n ORDER BY n',expected=c.runLocalTablePair(SQL,t,a,b),{wrapped,stats}=instrument(SQL);
 const result=r.reduceLocalDifference(wrapped,t,a,b,expected);assert.equal(result.status,'not-found');assert.equal(result.candidateChecks,64);assert.equal(result.budgetExhausted,true);assert.equal(result.sourceIndices.length,80);assert.equal(stats.selects,256);assert.equal(stats.opened,stats.closed);
});

test('unknown query errors and truncation are never equivalence or deletion evidence',async()=>{
 const {c,r,SQL}=await context(),t=table(['a','b']);
 const a='SELECT CASE WHEN COUNT(*) = 0 THEN abs(-9223372036854775808) ELSE COUNT(*) END AS n FROM local_data ORDER BY n';
 const counted=instrument(SQL),witness=r.reduceLocalDifference(counted.wrapped,t,a,B,c.runLocalTablePair(SQL,t,a,B));assert.equal(witness.sourceIndices.length,1);assert.ok(witness.unknownCandidates>=1);assert.ok(counted.stats.opened<witness.candidateChecks*4);assert.equal(counted.stats.opened,counted.stats.closed);
 const expected=c.runLocalTablePair(SQL,t,A,B);
 const {wrapped}=instrument(SQL,(statement,sql,n)=>{statement.step();const value=statement.get(undefined,{useBigInt:true})[0];statement.reset();if(value===(sql.includes('COUNT(*) + 1')?1n:0n)){let step=0;statement.step=()=>++step<=101;statement.get=()=>[0n]}});
 const limited=r.reduceLocalDifference(wrapped,t,A,B,expected);assert.equal(limited.sourceIndices.length,1);assert.ok(limited.unknownCandidates>=1);
 const baselineTruncated=structuredClone(expected);baselineTruncated.a.truncated=true;baselineTruncated.comparison=c.compareLocalResults(baselineTruncated.a,baselineTruncated.b);
 assert.throws(()=>r.reduceLocalDifference(SQL,t,A,B,baselineTruncated),expectCode('invalid-witness'));
});

test('baseline drift, candidate instability and final drift immediately revoke all evidence',async()=>{
 const {c,r,SQL}=await context(),t=table(['x']),expected=c.runLocalTablePair(SQL,t,A,B);
 const changed=structuredClone(expected);changed.a.rows[0][0].value='99';changed.comparison=c.compareLocalResults(changed.a,changed.b);
 assert.throws(()=>r.reduceLocalDifference(SQL,t,A,B,changed),expectCode('unstable'));
 for(const turn of [3,7,11]){
  const {wrapped,stats}=instrument(SQL,(statement,sql,n)=>{if(n===turn){const get=statement.get.bind(statement);statement.get=(...args)=>{const row=get(...args);row[0]=999n;return row}}});
  assert.throws(()=>r.reduceLocalDifference(wrapped,t,A,B,expected),expectCode('unstable'));assert.equal(stats.selects,Math.ceil(turn/4)*4);assert.equal(stats.opened,stats.closed);
 }
 const witness=r.reduceLocalDifference(SQL,t,A,B,expected);witness.pair.a.rows[0][0].value='99';witness.pair.comparison=c.compareLocalResults(witness.pair.a,witness.pair.b);
 assert.throws(()=>r.replayLocalDifference(SQL,t,A,B,witness),expectCode('unstable'));
});

test('gate rejects nested LIMIT/OFFSET, unknown functions and no top-level order; default gate is unchanged',async()=>{
 const {c,r,SQL}=await context(),gate=await import('../source/atelier/js/research-sql-deterministic.mjs'),t=table(['x']),expected=c.runLocalTablePair(SQL,t,A,B);
 for(const sql of ['SELECT c1 FROM local_data ORDER BY c1 LIMIT 1','SELECT * FROM (SELECT c1 FROM local_data LIMIT 1) ORDER BY c1','SELECT 1 AS x ORDER BY x OFFSET 1','SELECT random() AS x ORDER BY x','SELECT private_secret(1) AS x ORDER BY x','SELECT c1 FROM local_data','WITH x AS (SELECT c1 FROM local_data ORDER BY c1) SELECT * FROM x'])assert.throws(()=>r.reduceLocalDifference(SQL,t,sql,B,expected),expectCode('unsupported'));
 assert.equal(gate.validateMinimizerSql('SELECT 1 ORDER BY 1 LIMIT 1'),'SELECT 1 ORDER BY 1 LIMIT 1');
 for(const sql of ["SELECT 'LIMIT OFFSET' AS x ORDER BY x",'SELECT 1 AS "limit" ORDER BY "limit"','SELECT 1 AS [offset] ORDER BY [offset]','SELECT 1 AS `limit` ORDER BY `limit`','SELECT 1 AS x /* LIMIT 1 */ ORDER BY x -- OFFSET 2'])assert.equal(gate.validateMinimizerSql(sql,{rejectLimitOffset:true}),sql);
 // Balanced lexer tokens are not SQLite standalone syntax. Wrapper acceptance
 // cannot substitute for standalone prepare (nor can a valid-looking suffix).
 assert.throws(()=>r.reduceLocalDifference(SQL,t,'SELECT FROM local_data ORDER BY c1',B,expected),expectCode('unknown'));
});

function makeWorker(){
 const source=fs.readFileSync(path.join(base,'research-local-table-worker.js'),'utf8').replace(/import\('\.\/(research-local-table-(?:core|reduce)\.mjs)'\)/g,(_,name)=>`import(${JSON.stringify(pathToFileURL(path.join(base,name)).href)})`);
 return new Worker(`const {parentPort}=require('node:worker_threads');global.self={location:{href:'https://test.invalid/atelier/js/research-local-table-worker.js'},postMessage:data=>parentPort.postMessage(data)};global.importScripts=()=>{global.initSqlJs=()=>require(${JSON.stringify(runtime)})({wasmBinary:require('node:fs').readFileSync(${JSON.stringify(wasm)})})};parentPort.on('message',data=>self.onmessage({data}));\n${source}`,{eval:true});
}
test('real Worker reduce and replay messages round-trip typed witnesses and fixed-code sanitized errors',{timeout:10000},async()=>{
 const worker=makeWorker(),t=table(['x']);const submit=async data=>{const event=once(worker,'message');worker.postMessage(data);return (await event)[0]};
 try{
  assert.equal((await once(worker,'message'))[0].type,'ready');
  const common={table:t,sqlA:A,sqlB:B};const run=await submit({...common,type:'run',id:1});
  const reduced=await submit({...common,type:'reduce',id:2,expectedPair:run.result});assert.equal(reduced.id,2);assert.equal(reduced.result.status,'reduced');
  const replay=await submit({...common,type:'replay',id:3,witness:reduced.result});assert.equal(replay.result.status,'replayed');assert.deepEqual(replay.result.pair,reduced.result.pair);
  const error=await submit({...common,type:'reduce',id:4,sqlA:'SELECT private_secret(1) ORDER BY 1',expectedPair:run.result});assert.equal(error.code,'unsupported');assert.equal(error.result,undefined);assert.ok(!error.error.includes('private_secret'));
 }finally{await worker.terminate()}
});

test('budget exhaustion returns only finally reverified best-so-far; final unknown returns no witness',async()=>{
 const {c,r,SQL}=await context(),t=table(Array(80).fill('x'));
 const a='SELECT COUNT(*) IN (40,80) AS n FROM local_data ORDER BY n',b='SELECT 0 AS n ORDER BY n';
 const result=r.reduceLocalDifference(SQL,t,a,b,c.runLocalTablePair(SQL,t,a,b));
 assert.equal(result.status,'reduced');assert.equal(result.sourceIndices.length,40);assert.equal(result.candidateChecks,64);assert.equal(result.budgetExhausted,true);
 assert.equal(r.replayLocalDifference(SQL,t,a,b,result).status,'replayed');
 const small=table(['x']),expected=c.runLocalTablePair(SQL,small,A,B);
 const {wrapped,stats}=instrument(SQL,(statement,sql,n)=>{if(n>=9){let step=0;statement.step=()=>++step<=101;statement.get=()=>[0n]}});
 assert.throws(()=>r.reduceLocalDifference(wrapped,small,A,B,expected),expectCode('unknown'));assert.equal(stats.selects,12);assert.equal(stats.opened,stats.closed);
});
