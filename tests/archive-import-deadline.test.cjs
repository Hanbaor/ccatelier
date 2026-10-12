const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const flush=async()=>{for(let i=0;i<24;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

async function fixture(t,{load,search='?q=STL'}={}){
 const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../public/notes/index.html'),'utf8'),{url:'https://atelier.test/notes/'+search,pretendToBeVisual:true}),win=dom.window,doc=win.document;
 let now=0,serial=0,reloads=0,loads=0,created=0,shown=[],paused=0;
 const timers=new Map(),requests=[];
 win.setTimeout=(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:now+ms});return id;};win.clearTimeout=id=>timers.delete(id);
 const tick=async ms=>{const end=now+ms;while(true){const next=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].fn();await flush();}now=end;await flush();};
 const location=new Proxy({},{get(_,key){return key==='reload'?()=>{reloads++;}:Reflect.get(win.location,key,win.location);}});
 const errors=[];win.addEventListener('error',event=>errors.push(event.error));
 const saved=new Map(),globals={window:win,document:doc,location,history:win.history,CustomEvent:win.CustomEvent,localStorage:win.localStorage,innerWidth:1440,innerHeight:900,devicePixelRatio:1,matchMedia:()=>({matches:false,addEventListener(){}}),requestAnimationFrame:()=>0,cancelAnimationFrame(){},Worker:undefined,fetch:async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(__dirname,'../public/atelier/data/archive.json'),'utf8'))})};
 for(const [name,value] of Object.entries(globals)){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});}
 t.after(async()=>{win.dispatchEvent(new win.Event('pagehide'));await flush();win.close();for(const [name,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}assert.deepEqual(errors,[],'graph controls must not leak uncaught errors');});
 const {initArchive}=await import('../source/atelier/js/archive.js');
 await initArchive({loadConstellation:()=>{loads++;if(load)return load(loads);const pending=deferred();requests.push(pending);return pending.promise;}});await flush();
 const $=selector=>doc.querySelector(selector),module={createConstellation(){created++;return {setPosts(posts){shown.push(posts.map(post=>post.path));},pause(){paused++;}};}};
 return {win,doc,$,requests,timers,tick,module,loads:()=>loads,created:()=>created,shown:()=>shown,paused:()=>paused,reloads:()=>reloads,graph:()=>$('.constellation'),notice:()=>$('.constellation > [role=status]'),retry:()=>$('.constellation > [role=status] button'),enter:async()=>{$('[data-view=graph]').click();await flush();},leave:()=>{$('[data-view=list]').click();},hide:()=>win.dispatchEvent(new win.PageTransitionEvent('pagehide',{persisted:true})),show:async(persisted=true)=>{win.dispatchEvent(new win.PageTransitionEvent('pageshow',{persisted}));await flush();}};
}
function failed(f,label='重新加载'){
 assert.match(f.notice().textContent,/暂未载入.*卡片或列表/);assert.equal(f.retry().textContent,label);
 assert.equal(f.graph().getAttribute('aria-busy'),'false');assert.equal(f.$('[data-graph-select]').disabled,true);assert.equal(f.timers.size,0);
}
function ready(f){assert.equal(f.notice(),null);assert.equal(f.graph().getAttribute('aria-busy'),'false');assert.equal(f.$('[data-graph-select]').disabled,false);assert.equal(f.timers.size,0);}

