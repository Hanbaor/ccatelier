const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(t,queue=[],loader,historyLoader,listLoader,backupLoader,controllerLoader){
 const dom=new JSDOM('<title>测试文章</title><body data-root="/"><div id="toast"></div><button class="queue-open">队列</button><span data-queue-count></span><a data-queue-next></a></body>',{url:'https://ccatelier.test/notes/'}),{window}=dom;
 Object.assign(globalThis,{window,document:window.document,location:window.location,localStorage:window.localStorage,CustomEvent:window.CustomEvent,matchMedia:()=>({matches:false,addEventListener(){}})});
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
 const {storage}=await import('../source/atelier/js/ui.js');
 storage.set('cc-queue',JSON.stringify({version:1,queue}));storage.set('cc-saved','[]');storage.persistent=true;
 await import('../source/atelier/js/queue-legacy.js');await import('../source/atelier/js/queue-list.js');await import('../source/atelier/js/queue-backup.js');
 const fs=require('node:fs'),{pathToFileURL}=require('node:url'),path=require('node:path');
 const base=pathToFileURL(path.resolve(__dirname,'../source/atelier/js/queue.js'));
 let queueModule=base.href;
 if(loader||historyLoader||listLoader||backupLoader||controllerLoader){
  globalThis.queueRecoveryControllerLoader=controllerLoader;globalThis.queueRecoveryLoader=loader;globalThis.queueRecoveryHistoryLoader=historyLoader;globalThis.queueRecoveryListLoader=listLoader;globalThis.queueRecoveryBackupLoader=backupLoader;
  const absolute=source=>source.replace(/from '(\.\/[^']+)'/g,(_,file)=>`from '${new URL(file,base)}'`);
  const source=absolute(fs.readFileSync(new URL('./queue-dialog.js',base),'utf8').replace("import('./queue-legacy.js')",loader?'globalThis.queueRecoveryLoader()':`import('${new URL('./queue-legacy.js',base)}')`).replace("import('./queue-history.js')",historyLoader?'globalThis.queueRecoveryHistoryLoader()':`import('${new URL('./queue-history.js',base)}')`).replace("import('./queue-list.js')",listLoader?'globalThis.queueRecoveryListLoader()':`import('${new URL('./queue-list.js',base)}')`).replace("import('./queue-backup.js')",backupLoader?'globalThis.queueRecoveryBackupLoader()':`import('${new URL('./queue-backup.js',base)}')`));
  const controller='data:text/javascript;base64,'+Buffer.from(source+'\n// '+Math.random()).toString('base64');
  await import(controller);
  queueModule='data:text/javascript;base64,'+Buffer.from(absolute(fs.readFileSync(base,'utf8')).replace("import('./queue-dialog.js')",controllerLoader?'globalThis.queueRecoveryControllerLoader()':`import('${controller}')`)).toString('base64');
  t.after(()=>{delete globalThis.queueRecoveryControllerLoader;delete globalThis.queueRecoveryLoader;delete globalThis.queueRecoveryHistoryLoader;delete globalThis.queueRecoveryListLoader;delete globalThis.queueRecoveryBackupLoader;});
 }else await import('../source/atelier/js/queue-dialog.js');
 const {initQueue}=await import(queueModule);initQueue();
 const timeout=globalThis.setTimeout,timers=[];globalThis.setTimeout=(fn,ms,...args)=>{const timer=timeout(fn,ms,...args);timers.push(timer);return timer;};
 t.after(()=>{timers.forEach(clearTimeout);globalThis.setTimeout=timeout;dom.window.close();});
 const button=label=>[...document.querySelectorAll('#queue-dialog button')].find(b=>b.textContent===label);
 const ready=async()=>{if(!document.querySelector('.queue-operation-status')){document.querySelector('.queue-open').click();await flush();}assert.ok(document.querySelector('.queue-operation-status'));};
 return {window,storage,button,ready,input:async()=>{await ready();return document.querySelector('#queue-dialog input');},status:{get textContent(){return document.querySelector('#queue-dialog>.live-status').textContent+(document.querySelector('.queue-operation-status')?.textContent||'');}},get listStatus(){return document.querySelector('.queue-list-status');}};
}
const item=n=>({path:`/writing/${n}/`,title:`文章 ${n}`});
test('merging old bookmarks preserves the temporary-only warning and all in-page queue data on quota failure',async t=>{
 const s=await setup(t,[item(1)]);s.storage.set('cc-saved',JSON.stringify([item(2),item(3)]));
 s.window.Storage.prototype.setItem=()=>{throw Error('QuotaExceededError');};
 await s.ready();s.button('加入旧收藏').click();await flush();
 assert.match(s.status.textContent,/仅在当前页面有效/);
 assert.deepEqual(JSON.parse(s.storage.get('cc-queue')).queue,[item(1),item(2),item(3)]);
 assert.deepEqual(JSON.parse(localStorage.getItem('cc-queue')).queue,[item(1)],'failed persistence leaves the original durable value intact');
});
test('merging bookmarks at the queue limit reports actual additions rather than all input records',async t=>{
 const s=await setup(t,Array.from({length:199},(_,i)=>item(i)));s.storage.set('cc-saved',JSON.stringify([item(0),item(199),item(200)]));
 await s.ready();s.button('加入旧收藏').click();await flush();
 const queue=JSON.parse(s.storage.get('cc-queue')).queue;
 assert.equal(queue.length,200);assert.deepEqual(queue.at(-1),item(199));
 assert.match(s.status.textContent,/已合并 1 条/);assert.match(s.status.textContent,/200/);
});
test('queue export reports an object URL failure without changing saved data',async t=>{
 const s=await setup(t,[item(1)]),before=localStorage.getItem('cc-queue'),errors=[];
 s.window.addEventListener('error',event=>{errors.push(event.error);event.preventDefault();});
 const original=URL.createObjectURL;t.after(()=>{URL.createObjectURL=original;});
 URL.createObjectURL=()=>{throw Error('下载资源不可用');};await s.ready();s.button('导出队列').click();await flush();
 assert.deepEqual(errors,[]);assert.match(s.status.textContent,/下载资源不可用/);assert.equal(localStorage.getItem('cc-queue'),before);
});
test('a failed download activation revokes its URL and keeps the queue available to retry',async t=>{
 const s=await setup(t,[item(1)]),before=localStorage.getItem('cc-queue'),errors=[],revoked=[];
 s.window.addEventListener('error',event=>{errors.push(event.error);event.preventDefault();});
 const original={create:URL.createObjectURL,revoke:URL.revokeObjectURL};t.after(()=>{URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;});
 URL.createObjectURL=()=> 'blob:queue-recovery';URL.revokeObjectURL=url=>revoked.push(url);
 s.window.HTMLAnchorElement.prototype.click=()=>{throw Error('无法启动下载');};await s.ready();s.button('导出队列').click();await flush();
 assert.deepEqual(errors,[]);assert.deepEqual(revoked,['blob:queue-recovery']);assert.match(s.status.textContent,/无法启动下载/);assert.equal(localStorage.getItem('cc-queue'),before);
});
test('a capacity-limited temporary merge retains both the skipped count and persistence warning',async t=>{
 const s=await setup(t,Array.from({length:199},(_,i)=>item(i)));s.storage.set('cc-saved',JSON.stringify([item(0),item(199),item(200)]));
 s.window.Storage.prototype.setItem=()=>{throw Error('QuotaExceededError');};await s.ready();s.button('加入旧收藏').click();await flush();
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
 const s=await setup(t,[item(1)]),before=localStorage.getItem('cc-queue'),file=await s.input();
 document.querySelector('.queue-open').click();await flush();Object.defineProperty(file,'files',{value:[{size:10,text:async()=>'{broken json'}]});file.dispatchEvent(new s.window.Event('change'));await flush();
 assert.match(s.status.textContent,/无法解析备份/);assert.equal(file.value,'');assert.equal(localStorage.getItem('cc-queue'),before);
});
test('lazy bookmark migration prevents duplicate clicks, reads current cross-tab data, and restores its control',async t=>{
 let resolve,calls=0;const pending=new Promise(yes=>{resolve=yes;});
 const s=await setup(t,[item(1)],()=>{calls++;return pending;});await s.ready();const merge=s.button('加入旧收藏');
 s.storage.set('cc-saved',JSON.stringify([item(2)]));merge.click();merge.click();merge.dispatchEvent(new s.window.MouseEvent('click'));
 assert.equal(calls,1);assert.equal(merge.disabled,true);
 localStorage.setItem('cc-queue',JSON.stringify({version:1,queue:[item(1),item(3)]}));
 s.window.dispatchEvent(new s.window.StorageEvent('storage',{key:'cc-queue'}));
 // Completion must not reopen a dismissed dialog or steal focus.
 const dialog=document.querySelector('#queue-dialog'),rows=[...dialog.querySelectorAll('.queue-row')];dialog.close();const outside=document.createElement('button');document.body.append(outside);outside.focus();
 resolve(await import('../source/atelier/js/queue-legacy.js'));await flush();
 assert.equal(merge.disabled,false);assert.equal(document.activeElement,outside);assert.equal(document.querySelector('#queue-dialog').open,false);assert.deepEqual([...dialog.querySelectorAll('.queue-row')],rows);
 assert.deepEqual(JSON.parse(s.storage.get('cc-queue')).queue,[item(1),item(3),item(2)]);
});
test('lazy migration loading failure keeps saved data, reports the error, and permits retry',async t=>{
 let calls=0;const s=await setup(t,[item(1)],()=>{calls++;return calls===1?Promise.reject(Error('迁移模块暂时无法加载')):import('../source/atelier/js/queue-legacy.js');});
 s.storage.set('cc-saved',JSON.stringify([item(2)]));const before=localStorage.getItem('cc-queue');await s.ready();const merge=s.button('加入旧收藏');
 merge.click();await flush();assert.match(s.status.textContent,/暂时无法加载/);assert.equal(merge.disabled,false);assert.equal(localStorage.getItem('cc-queue'),before);
 merge.click();await flush();assert.equal(calls,2);assert.equal(merge.disabled,false);assert.deepEqual(JSON.parse(s.storage.get('cc-queue')).queue,[item(1),item(2)]);
});
test('legacy migration stays off the initial graph and enters automatically generated offline manifests',()=>{
 const fs=require('node:fs'),path=require('node:path'),{graph}=require('../tools/module-graph.cjs'),base=path.resolve(__dirname,'..');
 const result=graph(path.join(base,'source'),['atelier/js/main.js']);assert.ok(result.bytes<100000);for(const name of ['queue-dialog.js','queue-legacy.js','queue-history.js','queue-list.js','queue-backup.js'])assert.ok(!result.files.some(file=>file.path.endsWith('/'+name)));
 const generators=new Map(),previous=globalThis.hexo;
 try{
  globalThis.hexo={extend:{generator:{register:(name,fn)=>generators.set(name,fn)},helper:{register(){}}}};
  const script=require.resolve('../scripts/live-archive.js');delete require.cache[script];require(script);
  for(const root of ['/','/preview/']){
   const files=generators.get('live-archive').call({config:{root},base_dir:base},{posts:{sort:()=>({toArray:()=>[]})},data:{}});
   const shell=JSON.parse(files.find(file=>file.path==='atelier/data/offline-shell.json').data);
   for(const name of ['queue-dialog.js','queue-legacy.js','queue-history.js','queue-list.js','queue-backup.js'])assert.ok(shell.includes(root+'atelier/js/'+name));
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
 const s=await setup(t,[item(1)],undefined,()=>{calls++;return pending;}),opener=document.createElement('button');opener.className='queue-open';document.body.append(opener);
 assert.equal(calls,0);assert.equal(document.querySelector('.queue-history'),null);opener.click();await flush();const history=document.querySelector('.queue-history');assert.equal(history.children.length,0);assert.equal(calls,1);
 localStorage.setItem('cc-queue',JSON.stringify({version:1,queue:[{...item(2),completed:Date.now()}]}));s.window.dispatchEvent(new s.window.StorageEvent('storage',{key:'cc-queue'}));
 resolve(await import('../source/atelier/js/queue-history.js'));await flush();
 assert.equal(history.children.length,14);assert.match(history.getAttribute('aria-label'),/完成 1 篇/);
 localStorage.setItem('cc-queue',JSON.stringify({version:1,queue:[]}));s.window.dispatchEvent(new s.window.StorageEvent('storage',{key:'cc-queue'}));await flush();assert.match(history.getAttribute('aria-label'),/完成 0 篇/);
});
test('late history loading leaves a closed dialog untouched and can render on reopening',async t=>{
 let resolve;const pending=new Promise(yes=>{resolve=yes;}),s=await setup(t,[],undefined,()=>pending),opener=document.createElement('button');opener.className='queue-open';document.body.append(opener);opener.click();await flush();
 const dialog=document.querySelector('#queue-dialog'),history=document.querySelector('.queue-history');dialog.close();opener.focus();
 resolve(await import('../source/atelier/js/queue-history.js'));await flush();assert.equal(dialog.open,false);assert.equal(history.children.length,0);assert.equal(document.activeElement,opener);
 opener.click();await flush();assert.equal(history.children.length,14);
});
test('history load failures display an honest fallback and retry when reopened',async t=>{
 let calls=0;const s=await setup(t,[],undefined,()=>++calls===1?Promise.reject(Error('offline')):import('../source/atelier/js/queue-history.js')),opener=document.createElement('button');opener.className='queue-open';document.body.append(opener);opener.click();await flush();
 const history=document.querySelector('.queue-history');assert.match(document.querySelector('.queue-history-status').textContent,/暂时无法加载/);document.querySelector('#queue-dialog').close();opener.click();await flush();assert.equal(history.children.length,14);assert.doesNotMatch(document.querySelector('.queue-history-status').textContent,/无法加载/);
});
test('closed queues keep counters and next links current without constructing their 200 rows',async t=>{
 const q=Array.from({length:200},(_,i)=>item(i)),s=await setup(t,q);
 assert.equal(document.querySelectorAll('.queue-row').length,0,'the closed initial dialog must not construct 200 hidden rows');
 assert.equal(document.querySelector('[data-queue-count]').textContent,'200');
 assert.equal(document.querySelector('[data-queue-next]').getAttribute('href'),q[0].path);
 const {queueAction}=await import('../source/atelier/js/archive-store.js');queueAction({type:'done',path:q[0].path});
 assert.equal(document.querySelectorAll('.queue-row').length,0);assert.equal(document.querySelector('[data-queue-count]').textContent,'199');assert.equal(document.querySelector('[data-queue-next]').getAttribute('href'),q[1].path);
 localStorage.setItem('cc-queue',JSON.stringify({version:1,queue:[item(300)]}));s.window.dispatchEvent(new s.window.StorageEvent('storage',{key:'cc-queue'}));
 assert.equal(document.querySelectorAll('.queue-row').length,0);assert.equal(document.querySelector('[data-queue-count]').textContent,'1');assert.equal(document.querySelector('[data-queue-next]').getAttribute('href'),item(300).path);
 document.querySelector('.queue-open').click();await flush();assert.equal(document.querySelectorAll('.queue-row').length,1);assert.equal(document.querySelector('.queue-row').dataset.queuePath,item(300).path);
 await flush();
});
test('closing a populated queue freezes its hidden list until the latest data is reopened',async t=>{
 const s=await setup(t,[item(1),item(2)]),opener=document.querySelector('.queue-open'),dialog=document.querySelector('#queue-dialog');
 opener.click();await flush();const original=[...dialog.querySelectorAll('.queue-row')];assert.equal(original.length,2);dialog.close();opener.focus();
 const {saveQueue}=await import('../source/atelier/js/archive-store.js');saveQueue([item(3)]);
 assert.deepEqual([...dialog.querySelectorAll('.queue-row')],original,'hidden existing rows are not rebuilt');assert.equal(document.activeElement,opener);
 assert.equal(document.querySelector('[data-queue-count]').textContent,'1');assert.equal(document.querySelector('[data-queue-next]').getAttribute('href'),item(3).path);
 localStorage.clear();s.window.dispatchEvent(new s.window.StorageEvent('storage',{key:null}));
 assert.deepEqual([...dialog.querySelectorAll('.queue-row')],original);assert.equal(document.querySelector('[data-queue-count]').textContent,'0');assert.equal(document.querySelector('[data-queue-next]').hidden,true);
 opener.click();assert.equal(dialog.querySelectorAll('.queue-row').length,0);assert.match(dialog.lastElementChild.textContent,/加入队列/);await flush();
 dialog.close();saveQueue([item(4)]);opener.click();assert.equal(dialog.querySelector('.queue-row').dataset.queuePath,item(4).path);await flush();
});
test('closed quota updates retain the storage warning and show temporary data when opened',async t=>{
 const s=await setup(t,[item(1)]),{queueAction}=await import('../source/atelier/js/archive-store.js');
 s.window.Storage.prototype.setItem=()=>{throw Error('QuotaExceededError');};queueAction({type:'add',item:item(2)});
 assert.equal(document.querySelectorAll('.queue-row').length,0);assert.match(s.status.textContent,/仅在当前页面有效/);assert.equal(document.querySelector('[data-queue-count]').textContent,'2');
 document.querySelector('.queue-open').click();await flush();assert.equal(document.querySelectorAll('.queue-row').length,2);assert.match(s.status.textContent,/仅在当前页面有效/);await flush();
});
function captureDownloads(t,s){
 const original={create:URL.createObjectURL,revoke:URL.revokeObjectURL},downloads=[];let blob;
 URL.createObjectURL=value=>{blob=value;return 'blob:synthetic-export';};URL.revokeObjectURL=()=>{};
 s.window.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,blob});};
 t.after(()=>{URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke;});return downloads;
}
const protectedValues=['{"version":1,"queue":[',JSON.stringify({version:2,queue:[item('future')]}),'','null',JSON.stringify({version:1,queue:[{path:'//unsafe/',title:'无效记录'}]})];
for(const [index,raw] of protectedValues.entries())test(`unreadable stored queue ${index} preserves exact text across every direct mutation and article action`,async t=>{
 const s=await setup(t),{saveQueue,queueAction}=await import('../source/atelier/js/archive-store.js');s.storage.set('cc-queue',raw);
 const errors=[];s.window.addEventListener('error',event=>{errors.push(event.error);event.preventDefault();});
 for(const action of [{type:'add',item:item(1)},...['move','done','undone','remove'].map(type=>({type,path:item(1).path,delta:1}))]){
  const result=queueAction(action);assert.equal(result.ok,false);assert.match(result.error,/原文已保留/);assert.equal(localStorage.getItem('cc-queue'),raw);
 }
 assert.equal(saveQueue([item(2)]).ok,false);assert.equal(localStorage.getItem('cc-queue'),raw);
 for(const key of ['queueAdd','queueDone']){const button=document.createElement('button');button.dataset[key]='';document.body.append(button);button.click();assert.equal(localStorage.getItem('cc-queue'),raw);assert.match(document.querySelector('#toast').textContent,/原文已保留/);}
 assert.deepEqual(errors,[]);
});
test('unreadable export contains the exact raw text and never unlocks protected writes',async t=>{
 const s=await setup(t),raw=protectedValues[0],downloads=captureDownloads(t,s);s.storage.set('cc-queue',raw);await s.ready();s.button('导出队列').click();await flush();
 assert.equal(downloads.length,1);assert.match(downloads[0].name,/unreadable\.txt$/);assert.equal(await downloads[0].blob.text(),raw);assert.match(s.status.textContent,/尚未恢复/);
 const {queueAction}=await import('../source/atelier/js/archive-store.js');assert.equal(queueAction({type:'add',item:item(1)}).ok,false);assert.equal(localStorage.getItem('cc-queue'),raw);
});
test('protected storage rejects valid import and old-bookmark merge without clearing either source',async t=>{
 const s=await setup(t),raw=protectedValues[1],saved=JSON.stringify([item(2)]);s.storage.set('cc-queue',raw);s.storage.set('cc-saved',saved);
 document.querySelector('.queue-open').click();await flush();const file=await s.input();Object.defineProperty(file,'files',{value:[{size:100,text:async()=>JSON.stringify({version:1,queue:[item(3)]})}]});file.dispatchEvent(new s.window.Event('change'));await flush();
 assert.equal(localStorage.getItem('cc-queue'),raw);assert.match(s.status.textContent,/原文已保留/);assert.equal(file.value,'');
 await s.ready();s.button('加入旧收藏').click();await flush();assert.equal(localStorage.getItem('cc-queue'),raw);assert.equal(localStorage.getItem('cc-saved'),saved);assert.match(s.status.textContent,/原文已保留/);
});
test('a valid quota fallback cannot overwrite unreadable data subsequently written by another tab',async t=>{
 const s=await setup(t,[item(1)]),{queueAction,getQueue}=await import('../source/atelier/js/archive-store.js'),set=s.window.Storage.prototype.setItem,raw=protectedValues[1],downloads=captureDownloads(t,s);
 s.window.Storage.prototype.setItem=()=>{throw Error('QuotaExceededError');};const first=queueAction({type:'add',item:item(2)});assert.equal(first.ok,true);assert.equal(first.persisted,false);
 set.call(localStorage,'cc-queue',raw);s.window.Storage.prototype.setItem=set;
 const blocked=queueAction({type:'add',item:item(3)});assert.equal(blocked.ok,false);assert.match(blocked.error,/原文已保留/);assert.equal(localStorage.getItem('cc-queue'),raw);assert.deepEqual(getQueue(),[item(1),item(2)]);
 await s.ready();s.button('导出队列').click();await flush();assert.deepEqual(JSON.parse(await downloads[0].blob.text()).queue,[item(1),item(2)]);assert.equal(localStorage.getItem('cc-queue'),raw);
});
test('storage access refusal remains a usable memory-only queue and export, with no blind durable write',async t=>{
 const s=await setup(t),{queueAction,getQueue}=await import('../source/atelier/js/archive-store.js'),downloads=captureDownloads(t,s);let writes=0;
 s.window.Storage.prototype.getItem=()=>{throw Error('SecurityError');};s.window.Storage.prototype.setItem=()=>{writes++;throw Error('SecurityError');};
 for(const n of [1,2]){const result=queueAction({type:'add',item:item(n)});assert.equal(result.ok,true);assert.equal(result.persisted,false);}
 assert.equal(writes,0);assert.deepEqual(getQueue(),[item(1),item(2)]);assert.match(document.querySelector('#toast').textContent,/存储不可用/);
 await s.ready();s.button('导出队列').click();await flush();assert.deepEqual(JSON.parse(await downloads[0].blob.text()).queue,[item(1),item(2)]);
});
test('missing and valid empty queues remain writable and protected state clears after external repair',async t=>{
 const s=await setup(t),{queueAction}=await import('../source/atelier/js/archive-store.js');localStorage.removeItem('cc-queue');
 assert.equal(queueAction({type:'add',item:item(1)}).ok,true);s.storage.set('cc-queue',JSON.stringify({version:1,queue:[]}));assert.equal(queueAction({type:'add',item:item(2)}).ok,true);
 s.storage.set('cc-queue',protectedValues[0]);s.window.dispatchEvent(new s.window.StorageEvent('storage',{key:'cc-queue'}));assert.match(s.status.textContent,/原文已保留/);
 s.storage.set('cc-queue',JSON.stringify({version:1,queue:[]}));s.window.dispatchEvent(new s.window.StorageEvent('storage',{key:'cc-queue'}));assert.doesNotMatch(s.status.textContent,/原文已保留/);assert.equal(queueAction({type:'add',item:item(3)}).ok,true);
});
test('unavailable storage without a memory snapshot refuses to invent an empty backup',async t=>{
 const s=await setup(t,[item(1)]),downloads=captureDownloads(t,s),get=s.window.Storage.prototype.getItem;
 s.window.Storage.prototype.getItem=()=>{throw Error('SecurityError');};await s.ready();s.button('导出队列').click();await flush();
 assert.equal(downloads.length,0);assert.match(s.status.textContent,/暂时无法读取队列/);assert.doesNotMatch(s.status.textContent,/损坏/);
 assert.deepEqual(JSON.parse(get.call(localStorage,'cc-queue')).queue,[item(1)]);
});
test('lazy queue list initializes once, reads latest data, and keeps deliberate focus through close and reopen',async t=>{
 let resolve,loads=0,created=0;const pending=new Promise(yes=>{resolve=yes;});
 const s=await setup(t,[item(1),item(2)],undefined,undefined,()=>{loads++;return pending;}),dialog=document.querySelector('#queue-dialog'),opener=document.querySelector('.queue-open');
 assert.equal(loads,0);opener.click();await flush();assert.equal(loads,1);assert.equal(dialog.querySelectorAll('.queue-row').length,0);
 const {queueAction}=await import('../source/atelier/js/archive-store.js');queueAction({type:'add',item:item(3)});dialog.close();opener.click();assert.equal(loads,1);
 const chosen=s.button('加入旧收藏');chosen.focus();const module=await import('../source/atelier/js/queue-list.js');resolve({createQueueList(...args){created++;return module.createQueueList(...args);}});await flush();
 assert.equal(created,1);assert.equal(dialog.querySelectorAll('.queue-row').length,3);assert.equal(document.activeElement,chosen);
 const down=dialog.querySelector('[data-queue-action=down]');down.focus();down.click();assert.equal(document.activeElement.dataset.queueAction,'down');assert.equal(document.activeElement.closest('.queue-row').dataset.queuePath,item(1).path);
 dialog.close();queueAction({type:'remove',path:item(2).path});opener.click();assert.equal(dialog.querySelectorAll('.queue-row').length,2,'cached module renders synchronously');assert.equal(created,1);assert.equal(loads,1);
});
test('a list module resolving after close is cached without rendering or stealing focus',async t=>{
 let resolve,created=0;const pending=new Promise(yes=>{resolve=yes;}),s=await setup(t,[item(1)],undefined,undefined,()=>pending),dialog=document.querySelector('#queue-dialog'),opener=document.querySelector('.queue-open');
 opener.click();await flush();dialog.close();opener.focus();const module=await import('../source/atelier/js/queue-list.js');resolve({createQueueList(...args){created++;return module.createQueueList(...args);}});await flush();
 assert.equal(created,1);assert.equal(dialog.open,false);assert.equal(dialog.querySelectorAll('.queue-row').length,0);assert.equal(document.activeElement,opener);
 opener.click();assert.equal(dialog.querySelectorAll('.queue-row').length,1);assert.equal(created,1);
});
test('list loading failure can retry and clears only its own obsolete error',async t=>{
 let loads=0;const s=await setup(t,[item(1)],undefined,undefined,()=>++loads===1?Promise.reject(Error('offline')):import('../source/atelier/js/queue-list.js')),dialog=document.querySelector('#queue-dialog'),opener=document.querySelector('.queue-open');
 opener.click();await flush();assert.match(s.listStatus.textContent,/队列列表暂时无法加载/);dialog.close();opener.click();await flush();assert.equal(dialog.querySelectorAll('.queue-row').length,1);assert.equal(s.listStatus.textContent,'');
});
for(const kind of ['protected','quota','import'])test(`successful list retry preserves a newer ${kind} status`,async t=>{
 let resolve,loads=0;const pending=new Promise(yes=>{resolve=yes;}),s=await setup(t,[item(1)],undefined,undefined,()=>++loads===1?Promise.reject(Error('offline')):pending),dialog=document.querySelector('#queue-dialog'),opener=document.querySelector('.queue-open');
 opener.click();await flush();dialog.close();opener.click();await flush();
 if(kind==='protected'){s.storage.set('cc-queue',protectedValues[0]);s.window.dispatchEvent(new s.window.StorageEvent('storage',{key:'cc-queue'}));}
 if(kind==='quota'){s.window.Storage.prototype.setItem=()=>{throw Error('QuotaExceededError');};const {queueAction}=await import('../source/atelier/js/archive-store.js');queueAction({type:'add',item:item(2)});}
 if(kind==='import'){const file=await s.input();Object.defineProperty(file,'files',{value:[{size:100,text:async()=>JSON.stringify({version:1,queue:[item(3)]})}]});file.dispatchEvent(new s.window.Event('change'));await flush();}
 const status=s.status.textContent;assert.doesNotMatch(status,/暂时无法加载/);resolve(await import('../source/atelier/js/queue-list.js'));await flush();assert.equal(s.status.textContent,status);assert.equal(s.listStatus.textContent,'');
 if(kind==='protected'){assert.equal(dialog.querySelectorAll('.queue-row').length,0);assert.doesNotMatch(dialog.lastElementChild.textContent,/加入队列/);}
});
test('stale visible list controls cannot overwrite newly protected durable values',async t=>{
 const s=await setup(t,[item(1),item(2)]);document.querySelector('.queue-open').click();await flush();
 const row=document.querySelector('.queue-row'),raw=protectedValues[1],errors=[];s.window.addEventListener('error',event=>{errors.push(event.error);event.preventDefault();});s.storage.set('cc-queue',raw);
 for(const button of row.querySelectorAll('button:not(:disabled)')){button.click();assert.equal(localStorage.getItem('cc-queue'),raw);assert.match(document.querySelector('#toast').textContent,/原文已保留/);}
 assert.deepEqual(errors,[]);
});
test('the constellation queue button reports protected storage without an uncaught exception',async t=>{
 const s=await setup(t),host=document.createElement('div');host.innerHTML='<canvas></canvas><div class="constellation-detail"></div><select data-graph-select></select><button data-graph-zoom="in"></button><button data-graph-zoom="out"></button><button data-graph-reset></button>';document.body.append(host);host.querySelector('canvas').getContext=()=>null;
 Object.assign(globalThis,{ResizeObserver:class{observe(){}},devicePixelRatio:1,requestAnimationFrame:()=>0,cancelAnimationFrame(){}});
 const {createConstellation}=await import('../source/atelier/js/constellation.js'),graph=createConstellation(host,()=>{});graph.setPosts([{...item(1),group:'writing',tags:[]}]);
 const select=host.querySelector('select');select.value=item(1).path;select.dispatchEvent(new s.window.Event('change'));
 const raw=protectedValues[0],errors=[];s.storage.set('cc-queue',raw);s.window.addEventListener('error',event=>{errors.push(event.error);event.preventDefault();});
 [...host.querySelectorAll('button')].find(button=>button.textContent==='＋ 阅读队列').click();assert.equal(localStorage.getItem('cc-queue'),raw);assert.match(document.querySelector('#toast').textContent,/原文已保留/);assert.deepEqual(errors,[]);graph.pause();
});
test('archive cards do not overwrite protected data or replace quota and capacity warnings with success',async t=>{
 const s=await setup(t);document.body.insertAdjacentHTML('beforeend','<section data-archive><div class="archive-app"><form class="archive-search"><input id="archive-q"><button type="reset"></button></form><details class="archive-options"><select data-tag></select><select data-duration><option value="all">全部</option></select><select id="archive-sort"><option value="newest">最新</option></select><div class="archive-filter-tags"></div><button data-group="writing"></button><button data-view="list"></button></details><div class="constellation"></div><span data-archive-count></span><div data-archive-results></div><button data-archive-more></button></div><div class="archive-fallback"></div></section>');
 Object.assign(globalThis,{history:s.window.history,fetch:async()=>({ok:true,json:async()=>({version:1,posts:[{...item('card'),group:'writing',tags:[],date:'2026-01-01',minutes:1,text:'合成测试',excerpt:'合成测试'}]})})});
 const {initArchive}=await import('../source/atelier/js/archive.js');await initArchive();const card=document.querySelector('[data-queue-path]'),errors=[];s.window.addEventListener('error',event=>{errors.push(event.error);event.preventDefault();});
 const raw=protectedValues[1];s.storage.set('cc-queue',raw);card.click();assert.equal(localStorage.getItem('cc-queue'),raw);assert.match(document.querySelector('#toast').textContent,/原文已保留/);
 s.storage.set('cc-queue',JSON.stringify({version:1,queue:Array.from({length:200},(_,i)=>item(i))}));card.click();assert.match(document.querySelector('#toast').textContent,/队列已满/);
 s.storage.set('cc-queue',JSON.stringify({version:1,queue:[]}));s.window.Storage.prototype.setItem=()=>{throw Error('QuotaExceededError');};card.click();assert.match(document.querySelector('#toast').textContent,/存储不可用/);assert.equal(card.getAttribute('aria-pressed'),'true');assert.deepEqual(errors,[]);s.window.dispatchEvent(new s.window.Event('pagehide'));
});
test('a list retry completing while closed clears its own stale failure before the next open',async t=>{
 let resolve,loads=0;const pending=new Promise(yes=>{resolve=yes;}),s=await setup(t,[item(1)],undefined,undefined,()=>++loads===1?Promise.reject(Error('offline')):pending),dialog=document.querySelector('#queue-dialog'),opener=document.querySelector('.queue-open');
 opener.click();await flush();assert.match(s.listStatus.textContent,/暂时无法加载/);dialog.close();opener.click();await flush();dialog.close();opener.focus();resolve(await import('../source/atelier/js/queue-list.js'));await flush();
 assert.equal(dialog.open,false);assert.equal(document.activeElement,opener);assert.equal(dialog.querySelectorAll('.queue-row').length,0);opener.click();assert.equal(dialog.querySelectorAll('.queue-row').length,1);assert.equal(s.listStatus.textContent,'');
});
test('backup module failures keep storage intact and a retry downloads the latest raw value',async t=>{
 let loads=0;const s=await setup(t,[item(1)],undefined,undefined,undefined,()=>++loads===1?Promise.reject(Error('备份模块暂时无法加载')):import('../source/atelier/js/queue-backup.js')),downloads=captureDownloads(t,s),before=localStorage.getItem('cc-queue');
 await s.ready();s.button('导出队列').click();await flush();assert.equal(downloads.length,0);assert.equal(localStorage.getItem('cc-queue'),before);assert.match(s.status.textContent,/导出队列暂时无法加载/);
 const raw=protectedValues[0];s.storage.set('cc-queue',raw);await s.ready();s.button('导出队列').click();await flush();assert.equal(downloads.length,1);assert.equal(await downloads[0].blob.text(),raw);assert.match(s.status.textContent,/尚未恢复/);assert.equal(localStorage.getItem('cc-queue'),raw);
});
function delayedImport(window){
 const file=document.querySelector('#queue-dialog input');let resolve,reject;const pending=new Promise((yes,no)=>{resolve=yes;reject=no;});
 Object.defineProperty(file,'files',{configurable:true,value:[{size:100,text:()=>pending}]});file.dispatchEvent(new window.Event('change'));
 return{resolve:queue=>resolve(JSON.stringify({version:1,queue})),reject};
}
test('newer queue import wins when reads finish in reverse order, including stale failures',async t=>{
 const s=await setup(t,[item(1)]);document.querySelector('.queue-open').click();await flush();
 const first=delayedImport(s.window),second=delayedImport(s.window);second.resolve([item(3)]);await flush();const status=s.status.textContent;
 first.resolve([item(2)]);await flush();assert.deepEqual(JSON.parse(localStorage.getItem('cc-queue')).queue,[item(3)]);assert.equal(s.status.textContent,status);
 const stale=delayedImport(s.window),latest=delayedImport(s.window);latest.resolve([item(4)]);await flush();const latestStatus=s.status.textContent;stale.reject(Error('old read failure'));await flush();
 assert.deepEqual(JSON.parse(localStorage.getItem('cc-queue')).queue,[item(4)]);assert.equal(s.status.textContent,latestStatus);
});
for(const event of ['close','reopen','queue-change','storage','silent-storage','invalid'])test(`pending queue import preserves newer state after ${event}`,async t=>{
 const s=await setup(t,[item(1)]);document.querySelector('.queue-open').click();await flush();const pending=delayedImport(s.window),dialog=document.querySelector('#queue-dialog');
 if(event==='close'||event==='reopen'){dialog.close();if(event==='reopen')document.querySelector('.queue-open').click();await flush();}
 if(event==='queue-change'){const {queueAction}=await import('../source/atelier/js/archive-store.js');queueAction({type:'add',item:item(4)});}
 if(event==='storage'||event==='silent-storage'||event==='invalid'){localStorage.setItem('cc-queue',event==='invalid'?'{broken':JSON.stringify({version:1,queue:[item(5)]}));if(event==='storage')s.window.dispatchEvent(new s.window.StorageEvent('storage',{key:'cc-queue'}));}
 const before=localStorage.getItem('cc-queue');pending.resolve([item(2)]);await flush();assert.equal(localStorage.getItem('cc-queue'),before);
 if(event==='close')assert.equal(dialog.open,false);
});
test('invalid current queue import preserves the original and allows the same input to retry',async t=>{
 const s=await setup(t,[item(1)]),before=localStorage.getItem('cc-queue');document.querySelector('.queue-open').click();await flush();const invalid=delayedImport(s.window);invalid.resolve([{path:'https://bad.test/',title:'Bad'}]);await flush();assert.equal(localStorage.getItem('cc-queue'),before);assert.doesNotMatch(s.status.textContent,/队列已导入/);
 const retry=delayedImport(s.window);retry.resolve([item(2)]);await flush();assert.deepEqual(JSON.parse(localStorage.getItem('cc-queue')).queue,[item(2)]);
});
test('queue import clears selection before reading and closed stale failures cannot replace current feedback',async t=>{
 const s=await setup(t,[item(1)]),file=await s.input();document.querySelector('.queue-open').click();await flush();let value='chosen.json',readValue;
 Object.defineProperty(file,'value',{configurable:true,get:()=>value,set:next=>{value=next;}});let reject;
 Object.defineProperty(file,'files',{configurable:true,value:[{size:100,text:()=>{readValue=file.value;return new Promise((_,no)=>{reject=no;});}}]});file.dispatchEvent(new s.window.Event('change'));assert.equal(readValue,'');assert.equal(file.value,'');
 document.querySelector('#queue-dialog').close();document.querySelector('.queue-open').click();await flush();const before=localStorage.getItem('cc-queue'),status=s.status.textContent;reject(Error('stale read'));await flush();assert.equal(localStorage.getItem('cc-queue'),before);assert.equal(s.status.textContent,status);
});
for(const kind of ['closed-before-event','detached','pagehide'])test(`queue import cannot commit after ${kind}`,async t=>{
 const s=await setup(t,[item(1)]);document.querySelector('.queue-open').click();await flush();const pending=delayedImport(s.window),dialog=document.querySelector('#queue-dialog'),before=localStorage.getItem('cc-queue');
 if(kind==='closed-before-event')dialog.open=false;else if(kind==='detached')dialog.remove();else s.window.dispatchEvent(new s.window.Event('pagehide'));
 pending.resolve([item(2)]);await flush();assert.equal(localStorage.getItem('cc-queue'),before);
});

