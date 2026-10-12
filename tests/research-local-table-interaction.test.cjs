const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');const root=path.resolve(__dirname,'..');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
const fixture={headers:['Friendly name'],columns:['c1'],rows:[['one'],['two']]};
const cell=value=>({type:'text',value});
const pair=(value='one',state='match')=>({a:{columns:['c1'],rows:[[cell(value)]],truncated:false},b:{columns:['c1'],rows:[[cell(value)]],truncated:false},comparison:{state}});
async function setup(){
 const html=require('ejs').render(fs.readFileSync(path.join(root,'custom/redefine/nijika/research.ejs'),'utf8'),{url_for:v=>'/'+v});
 const dom=new JSDOM(html,{url:'https://example.test/research/',pretendToBeVisual:true});const doc=dom.window.document,calls=[],requests=[];let stops=0,loads=0;
 const {initLocalTable}=await import('../source/atelier/js/research-local-table.js');
 const runner={run(...args){calls.push(args);const d=deferred();requests.push(d);return d.promise},stop(){stops++}};
 const c=initLocalTable(doc,{runnerFactory:()=>runner,loadCore:async()=>{loads++;return{parseLocalTable(bytes,separator){if(bytes==='bad')throw new Error('private invalid contents');return bytes===fixture?fixture:{...fixture,rows:[[bytes,separator]]}}}},readFile:f=>f.read?f.read():Promise.resolve(f.bytes)});
 const get=n=>doc.querySelector(`[data-local-${n}]`);return{dom,doc,c,get,calls,requests,get stops(){return stops},get loads(){return loads},async accept(bytes=fixture){await c.importFile({size:10,bytes});get('lab').open=true;await flush();},close(){c.destroy();dom.window.close()}};
}
test('optional sibling stays closed and lazy; preview first, no builtin changes or automatic run',async()=>{
 const s=await setup();try{assert.equal(s.get('lab').open,false);assert.equal(s.loads,0);assert.equal(s.calls.length,0);assert.equal(s.get('lab').closest('[data-sql-lab]'),null);assert.equal(s.doc.querySelectorAll('[data-sql-case]').length,4);await s.accept();assert.equal(s.calls.length,0);assert.match(s.get('preview').textContent,/c1Friendly name/);assert.equal(s.get('a').value,s.get('b').value);s.c.run();assert.equal(s.calls.length,1);s.requests[0].resolve(pair());await flush();assert.match(s.get('status').textContent,/当前数据.*一致/);}finally{s.close()}
});
test('failed replacement preserves accepted table and existing result; new accepted table invalidates',async()=>{
 const s=await setup();try{await s.accept();s.c.run();s.requests[0].resolve(pair());await flush();const output=s.get('result-a').textContent;
 await s.c.importFile({size:10,bytes:'bad'});assert.equal(s.get('result-a').textContent,output);assert.equal(s.get('results').hidden,false);assert.match(s.get('file-status').textContent,/保持不变/);assert.doesNotMatch(s.get('file-status').textContent,/private/);
 await s.accept('replacement');assert.equal(s.get('results').hidden,true);assert.match(s.get('status').textContent,/旧结果已失效/);assert.equal(s.calls.length,1);
 }finally{s.close()}
});
test('file generations isolate late reads, clear, separator changes and pagehide',async()=>{
 const s=await setup();try{const old=deferred();const oldImport=s.c.importFile({size:10,read:()=>old.promise});await s.accept('new');old.resolve('old');await oldImport;assert.match(s.get('preview').textContent,/new/);assert.doesNotMatch(s.get('preview').textContent,/old/);
 for(const action of [()=>s.c.clear(),()=>s.get('delimiter').dispatchEvent(new s.dom.window.Event('change')),()=>s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'))]){const d=deferred();const pending=s.c.importFile({size:10,read:()=>d.promise});action();d.resolve('late secret');await pending;assert.doesNotMatch(s.get('preview').textContent,/late secret/);}
 assert.equal(s.get('a').value,'SELECT * FROM local_data ORDER BY rowid');assert.equal(s.get('preview-section').hidden,true);
 }finally{s.close()}
});
test('editing either SQL, stop, collapse and pagehide cancel late results; no restore auto-run',async()=>{
 const s=await setup();try{await s.accept();for(const action of [()=>s.get('a').dispatchEvent(new s.dom.window.Event('input')),()=>s.get('b').dispatchEvent(new s.dom.window.Event('input')),()=>s.get('stop').click(),()=>{s.get('lab').open=false;s.get('lab').dispatchEvent(new s.dom.window.Event('toggle'))},()=>s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'))]){
 s.get('lab').open=true;s.c.run();const request=s.requests.at(-1);action();request.resolve(pair('late secret'));await flush();assert.equal(s.get('results').hidden,true);assert.doesNotMatch(s.get('result-a').textContent,/late secret/);}
 const calls=s.calls.length;s.dom.window.dispatchEvent(new s.dom.window.Event('pageshow'));s.get('lab').open=true;await flush();assert.equal(s.calls.length,calls);assert.equal(s.get('preview-section').hidden,true);assert.equal(s.get('run').disabled,true);
 }finally{s.close()}
});
test('replacement while running cancels old result only when new file is accepted',async()=>{
 const s=await setup();try{await s.accept();s.c.run();await s.c.importFile({size:10,bytes:'bad'});s.requests[0].resolve(pair('previous'));await flush();assert.match(s.get('result-a').textContent,/previous/);
 s.c.run();await s.accept('new table');s.requests[1].resolve(pair('old result'));await flush();assert.equal(s.get('results').hidden,true);assert.doesNotMatch(s.get('result-a').textContent,/old result/);
 }finally{s.close()}
});
test('IME and repeated keyboard events cannot run; literal hostile cells and typed values stay text',async()=>{
 const s=await setup();try{await s.accept();const fire=options=>s.get('a').dispatchEvent(new s.dom.window.KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,...options}));fire({isComposing:true});fire({keyCode:229});fire({repeat:true});assert.equal(s.calls.length,0);fire({});assert.equal(s.calls.length,1);s.requests[0].resolve(pair('<img src=x onerror=alert(1)>'));await flush();assert.equal(s.get('result-a').querySelector('img'),null);assert.match(s.get('result-a').textContent,/TEXT/);
 s.c.run();const limited=pair();limited.b.truncated=true;s.requests[1].resolve(limited);await flush();assert.match(s.get('status').textContent,/不作一致性判断/);
 }finally{s.close()}
});
test('clear drops SQL and results, destroy removes callbacks, re-init is supported',async()=>{
 const s=await setup();try{await s.accept();s.get('a').value='SELECT private';s.c.clear();assert.equal(s.get('a').value,s.get('b').value);assert.equal(s.get('run').disabled,true);assert.equal(s.get('preview').textContent,'');s.c.destroy();s.get('file').dispatchEvent(new s.dom.window.Event('change'));s.get('a').dispatchEvent(new s.dom.window.Event('input'));assert.equal(s.get('file').disabled,true);assert.equal(s.calls.length,0);
 }finally{s.dom.window.close()}
});
function workers(){const all=[];class Worker{constructor(url){this.url=url;this.messages=[];all.push(this)}postMessage(data){this.messages.push(data);if(this.throwPost)throw new Error('private')}terminate(){this.terminated=true}emit(data){this.onmessage?.({data})}}return{all,Worker}}
function timers(){let id=0;const tasks=new Map();return{tasks,setTimer(fn,ms){const key=++id;tasks.set(key,{fn,ms});return key},clearTimer(key){tasks.delete(key)},fire(ms){const item=[...tasks].find(([,v])=>v.ms===ms);assert.ok(item);tasks.delete(item[0]);item[1].fn()}}}
test('runner is lazy with separate bootstrap and whole-pair deadlines; repeated ready cannot extend deadline',async()=>{
 const {createLocalTableRunner}=await import('../source/atelier/js/research-local-table.js');const w=workers(),t=timers(),r=createLocalTableRunner({WorkerClass:w.Worker,...t});assert.equal(w.all.length,0);const done=r.run(fixture,'a','b');const worker=w.all[0];assert.equal(worker.messages.length,0);assert.equal([...t.tasks.values()][0].ms,10000);worker.emit({type:'ready'});const timer=[...t.tasks.keys()][0];worker.emit({type:'ready'});assert.equal([...t.tasks.keys()][0],timer);assert.equal(worker.messages.length,1);assert.equal([...t.tasks.values()][0].ms,1500);assert.equal(worker.messages[0].sqlB,'b');worker.emit({type:'result',id:worker.messages[0].id,result:pair()});assert.equal((await done).comparison.state,'match');assert.ok(worker.terminated);assert.equal(t.tasks.size,0);
});
test('runner timeout, stop, stale messages, load failures and postMessage throw recover without leaks',async()=>{
 const {createLocalTableRunner}=await import('../source/atelier/js/research-local-table.js');const w=workers(),t=timers(),r=createLocalTableRunner({WorkerClass:w.Worker,...t});
 let pending=r.run(fixture,'a','b');let check=assert.rejects(pending,/载入超时/);t.fire(10000);await check;
 pending=r.run(fixture,'a','b');let worker=w.all.at(-1);worker.emit({type:'ready'});check=assert.rejects(pending,/超过 1.5 秒/);t.fire(1500);await check;assert.ok(worker.terminated);
 pending=r.run(fixture,'a','b');worker=w.all.at(-1);const late=worker.onmessage;check=assert.rejects(pending,e=>e.cancelled===true);r.stop();await check;assert.equal(t.tasks.size,0);late({data:{type:'ready'}});assert.equal(worker.messages.length,0);
 pending=r.run(fixture,'a','b');worker=w.all.at(-1);worker.throwPost=true;check=assert.rejects(pending,/无法启动/);worker.emit({type:'ready'});await check;assert.equal(t.tasks.size,0);
 pending=r.run(fixture,'a','b');worker=w.all.at(-1);check=assert.rejects(pending,/未能载入/);worker.emit({type:'load-error'});await check;
 await assert.rejects(createLocalTableRunner({WorkerClass:null,...t}).run(fixture,'a','b'),/浏览器/);assert.equal(t.tasks.size,0);
});
test('runner ignores mismatched result ids and never exposes engine messages',async()=>{
 const {createLocalTableRunner}=await import('../source/atelier/js/research-local-table.js');const w=workers(),t=timers(),r=createLocalTableRunner({WorkerClass:w.Worker,...t});const pending=r.run(fixture,'a','b');const worker=w.all[0];worker.emit({type:'ready'});worker.emit({type:'result',id:999,result:pair()});assert.equal(worker.terminated,undefined);const rejected=assert.rejects(pending,error=>!error.message.includes('private'));worker.emit({type:'result',id:worker.messages[0].id,error:'private contents from syntax error'});await rejected;assert.equal(t.tasks.size,0);
});
test('real UTF-8 parser and shipped SQLite integrate with preview cap, TEXT sources and typed pair rendering',async()=>{
 const html=require('ejs').render(fs.readFileSync(path.join(root,'custom/redefine/nijika/research.ejs'),'utf8'),{url_for:v=>'/'+v});const dom=new JSDOM(html,{url:'https://example.test/research/',pretendToBeVisual:true});const doc=dom.window.document;
 const {initLocalTable}=await import('../source/atelier/js/research-local-table.js'),core=await import('../source/atelier/js/research-local-table-core.mjs');
 const SQL=await require('../source/atelier/vendor/sql.js/1.14.2/sql-wasm.js')({wasmBinary:fs.readFileSync(path.join(root,'source/atelier/vendor/sql.js/1.14.2/sql-wasm.wasm'))});
 const c=initLocalTable(doc,{runnerFactory:()=>({run:async(table,a,b)=>core.runLocalTablePair(SQL,table,a,b),stop(){}})});
 try{const bytes=new TextEncoder().encode('不作标识符\n'+Array.from({length:25},(_,i)=>i===0?'9007199254740993':'NULL').join('\n'));await c.importFile({size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer});assert.equal(doc.querySelectorAll('[data-local-preview] tbody tr').length,20);assert.match(doc.querySelector('[data-local-preview]').textContent,/不作标识符/);doc.querySelector('[data-local-lab]').open=true;
 const a=doc.querySelector('[data-local-a]'),b=doc.querySelector('[data-local-b]');a.value='SELECT CAST(c1 AS INTEGER) FROM local_data WHERE rowid=1';b.value='SELECT c1 FROM local_data WHERE rowid=1';await c.run();assert.match(doc.querySelector('[data-local-result-a]').textContent,/9007199254740993INTEGER/);assert.match(doc.querySelector('[data-local-result-b]').textContent,/9007199254740993TEXT/);assert.match(doc.querySelector('[data-local-status]').textContent,/不同/);
 a.value='SELECT 1';b.value='SELECT 1.0';await c.run();assert.match(doc.querySelector('[data-local-result-a]').textContent,/INTEGER/);assert.match(doc.querySelector('[data-local-result-b]').textContent,/REAL/);assert.match(doc.querySelector('[data-local-status]').textContent,/不同/);
 }finally{c.destroy();dom.window.close()}
});
test('different and reordered rows have text marks, empty results and shape differences stay explicit',async()=>{
 const s=await setup();try{await s.accept();s.c.run();const different=pair('one','different');different.comparison.actualMarks=['extra'];different.comparison.expectedMarks=['missing'];s.requests[0].resolve(different);await flush();assert.equal(s.get('result-a').querySelector('[data-local-mark]').textContent,'A 独有');assert.equal(s.get('result-b').querySelector('[data-local-mark]').textContent,'B 独有');assert.equal(s.get('result-a').querySelector('th').textContent,'比较状态');
 s.c.run();const order=pair('one','order');order.comparison.actualMarks=['order'];s.requests[1].resolve(order);await flush();assert.match(s.get('result-a').textContent,/顺序不同/);assert.match(s.get('result-b').textContent,/顺序不同/);
 s.c.run();const empty=pair('','different');empty.a.rows=[];empty.b.rows=[];empty.b.columns=['x','y'];s.requests[2].resolve(empty);await flush();assert.match(s.get('result-a').textContent,/0 行/);assert.match(s.get('status').textContent,/列数不同/);
 }finally{s.close()}
});
test('two controllers isolate keyboard and private data; destroy/re-init does not duplicate listeners',async()=>{
 const s=await setup();const {initResearchSql}=await import('../source/atelier/js/research-sql.js');const {initLocalTable}=await import('../source/atelier/js/research-local-table.js');let builtinCalls=0;const builtin=initResearchSql(s.doc,{runnerFactory:()=>({run:async()=>{builtinCalls++;return{columns:['x'],rows:[[1]],truncated:false}},stop(){}})});
 try{await s.accept('private_secret_927');s.get('a').value="SELECT 'private_secret_927'";const initialURL=s.dom.window.location.href;let sideEffects=0;const flag=()=>{sideEffects++;throw Error('unexpected side effect')};s.dom.window.fetch=flag;s.dom.window.navigator.clipboard={writeText:flag};s.dom.window.Storage.prototype.setItem=flag;s.dom.window.history.pushState=flag;s.dom.window.history.replaceState=flag;
 s.get('a').dispatchEvent(new s.dom.window.KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}));assert.equal(s.calls.length,1);assert.equal(builtinCalls,0);s.requests[0].resolve(pair('private_secret_927'));await flush();assert.equal(sideEffects,0);assert.equal(s.dom.window.location.href,initialURL);
 const builtinEditor=s.doc.querySelector('[data-sql-case]:not([hidden]) [data-sql-editor]');builtinEditor.dispatchEvent(new s.dom.window.KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}));await flush();assert.equal(builtinCalls,1);assert.equal(s.calls.length,1);
 await builtin.shareDraft();const url=s.doc.querySelector('[data-sql-share-url]').value;const {decodeSqlShare}=await import('../source/atelier/js/research-sql-share.mjs');assert.doesNotMatch(JSON.stringify(decodeSqlShare(new URL(url).hash)),/private_secret_927/);
 s.c.destroy();let freshCalls=0;const fresh=initLocalTable(s.doc,{runnerFactory:()=>({run:async()=>{freshCalls++;return pair()},stop(){}}),readFile:async()=>fixture,loadCore:async()=>({parseLocalTable:()=>fixture})});await fresh.importFile({size:10});s.get('lab').open=true;s.get('a').dispatchEvent(new s.dom.window.KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true}));await flush();assert.equal(freshCalls,1);assert.equal(s.calls.length,1);fresh.destroy();
 }finally{builtin.stop();s.close()}
});