test('never-settling graph import has one exact 15-second deadline, then leaves filters, native links and recovery usable',async t=>{
 const f=await fixture(t);assert.equal(f.loads(),0);assert.equal(f.timers.size,0);
 const links=[...f.doc.querySelectorAll('.archive-fallback h2 a')].map(link=>link.href),input=f.$('#archive-q');
 await f.enter();await f.enter();assert.equal(f.loads(),1);assert.equal(f.timers.size,1);const url=f.win.location.href;
 await f.tick(14999);assert.equal(f.retry(),null);assert.equal(f.graph().getAttribute('aria-busy'),'true');
 await f.tick(1);failed(f);assert.equal(input.value,'STL');assert.equal(f.win.location.href,url);
 assert.deepEqual([...f.doc.querySelectorAll('.archive-fallback h2 a')].map(link=>new URL(link.href).pathname),links.map(link=>new URL(link).pathname));
 await f.tick(60000);f.$('#archive-sort').value='title';f.$('#archive-sort').dispatchEvent(new f.win.Event('change'));await flush();assert.equal(f.loads(),1,'filter changes do not retry a failed graph automatically');failed(f);
 f.leave();assert.equal(f.$('[data-archive-results]').hidden,false);assert.match(f.$('[data-archive-results]').textContent,/STL/);
 await f.enter();assert.equal(f.loads(),2,'intentional graph reentry starts a bounded new wait');f.requests[1].resolve(f.module);await flush();ready(f);assert.equal(f.created(),1);assert.equal(input.value,'STL');
});

for(const late of ['resolve','reject'])test(`timed-out graph ${late} cannot replace its recovery or reclaim focus`,async t=>{
 const f=await fixture(t);await f.enter();await f.tick(15000);const notice=f.notice(),retry=f.retry();f.$('#archive-q').focus();
 f.requests[0][late](late==='resolve'?f.module:Error('late'));await flush();failed(f);assert.equal(f.created(),0);assert.equal(f.notice(),notice);assert.equal(f.retry(),retry);assert.equal(f.doc.activeElement,f.$('#archive-q'));
});

for(const interruption of ['list','pagehide'])for(const late of ['resolve','reject'])test(`${interruption} retires graph wait immediately; old ${late}/finally cannot unlock or initialize a newer attempt`,async t=>{
 const f=await fixture(t);await f.enter();const old=f.requests[0];
 if(interruption==='list')f.leave();else f.hide();await flush();assert.equal(f.timers.size,0);assert.equal(f.graph().getAttribute('aria-busy'),'false');
 if(interruption==='list')await f.enter();else await f.show();assert.equal(f.loads(),2,'return must work while the old import is still unsettled');
 f.$('#archive-q').focus();old[late](late==='resolve'?f.module:Error('retired'));await flush();assert.equal(f.created(),0);assert.equal(f.graph().getAttribute('aria-busy'),'true');assert.equal(f.timers.size,1);
 await f.enter();assert.equal(f.loads(),2,'old finally cannot clear the current attempt and cause a third load');
 f.requests[1].resolve(f.module);await flush();ready(f);assert.equal(f.created(),1);assert.equal(f.doc.activeElement,f.$('#archive-q'));
});

for(const late of ['resolve','reject'])test(`successful graph retry stays ready after an expired request's late ${late}`,async t=>{
 const f=await fixture(t);await f.enter();await f.tick(15000);f.retry().focus();f.retry().click();assert.equal(f.doc.activeElement,f.$('[data-view=graph]'));await flush();
 f.requests[1].resolve(f.module);await flush();ready(f);f.$('#archive-q').focus();f.requests[0][late](late==='resolve'?f.module:Error('late'));await flush();ready(f);assert.equal(f.created(),1);assert.equal(f.doc.activeElement,f.$('#archive-q'));
});

test('both persisted and ordinary pageshow may restart a retired graph wait without restoring stale focus',async t=>{
 const f=await fixture(t);await f.enter();f.hide();await flush();f.$('#archive-q').focus();await f.show(false);assert.equal(f.loads(),2);
 f.hide();await flush();await f.show(true);assert.equal(f.loads(),3);f.requests[2].resolve(f.module);await flush();ready(f);assert.equal(f.created(),1);assert.equal(f.doc.activeElement,f.$('#archive-q'));
 f.requests[0].resolve(f.module);f.requests[1].reject(Error('abandoned'));await flush();ready(f);assert.equal(f.created(),1);
});