function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function deadlines(t,window){
 const set=window.setTimeout,clear=window.clearTimeout,pending=new Map();let next=-1;
 window.setTimeout=function(fn,ms,...args){if(ms!==15000)return set.call(this,fn,ms,...args);const id=next--;pending.set(id,()=>fn(...args));return id;};
 window.clearTimeout=function(id){if(!pending.delete(id))clear.call(this,id);};
 t.after(()=>{window.setTimeout=set;window.clearTimeout=clear;});
 return {get size(){return pending.size;},expire(){const current=[...pending.values()];pending.clear();current.forEach(run=>run());}};
}
const openQueue=async()=>{document.querySelector('.queue-open').click();await flush();};

test('dialog controller is absent initially, bounded while loading, and retries without accepting retired imports',async t=>{
 const first=deferred(),second=deferred();let loads=0,created=0;
 const s=await setup(t,[item(1)],undefined,undefined,undefined,undefined,()=>++loads===1?first.promise:second.promise),clock=deadlines(t,s.window),dialog=document.querySelector('#queue-dialog');
 assert.equal(loads,0);assert.equal(dialog.querySelector('input'),null);assert.equal(s.button('导出队列'),undefined);
 await openQueue();assert.equal(loads,1);assert.match(document.querySelector('.queue-controller-status').textContent,/正在加载/);
 document.querySelector('.queue-open').click();assert.equal(loads,1);assert.equal(dialog.querySelector('input'),null);
 clock.expire();await flush();assert.match(document.querySelector('.queue-controller-status').textContent,/暂时无法加载/);
 const retry=s.button('重试队列工具');retry.focus();retry.click();retry.dispatchEvent(new s.window.MouseEvent('click'));assert.equal(loads,2);assert.equal(document.activeElement,dialog.querySelector('.live-dialog-head button'));
 const module=await import('../source/atelier/js/queue-dialog.js'),wrapper={createQueueDialog(...args){created++;return module.createQueueDialog(...args);}};
 first.resolve(wrapper);await flush();assert.equal(created,0);assert.equal(dialog.querySelector('input'),null);assert.equal(clock.size,1,'old completion must not clear the new deadline');
 const outside=document.createElement('button');document.body.append(outside);outside.focus();second.resolve(wrapper);await flush();
 assert.equal(created,1);assert.equal(dialog.querySelectorAll('input').length,1);assert.equal(document.activeElement,outside);assert.equal(document.querySelector('.queue-controller-status').textContent,'');
});

