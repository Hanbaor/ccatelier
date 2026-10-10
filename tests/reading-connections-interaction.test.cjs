const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {connectionCatalog}=require('../tools/connection-catalog.cjs');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const posts=['a','b','c'].map(name=>({path:'/lab/'+name+'/',title:name,minutes:2,exercise:{hasCode:true,hasAnalysis:false}}));
const data=connectionCatalog(posts.map(p=>({...p,topics:['set'],html:'<h2 id="real">Section</h2><p>set &lt;img src=x onerror=alert(1)&gt;</p>'})));
function setup(){const dom=new JSDOM('<body data-root="/lab/"><section></section></body>',{url:'https://example.test/lab/notes/'});Object.assign(globalThis,{window:dom.window,document:dom.window.document,location:dom.window.location,localStorage:dom.window.localStorage,CustomEvent:dom.window.CustomEvent,matchMedia:()=>({matches:false,addEventListener(){}})});return dom;}

test('connections are opt-in, scoped, source-safe, accessible without canvas, and use subdirectory URLs',async()=>{
 const dom=setup(),{createReadingConnections}=await import('../source/atelier/js/reading-connections.js');let loads=0;
 try{
  const view=createReadingConnections(document.querySelector('section'),{load:async()=>{loads++;return data;}}),panel=document.querySelector('details');
  view.select(posts,'/lab/a/');assert.equal(loads,0);assert.equal(panel.hidden,false);
  panel.open=true;panel.dispatchEvent(new window.Event('toggle'));await flush();assert.equal(loads,1);assert.equal(document.querySelectorAll('ol>li').length,2);
  assert.equal(document.querySelector('img'),null);assert.ok(document.querySelector('.connection-excerpt').textContent.includes('<img'));
  assert.equal(document.querySelector('.connection-source a').getAttribute('href'),'/lab/a/#real');assert.match(panel.textContent,/代码|正文/);assert.match(panel.textContent,/解析待补/);
  view.select([posts[0]],'/lab/a/');assert.equal(document.querySelectorAll('ol>li').length,0);assert.match(panel.textContent,/没有足够/);
  view.select(posts,'');assert.equal(panel.hidden,true);view.pause();
 }finally{dom.window.close();}
});

test('pending responses cannot restore stale selection, closed panel or paused graph; retry works',async()=>{
 const dom=setup(),{createReadingConnections}=await import('../source/atelier/js/reading-connections.js');const first=deferred();let loads=0,signal;
 try{
  const view=createReadingConnections(document.querySelector('section'),{load:async s=>{signal=s;if(++loads===1)return first.promise;if(loads===2)throw Error('offline');return data;}}),panel=document.querySelector('details');
  view.select(posts,'/lab/a/');panel.open=true;panel.dispatchEvent(new window.Event('toggle'));await flush();
  view.select([posts[1]],'/lab/b/');view.pause();assert.equal(signal.aborted,true);first.resolve(data);await flush();assert.equal(document.querySelector('ol'),null);
  view.select(posts,'/lab/b/');await flush();assert.match(panel.textContent,/暂时无法/);panel.querySelector('button').click();await flush();assert.equal(document.querySelectorAll('ol>li').length,2);assert.ok([...document.querySelectorAll('.connection-title')].every(a=>!a.href.endsWith('/b/')));
  view.pause();
 }finally{dom.window.close();}
});

