const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Worker}=require('node:worker_threads'),{once}=require('node:events'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),core=import('../source/atelier/js/research-local-table-core.mjs');
const runtime=path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.js'),wasm=path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.wasm');
const engine=require(runtime)({wasmBinary:fs.readFileSync(wasm)}),bytes=s=>new TextEncoder().encode(s);
const fixture=c=>c.parseLocalTable(bytes('name,points\nBlue,001\nGold,9223372036854775807\nBlue,001'));
const cell=(type,value)=>({type,value}), result=rows=>({columns:['x'],rows:rows.map(value=>[value]),truncated:false});

test('strict CSV/TSV preserves source text, quoting, BOM and original headers without identifiers',async()=>{
 const c=await core;
 const parsed=c.parseLocalTable(bytes('\ufeff名字,"name,quoted",name,name\r\n"a\r\nb","say ""hi""",001,=1+1\r\n"",NULL,  x  ,9223372036854775807\r\n'));
 assert.deepEqual(parsed,{headers:['名字','name,quoted','name','name'],columns:['c1','c2','c3','c4'],rows:[['a\r\nb','say "hi"','001','=1+1'],['','NULL','  x  ','9223372036854775807']]});
 assert.deepEqual(c.parseLocalTable(bytes('a\tb\n"x\ty"\t0\n'),'\t').rows,[['x\ty','0']]);
 assert.deepEqual(c.parseLocalTable(bytes('header')).rows,[]);
 assert.deepEqual(c.parseLocalTable(bytes('header\n\n')).rows,[['']]);
 assert.deepEqual(c.parseLocalTable(bytes('a,b\nx,')).rows,[['x','']]);
 const malicious=c.parseLocalTable(bytes('"x\"\"; DROP TABLE local_data;--",__proto__,\n"<img src=x onerror=alert(1)>",NULL,001'));
 assert.deepEqual(malicious.columns,['c1','c2','c3']);
 assert.equal(malicious.headers[0],'x"; DROP TABLE local_data;--');
 const clone=c.validateLocalTable(parsed);clone.rows[0][0]='changed';assert.notEqual(parsed.rows[0][0],'changed');
});

test('parser rejects invalid encodings, dialect, malformed records and every size boundary',async()=>{
 const c=await core;
 for(const source of ['', 'a\n"unfinished','a\na"b','a\n"x" trailing','a,b\nx','a,b\nx,y,z','a\rb','a\nx\0'])assert.throws(()=>c.parseLocalTable(bytes(source)),c.LocalTableError,source);
 assert.throws(()=>c.parseLocalTable(new Uint8Array([0xc3,0x28])),/UTF-8/);
 assert.throws(()=>c.parseLocalTable(new Uint8Array([0xff,0xfe,0x61,0])),/UTF-8/);
 assert.throws(()=>c.parseLocalTable(bytes('a'),';'),/CSV/);
 assert.throws(()=>c.parseLocalTable('a'),/UTF-8/);
 assert.throws(()=>c.parseLocalTable(new Uint8Array(c.LOCAL_TABLE_LIMITS.fileBytes+1)),/256/);
 assert.equal(c.parseLocalTable(bytes('h'.repeat(128))).headers[0].length,128);
 assert.throws(()=>c.parseLocalTable(bytes('h'.repeat(129))),/128/);
 assert.equal(c.parseLocalTable(bytes('h\n'+'x'.repeat(512))).rows[0][0].length,512);
 assert.throws(()=>c.parseLocalTable(bytes('h\n'+'x'.repeat(513))),/512/);
 assert.equal(c.parseLocalTable(bytes(Array(16).fill('h').join(','))).columns.length,16);
 assert.throws(()=>c.parseLocalTable(bytes(Array(17).fill('h').join(','))),/16/);
 assert.equal(c.parseLocalTable(bytes('h\n'+Array(500).fill('x').join('\n'))).rows.length,500);
 assert.throws(()=>c.parseLocalTable(bytes('h\n'+Array(501).fill('x').join('\n'))),/500/);
 // Exactly 256 KiB of UTF-8, all fields within the independent limits.
 const base='a,b\n'+Array(255).fill('x'.repeat(512)+','+'y'.repeat(512)).join('\n')+'\n';
 const remain=c.LOCAL_TABLE_LIMITS.fileBytes-bytes(base).length;
 const exact=base+'z'.repeat(remain-1)+',';
 assert.equal(bytes(exact).length,c.LOCAL_TABLE_LIMITS.fileBytes);
 assert.equal(c.parseLocalTable(bytes(exact)).rows.length,256);
 assert.throws(()=>c.parseLocalTable(bytes(exact+'x')),/256/);
 const t=fixture(c);
 for(const bad of [{...t,columns:['evil','c2']},{...t,headers:new Array(2)},{...t,rows:[new Array(2)]},{...t,rows:new Array(1)},{...t,rows:[[1,'x']]},{...t,rows:[['x']]},{...t,rows:[['x\0','x']]}])assert.throws(()=>c.validateLocalTable(bad),c.LocalTableError);
 assert.throws(()=>c.validateLocalTable({headers:Array(16).fill('h'),columns:Array.from({length:16},(_,i)=>`c${i+1}`),rows:Array.from({length:500},()=>Array(16).fill('中'.repeat(512)))}),/256/);
});