for(const interruption of ['close','pagehide'])test(`late dialog controller after ${interruption} does not initialize hidden or retired controls`,async t=>{
 const first=deferred();let loads=0,created=0;const module=await import('../source/atelier/js/queue-dialog.js'),wrapper={createQueueDialog(...args){created++;return module.createQueueDialog(...args);}};
 const s=await setup(t,[item(1)],undefined,undefined,undefined,undefined,()=>++loads===1?first.promise:Promise.resolve(wrapper)),dialog=document.querySelector('#queue-dialog');
 await openQueue();if(interruption==='close')dialog.close();else{s.window.dispatchEvent(new s.window.Event('pagehide'));s.window.dispatchEvent(new s.window.Event('pageshow'));}
 const outside=document.createElement('button');document.body.append(outside);outside.focus();first.resolve(wrapper);await flush();assert.equal(created,0);assert.equal(dialog.querySelector('input'),null);assert.equal(document.activeElement,outside);assert.equal(loads,1);
 await openQueue();assert.equal(created,1);assert.equal(loads,interruption==='close'?1:2);assert.equal(dialog.querySelectorAll('input').length,1);
});

test('partial controller initialization requires refresh and never binds a second controller',async t=>{
 let initialized=0;const s=await setup(t,[],undefined,undefined,undefined,undefined,async()=>({createQueueDialog(host){initialized++;const button=document.createElement('button');button.textContent='部分工具';host.append(button);throw Error('initialization failed');}}));
 await openQueue();assert.equal(initialized,1);assert.match(document.querySelector('.queue-controller-status').textContent,/初始化失败.*刷新/);assert.equal(s.button('部分工具').disabled,true);assert.equal(s.button('重试队列工具').hidden,true);
 s.window.dispatchEvent(new s.window.Event('pagehide'));s.window.dispatchEvent(new s.window.Event('pageshow'));assert.match(document.querySelector('.queue-controller-status').textContent,/初始化失败.*刷新/);
 document.querySelector('#queue-dialog').close();await openQueue();s.button('重试队列工具').dispatchEvent(new s.window.MouseEvent('click'));assert.equal(initialized,1);
});

