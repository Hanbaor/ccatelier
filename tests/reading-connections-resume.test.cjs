const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {connectionCatalog}=require('../tools/connection-catalog.cjs');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const settle=()=>new Promise(resolve=>setTimeout(resolve,15));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const makePosts=()=>['a','b','c'].map(name=>({path:'/lab/'+name+'/',title:name,minutes:2,exercise:{hasCode:true,hasAnalysis:false}}));
const data=connectionCatalog(makePosts().map(p=>({...p,topics:['set'],html:'<h2 id="real">Section</h2><p>set appears here</p>'})));
function setup(){
 const dom=new JSDOM('<body data-root="/lab/"><section><canvas></canvas><div class="constellation-detail"></div><select data-graph-select></select><button data-graph-zoom="in"></button><button data-graph-zoom="out"></button><button data-graph-reset></button></section><button id="outside">Elsewhere</button></body>',{url:'https://example.test/lab/notes/'});
 dom.window.HTMLCanvasElement.prototype.getContext=()=>null;
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,location:dom.window.location,localStorage:dom.window.localStorage,CustomEvent:dom.window.CustomEvent,matchMedia:()=>({matches:false,addEventListener(){}}),ResizeObserver:class{observe(){}},requestAnimationFrame:()=>0,cancelAnimationFrame(){},devicePixelRatio:1});
 return dom;
}
async function expand(){const panel=document.querySelector('details');panel.open=true;await settle();return panel;}

test('real constellation resume preserves completed evidence nodes and focus while refreshing every contextual link',async()=>{
 const dom=setup(),oldFetch=globalThis.fetch;let loads=0,context='first';globalThis.fetch=async()=>{loads++;return {ok:true,json:async()=>data};};
 try{
  const {createConstellation}=await import('../source/atelier/js/constellation.js');
  const posts=makePosts(),graph=createConstellation(document.querySelector('section'),()=>{},{articleHref:path=>{const url=new URL(path,location.origin);url.searchParams.set('notes',context);return url.pathname+url.search+url.hash;}});
  graph.setPosts(posts);const select=document.querySelector('select');select.value='/lab/a/';select.dispatchEvent(new window.Event('change'));const panel=await expand();
  const body=panel.querySelector('.reading-connections-body'),nodes=[...body.querySelectorAll('*')],links=[...body.querySelectorAll('a')];
  for(const selector of ['.connection-title','.connection-source a']){
   const link=body.querySelector(selector);link.focus();const nativeFocus=dom.window.HTMLElement.prototype.focus;let focusCalls=0;
   dom.window.HTMLElement.prototype.focus=function(...args){focusCalls++;return nativeFocus.apply(this,args);};
   dom.window.HTMLElement.prototype.scrollIntoView=()=>assert.fail('resume must not scroll');
   try{context+='-resumed';graph.pause();graph.setPosts([...posts]);await settle();assert.equal(document.activeElement,link);assert.equal(link.isConnected,true);assert.equal(focusCalls,0);}finally{dom.window.HTMLElement.prototype.focus=nativeFocus;}
   assert.deepEqual([...body.querySelectorAll('*')],nodes);assert.ok(links.every(a=>new URL(a.href).searchParams.get('notes')===context));
   assert.ok([...body.querySelectorAll('.connection-source a')].every(a=>new URL(a.href).hash==='#real'));
  }
  assert.equal(loads,1);document.querySelector('#outside').focus();graph.pause();graph.setPosts(posts);assert.equal(document.activeElement,document.querySelector('#outside'));
  panel.open=false;await settle();panel.open=true;await settle();assert.deepEqual([...body.querySelectorAll('*')],nodes,'collapse and reopen retains completed evidence');
  select.value='/lab/b/';select.dispatchEvent(new window.Event('change'));assert.equal(nodes[0].isConnected,false);assert.ok([...body.querySelectorAll('.connection-title')].every(a=>new URL(a.href).pathname!=='/lab/b/'));graph.pause();
 }finally{globalThis.fetch=oldFetch;dom.window.close();}
});

