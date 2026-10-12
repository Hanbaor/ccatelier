const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

async function fixture(t,{search='',delayedData=false,worker=false}={}){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'public/notes/index.html'),'utf8'),{url:'https://atelier.test/notes/'+search,pretendToBeVisual:true}),{window}=dom,{document}=window;
 const posts=JSON.parse(fs.readFileSync(path.join(root,'public/atelier/data/archive.json'),'utf8')).posts;
 const data=deferred(),queue=[],recent=[];let workerInstance;
 const $=(selector,within=document)=>within.querySelector(selector),$$=(selector,within=document)=>[...within.querySelectorAll(selector)];
 const element=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
 const action=(label,fn,cls)=>{const button=element('button',cls,label);button.type='button';button.addEventListener('click',fn);return button;};
 class WorkerMock{
  constructor(){workerInstance=this;this.requests=[];}
  postMessage(request){this.requests.push(request);}
  terminate(){this.terminated=true;}
  reply(paths){this.onmessage({data:{id:this.requests.at(-1).id,paths}});}
 }
 const core=await import('../source/atelier/js/archive-core.mjs');
 const readingContext=await import('../source/atelier/js/reading-context.mjs');
 const source=fs.readFileSync(path.join(root,'source/atelier/js/archive.js'),'utf8').replace(/^import .*;\n/gm,'').replace('export async function','async function').replaceAll('import.meta.url',JSON.stringify('https://atelier.test/atelier/js/archive.js'));
 const {withImportDeadline}=await import('../source/atelier/js/ui.js');
 const context={withImportDeadline,window,document,location:window.location,history:window.history,URL,Worker:worker?WorkerMock:undefined,setTimeout,clearTimeout,queueMicrotask,$,$$,element,action,toast(){},...core,...readingContext,shelves:{read:()=>({items:recent})},loadArchive:()=>delayedData?data.promise:Promise.resolve(posts),getQueue:()=>queue,queueAction(change){if(change.type==='add')queue.push(change.item);else queue.splice(queue.findIndex(item=>item.path===change.path),1);document.dispatchEvent(new window.Event('atelier:queue'));return {ok:true,persisted:true};}};
 const init=vm.runInNewContext(source+'\ninitArchive;',context);
 t.after(()=>{window.dispatchEvent(new window.Event('pagehide'));window.close();});
 return {window,document,$,$$,posts,data,init,queue,recent,get worker(){return workerInstance;},app:$('.archive-app'),fallback:$('.archive-fallback'),more:$('[data-archive-more]'),results:$('[data-archive-results]')};
}

const hide=f=>f.window.dispatchEvent(new f.window.PageTransitionEvent('pagehide',{persisted:true}));
const show=f=>f.window.dispatchEvent(new f.window.PageTransitionEvent('pageshow',{persisted:true}));

test('unchanged BFCache restores expanded cards, focus, queue and resume without scroll or history writes',async t=>{
 const f=await fixture(t,{search:'?group=hot100#notes-catalog'});await f.init();
 f.more.dispatchEvent(new f.window.MouseEvent('click',{detail:1}));
 const cards=[...f.results.children],link=cards[24].querySelector('h2 a'),button=cards[24].querySelector('[data-queue-path]');link.focus();
 let focusCalls=0,scrollCalls=0,historyCalls=0;
 f.window.HTMLElement.prototype.focus=()=>{focusCalls++;};f.window.HTMLElement.prototype.scrollIntoView=()=>{scrollCalls++;};f.window.scrollTo=()=>{scrollCalls++;};
 f.window.history.pushState=f.window.history.replaceState=()=>{historyCalls++;};
 hide(f);f.queue.push(f.posts.find(p=>p.path===button.dataset.queuePath));f.recent.push({path:button.dataset.queuePath,progress:.42});show(f);
 assert.deepEqual([...f.results.children],cards);assert.equal(f.document.activeElement,link);assert.equal(f.more.hidden,false);
 assert.equal(button.getAttribute('aria-pressed'),'true');assert.match(f.$('[data-notes-resume]').textContent,/42%/);
 assert.equal(f.window.location.hash,'#notes-catalog');assert.equal(focusCalls,0);assert.equal(scrollCalls,0);assert.equal(historyCalls,0);
});

test('same-query popstate preserves queue button focus and a native hash change',async t=>{
 const f=await fixture(t,{search:'?group=hot100'});await f.init();const button=f.$('[data-queue-path]');button.focus();
 f.window.history.replaceState({},'','#reading-paths');f.window.dispatchEvent(new f.window.PopStateEvent('popstate'));
 assert.equal(f.document.activeElement,button);assert.ok(button.isConnected);assert.equal(f.window.location.hash,'#reading-paths');
});

test('BFCache with changed URL recomputes filters and resets expanded count',async t=>{
 const f=await fixture(t,{search:'?group=hot100'});await f.init();f.more.click();const card=f.results.firstElementChild;
 hide(f);f.window.history.replaceState({},'','?group=writing&q=STL#notes-catalog');show(f);
 assert.equal(card.isConnected,false);assert.equal(f.$('#archive-q').value,'STL');const {queryArchive,readQuery}=await import('../source/atelier/js/archive-core.mjs');assert.equal(f.results.children.length,queryArchive(f.posts,readQuery(f.window.location.search)).length);assert.match(f.results.textContent,/STL/);
});

