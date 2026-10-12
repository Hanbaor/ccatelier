const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const articles=Object.freeze([Object.freeze({title:'needle article',content:'private-query',url:'https://ccatelier.top/lab/article/'})]);

async function fixture(t,{injected=false,url='https://ccatelier.top/lab/',resultBase}={}){
 const dom=new JSDOM('<body data-root="/lab/" data-search="/lab/search.json"><button class="search-open">Search</button><dialog id="search-dialog"><button id="close">Close</button><select id="search-scope"><option value="site">Site</option><option value="offline">Offline</option></select><p id="search-status"></p><input id="search-input"><div id="search-results"></div></dialog></body>',{url});
 const {window}=dom,document=window.document,timers=new Map(),network=[],site=[],offline=[];let serial=0;
 await tick();
 const core=await import(path.resolve('source/atelier/js/search-core.mjs'));
 const context=vm.createContext({window,document,location:window.location,AbortController,
  $:(selector,root=document)=>root.querySelector(selector),$$:(selector,root=document)=>[...root.querySelectorAll(selector)],
  openDialog:()=>{document.querySelector('dialog').open=true;},...core,
  setTimeout:(fn,delay)=>{const id=++serial;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
  fetch:(url,options)=>{const request=deferred();network.push({...request,url,options});return request.promise;}
 });
 const source=fs.readFileSync(process.env.SEARCH_SOURCE||'source/atelier/js/search.js','utf8').replace(/^import .*\n/gm,'').replace('export function initSearch','function initSearch');
 vm.runInContext(source,context);
 const options={loadOffline:()=>{const request=deferred();offline.push(request);return request.promise;},loadContext:async()=>({searchResultText:item=>({title:[{text:item.title}],excerpt:[]})})};
 if(injected)options.loadSite=(...args)=>{const request=deferred();site.push({...request,args});return request.promise;};
 if(resultBase!==undefined)options.resultBase=resultBase;
 context.initSearch(options);
 const scope=document.querySelector('select'),input=document.querySelector('input'),box=document.querySelector('#search-results'),dialog=document.querySelector('dialog'),opener=document.querySelector('.search-open');
 t.after(()=>dom.window.close());
 return {window,document,timers,network,site,offline,scope,input,box,dialog,opener,
  open:()=>opener.click(),query:value=>{input.value=value;input.dispatchEvent(new window.Event('input'));},
  change:value=>{scope.value=value;scope.dispatchEvent(new window.Event('change'));},
  expire:()=>{assert.equal(timers.size,1);const timer=[...timers.values()][0];assert.equal(timer.delay,8000);timer.fn();}
 };
}

test('default loader stays lazy, requests the configured URL and signal only, and rejects foreign/unsafe results',async t=>{
 const f=await fixture(t);assert.equal(f.network.length,0);f.query('private-query');assert.equal(f.network.length,0);f.open();
 assert.equal(f.network.length,1);const request=f.network[0];assert.equal(request.url,'/lab/search.json');assert.deepEqual(Object.keys(request.options),['signal']);assert.ok(request.options.signal instanceof AbortSignal);
 request.resolve({ok:true,json:async()=>[...articles,...['https://unknown.example/lab/article/','//foreign.example/path','javascript:alert(1)','file:///tmp/article','https://ccatelier.top//foreign.example/path'].map(url=>({title:'unsafe',content:'private-query',url}))]});await tick();
 assert.deepEqual([...f.box.querySelectorAll('a')].map(a=>a.getAttribute('href')),['/lab/article/']);
 f.query('needle');f.query('no-match-secret');assert.equal(f.network.length,1);assert.equal(f.timers.size,0);
});

test('injected file preview remains file://, uses canonical validation, and never sends its query',async t=>{
 const f=await fixture(t,{injected:true,url:'file:///tmp/preview.html',resultBase:'https://ccatelier.top/lab/'});
 assert.equal(f.site.length,0);assert.equal(f.network.length,0);f.query('private-query');assert.equal(f.site.length,0);f.open();
 const request=f.site[0];assert.equal(request.args.length,1);assert.deepEqual(Object.keys(request.args[0]),['signal']);assert.ok(request.args[0].signal instanceof AbortSignal);
 request.resolve(articles);await tick();assert.equal(f.box.querySelector('a').getAttribute('href'),'/lab/article/');assert.equal(f.window.location.href,'file:///tmp/preview.html');assert.equal(f.window.location.origin,'null');
 f.query('needle');f.query('no-match-secret');f.open();assert.equal(f.site.length,1);assert.equal(f.network.length,0);assert.equal(articles[0].title,'needle article');
});

for(const late of ['resolve','reject'])test(`injected deadline aborts, retry wins, and stale ${late} cannot replace results or steal focus`,async t=>{
 const f=await fixture(t,{injected:true});f.query('needle');f.open();const first=f.site[0];f.scope.focus();f.expire();await tick();
 assert.equal(first.args[0].signal.aborted,true);assert.equal(f.document.activeElement,f.scope);assert.equal(f.box.getAttribute('aria-busy'),'false');assert.equal(f.timers.size,0);
 const retry=f.box.querySelector('button');retry.focus();retry.click();assert.equal(f.document.activeElement,f.input);assert.equal(f.input.value,'needle');
 f.site[1].resolve(articles);await tick();const link=f.box.querySelector('a');link.focus();
 if(late==='resolve')first.resolve([{title:'needle stale',url:'/stale/'}]);else first.reject(Error('late failure'));
 await tick();assert.equal(f.box.querySelector('a'),link);assert.equal(f.document.activeElement,link);assert.equal(f.timers.size,0);assert.equal(f.network.length,0);
});

for(const stage of ['success','timeout'])test(`injected ${stage} respects closed dialog focus`,async t=>{
 const f=await fixture(t,{injected:true});f.query('needle');f.open();f.dialog.open=false;f.opener.focus();
 if(stage==='success')f.site[0].resolve(articles);else f.expire();await tick();
 assert.equal(f.document.activeElement,f.opener);assert.equal(f.dialog.open,false);assert.equal(f.timers.size,0);
});

test('injected site timeout leaves active offline results and keyboard ownership alone',async t=>{
 const f=await fixture(t,{injected:true});f.query('needle');f.open();f.change('offline');f.offline[0].resolve({version:1,entries:articles,unavailable:0});await tick();
 const link=f.box.querySelector('a');link.focus();f.expire();await tick();assert.equal(f.site[0].args[0].signal.aborted,true);assert.equal(f.box.querySelector('a'),link);assert.equal(f.document.activeElement,link);
 f.site[0].resolve([{title:'needle stale',url:'/stale/'}]);await tick();assert.equal(f.box.querySelector('a'),link);assert.equal(f.network.length,0);
});

test('injected data alone never weakens the default file-origin validation',async t=>{
 const f=await fixture(t,{injected:true,url:'file:///tmp/preview.html'});f.query('needle');f.open();f.site[0].resolve(articles);await tick();
 assert.equal(f.box.querySelectorAll('a').length,0);assert.equal(f.window.location.origin,'null');assert.equal(f.network.length,0);
});

test('default failed response never reads its body and stays retryable',async t=>{
 const f=await fixture(t);f.open();let reads=0;f.network[0].resolve({ok:false,json:async()=>{reads++;return articles;}});await tick();
 assert.equal(reads,0);assert.ok(f.box.querySelector('button'));assert.equal(f.timers.size,0);
});

test('injected invalid data retains existing array validation and recovery',async t=>{
 const f=await fixture(t,{injected:true});f.query('needle');f.open();f.site[0].resolve({entries:articles});await tick();assert.ok(f.box.querySelector('button'));
 f.box.querySelector('button').click();f.site[1].resolve([...articles,null,{title:12,url:'/bad/'},{title:'needle missing URL'}]);await tick();
 assert.equal(f.box.querySelectorAll('a').length,1);assert.equal(f.box.querySelector('a').getAttribute('href'),'/lab/article/');assert.equal(f.network.length,0);
});