test('resume compares ordered value snapshots, invalidates changed metadata and retains completed empty results',async()=>{
 const dom=setup();try{
  const {createReadingConnections}=await import('../source/atelier/js/reading-connections.js'),posts=makePosts();let loads=0;
  const view=createReadingConnections(document.querySelector('section'),{load:async()=>{loads++;return data;}});view.select(posts,posts[0].path);const panel=await expand(),body=panel.querySelector('.reading-connections-body');
  let title=body.querySelector('.connection-title');view.pause();view.select(posts.map(p=>({...p,exercise:{...p.exercise},ignored:'irrelevant'})),posts[0].path);assert.equal(body.querySelector('.connection-title'),title);
  posts[1].title='Updated';posts[1].minutes=9;posts[1].exercise.hasCode=false;posts[1].exercise.hasAnalysis=true;
  view.select(posts,posts[0].path);assert.equal(title.isConnected,false);title=body.querySelector('.connection-title');assert.equal(title.textContent,'Updated');assert.equal(body.querySelector('.connection-state').textContent,'9 分钟 · 题面');
  view.select([...posts].reverse(),posts[0].path);assert.equal(title.isConnected,false,'ordered inputs are part of the snapshot');
  view.select([posts[0]],posts[0].path);const empty=body.querySelector('.connection-empty');assert.ok(empty);view.pause();view.select([{...posts[0]}],posts[0].path);assert.equal(body.querySelector('.connection-empty'),empty);
  view.select(posts,'');assert.equal(panel.hidden,true);assert.equal(body.childNodes.length,0);view.select(posts,posts[0].path);assert.equal(panel.hidden,false);assert.ok(body.querySelector('.connection-title'));assert.equal(loads,1);view.pause();
 }finally{dom.window.close();}
});

test('paused pending same-selection loads restart; late success cannot replace the resumed selection',async()=>{
 const dom=setup(),first=deferred(),second=deferred(),signals=[];try{
  const {createReadingConnections}=await import('../source/atelier/js/reading-connections.js'),posts=makePosts();
  const view=createReadingConnections(document.querySelector('section'),{load:signal=>{signals.push(signal);return signals.length===1?first.promise:second.promise;}});view.select(posts,posts[0].path);const panel=await expand();view.pause();assert.equal(signals[0].aborted,true);view.select(posts,posts[0].path);await flush();assert.equal(signals.length,2);assert.equal(signals[1].aborted,false);
  view.select(posts,posts[1].path);second.resolve(data);await flush();const title=panel.querySelector('.connection-title');assert.ok(title);assert.ok([...panel.querySelectorAll('.connection-title')].every(a=>!a.href.endsWith('/b/')));
  first.resolve(data);await flush();assert.equal(panel.querySelector('.connection-title'),title,'late aborted response cannot rerender current evidence');view.pause();
 }finally{first.resolve(data);second.resolve(data);dom.window.close();}
});

test('same-selection resume retries errors, renders previously closed selection and never steals asynchronous focus',async()=>{
 const dom=setup(),retry=deferred();try{
  const {createReadingConnections}=await import('../source/atelier/js/reading-connections.js'),posts=makePosts();let calls=0;
  const view=createReadingConnections(document.querySelector('section'),{load:()=>++calls===1?Promise.reject(Error('offline')):retry.promise});view.select(posts,posts[0].path);view.pause();view.select(posts,posts[0].path);assert.equal(calls,0);const panel=await expand();assert.ok(panel.querySelector('button'));
  view.pause();view.select(posts,posts[0].path);await flush();assert.equal(calls,2);assert.equal(panel.querySelector('button'),null);const outside=document.querySelector('#outside');outside.focus();retry.resolve(data);await flush();assert.ok(panel.querySelector('.connection-title'));assert.equal(document.activeElement,outside);view.pause();
 }finally{retry.resolve(data);dom.window.close();}
});