for(const kind of ['protected','quota','import'])test(`late list rejection preserves the newer ${kind} feedback`,async t=>{
 const pending=deferred(),s=await setup(t,[item(1)],undefined,undefined,()=>pending.promise);await openQueue();
 if(kind==='protected'){s.storage.set('cc-queue',protectedValues[0]);s.window.dispatchEvent(new s.window.StorageEvent('storage',{key:'cc-queue'}));}
 if(kind==='quota'){s.window.Storage.prototype.setItem=()=>{throw Error('QuotaExceededError');};const {queueAction}=await import('../source/atelier/js/archive-store.js');queueAction({type:'add',item:item(2)});}
 if(kind==='import'){delayedImport(s.window).resolve([item(3)]);await flush();}
 const before=s.status.textContent,raw=localStorage.getItem('cc-queue');pending.reject(Error('old import rejected'));await flush();
 assert.equal(s.status.textContent,before);assert.equal(localStorage.getItem('cc-queue'),raw);assert.match(s.listStatus.textContent,/暂时无法加载/);
});

test('a never-settling list import times out and old finally cannot clear an explicit retry',async t=>{
 const first=deferred(),second=deferred();let loads=0,created=0;const s=await setup(t,[item(1)],undefined,undefined,()=>++loads===1?first.promise:second.promise),clock=deadlines(t,s.window);await openQueue();
 assert.equal(loads,1);document.querySelector('#queue-dialog').close();await openQueue();assert.equal(loads,1);clock.expire();await flush();assert.match(s.listStatus.textContent,/暂时无法加载/);
 const retry=s.button('重试队列列表');retry.focus();retry.click();retry.dispatchEvent(new s.window.MouseEvent('click'));assert.equal(loads,2);assert.equal(document.activeElement,document.querySelector('.live-dialog-head button'));
 const module=await import('../source/atelier/js/queue-list.js'),wrapper={createQueueList(...args){created++;return module.createQueueList(...args);}};first.resolve(wrapper);await flush();assert.equal(created,0);assert.match(s.listStatus.textContent,/正在加载/);assert.equal(clock.size,1);
 const chosen=s.button('加入旧收藏');chosen.focus();second.resolve(wrapper);await flush();assert.equal(created,1);assert.equal(document.querySelectorAll('.queue-row').length,1);assert.equal(s.listStatus.textContent,'');assert.equal(document.activeElement,chosen);
});

