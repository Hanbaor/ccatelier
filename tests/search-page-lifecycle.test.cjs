const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const entries=[{title:'needle result',content:'needle',url:'/result/'}];
const saved=items=>({version:1,entries:items,unavailable:0});

async function fixture(t){
 const dom=new JSDOM('<body data-root="/lab/"><button class="search-open">Search</button><button id="outside">Elsewhere</button><dialog id="search-dialog"><select id="search-scope"><option value="offline">Offline</option></select><p id="search-status"></p><input id="search-input"><div id="search-results"></div></dialog></body>',{url:'https://ccatelier.test/lab/'});
 const {window}=dom,document=window.document;
 await tick(); // Initial pageshow must finish before the synthetic lifecycle.
 const globals={window,document,location:window.location,CustomEvent:window.CustomEvent};
 const previous=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 Object.assign(globalThis,globals);
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const requests=[],allRequests=[],focusCalls=[];
 const nativeFocus=window.HTMLElement.prototype.focus;
 window.HTMLElement.prototype.focus=function(...args){focusCalls.push(this);return nativeFocus.apply(this,args);};
 const {initSearch}=await import('../source/atelier/js/search.js');
 initSearch({
  loadOffline:()=>{const request=deferred();requests.push(request);allRequests.push(request);return request.promise;},
  loadContext:()=>new Promise(()=>{}) // Optional enrichment cannot block results.
 });
 const input=document.querySelector('input'),box=document.querySelector('#search-results'),dialog=document.querySelector('dialog'),opener=document.querySelector('.search-open'),outside=document.querySelector('#outside');
 input.value='needle';
 t.after(async()=>{
  for(const request of allRequests)request.resolve(saved(entries));
  await tick();dom.window.close();
  for(const [key,descriptor] of previous)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
 });
 return {window,document,input,box,dialog,opener,outside,requests,focusCalls,
  open:()=>opener.click(),refresh:()=>document.dispatchEvent(new window.Event('atelier:offline')),
  hide:()=>window.dispatchEvent(new window.PageTransitionEvent('pagehide',{persisted:true})),
  show:()=>window.dispatchEvent(new window.PageTransitionEvent('pageshow',{persisted:true})),
  async succeed(request= requests.shift(),items=entries){request.resolve(saved(items));await tick();},
  resetFocus:()=>{focusCalls.length=0;}
 };
}

for(const outcome of ['success','failure'])test(`pagehide retires pending search focus while the existing read can finish with ${outcome}`,async t=>{
 const f=await fixture(t);f.open();await f.succeed();f.box.querySelector('a').focus();f.refresh();
 const pending=f.requests.shift();assert.equal(f.document.activeElement,f.box.querySelector('.search-empty'));
 f.hide();f.resetFocus();
 if(outcome==='success')await f.succeed(pending);else{pending.reject(Error('Read unavailable'));await tick();}
 assert.equal(f.dialog.open,true,'open dialog alone does not own focus after pagehide');
 assert.equal(f.box.getAttribute('aria-busy'),'false');assert.equal(f.focusCalls.length,0);
 if(outcome==='success')assert.equal(f.box.querySelector('a').getAttribute('href'),'/result/');
 else assert.ok(f.box.querySelector('button'),'read failure remains recoverable');
});

test('pageshow refresh cannot inherit either completed or pending pre-hide search focus',async t=>{
 const f=await fixture(t);f.open();await f.succeed();f.box.querySelector('a').focus();
 f.hide();f.resetFocus();f.show();
 assert.equal(f.focusCalls.length,0,'resume must not focus a replacement loading placeholder');
 await f.succeed();assert.equal(f.focusCalls.length,0);
 f.box.querySelector('a').focus();f.refresh();const stale=f.requests.shift();
 assert.equal(f.document.activeElement,f.box.querySelector('.search-empty'));
 f.hide();f.resetFocus();f.show();assert.equal(f.focusCalls.length,0);
 f.outside.focus();f.resetFocus();await f.succeed();const latest=f.box.querySelector('a');
 await f.succeed(stale,[{title:'needle stale',content:'needle',url:'/stale/'}]);
 assert.equal(f.box.querySelector('a'),latest);assert.equal(f.focusCalls.length,0);assert.equal(f.document.activeElement,f.outside);
});

test('refresh while page-inactive does not transfer focus, and new post-pageshow searches do',async t=>{
 const f=await fixture(t);f.open();await f.succeed();f.box.querySelector('a').focus();
 f.hide();f.resetFocus();f.refresh();assert.equal(f.focusCalls.length,0);await f.succeed();assert.equal(f.focusCalls.length,0);
 f.show();await f.succeed();assert.equal(f.focusCalls.length,0);
 f.open();assert.equal(f.document.activeElement,f.input);await f.succeed();assert.equal(f.document.activeElement,f.input);
 f.box.querySelector('a').focus();f.refresh();assert.equal(f.document.activeElement,f.box.querySelector('.search-empty'));
 await f.succeed();assert.equal(f.document.activeElement,f.box.querySelector('a'),'new active refresh owns its result focus');
});

for(const action of ['close','query'])test(`a late refresh does not reclaim search focus after ${action}`,async t=>{
 const f=await fixture(t);f.open();await f.succeed();f.box.querySelector('a').focus();f.refresh();
 const pending=f.requests.shift();let owner;
 if(action==='close'){f.dialog.close();owner=f.opener;owner.focus();}
 else{owner=f.input;owner.focus();owner.value='different';owner.dispatchEvent(new f.window.Event('input'));}
 f.resetFocus();await f.succeed(pending,[...entries,{title:'different result',content:'different',url:'/different/'}]);
 assert.equal(f.focusCalls.length,0);assert.equal(f.document.activeElement,owner);
 if(action==='close')assert.equal(f.dialog.open,false);
 else assert.equal(f.box.querySelector('a').getAttribute('href'),'/different/');
});
