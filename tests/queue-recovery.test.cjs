const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(t,queue=[],loader,historyLoader){
 const dom=new JSDOM('<title>测试文章</title><body data-root="/"><div id="toast"></div></body>',{url:'https://ccatelier.test/notes/'}),{window}=dom;
 Object.assign(globalThis,{window,document:window.document,location:window.location,localStorage:window.localStorage,CustomEvent:window.CustomEvent,matchMedia:()=>({matches:false,addEventListener(){}})});
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
 const {storage}=await import('../source/atelier/js/ui.js');
 storage.set('cc-queue',JSON.stringify({version:1,queue}));storage.set('cc-saved','[]');storage.persistent=true;
 await import('../source/atelier/js/queue-legacy.js');
 let queueModule='../source/atelier/js/queue.js';
 if(loader||historyLoader){
  const fs=require('node:fs'),{pathToFileURL}=require('node:url'),path=require('node:path');
  const base=pathToFileURL(path.resolve(__dirname,'../source/atelier/js/queue.js'));
  globalThis.queueRecoveryLoader=loader;globalThis.queueRecoveryHistoryLoader=historyLoader;
  const source=fs.readFileSync(base,'utf8').replace("import('./queue-legacy.js')",loader?'globalThis.queueRecoveryLoader()':`import('${new URL('./queue-legacy.js',base)}')`).replace("import('./queue-history.js')",historyLoader?'globalThis.queueRecoveryHistoryLoader()':`import('${new URL('./queue-history.js',base)}')`).replace(/from '(\.\/[^']+)'/g,(_,file)=>`from '${new URL(file,base)}'`);
  queueModule='data:text/javascript;base64,'+Buffer.from(source+'\n// '+Math.random()).toString('base64');
  t.after(()=>{delete globalThis.queueRecoveryLoader;delete globalThis.queueRecoveryHistoryLoader;});
 }
 const {initQueue}=await import(queueModule);initQueue();
 const timeout=globalThis.setTimeout,timers=[];globalThis.setTimeout=(fn,ms,...args)=>{const timer=timeout(fn,ms,...args);timers.push(timer);return timer;};
 t.after(()=>{timers.forEach(clearTimeout);globalThis.setTimeout=timeout;dom.window.close();});
 const button=label=>[...document.querySelectorAll('#queue-dialog button')].find(b=>b.textContent===label);
 return {window,storage,button,status:document.querySelector('#queue-dialog>.live-status')};
}
const item=n=>({path:`/writing/${n}/`,title:`文章 ${n}`});
test('merging old bookmarks preserves the temporary-only warning and all in-page queue data on quota failure',async t=>{
 const s=await setup(t,[item(1)]);s.storage.set('cc-saved',JSON.stringify([item(2),item(3)]));
 s.window.Storage.prototype.setItem=()=>{throw Error('QuotaExceededError');};
 s.button('加入旧收藏').click();await flush();
 assert.match(s.status.textContent,/仅在当前页面有效/);
 assert.deepEqual(JSON.parse(s.storage.get('cc-queue')).queue,[item(1),item(2),item(3)]);
 assert.deepEqual(JSON.parse(localStorage.getItem('cc-queue')).queue,[item(1)],'failed persistence leaves the original durable value intact');
});
test('merging bookmarks at the queue limit reports actual additions rather than all input records',async t=>{
 const s=await setup(t,Array.from({length:199},(_,i)=>item(i)));s.storage.set('cc-saved',JSON.stringify([item(0),item(199),item(200)]));
 s.button('加入旧收藏').click();await flush();
 const queue=JSON.parse(s.storage.get('cc-queue')).queue;
 assert.equal(queue.length,200);assert.deepEqual(queue.at(-1),item(199));
 assert.match(s.status.textContent,/已合并 1 条/);assert.match(s.status.textContent,/200/);
});
test('queue export reports an object URL failure without changing saved data',async t=>{
 const s=await setup(t,[item(1)]),before=localStorage.getItem('cc-queue'),errors=[];
 s.window.addEventListener('error',event=>{errors.push(event.error);event.preventDefault();});
 const original=URL.createObjectURL;t.after(()=>{URL.createObjectURL=original;});
 URL.createObjectURL=()=>{throw Error('下载资源不可用');};s.button('导出队列').click();await flush();
 assert.deepEqual(errors,[]);assert.match(s.status.textContent,/下载资源不可用/);assert.equal(localStorage.getItem('cc-queue'),before);
});
test('a failed download activation revokes its URL and keeps the queue available to retry',async t=>{
 const s=await setup(t,[item(1)]),before=localStorage.getItem('cc-queue'),errors=[],revoked=[];
 s.window.addEventListener('error',event=>{errors.push(event.error);event.preventDefault();});
 const original={create:URL.createObjectURL,revoke:URL.revokeObjectURL};t.after(()=>{URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;});
 URL.createObjectURL=()=> 'blob:queue-recovery';URL.revokeObjectURL=url=>revoked.push(url);
 s.window.HTMLAnchorElement.prototype.click=()=>{throw Error('无法启动下载');};s.button('导出队列').click();await flush();
 assert.deepEqual(errors,[]);assert.deepEqual(revoked,['blob:queue-recovery']);assert.match(s.status.textContent,/无法启动下载/);assert.equal(localStorage.getItem('cc-queue'),before);
});
test('a capacity-limited temporary merge retains both the skipped count and persistence warning',async t=>{
 const s=await setup(t,Array.from({length:199},(_,i)=>item(i)));s.storage.set('cc-saved',JSON.stringify([item(0),item(199),item(200)]));
 s.window.Storage.prototype.setItem=()=>{throw Error('QuotaExceededError');};s.button('加入旧收藏').click();await flush();
 assert.match(s.status.textContent,/已合并 1 条/);assert.match(s.status.textContent,/另有 1 条未加入/);assert.match(s.status.textContent,/仅在当前页面有效/);
 assert.equal(JSON.parse(s.storage.get('cc-queue')).queue.length,200);assert.equal(JSON.parse(localStorage.getItem('cc-queue')).queue.length,199);
});
for(const kind of ['add','done'])test(`article queue ${kind} keeps its quota warning instead of announcing durable success`,async t=>{
 const s=await setup(t),button=document.createElement('button');button.dataset[kind==='add'?'queueAdd':'queueDone']='';document.body.append(button);
 s.window.Storage.prototype.setItem=()=>{throw Error('QuotaExceededError');};button.click();
 assert.match(document.querySelector('#toast').textContent,/存储不可用/);
 const queue=JSON.parse(s.storage.get('cc-queue')).queue;assert.equal(queue.length,1);assert.equal(Boolean(queue[0].completed),kind==='done');
 assert.deepEqual(JSON.parse(localStorage.getItem('cc-queue')).queue,[]);
});
test('malformed import JSON leaves the durable queue unchanged and resets the file selection',async t=>{
 const s=await setup(t,[item(1)]),before=localStorage.getItem('cc-queue'),file=document.querySelector('#queue-dialog input');
 Object.defineProperty(file,'files',{value:[{size:10,text:async()=>'{broken json'}]});file.dispatchEvent(new s.window.Event('change'));await flush();
 assert.match(s.status.textContent,/无法解析备份/);assert.equal(file.value,'');assert.equal(localStorage.getItem('cc-queue'),before);
});
test('lazy bookmark migration prevents duplicate clicks, reads current cross-tab data, and restores its control',async t=>{
 let resolve,calls=0;const pending=new Promise(yes=>{resolve=yes;});
 const s=await setup(t,[item(1)],()=>{calls++;return pending;}),merge=s.button('加入旧收藏');
 s.storage.set('cc-saved',JSON.stringify([item(2)]));merge.click();merge.click();merge.dispatchEvent(new s.window.MouseEvent('click'));
 assert.equal(calls,1);assert.equal(merge.disabled,true);
 localStorage.setItem('cc-queue',JSON.stringify({version:1,queue:[item(1),item(3)]}));
 s.window.dispatchEvent(new s.window.StorageEvent('storage',{key:'cc-queue'}));
 // Completion must not reopen a dismissed dialog or steal focus.
 const outside=document.createElement('button');document.body.append(outside);outside.focus();
 resolve(await import('../source/atelier/js/queue-legacy.js'));await flush();
 assert.equal(merge.disabled,false);assert.equal(document.activeElement,outside);assert.equal(document.querySelector('#queue-dialog').open,false);
 assert.deepEqual(JSON.parse(s.storage.get('cc-queue')).queue,[item(1),item(3),item(2)]);
});
test('lazy migration loading failure keeps saved data, reports the error, and permits retry',async t=>{
 let calls=0;const s=await setup(t,[item(1)],()=>{calls++;return calls===1?Promise.reject(Error('迁移模块暂时无法加载')):import('../source/atelier/js/queue-legacy.js');});
 s.storage.set('cc-saved',JSON.stringify([item(2)]));const before=localStorage.getItem('cc-queue'),merge=s.button('加入旧收藏');
 merge.click();await flush();assert.match(s.status.textContent,/暂时无法加载/);assert.equal(merge.disabled,false);assert.equal(localStorage.getItem('cc-queue'),before);
 merge.click();await flush();assert.equal(calls,2);assert.equal(merge.disabled,false);assert.deepEqual(JSON.parse(s.storage.get('cc-queue')).queue,[item(1),item(2)]);
});
test('legacy migration stays off the initial graph and enters automatically generated offline manifests',()=>{
 const fs=require('node:fs'),path=require('node:path'),{graph}=require('../tools/module-graph.cjs'),base=path.resolve(__dirname,'..');
 const result=graph(path.join(base,'source'),['atelier/js/main.js']);assert.ok(result.bytes<100000);for(const name of ['queue-legacy.js','queue-history.js'])assert.ok(!result.files.some(file=>file.path.endsWith('/'+name)));
 const generators=new Map(),previous=globalThis.hexo;
 try{
  globalThis.hexo={extend:{generator:{register:(name,fn)=>generators.set(name,fn)},helper:{register(){}}}};
  const script=require.resolve('../scripts/live-archive.js');delete require.cache[script];require(script);
  for(const root of ['/','/preview/']){
   const files=generators.get('live-archive').call({config:{root},base_dir:base},{posts:{sort:()=>({toArray:()=>[]})},data:{}});
   const shell=JSON.parse(files.find(file=>file.path==='atelier/data/offline-shell.json').data);
   for(const name of ['queue-legacy.js','queue-history.js'])assert.ok(shell.includes(root+'atelier/js/'+name));
  }
 }finally{if(previous===undefined)delete globalThis.hexo;else globalThis.hexo=previous;}
});
for(const kind of ['add','done'])test(`article queue ${kind} does not announce success for an absent article at capacity`,async t=>{
 const queue=Array.from({length:200},(_,i)=>item(i)),s=await setup(t,queue),before=localStorage.getItem('cc-queue'),button=document.createElement('button');
 button.dataset[kind==='add'?'queueAdd':'queueDone']='';document.body.append(button);button.click();
 assert.match(document.querySelector('#toast').textContent,/队列已满/);
 assert.equal(localStorage.getItem('cc-queue'),before);assert.match(s.status.textContent,/仅保存在这台浏览器/);
});
test('an existing article can still be completed at full queue capacity',async t=>{
 const s=await setup(t,[{path:'/notes/',title:'当前文章'},...Array.from({length:199},(_,i)=>item(i))]),button=document.createElement('button');
 button.dataset.queueDone='';document.body.append(button);button.click();
 assert.match(document.querySelector('#toast').textContent,/读完了/);const queue=JSON.parse(localStorage.getItem('cc-queue')).queue;
 assert.equal(queue.length,200);assert.ok(queue[0].completed);
});
test('history waits for the open dialog and renders the newest queue after loading',async t=>{
 let resolve,calls=0;const pending=new Promise(yes=>{resolve=yes;});
 const s=await setup(t,[item(1)],undefined,()=>{calls++;return pending;}),history=document.querySelector('.queue-history'),opener=document.createElement('button');opener.className='queue-open';document.body.append(opener);
 assert.equal(calls,0);assert.equal(history.children.length,0);opener.click();assert.equal(calls,1);
 localStorage.setItem('cc-queue',JSON.stringify({version:1,queue:[{...item(2),completed:Date.now()}]}));s.window.dispatchEvent(new s.window.StorageEvent('storage',{key:'cc-queue'}));
 resolve(await import('../source/atelier/js/queue-history.js'));await flush();
 assert.equal(history.children.length,14);assert.match(history.getAttribute('aria-label'),/完成 1 篇/);
 localStorage.setItem('cc-queue',JSON.stringify({version:1,queue:[]}));s.window.dispatchEvent(new s.window.StorageEvent('storage',{key:'cc-queue'}));await flush();assert.match(history.getAttribute('aria-label'),/完成 0 篇/);
});
test('late history loading leaves a closed dialog untouched and can render on reopening',async t=>{
 let resolve;const pending=new Promise(yes=>{resolve=yes;}),s=await setup(t,[],undefined,()=>pending),history=document.querySelector('.queue-history'),opener=document.createElement('button');opener.className='queue-open';document.body.append(opener);opener.click();
 const dialog=document.querySelector('#queue-dialog');dialog.close();opener.focus();
 resolve(await import('../source/atelier/js/queue-history.js'));await flush();assert.equal(dialog.open,false);assert.equal(history.children.length,0);assert.equal(document.activeElement,opener);
 opener.click();await flush();assert.equal(history.children.length,14);
});
test('history load failures display an honest fallback and retry when reopened',async t=>{
 let calls=0;const s=await setup(t,[],undefined,()=>++calls===1?Promise.reject(Error('offline')):import('../source/atelier/js/queue-history.js')),opener=document.createElement('button');opener.className='queue-open';document.body.append(opener);opener.click();await flush();
 const history=document.querySelector('.queue-history');assert.match(history.textContent,/暂时无法加载/);document.querySelector('#queue-dialog').close();opener.click();await flush();assert.equal(history.children.length,14);assert.doesNotMatch(history.textContent,/无法加载/);
});