test('cached renderer failures stay local, are caught on later queue events, and recover without stale errors',async t=>{
 let creations=0,fail=false;const module=await import('../source/atelier/js/queue-list.js'),s=await setup(t,[item(1)],undefined,undefined,async()=>({createQueueList(...args){creations++;const render=module.createQueueList(...args);return state=>{if(fail)throw Error('renderer failed');render(state);};}})),errors=[];
 s.window.addEventListener('error',event=>{errors.push(event.error);event.preventDefault();});await openQueue();assert.equal(creations,1);fail=true;
 const {queueAction}=await import('../source/atelier/js/archive-store.js');queueAction({type:'add',item:item(2)});assert.deepEqual(errors,[]);assert.equal(document.querySelectorAll('.queue-row').length,0);assert.match(s.listStatus.textContent,/暂时无法加载/);
 queueAction({type:'done',path:item(2).path});assert.equal(creations,1,'data changes do not run an automatic retry loop');fail=false;s.button('重试队列列表').click();await flush();
 assert.equal(creations,2);assert.equal(document.querySelectorAll('.queue-row').length,2);assert.equal(s.listStatus.textContent,'');assert.deepEqual(errors,[]);
});

for(const kind of ['merge','export'])test(`${kind} imports are bounded, deduplicate clicks, and use latest data only for the live attempt`,async t=>{
 const first=deferred(),second=deferred();let loads=0;const loader=()=>++loads===1?first.promise:second.promise;
 const s=await setup(t,[item(1)],kind==='merge'?loader:undefined,undefined,undefined,kind==='export'?loader:undefined),clock=deadlines(t,s.window),downloads=captureDownloads(t,s);await openQueue();
 const button=s.button(kind==='merge'?'加入旧收藏':'导出队列'),before=localStorage.getItem('cc-queue');button.click();button.click();button.dispatchEvent(new s.window.MouseEvent('click'));assert.equal(loads,1);assert.equal(button.disabled,true);
 clock.expire();await flush();assert.equal(button.disabled,false);assert.match(s.status.textContent,/暂时无法加载/);assert.doesNotMatch(s.status.textContent,/Import timed out/);assert.equal(localStorage.getItem('cc-queue'),before);assert.equal(downloads.length,0);
 button.click();assert.equal(loads,2);const module=await import(kind==='merge'?'../source/atelier/js/queue-legacy.js':'../source/atelier/js/queue-backup.js');first.resolve(module);await flush();assert.equal(button.disabled,true);assert.equal(localStorage.getItem('cc-queue'),before);assert.equal(downloads.length,0);
 localStorage.setItem('cc-queue',JSON.stringify({version:1,queue:[item(3)]}));s.storage.set('cc-saved',JSON.stringify([item(4)]));second.resolve(module);await flush();assert.equal(button.disabled,false);
 if(kind==='merge'){assert.deepEqual(JSON.parse(localStorage.getItem('cc-queue')).queue,[item(3),item(4)]);assert.equal(downloads.length,0);}else{assert.equal(downloads.length,1);assert.deepEqual(JSON.parse(await downloads[0].blob.text()).queue,[item(3)]);}
});

