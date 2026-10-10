const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const core=import('../source/atelier/js/research-sql-core.mjs');
const engine=require('../source/atelier/vendor/sql.js/1.14.2/sql-wasm.js')({wasmBinary:fs.readFileSync(path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.wasm'))});

test('the shipped pinned SQLite WASM executes both deliberately wrong and reference queries',async()=>{
 const {SQL_CASES,runFixtureQuery,compareResults}=await core,SQL=await engine;
 for(const fixture of SQL_CASES){
  const candidate=runFixtureQuery(SQL,fixture.id,fixture.candidate),reference=runFixtureQuery(SQL,fixture.id,fixture.reference);
  assert.deepEqual(reference,{...fixture.expected,truncated:false});
  assert.equal(compareResults(reference,fixture.expected).state,'match');
  assert.equal(compareResults(candidate,fixture.expected).state,'different');
 }
 assert.deepEqual(runFixtureQuery(SQL,'empty-count',SQL_CASES[0].candidate).rows,[['Aster',2],['Lumen',1],['Moss',1]]);
 assert.deepEqual(runFixtureQuery(SQL,'top-ties',SQL_CASES[1].candidate).rows,[['Blue',95]]);
 assert.equal(require('../package.json').dependencies['sql.js'],'1.14.2');
 for(const file of ['sql-wasm.js','sql-wasm.wasm']){
  const expected=fs.readFileSync(path.join(root,'node_modules/sql.js/dist',file)),shipped=fs.readFileSync(path.join(root,'source/atelier/vendor/sql.js/1.14.2',file));
  assert.equal(crypto.createHash('sha256').update(shipped).digest('hex'),crypto.createHash('sha256').update(expected).digest('hex'));
 }
 assert.match(read('source/atelier/vendor/sql.js/1.14.2/LICENSE'),/MIT|Permission is hereby granted/);
});

test('SQL input is bounded and cannot become a PRAGMA, write, attachment or second statement',async()=>{
 const {runFixtureQuery,validateQuery,SQL_CASES}=await core,SQL=await engine;
 for(const sql of ['',null,15,'PRAGMA query_only=OFF','DELETE FROM artists','ATTACH DATABASE \'x\' AS x','SELECT 1; SELECT 2',"SELECT ';'",'SELECT 1 -- ;','SELECT 1\0; DELETE FROM artists','SELECT '+ 'x'.repeat(4000)]) assert.throws(()=>validateQuery(sql));
 for(const sql of [
  'WITH a AS (SELECT 1) DELETE FROM artists',
  'WITH a AS (SELECT 1) UPDATE artists SET name=\'Oops\' RETURNING name',
  'SELECT 1) PRAGMA query_only=OFF --',
  'SELECT 1) UPDATE artists SET name=\'Oops\' --',
  "SELECT load_extension('x')",'SELECT * FROM pragma_query_only(0)',
  'SELECT 1) ATTACH DATABASE \'x\' AS x --',
  'SELECT 1) SELECT 2 --', 'WITH changed AS (DELETE FROM artists RETURNING *) SELECT * FROM changed'
 ]) assert.throws(()=>runFixtureQuery(SQL,'empty-count',sql),sql);
 assert.deepEqual(runFixtureQuery(SQL,'empty-count','SELECT * FROM pragma_query_only').rows,[[1]]);
 assert.deepEqual(runFixtureQuery(SQL,'empty-count',SQL_CASES[0].reference).rows,SQL_CASES[0].expected.rows,'fresh original fixture after every invalid query');
 assert.throws(()=>runFixtureQuery(SQL,'__proto__','SELECT 1'),/未知/);
 // Strings/comments are data and are not interpreted by an imitation SQL parser.
 assert.deepEqual(runFixtureQuery(SQL,'empty-count',"SELECT 'DROP TABLE artists' AS text, NULL AS absent -- harmless comment").rows,[['DROP TABLE artists',null]]);
});

test('SQLite allocation, row, column and cell limits remain bounded and recoverable',async()=>{
 const {runFixtureQuery,SQL_LIMITS,SQL_CASES,compareResults}=await core,SQL=await engine;
 const limited=runFixtureQuery(SQL,'empty-count','WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<1000) SELECT x FROM n');
 assert.equal(limited.rows.length,100);assert.equal(limited.truncated,true);assert.equal(compareResults(limited,SQL_CASES[0].expected).state,'limited');
 const exact=runFixtureQuery(SQL,'empty-count','WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<100) SELECT x FROM n');
 assert.equal(exact.rows.length,100);assert.equal(exact.truncated,false);
 assert.throws(()=>runFixtureQuery(SQL,'empty-count','SELECT '+Array.from({length:17},(_,i)=>i).join(',')),/16/);
 assert.throws(()=>runFixtureQuery(SQL,'empty-count',"SELECT printf('%0513d',1)"),/512/);
 assert.throws(()=>runFixtureQuery(SQL,'empty-count','SELECT zeroblob(8)'),/二进制/);
 assert.throws(()=>runFixtureQuery(SQL,'empty-count','SELECT randomblob(33554432)'),/memory|内存/i);
 assert.deepEqual(runFixtureQuery(SQL,'empty-count','SELECT * FROM pragma_hard_heap_limit').rows,[[SQL_LIMITS.heapBytes]]);
 for(let i=0;i<40;i++)assert.deepEqual(runFixtureQuery(SQL,'empty-count',SQL_CASES[0].reference).rows,SQL_CASES[0].expected.rows);
});

test('comparison preserves types, duplicate multiplicity and the question’s requested order',async()=>{
 const {compareResults}=await core,expected={columns:['name','n'],rows:[['A',1],['A',1],['B',0]]};
 assert.equal(compareResults({...expected,truncated:false},expected).state,'match');
 assert.equal(compareResults({columns:['renamed','count'],rows:expected.rows},expected).state,'match','aliases do not decide equivalence');
 const duplicate=compareResults({columns:expected.columns,rows:[['A',1],['B',0],['B',0]]},expected);
 assert.equal(duplicate.missing,1);assert.equal(duplicate.extra,1);assert.deepEqual(duplicate.actualMarks,['same','same','extra']);
 assert.equal(compareResults({columns:expected.columns,rows:[['B',0],['A',1],['A',1]]},expected).state,'order');
 assert.equal(compareResults({columns:expected.columns,rows:[['A','1'],['A',1],['B',0]]},expected).state,'different');
 assert.equal(compareResults({columns:['name'],rows:[['A'],['A'],['B']]},expected).state,'different');
 assert.equal(compareResults({columns:['n'],rows:[]},{columns:['n'],rows:[]}).state,'match');
});

test('static research fixtures, SQL and expected rows agree with runtime and are readable without scripts',async()=>{
 const {SQL_CASES}=await core,dom=new JSDOM(read('public/research/index.html')),doc=dom.window.document;
 try{
  assert.equal(doc.querySelectorAll('.room-research h1').length,1);
  for(const fixture of SQL_CASES){
   const panel=doc.querySelector(`[data-sql-case="${fixture.id}"]`);assert.ok(panel);assert.equal(panel.hidden,false);
   assert.equal(panel.querySelector('[data-sql-editor]').value,fixture.candidate);assert.equal(panel.querySelector('[data-sql-editor]').readOnly,true);
   assert.equal(panel.querySelector('[data-sql-reference]').textContent,fixture.reference);
   for(const data of fixture.tables){
    const table=panel.querySelector(`[data-sql-fixture="${data.name}"]`);
    assert.deepEqual(Array.from(table.querySelectorAll('thead th'),cell=>cell.textContent),data.columns);
    assert.deepEqual(Array.from(table.querySelectorAll('tbody tr'),row=>Array.from(row.cells,cell=>cell.textContent)),data.rows.map(row=>row.map(String)));
   }
   assert.deepEqual(Array.from(panel.querySelectorAll('[data-sql-expected] tbody tr'),row=>Array.from(row.cells).slice(1).map(cell=>cell.textContent)),fixture.expected.rows.map(row=>row.map(String)));
   assert.equal(panel.querySelector('.sql-insight').open,false);
  }
  assert.ok(doc.querySelector('[data-sql-run-bar]').hidden);assert.ok(doc.querySelector('script[src="/atelier/js/research-sql.js"]'));
  assert.match(doc.querySelector('.sql-boundaries').textContent,/本例|不保证|分号/);
  assert.equal(doc.querySelectorAll('[autofocus]').length,0);
  for(const route of ['index.html','notes/index.html','projects/index.html','studio/index.html'])assert.doesNotMatch(read('public/'+route),/research-sql\.(js|css)/);
  assert.doesNotMatch(read('source/atelier/js/main.js'),/research-sql|sql-wasm/);
  assert.doesNotMatch(read('source/atelier/js/research-sql.js'),/fetch\(|localStorage|sessionStorage|initSqlJs|sql-wasm/);
  assert.match(read('source/atelier/js/research-sql-worker.js'),/importScripts\('\.\.\/vendor\/sql\.js\/1\.14\.2\/sql-wasm\.js'\)/);
 }finally{dom.window.close()}
});
