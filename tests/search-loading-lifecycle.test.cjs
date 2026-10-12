const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const entries=[{title:'needle result',content:'needle',url:'/result/'}];
const saved=items=>({version:1,entries:items,unavailable:0});

async function fixture(t,mode='site'){
 const dom=new JSDOM('<body data-root="/lab/" data-search="/lab/search.json"><button class="search-open">Search</button><dialog id="search-dialog"><button id="close">Close</button><select id="search-scope"><option value="site">Site</option><option value="offline">Offline</option></select><p id="search-status"></p><input id="search-input"><div id="search-results"></div></dialog></body>',{url:'https://ccatelier.test/lab/'});
 const {window}=dom,document=window.document,timers=new Map(),requests=[];let nextTimer=0;
 await tick(); // Let initial pageshow finish before installing lifecycle listeners.
 const core=await import('../source/atelier/js/search-core.mjs');
 const context=vm.createContext({window,document,location:window.location,AbortController,
  $:(selector,root=document)=>root.querySelector(selector),$$:(selector,root=document)=>[...root.querySelectorAll(selector)],
  openDialog:()=>{document.querySelector('dialog').open=true;},...core,
  setTimeout:(fn,delay)=>{const id=++nextTimer;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),
  fetch:(url,options)=>{const request=deferred();requests.push({...request,url,signal:options.signal});return request.promise;}
 });
 const source=fs.readFileSync('source/atelier/js/search.js','utf8').replace(/^import .*\n/gm,'').replace('export function initSearch','function initSearch');
 vm.runInContext(source,context);
 context.initSearch({loadOffline:()=>{const request=deferred();requests.push(request);return request.promise;},loadContext:async()=>({searchResultText:item=>({title:[{text:item.title}],excerpt:[]})})});
 const scope=document.querySelector('select'),input=document.querySelector('input'),box=document.querySelector('#search-results'),dialog=document.querySelector('dialog');
 scope.value=mode;input.value='needle';
 t.after(()=>dom.window.close());
 return {window,document,timers,requests,scope,input,box,dialog,
  open:()=>document.querySelector('.search-open').click(),
  refresh:()=>document.dispatchEvent(new window.Event('atelier:offline')),
  change:mode=>{scope.value=mode;scope.dispatchEvent(new window.Event('change'));},
  expire:()=>{assert.equal(timers.size,1);const timer=[...timers.values()][0];assert.equal(timer.delay,8000);timer.fn();},
  succeed(request,items=entries){request.resolve(mode==='site'?{ok:true,json:async()=>items}:saved(items));}
 };
}

for(const stage of ['fetch','body','offline'])for(const late of ['resolve','reject'])test(`${stage} timeout settles busy state and retry survives late ${late}`,async t=>{
 const mode=stage==='offline'?'offline':'site',f=await fixture(t,mode);f.open();const first=f.requests.shift();let stale=first;
 if(stage==='body'){stale=deferred();first.resolve({ok:true,json:()=>stale.promise});await tick();}
 assert.equal(f.box.getAttribute('aria-busy'),'true');f.expire();await tick();
 assert.equal(f.box.getAttribute('aria-busy'),'false');assert.ok(f.box.querySelector('button'));assert.equal(f.timers.size,0);
 if(mode==='site')assert.equal(first.signal.aborted,true);
 const retry=f.box.querySelector('button');retry.focus();retry.click();assert.equal(f.document.activeElement,f.input);
 const second=f.requests.shift();f.succeed(second);await tick();const result=f.box.querySelector('a');result.focus();
 if(late==='reject')stale.reject(null);else if(stage==='body')stale.resolve([{title:'needle stale',url:'/stale/'}]);else f.succeed(stale,[{title:'needle stale',url:'/stale/',content:'needle'}]);
 await tick();assert.equal(f.box.querySelector('a'),result);assert.equal(result.getAttribute('href'),'/result/');assert.equal(f.document.activeElement,result);assert.equal(f.timers.size,0);
});

for(const rejection of [null,undefined,'failure',{}, {message:123}])test(`offline ${JSON.stringify(rejection)} rejection exposes recoverable fallback`,async t=>{
 const f=await fixture(t,'offline');f.open();f.requests.shift().reject(rejection);await tick();
 assert.equal(f.box.getAttribute('aria-busy'),'false');assert.match(f.box.textContent,/离线副本暂时无法读取/);assert.ok(f.box.querySelector('button'));assert.equal(f.timers.size,0);
 f.box.querySelector('button').click();f.succeed(f.requests.shift());await tick();assert.equal(f.box.querySelector('a').getAttribute('href'),'/result/');
});

test('superseding offline reads releases deadlines and keeps newest refresh ownership',async t=>{
 const f=await fixture(t,'offline');f.open();f.succeed(f.requests.shift());await tick();f.box.querySelector('a').focus();
 f.refresh();const stale=f.requests.shift();assert.equal(f.document.activeElement,f.box.querySelector('.search-empty'));
 f.refresh();const latest=f.requests.shift();assert.equal(f.timers.size,1,'obsolete deadline is synchronously cleared');
 f.input.value='needle result';f.input.dispatchEvent(new f.window.Event('input'));assert.equal(f.document.activeElement,f.box.querySelector('.search-empty'),'re-render retains loading keyboard owner');
 stale.reject(null);await tick();assert.equal(f.box.getAttribute('aria-busy'),'true');assert.equal(f.timers.size,1);
 f.succeed(latest);await tick();assert.equal(f.document.activeElement,f.box.querySelector('a'));assert.equal(f.timers.size,0);
});

for(const focus of ['loading','scope','closed'])test(`refresh deadline respects ${focus} keyboard ownership`,async t=>{
 const f=await fixture(t,'offline');f.open();f.succeed(f.requests.shift());await tick();f.box.querySelector('a').focus();f.refresh();
 let target=f.input;
 if(focus==='scope'){target=f.scope;target.focus();}
 if(focus==='closed'){f.dialog.open=false;target=f.document.querySelector('.search-open');target.focus();}
 f.expire();await tick();assert.equal(f.document.activeElement,target);assert.equal(f.box.getAttribute('aria-busy'),'false');assert.ok(f.box.querySelector('button'));
});

test('a hidden scope deadline cannot replace or take focus from current results',async t=>{
 const f=await fixture(t);f.open();const site=f.requests.shift();f.change('offline');f.requests.shift().resolve(saved(entries));await tick();
 const result=f.box.querySelector('a');result.focus();f.expire();await tick();
 assert.equal(site.signal.aborted,true);assert.equal(f.box.querySelector('a'),result);assert.equal(f.document.activeElement,result);assert.equal(f.box.getAttribute('aria-busy'),'false');
 f.change('site');assert.equal(f.box.getAttribute('aria-busy'),'true');f.succeed(f.requests.shift());await tick();assert.equal(f.timers.size,0);
});