test('an explicitly requested export may finish after close without reopening or stealing focus',async t=>{
 const pending=deferred(),s=await setup(t,[item(1)],undefined,undefined,undefined,()=>pending.promise),downloads=captureDownloads(t,s);await openQueue();await s.ready();s.button('导出队列').click();const dialog=document.querySelector('#queue-dialog');dialog.close();document.querySelector('.queue-open').focus();
 pending.resolve(await import('../source/atelier/js/queue-backup.js'));await flush();assert.equal(downloads.length,1);assert.equal(dialog.open,false);assert.equal(document.activeElement,document.querySelector('.queue-open'));
});

test('pagehide retires list, history, file, merge and export work across pageshow until new explicit actions',async t=>{
 const jobs={list:deferred(),history:deferred(),merge:deferred(),export:deferred()},calls={list:0,history:0,merge:0,export:0},executed={list:0,history:0,merge:0,export:0};
 const modules={list:await import('../source/atelier/js/queue-list.js'),history:await import('../source/atelier/js/queue-history.js'),merge:await import('../source/atelier/js/queue-legacy.js'),export:await import('../source/atelier/js/queue-backup.js')};
 const loader=kind=>()=>++calls[kind]===1?jobs[kind].promise:Promise.resolve(modules[kind]);
 const s=await setup(t,[item(1)],loader('merge'),loader('history'),loader('list'),loader('export')),downloads=captureDownloads(t,s);s.storage.set('cc-saved',JSON.stringify([item(2)]));await openQueue();await s.ready();s.button('加入旧收藏').click();await s.ready();s.button('导出队列').click();const file=delayedImport(s.window),before=localStorage.getItem('cc-queue');
 s.window.dispatchEvent(new s.window.Event('pagehide'));s.window.dispatchEvent(new s.window.Event('pageshow'));assert.deepEqual(calls,{list:1,history:1,merge:1,export:1});
 assert.equal(document.querySelector('#queue-dialog').open,true);for(const kind of ['list','history'])assert.match(document.querySelector('.queue-'+kind+'-status').textContent,/已暂停/);for(const label of ['重试队列列表','重试阅读记录'])assert.equal(s.button(label).hidden,false);
 jobs.list.resolve({createQueueList(){executed.list++;return ()=>{};}});jobs.history.resolve({renderQueueHistory(){executed.history++;}});jobs.merge.resolve({mergeSavedQueue(){executed.merge++;return modules.merge.mergeSavedQueue();}});jobs.export.resolve({exportQueue(){executed.export++;return modules.export.exportQueue();}});file.resolve([item(9)]);await flush();
 assert.deepEqual(executed,{list:0,history:0,merge:0,export:0});assert.equal(downloads.length,0);assert.equal(localStorage.getItem('cc-queue'),before);assert.equal(document.querySelectorAll('.queue-row').length,0);assert.equal(document.querySelector('.queue-history').children.length,0);
 await openQueue();await s.ready();s.button('加入旧收藏').click();await flush();await s.ready();s.button('导出队列').click();await flush();assert.deepEqual(JSON.parse(localStorage.getItem('cc-queue')).queue,[item(1),item(2)]);assert.equal(downloads.length,1);assert.equal(document.querySelectorAll('.queue-row').length,2);assert.equal(document.querySelector('.queue-history').children.length,14);
});

test('history timeout is optional, retries explicitly with stable focus, and does not disable queue tools',async t=>{
 const first=deferred();let loads=0;const s=await setup(t,[item(1)],undefined,()=>++loads===1?first.promise:import('../source/atelier/js/queue-history.js')),clock=deadlines(t,s.window);await openQueue();clock.expire();await flush();
 assert.match(document.querySelector('.queue-history-status').textContent,/暂时无法加载/);assert.equal(document.querySelectorAll('.queue-row').length,1);assert.equal(s.button('导出队列').disabled,false);
 const retry=s.button('重试阅读记录');retry.focus();retry.click();assert.equal(document.activeElement,document.querySelector('.live-dialog-head button'));await flush();assert.equal(loads,2);assert.equal(document.querySelector('.queue-history').children.length,14);assert.equal(document.querySelector('.queue-history-status').textContent,'');
 first.reject(Error('late history failure'));await flush();assert.equal(document.querySelector('.queue-history-status').textContent,'');
});