test('an interrupted worker search must complete despite an unchanged restoration URL; late messages cannot replace restored results',async t=>{
 const f=await fixture(t,{search:'?group=hot100',worker:true});await f.init();const worker=f.worker;worker.reply(f.posts.filter(p=>p.group==='hot100').map(p=>p.path));
 f.$('[data-group=writing]').click();const pending=worker.requests.at(-1);assert.match(f.$('[data-archive-count]').textContent,/正在筛选/);
 hide(f);show(f);const cards=[...f.results.children];assert.equal(cards.length,9);assert.ok(cards.every(card=>card.dataset.group==='writing'));
 worker.onmessage({data:{id:pending.id,paths:[]}});assert.deepEqual([...f.results.children],cards);assert.equal(worker.terminated,true);
});

test('data resolving while hidden waits until pageshow before enhanced results or graph work',async t=>{
 const f=await fixture(t,{search:'?view=graph',delayedData:true});let created=0;
 const loading=f.init({loadConstellation:async()=>({createConstellation(){created++;return {setPosts(){},pause(){}};}})});
 hide(f);f.data.resolve(f.posts);await loading;await settle();assert.equal(created,0);assert.equal(f.app.hidden,true);
 show(f);await settle();assert.equal(created,1);assert.equal(f.app.hidden,false);
});

test('unchanged graph resumes existing instance and pending hidden import restarts safely',async t=>{
 const f=await fixture(t,{search:'?view=graph'}),pending=deferred();let created=0,shown=0,paused=0,loads=0;
 const module={createConstellation(){created++;return {setPosts(){shown++;},pause(){paused++;}};}};
 await f.init({loadConstellation:()=>{loads++;return pending.promise;}});await settle();hide(f);pending.resolve(module);await settle();assert.equal(created,0);
 show(f);await settle();assert.equal(created,1);assert.equal(shown,1);hide(f);show(f);assert.equal(created,1);assert.equal(shown,2);assert.equal(paused,1);assert.equal(loads,2);
});

for(const control of ['group','view','sort','duration','tag'])test('pending typed query survives immediate '+control+' change and cancels stale debounce',async t=>{
 const f=await fixture(t);await f.init();const input=f.$('#archive-q');input.value='STL';input.dispatchEvent(new f.window.Event('input',{bubbles:true}));
 if(control==='group')f.$('[data-group=hot100]').click();
 if(control==='view')f.$('[data-view=grid]').click();
 if(control==='sort'){const select=f.$('#archive-sort');select.value='title';select.dispatchEvent(new f.window.Event('change'));}
 if(control==='duration'){const select=f.$('[data-duration]');select.value='short';select.dispatchEvent(new f.window.Event('change'));}
 if(control==='tag')f.$('[data-filter-tag]').click();
 assert.equal(input.value,'STL');assert.equal(new URL(f.window.location.href).searchParams.get('q'),'STL');
 const cards=[...f.results.children];await new Promise(resolve=>setTimeout(resolve,200));assert.deepEqual([...f.results.children],cards);
});

test('reset and history navigation discard stale typed debounce; composition remains uncommitted until compositionend',async t=>{
 const f=await fixture(t);await f.init();const input=f.$('#archive-q'),type=()=>{input.value='STL';input.dispatchEvent(new f.window.Event('input'));};
 type();f.$('.archive-search').dispatchEvent(new f.window.Event('reset',{cancelable:true}));await new Promise(resolve=>setTimeout(resolve,200));assert.equal(input.value,'');assert.equal(f.window.location.search,'');
 type();f.window.history.replaceState({},'','?group=hot100');f.window.dispatchEvent(new f.window.PopStateEvent('popstate'));await new Promise(resolve=>setTimeout(resolve,200));assert.equal(input.value,'');assert.equal(new URL(f.window.location.href).searchParams.get('q'),null);
 input.dispatchEvent(new f.window.CompositionEvent('compositionstart'));input.value='STL';input.dispatchEvent(new f.window.Event('input'));f.$('[data-view=grid]').click();assert.equal(new URL(f.window.location.href).searchParams.get('q'),null);assert.equal(input.value,'STL');
 input.dispatchEvent(new f.window.CompositionEvent('compositionend'));assert.equal(new URL(f.window.location.href).searchParams.get('q'),'STL');
 input.dispatchEvent(new f.window.CompositionEvent('compositionstart'));input.value='unfinished';f.$('.archive-search').dispatchEvent(new f.window.Event('reset',{cancelable:true}));assert.equal(input.value,'');
 input.value='unfinished';f.window.history.replaceState({},'','?q=history');f.window.dispatchEvent(new f.window.PopStateEvent('popstate'));assert.equal(input.value,'history');
});

 test('an unchanged return preserves an uncommitted search draft without refiltering; changed history and reset override it',async t=>{
 const f=await fixture(t,{search:'?group=hot100'});await f.init();const input=f.$('#archive-q'),cards=[...f.results.children];
 input.value='STL';input.dispatchEvent(new f.window.Event('input'));cards[3].querySelector('h2 a').focus();hide(f);show(f);
 f.window.dispatchEvent(new f.window.PopStateEvent('popstate'));await new Promise(resolve=>setTimeout(resolve,200));
 assert.equal(input.value,'STL');assert.deepEqual([...f.results.children],cards);assert.equal(f.document.activeElement,cards[3].querySelector('h2 a'));assert.equal(new URL(f.window.location.href).searchParams.get('q'),null);
 f.$('.archive-search').dispatchEvent(new f.window.Event('reset',{cancelable:true}));assert.equal(input.value,'');
 input.value='draft';input.dispatchEvent(new f.window.Event('input'));hide(f);f.window.history.replaceState({},'','?q=other');show(f);assert.equal(input.value,'other');
});
