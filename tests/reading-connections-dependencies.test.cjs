const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),esbuild=require('esbuild');
// Repository-local dependencies only. Each DOM evaluates a fresh real bundle,
// so archive-store's module-time root is isolated across HTTP/file fixtures.
const repo=path.resolve(__dirname,'..');
const code=esbuild.buildSync({stdin:{contents:"export {createReadingConnections} from './source/atelier/js/reading-connections.js'; export {createConstellation} from './source/atelier/js/constellation.js'; export {safeResultURL} from './source/atelier/js/search-core.mjs';",resolveDir:repo},bundle:true,format:'iife',globalName:'Dependencies',write:false}).outputFiles[0].text;
const css=fs.readFileSync(path.join(repo,'source/atelier/css/reading-connections.css'),'utf8');
const flush=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {resolve,promise};};
const posts=['a','b','c'].map(x=>({path:'/lab/'+x+'/',title:x,minutes:2,tags:['term'],group:'writing'}));
const data={version:1,posts:posts.map(p=>({path:p.path,evidence:[{concept:'term',kind:'prose',anchor:'real anchor',excerpt:'the term is here',before:false,after:false}]}))};
function setup(url='https://example.test/lab/notes/'){
 const dom=new JSDOM('<body data-root="/lab/"><section><canvas></canvas><div class="constellation-detail"></div><select data-graph-select></select><button data-graph-zoom="in"></button><button data-graph-zoom="out"></button><button data-graph-reset></button></section><button id="outside">Outside</button></body>',{url,runScripts:'outside-only'}),w=dom.window;
 w.matchMedia=()=>({matches:false,addEventListener(){}});w.ResizeObserver=class{observe(){}};w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.HTMLCanvasElement.prototype.getContext=()=>null;w.eval(code);
 return {dom,w,d:w.document,api:w.Dependencies};
}
async function expand(w,d){const panel=d.querySelector('details');panel.open=true;panel.dispatchEvent(new w.Event('toggle'));await flush();return panel;}
function inline(d){const style=d.createElement('style');style.dataset.readingConnections='';style.textContent=css;d.head.append(style);return style;}
for(const protocol of ['http:','https:'])test(protocol+' defaults retain safe origin/root URLs and articleHref context',async()=>{
 const {dom,w,d,api}=setup(protocol+'//example.test/lab/notes/');try{
  const base=w.location.origin+'/lab/';
  assert.equal(api.safeResultURL('/lab/b/#real',base),'/lab/b/#real');
  assert.equal(api.safeResultURL(w.location.origin+'/lab/b/',base),'/lab/b/');
  for(const input of ['https://evil.test/lab/b/','//evil.test/lab/b/','javascript:alert(1)','file:///lab/b/',w.location.origin+'//evil.test/lab/b/'])assert.equal(api.safeResultURL(input,base),null,input);
  const calls=[],fixture={version:1,posts:[...data.posts,{path:'/outside/',evidence:data.posts[0].evidence}]};
  const view=api.createReadingConnections(d.querySelector('section'),{load:async()=>fixture,articleHref:value=>{calls.push(value);const url=new URL(value,w.location.origin);url.searchParams.set('context','test');return url.pathname+url.search+url.hash;}});
  view.select([...posts,{path:'/outside/',title:'outside',minutes:2}],posts[0].path);await expand(w,d);
  assert.deepEqual([...d.querySelectorAll('.connection-title')].map(a=>a.getAttribute('href')),['/lab/b/?context=test','/lab/c/?context=test']);
  assert.ok(calls.includes('/lab/a/#real%20anchor'));assert.ok(calls.every(x=>x.startsWith('/lab/')));
  assert.equal(d.querySelector('.connection-source a').getAttribute('href'),'/lab/a/?context=test#real%20anchor');
  assert.equal(d.querySelector('link[data-reading-connections]').getAttribute('href'),'/lab/atelier/css/reading-connections.css');view.pause();
 }finally{dom.window.close();}
});
test('actual file origin rejects default evidence URLs before articleHref',async()=>{
 const {dom,w,d,api}=setup('file:///preview/notes.html');try{let mapped=0;const view=api.createReadingConnections(d.querySelector('section'),{load:async()=>data,articleHref:x=>{mapped++;return x;}});view.select(posts,posts[0].path);await expand(w,d);assert.equal(w.location.origin,'null');assert.equal(w.location.protocol,'file:');assert.equal(d.querySelectorAll('.connection-list a').length,0);assert.equal(mapped,0);view.pause();}finally{dom.window.close();}
});
test('explicit trusted resolver receives separate path/anchor and controls final href',async()=>{
 const {dom,w,d,api}=setup('file:///preview/notes.html');try{inline(d);let mapped=0;const calls=[],view=api.createReadingConnections(d.querySelector('section'),{load:async()=>data,articleHref:x=>{mapped++;return x;},resolveURL:(p,a)=>{calls.push([p,a]);return p==='/lab/c/'?null:p.split('/')[2]+'.html'+(a?'#'+encodeURIComponent(a):'');}});view.select(posts,posts[0].path);await expand(w,d);assert.deepEqual([...d.querySelectorAll('.connection-title')].map(a=>a.getAttribute('href')),['b.html']);assert.equal(d.querySelector('.connection-source a').getAttribute('href'),'a.html#real%20anchor');assert.ok(calls.some(([p,a])=>p==='/lab/a/'&&a==='real anchor'));assert.equal(mapped,0);view.pause();}finally{dom.window.close();}
});
test('only recognized marked stylesheet elements prevent lazy network stylesheet insertion',async()=>{
 for(const kind of ['marked-style','unmarked-style','marked-div','marked-link']){
  const {dom,w,d,api}=setup();try{
   const marker=kind==='marked-style'?inline(d):d.createElement(kind==='unmarked-style'?'style':kind==='marked-div'?'div':'link');
   if(kind!=='marked-style'){if(kind!=='unmarked-style')marker.dataset.readingConnections='';if(kind==='unmarked-style')marker.textContent=css;if(kind==='marked-link'){marker.rel='stylesheet';marker.href='/lab/atelier/css/reading-connections.css';}d.head.append(marker);}
   let loads=0;w.fetch=()=>{throw Error('Unexpected data fetch');};const view=api.createReadingConnections(d.querySelector('section'),{load:async()=>{loads++;return data;}});view.select(posts,posts[0].path);assert.equal(loads,0);await expand(w,d);
   const links=d.querySelectorAll('link[data-reading-connections]');assert.equal(links.length,kind==='marked-style'?0:1,kind);
   if(kind==='marked-style')assert.equal(marker.textContent,css);if(kind==='marked-link')assert.equal(links[0],marker);
   await expand(w,d);assert.equal(d.querySelectorAll('link[data-reading-connections]').length,links.length);view.pause();
  }finally{dom.window.close();}
 }
});
test('constellation forwards explicit dependencies, keeps them lazy, and refreshes resolver links on resume',async()=>{
 const {dom,w,d,api}=setup('file:///preview/notes.html');try{inline(d);let loads=0,version=1;const graph=api.createConstellation(d.querySelector('section'),()=>{},{articleHref:p=>'graph:'+p,readingConnections:{load:async()=>{loads++;return data;},resolveURL:(p,a)=>p.split('/')[2]+'.html?v='+version+(a?'#'+encodeURIComponent(a):'')}});graph.setPosts(posts);const select=d.querySelector('select');select.value=posts[0].path;select.dispatchEvent(new w.Event('change'));assert.equal(loads,0);assert.equal(d.querySelector('.constellation-detail a').getAttribute('href'),'graph:/lab/a/');await expand(w,d);assert.equal(loads,1);const link=d.querySelector('.connection-source a');link.focus();graph.pause();version=2;graph.setPosts(posts);assert.equal(d.querySelector('.connection-source a'),link);assert.equal(d.activeElement,link);assert.match(link.getAttribute('href'),/v=2#/);assert.equal(loads,1);graph.pause();}finally{dom.window.close();}
});
test('injected loader retains abort, retry focus, and stale-response protection',async()=>{
 const {dom,w,d,api}=setup('file:///preview/notes.html');try{inline(d);const pending=deferred(),retry=deferred();let calls=0,firstSignal;const view=api.createReadingConnections(d.querySelector('section'),{resolveURL:(p,a)=>p.split('/')[2]+'.html'+(a?'#'+encodeURIComponent(a):''),load:signal=>{calls++;if(calls===1){firstSignal=signal;return pending.promise;}if(calls===2)return Promise.reject(Error('offline'));return retry.promise;}});view.select(posts,posts[0].path);await expand(w,d);view.pause();assert.equal(firstSignal.aborted,true);view.select(posts,posts[1].path);await flush();assert.match(d.querySelector('details').textContent,/暂时无法/);const button=d.querySelector('.connection-status button');button.focus();button.click();assert.equal(d.activeElement,d.querySelector('summary'));d.querySelector('#outside').focus();pending.resolve(data);await flush();assert.equal(d.querySelectorAll('.connection-title').length,0);retry.resolve(data);await flush();assert.equal(d.activeElement,d.querySelector('#outside'));assert.deepEqual([...d.querySelectorAll('.connection-title')].map(a=>a.getAttribute('href')),['a.html','c.html']);view.pause();}finally{dom.window.close();}
});
