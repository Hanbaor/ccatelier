const test=require('node:test'),assert=require('node:assert/strict');const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('search isolates site/offline state, keeps query, ignores late reads and invalidates deleted copies',async()=>{
 const dom=new JSDOM('<body data-root="/" data-search="/search.json"><button class="search-open"></button><dialog id="search-dialog"><select id="search-scope"><option value="site">全站</option><option value="offline">本机离线</option></select><p id="search-status"></p><input id="search-input"><div id="search-results"></div></dialog></body>',{url:'https://ccatelier.test/'});
 const {window}=dom;Object.assign(globalThis,{window,document:window.document,location:window.location,CustomEvent:window.CustomEvent,matchMedia:()=>({matches:false,addEventListener(){}})});
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 let fetches=0,reads=[];globalThis.fetch=async()=>{fetches++;throw Error('offline network');};
 const {initSearch}=await import('../source/atelier/js/search.js');initSearch({loadOffline:()=>new Promise((resolve,reject)=>reads.push({resolve,reject}))});
 const input=document.querySelector('input'),scope=document.querySelector('select'),box=document.querySelector('#search-results'),open=document.querySelector('.search-open');
 const change=mode=>{scope.value=mode;scope.dispatchEvent(new window.Event('change'));};const result=entries=>({version:1,entries,unavailable:0});const saved={title:'A',url:'/a/',content:'needle 正文'};
 try{
 open.click();await tick();assert.match(box.textContent,/文章索引暂时无法载入/);assert.equal(fetches,1);
 input.value='needle';change('offline');reads.shift().resolve(result([saved]));await tick();assert.equal(input.value,'needle');assert.equal(box.querySelectorAll('a').length,1);assert.match(box.textContent,/离线副本/);assert.equal(fetches,1);
 input.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowDown',isComposing:true,bubbles:true}));assert.notEqual(document.activeElement,box.querySelector('a'));input.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert.equal(document.activeElement,box.querySelector('a'));
 document.dispatchEvent(new window.CustomEvent('atelier:offline'));assert.equal(box.querySelectorAll('a').length,0);const old=reads.shift();document.dispatchEvent(new window.CustomEvent('atelier:offline'));reads.shift().resolve(result([]));await tick();old.resolve(result([saved]));await tick();assert.equal(box.querySelectorAll('a').length,0);
 change('site');await tick();assert.match(box.textContent,/文章索引暂时无法载入/);change('offline');reads.shift().reject(Error('当前离线服务暂不支持搜索，请联网刷新后重试。'));await tick();assert.match(box.textContent,/暂不支持搜索/);assert.equal(box.querySelectorAll('a').length,0);
 box.querySelector('button').click();reads.shift().resolve({...result([]),unavailable:2});await tick();assert.match(document.querySelector('#search-status').textContent,/2 篇/);assert.match(box.textContent,/无法检索/);
 document.querySelector('dialog').close();open.click();assert.equal(input.value,'needle');reads.shift().resolve(result([saved]));await tick();window.dispatchEvent(new window.Event('focus'));reads.shift().resolve(result([]));await tick();assert.equal(box.querySelectorAll('a').length,0);
 }finally{dom.window.close();}
});

test('offline client bounds old-worker and registration stalls and forwards cross-page invalidation',async()=>{
 const fs=require('node:fs'),vm=require('node:vm');const source=fs.readFileSync('source/atelier/js/offline-client.js','utf8').replace(/^import[^\n]+\n/,'').replace('export async function','async function');
 function client(mode){const timers=new Map(),events={},notices=[];let id=0,posts=0,resolveRegistration;const listeners=new Set(),installing={state:'installing',addEventListener:(type,fn)=>listeners.add(fn),removeEventListener:(type,fn)=>listeners.delete(fn)};
 const sw={postMessage(data,ports){posts++;queueMicrotask(()=>ports[0].postMessage({ok:false,error:'未知离线操作'}));}};
 class Channel{constructor(){const a={close(){this.closed=true;}},b={postMessage(data){if(!a.closed)a.onmessage({data});}};this.port1=a;this.port2=b;}}
 const context=vm.createContext({root:'/',window:{isSecureContext:true},navigator:{serviceWorker:{addEventListener:(type,fn)=>events[type]=fn,register:()=>mode==='stall'?new Promise(resolve=>resolveRegistration=resolve):Promise.resolve(mode==='install'?{installing}:{active:sw})}},document:{dispatchEvent:e=>notices.push(e.type)},CustomEvent:class{constructor(type){this.type=type;}},MessageChannel:Channel,AbortController,setTimeout:(fn,delay)=>{timers.set(++id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),queueMicrotask});vm.runInContext(source,context);
 return {call:data=>context.offlineMessage(data),timers,events,notices,listeners,installing,get posts(){return posts;},ready:()=>resolveRegistration({active:sw})};}
 const old=client('old');await assert.rejects(old.call({type:'search-index'}),/暂不支持搜索/);assert.equal(old.timers.size,0);
 old.events.message({data:{type:'atelier:offline'}});assert.deepEqual(old.notices,['atelier:offline']);
 const installing=client('install'),installation=installing.call({type:'search-index'});await tick();assert.equal(installing.listeners.size,1);[...installing.timers.values()].find(t=>t.delay===8000).fn();await assert.rejects(installation,/超时/);assert.equal(installing.listeners.size,0);assert.equal(installing.timers.size,0);installing.installing.state='activated';for(const listener of installing.listeners)listener();assert.equal(installing.posts,0);
 const saving=client('install'),save=saving.call({type:'save',path:'/a/'});await tick();assert.ok([...saving.timers.values()].some(t=>t.delay===120000));assert.ok(![...saving.timers.values()].some(t=>t.delay===8000));[...saving.timers.values()].find(t=>t.delay===15000).fn();await assert.rejects(save,/启动超时/);assert.equal(saving.listeners.size,0);assert.equal(saving.timers.size,0);
 const stalled=client('stall'),pending=stalled.call({type:'search-index'});await Promise.resolve();const timer=[...stalled.timers.values()].find(t=>t.delay===8000);assert.ok(timer);timer.fn();await assert.rejects(pending,/超时/);stalled.ready();await tick();assert.equal(stalled.posts,0,'late activation must not send an expired request');
});