test('real constellation keeps evidence data and styles unloaded until expansion and remains usable without canvas',async()=>{
 const dom=setup();document.querySelector('section').innerHTML='<canvas></canvas><div class="constellation-detail"></div><select data-graph-select></select><button data-graph-zoom="in"></button><button data-graph-zoom="out"></button><button data-graph-reset></button>';
 dom.window.HTMLCanvasElement.prototype.getContext=()=>null;
 Object.assign(globalThis,{ResizeObserver:class{observe(){}},requestAnimationFrame:()=>0,cancelAnimationFrame(){},devicePixelRatio:1});
 const calls=[];globalThis.fetch=async url=>{calls.push(url);return {ok:true,json:async()=>data};};
 try{
  const {createConstellation}=await import('../source/atelier/js/constellation.js');const graph=createConstellation(document.querySelector('section'),()=>{});graph.setPosts(posts);
  assert.equal(calls.length,0);assert.equal(document.querySelector('link[data-reading-connections]'),null);
  const select=document.querySelector('select');select.value='/lab/a/';select.dispatchEvent(new window.Event('change'));assert.equal(calls.length,0);
  const panel=document.querySelector('details');panel.open=true;panel.dispatchEvent(new window.Event('toggle'));await flush();
  assert.deepEqual(calls,['/lab/atelier/data/connections.json']);assert.equal(document.querySelector('link[data-reading-connections]').getAttribute('href'),'/lab/atelier/css/reading-connections.css');assert.equal(document.querySelectorAll('ol>li').length,2);
  graph.setPosts([posts[1]]);assert.equal(panel.hidden,true);assert.equal(document.querySelector('ol'),null);graph.pause();
 }finally{dom.window.close();delete globalThis.fetch;}
});

test('keyboard retry keeps focus on the summary immediately and never steals it after completion; failed styles can retry',async()=>{
 const dom=setup(),{createReadingConnections}=await import('../source/atelier/js/reading-connections.js'),pending=deferred();let calls=0;
 try{
  const outside=document.createElement('button');outside.textContent='Elsewhere';document.body.append(outside);
  const view=createReadingConnections(document.querySelector('section'),{load:()=>++calls===1?Promise.reject(Error('offline')):pending.promise}),panel=document.querySelector('details');
  view.select(posts,'/lab/a/');panel.open=true;await new Promise(resolve=>setTimeout(resolve,10));
  const failedStyle=document.querySelector('link[data-reading-connections]');failedStyle.dispatchEvent(new window.Event('error'));assert.equal(failedStyle.isConnected,false);
  const retry=panel.querySelector('button');retry.focus();assert.equal(document.activeElement,retry);retry.click();
  assert.equal(document.activeElement,panel.querySelector('summary'),'focus is transferred synchronously before removing the retry');
  const newStyle=document.querySelector('link[data-reading-connections]');assert.ok(newStyle);assert.notEqual(newStyle,failedStyle);
  outside.focus();pending.resolve(data);await flush();assert.equal(document.activeElement,outside,'a response must not reclaim focus');assert.equal(panel.querySelectorAll('ol>li').length,2);
  view.pause();
 }finally{dom.window.close();}
});

test('expanded source evidence keeps a 13px reading floor and 16px titles without mobile shrinkage',()=>{
 const fs=require('node:fs'),path=require('node:path'),css=fs.readFileSync(path.join(__dirname,'../source/atelier/css/reading-connections.css'),'utf8');
 const dom=new JSDOM('<style>'+css+'</style><section class="constellation"><details class="reading-connections" open><summary>循文而读</summary><p class="connection-note">说明</p><a class="connection-title">标题</a><small class="connection-state">状态</small><p class="connection-concepts">共同术语</p><div class="connection-pair"><strong>术语</strong><div class="connection-source"><a>来源</a><p class="connection-excerpt">摘录</p></div></div></details></section>');
 try{
  for(const selector of ['.reading-connections','.connection-note','.connection-state','.connection-concepts','.connection-pair>strong','.connection-source>a','.connection-excerpt'])assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector(selector)).fontSize,'13px',selector);
  assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector('.connection-title')).fontSize,'16px');
  assert.ok([...css.matchAll(/font-size:\s*(\d+)px/g)].every(match=>Number(match[1])>=13),'no base or narrow-screen font rule shrinks below 13px');
  assert.match(css,/@media\(max-width:600px\)[\s\S]*grid-template-columns:1fr/);
  assert.match(css,/white-space:pre-wrap;overflow-wrap:anywhere/);
 }finally{dom.window.close();}
});