test('actual pinned WASM keeps int64 exact and refuses non-finite results rather than false equality',async()=>{
 const c=await core,SQL=await engine,t=fixture(c),run=(a,b=a)=>c.runLocalTablePair(SQL,t,a,b);
 for(const [a,b] of [['9007199254740992','9007199254740993'],['9223372036854775806','9223372036854775807'],['-9223372036854775808','-9223372036854775807']]){
  const r=run(`SELECT ${a}`,`SELECT ${b}`);assert.equal(r.comparison.state,'different');assert.deepEqual(r.a.rows,[[cell('integer',a)]]);assert.deepEqual(r.b.rows,[[cell('integer',b)]]);
 }
 assert.equal(run('SELECT 1','SELECT 1.0').comparison.state,'different');
 assert.equal(run('SELECT 1',"SELECT '1'").comparison.state,'different');
 assert.equal(run('SELECT NULL',"SELECT 'NULL'").comparison.state,'different');
 assert.deepEqual(run('SELECT -0.0').a.rows,[[cell('real',0)]]);
 assert.deepEqual(run('SELECT 1.0/3').a.rows,[[cell('real',1/3)]]);
 assert.deepEqual(run('SELECT 0.0/0.0').a.rows,[[cell('null',null)]]);
 assert.deepEqual(run('SELECT 9007199254740993.0').a.rows,[[cell('real',9007199254740992)]]);
 for(const sql of ['SELECT 1e999','SELECT -1e999','SELECT 1e308 * 1e308']){
  assert.throws(()=>run(sql),/非有限/);assert.throws(()=>run('SELECT 1',sql),/非有限/);
 }
 assert.deepEqual(run('SELECT c2,typeof(c2) FROM local_data ORDER BY rowid').a.rows[1],[cell('text','9223372036854775807'),cell('text','text')]);
});

test('typed comparison distinguishes position, multiplicity and order and treats both truncation sides as inconclusive',async()=>{
 const c=await core,x=cell('text','x'),y=cell('text','y');
 assert.equal(c.compareLocalResults(result([x,y]),result([x,y])).state,'match');
 assert.equal(c.compareLocalResults(result([x,y]),result([y,x])).state,'order');
 const missing=c.compareLocalResults(result([x]),result([x,x]));assert.equal(missing.state,'different');assert.equal(missing.missing,1);
 assert.equal(c.compareLocalResults(result([]),{columns:['x','y'],rows:[],truncated:false}).state,'different');
 assert.equal(c.compareLocalResults(result([x]),{...result([x]),columns:['alias']}).state,'match');
 for(const side of ['a','b']){const a=result([x]),b=result([x]);(side==='a'?a:b).truncated=true;assert.equal(c.compareLocalResults(a,b).state,'limited');}
 for(const value of [NaN,Infinity,-Infinity])assert.throws(()=>c.compareLocalResults(result([cell('real',value)]),result([cell('real',value)])),/类型/);
 for(const value of ['01','-0','9223372036854775808','-9223372036854775809'])assert.throws(()=>c.compareLocalResults(result([cell('integer',value)]),result([x])),/类型/);
 assert.throws(()=>c.compareLocalResults({...result([x]),rows:[new Array(1)]},result([x])),/类型/);
});

test('fresh read-only databases use bound text inserts and existing query, allocation and output bounds',async()=>{
 const c=await core,SQL=await engine,t=fixture(c),run=(a,b='SELECT COUNT(*) FROM local_data')=>c.runLocalTablePair(SQL,t,a,b);
 const r=run('SELECT COUNT(*) FROM local_data');assert.equal(r.comparison.state,'match');assert.equal(r.a.rows[0][0].value,'3');
 for(const sql of ['',null,2,'PRAGMA query_only=OFF','DELETE FROM local_data','SELECT 1; SELECT 2',"SELECT ';'",'SELECT 1\0','SELECT '+ 'x'.repeat(4000),'WITH x AS (SELECT 1) DELETE FROM local_data',"SELECT load_extension('x')",'SELECT * FROM pragma_query_only(0)','SELECT 1) UPDATE local_data SET c1=1 --',"SELECT 1) ATTACH DATABASE 'x' AS x --"]){assert.throws(()=>run(sql),c.LocalTableError);}
 assert.deepEqual(run('SELECT * FROM pragma_query_only').a.rows,[[cell('integer','1')]]);
 assert.deepEqual(run('SELECT * FROM pragma_hard_heap_limit').a.rows,[[cell('integer',String(c.LOCAL_TABLE_LIMITS.heapBytes))]]);
 assert.throws(()=>run('SELECT zeroblob(1)'),/二进制/);
 assert.throws(()=>run('SELECT printf(\'%0600d\',1)'),/512/);
 assert.throws(()=>run('SELECT '+Array(17).fill('1').join(',')),/16/);
 assert.throws(()=>run('SELECT hex(zeroblob(20000000))'),c.LocalTableError);
 const many='WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<101) SELECT x FROM n';
 for(const pair of [[many,'SELECT 1'],['SELECT 1',many]])assert.equal(run(...pair).comparison.state,'limited');
 assert.equal(run('SELECT COUNT(*) FROM local_data').comparison.state,'match','failures do not corrupt the next fresh database');
 const hostile=c.parseLocalTable(bytes('"x; DROP TABLE local_data;--"\n"\'); DROP TABLE local_data;--"'));
 assert.equal(c.runLocalTablePair(SQL,hostile,'SELECT c1 FROM local_data','SELECT c1 FROM local_data').a.rows[0][0].value,"'); DROP TABLE local_data;--");
 assert.throws(()=>run('SELECT secret_private_column FROM local_data'),error=>!error.message.includes('secret_private_column'));
});