test('pagehide and unchanged pageshow do not automatically retry an already timed-out graph',async t=>{
 const f=await fixture(t);await f.enter();await f.tick(15000);f.hide();await f.show();failed(f);assert.equal(f.loads(),1);await f.enter();assert.equal(f.loads(),2);
});

test('a reused native-import promise can time out repeatedly and only its current explicit retry may initialize',async t=>{
 const shared=deferred(),f=await fixture(t,{load:()=>shared.promise});await f.enter();await f.tick(15000);f.retry().click();await flush();assert.equal(f.loads(),2);await f.tick(15000);failed(f);
 shared.resolve(f.module);await flush();failed(f);assert.equal(f.created(),0);f.retry().click();await flush();ready(f);assert.equal(f.created(),1);assert.equal(f.loads(),3);
});

for(const result of ['sync-throw','reject','success'])test(`graph import ${result} clears its deadline without waiting 15 seconds`,async t=>{
 let created=0;const f=await fixture(t,{load:()=>{if(result==='sync-throw')throw Error('offline');if(result==='reject')return Promise.reject(Error('offline'));return {createConstellation(){created++;return {setPosts(){},pause(){}};}};}});
 await f.enter();if(result==='success'){ready(f);assert.equal(created,1);}else failed(f);await f.tick(60000);assert.equal(f.loads(),1);
});

for(const failure of ['create','setPosts'])test(`partial ${failure} failure is a stable refresh boundary through filters, reentry, and page return`,async t=>{
 let created=0,shown=0,paused=0,listeners=0;
 const f=await fixture(t,{load:()=>({createConstellation(host){created++;host.addEventListener('test-listener',()=>listeners++);if(failure==='create')throw Error('partial listeners');return {setPosts(){if(++shown===1)throw Error('partial first render');},pause(){paused++;}};}})});
 await f.enter();failed(f,'刷新页面');assert.equal(created,1);assert.equal(shown,failure==='setPosts'?1:0);assert.equal(paused,failure==='setPosts'?1:0);
 f.$('#archive-sort').value='title';f.$('#archive-sort').dispatchEvent(new f.win.Event('change'));await f.enter();f.leave();await f.enter();f.hide();await f.show();await f.tick(60000);
 failed(f,'刷新页面');assert.equal(f.loads(),1);assert.equal(created,1);assert.equal(shown,failure==='setPosts'?1:0,'a poisoned graph cannot be reused to bypass recovery');f.graph().dispatchEvent(new f.win.Event('test-listener'));assert.equal(listeners,1);
 f.retry().click();assert.equal(f.reloads(),1);assert.equal(f.loads(),1,'refresh cannot rebind partial listeners');
});

for(const owner of ['input','dialog','hidden'])test(`graph retry does not reclaim ${owner} focus, including after asynchronous success`,async t=>{
 const f=await fixture(t);await f.enter();await f.tick(15000);const retry=f.retry();
 if(owner==='input')f.$('#archive-q').focus();else {retry.focus();if(owner==='dialog')f.$('dialog').open=true;else Object.defineProperty(f.doc,'hidden',{value:true,configurable:true});}
 const active=f.doc.activeElement;retry.click();if(owner==='input')assert.equal(f.doc.activeElement,active);else assert.notEqual(f.doc.activeElement,f.$('[data-view=graph]'));
 await flush();f.$('#archive-q').focus();f.requests[1].resolve(f.module);await flush();ready(f);assert.equal(f.doc.activeElement,f.$('#archive-q'));
});

test('a detached stale Retry cannot alter focus, reload, or replace an active graph attempt',async t=>{
 const f=await fixture(t);await f.enter();await f.tick(15000);const retry=f.retry();f.leave();retry.click();await flush();assert.equal(f.loads(),1);await f.enter();retry.click();await flush();assert.equal(f.loads(),2);
 f.requests[1].reject(Error('again'));await flush();const current=f.retry();retry.click();await flush();failed(f);assert.equal(f.loads(),2);assert.equal(f.retry(),current);
 current.click();await flush();f.requests[2].resolve(f.module);await flush();ready(f);
});
