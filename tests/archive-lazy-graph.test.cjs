const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

function page(){
 const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../public/notes/index.html'),'utf8'),{url:'https://ccatelier.test/notes/',pretendToBeVisual:true}),{window}=dom;
 Object.assign(globalThis,{window,document:window.document,location:window.location,history:window.history,CustomEvent:window.CustomEvent,localStorage:window.localStorage,innerWidth:1440,innerHeight:900,devicePixelRatio:1,matchMedia:()=>({matches:false,addEventListener(){}}),requestAnimationFrame:()=>0,cancelAnimationFrame(){}});
 globalThis.fetch=async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(__dirname,'../public/atelier/data/archive.json'),'utf8'))});delete globalThis.Worker;
 return dom;
}

test('graph loading is opt-in, deduplicated, and uses latest filter after enter/leave/back race',async()=>{
 const dom=page(),{initArchive}=await import('../source/atelier/js/archive.js'),pending=deferred();let loads=0,created=0,paused=0,shown=[];
 const module={createConstellation(){created++;return {setPosts(posts){shown.push(posts.map(p=>p.path));},pause(){paused++;}};}};
 const $=selector=>document.querySelector(selector);
 try{
  await initArchive({loadConstellation:()=>{loads++;return pending.promise;}});assert.equal(loads,0);assert.match($('[data-archive-count]').textContent,/9 \/ 9/);
  $('[data-view=graph]').click();await flush();assert.equal(loads,1);assert.equal($('.constellation').getAttribute('aria-busy'),'true');assert.equal($('[data-graph-select]').disabled,true);
  $('[data-view=list]').click();$('[data-group=hot100]').click();$('[data-view=graph]').click();await flush();assert.equal(loads,1,'an in-flight graph import is shared');
  pending.resolve(module);await flush();assert.equal(created,1);assert.equal(shown.at(-1).length,100);assert.equal($('.constellation').getAttribute('aria-busy'),'false');assert.equal($('[data-graph-select]').disabled,false);
  $('[data-view=list]').click();assert.ok(paused>0);
  history.replaceState({},'','?group=writing&view=graph');window.dispatchEvent(new window.PopStateEvent('popstate'));assert.equal(shown.at(-1).length,9);assert.equal(created,1);assert.equal(loads,1);
 }finally{window.dispatchEvent(new window.Event('pagehide'));dom.window.close();}
});

test('a late graph import cannot start in list view or after pagehide; bfcache return can resume',async()=>{
 const dom=page(),{initArchive}=await import('../source/atelier/js/archive.js'),first=deferred(),second=deferred();let loads=0,created=0,shown=0;
 const module={createConstellation(){created++;return {setPosts(){shown++;},pause(){}};}};
 const $=selector=>document.querySelector(selector);
 try{
  await initArchive({loadConstellation:()=>++loads===1?first.promise:loads===2?second.promise:Promise.resolve(module)});
  $('[data-view=graph]').click();await flush();$('[data-view=list]').click();first.resolve(module);await flush();assert.equal(created,0);assert.equal($('[data-archive-results]').hidden,false);
  $('[data-view=graph]').click();await flush();window.dispatchEvent(new window.Event('pagehide'));second.resolve(module);await flush();assert.equal(created,0);assert.equal(shown,0);
  window.dispatchEvent(new window.PageTransitionEvent('pageshow',{persisted:true}));await flush();assert.equal(created,1);assert.equal(shown,1);
 }finally{window.dispatchEvent(new window.Event('pagehide'));dom.window.close();}
});

test('graph import error retains filters/results and gives an accessible retry without reinitializing archive',async()=>{
 const dom=page(),{initArchive}=await import('../source/atelier/js/archive.js');let loads=0,created=0;
 const $=selector=>document.querySelector(selector);
 try{
  await initArchive({loadConstellation:async()=>{if(++loads===1)throw Error('network');return {createConstellation(){created++;return {setPosts(){},pause(){}};}};}});
  $('[data-view=graph]').click();await flush();const status=$('.constellation [role=status]');assert.match(status.textContent,/暂未载入/);assert.equal($('.constellation').getAttribute('aria-busy'),'false');assert.equal($('[data-graph-select]').disabled,true);
  $('[data-view=list]').click();assert.equal(document.querySelectorAll('.archive-app .archive-record').length,9);assert.match($('[data-archive-count]').textContent,/9 \/ 9/);
  $('[data-view=graph]').click();await flush();assert.equal(loads,2);assert.equal(created,1);assert.equal($('.constellation [role=status]'),null);assert.equal($('[data-graph-select]').disabled,false);
 }finally{window.dispatchEvent(new window.Event('pagehide'));dom.window.close();}
});