test('both query databases and all prepared statements are released on success or failure',async()=>{
 const c=await core,SQL=await engine,t=fixture(c);let opened=0,closed=0,prepared=0,freed=0;
 const wrapped={Database:class{constructor(){opened++;this.inner=new SQL.Database()}run(...args){return this.inner.run(...args)}exec(...args){return this.inner.exec(...args)}prepare(...args){const stmt=this.inner.prepare(...args),original=stmt.free.bind(stmt);prepared++;stmt.free=()=>{freed++;return original()};return stmt}close(){closed++;return this.inner.close()}}};
 c.runLocalTablePair(wrapped,t,'SELECT 1','SELECT 1');assert.equal(opened,2);assert.equal(closed,2);assert.equal(prepared,freed);
 assert.throws(()=>c.runLocalTablePair(wrapped,t,'SELECT 1','SELECT zeroblob(1)'));assert.equal(opened,4);assert.equal(closed,4);assert.equal(prepared,freed);
});

function makeWorker(){
 const source=fs.readFileSync(path.join(root,'source/atelier/js/research-local-table-worker.js'),'utf8').replace(/import\('\.\/(research-local-table-(?:core|reduce)\.mjs)'\)/g,(_,name)=>`import(${JSON.stringify(pathToFileURL(path.join(root,'source/atelier/js',name)).href)})`);
 const bootstrap=`const {parentPort}=require('node:worker_threads');global.self={location:{href:'https://test.invalid/atelier/js/research-local-table-worker.js'},postMessage:data=>parentPort.postMessage(data)};global.importScripts=()=>{global.initSqlJs=()=>require(${JSON.stringify(runtime)})({wasmBinary:require('node:fs').readFileSync(${JSON.stringify(wasm)})})};parentPort.on('message',data=>self.onmessage({data}));\n${source}`;
 return new Worker(bootstrap,{eval:true});
}
test('actual worker transports typed rows, sanitizes errors, can be terminated and restarted', {timeout:10000},async()=>{
 const c=await core,t=fixture(c);let worker=makeWorker();
 const submit=async(id,sqlA,sqlB)=>{const message=once(worker,'message');worker.postMessage({type:'run',id,table:t,sqlA,sqlB});return (await message)[0]};
 try{
  assert.deepEqual((await once(worker,'message'))[0],{type:'ready'});
  const result=await submit(1,'SELECT 9007199254740992','SELECT 9007199254740993');assert.equal(result.id,1);assert.equal(result.result.comparison.state,'different');assert.equal(result.result.a.rows[0][0].value,'9007199254740992');
  const error=await submit(2,'SELECT private_unshared_name','SELECT 1');assert.equal(error.type,'result');assert.equal(typeof error.error,'string');assert.ok(!error.error.includes('private_unshared_name'));
  let completed=false;worker.on('message',()=>{completed=true});
  worker.postMessage({type:'run',id:3,table:t,sqlA:'WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n) SELECT SUM(x) FROM n',sqlB:'SELECT 1'});
  await new Promise(resolve=>setTimeout(resolve,100));assert.equal(completed,false);await worker.terminate();
  worker=makeWorker();assert.equal((await once(worker,'message'))[0].type,'ready');
  assert.equal((await submit(4,'SELECT 1','SELECT 1')).result.comparison.state,'match');
 }finally{await worker.terminate()}
});

test('all thirteen existing fixture outputs and fixed limits remain intact',async()=>{
 const c=await core,old=await import('../source/atelier/js/research-sql-core.mjs'),SQL=await engine;let count=0;
 assert.equal(c.LOCAL_TABLE_LIMITS.heapBytes,old.SQL_LIMITS.heapBytes);assert.equal(c.LOCAL_TABLE_LIMITS.queryChars,old.SQL_LIMITS.queryChars);
 for(const f of old.SQL_CASES)for(const d of old.listSqlDatasets(f.id)){const fixture=old.getSqlDataset(f.id,d.id);assert.equal(old.compareResults(old.runFixtureQuery(SQL,f.id,fixture.reference,d.id),fixture.expected).state,'match');count++}
 assert.equal(count,13);
});
