const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {createRequire}=require('node:module'),{pathToFileURL}=require('node:url');
const root=process.env.REPO_ROOT||path.resolve(__dirname,'..'),{JSDOM}=createRequire(path.join(root,'package.json'))('jsdom');
const loadRoute=()=>import(pathToFileURL(process.env.ROUTE_SOURCE||path.join(root,'source/atelier/js/route-features.js')).href);
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
async function fixture(t,{id='reader',load,html='<main><input id="reader-find"><button data-next>Next</button><button data-speech-play>Speak</button><a href="#native">Native</a></main><button id="outside">Outside</button><dialog></dialog>'}={}){
 const dom=new JSDOM(html,{url:'https://atelier.test/lab/',pretendToBeVisual:true}),win=dom.window,doc=win.document;let now=0,serial=0;const timers=new Map();
 win.setTimeout=(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:now+ms});return id;};win.clearTimeout=id=>timers.delete(id);
 const tick=async ms=>{const end=now+ms;while(true){const first=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!first)break;now=first[1].at;timers.delete(first[0]);first[1].fn();await flush();}now=end;await flush();};
 let loads=0;const pending=deferred(),feature={id,selector:'main',label:'测试工具',init:'init',controls:'#reader-find,[data-next],[data-speech-play]'};
 const {startFeature}=await loadRoute(),record=startFeature(feature,{root:doc,load:()=>{loads++;return load?load(loads):pending.promise;}});
 t.after(()=>win.close());await flush();
 return {win,doc,pending,record,timers,tick,loads:()=>loads,notice:()=>doc.querySelector('[data-feature-status]'),retry:()=>doc.querySelector('[data-feature-status] button'),click:()=>doc.querySelector('[data-next]').click()};
}
function failed(p){assert.match(p.notice().textContent,/暂未载入/);assert.equal(p.notice().hasAttribute('aria-busy'),false);assert.equal(p.retry().textContent,'重新加载');assert.equal(p.timers.size,0);}
test('never-settling import reaches recovery at exactly 15 seconds; native reading remains available',async t=>{
 const p=await fixture(t);let settled=false;p.record.ready.then(()=>settled=true);p.click();await p.tick(14999);assert.equal(settled,false);assert.equal(p.retry(),null);assert.equal(p.notice().getAttribute('aria-busy'),'true');await p.tick(1);failed(p);assert.equal((await p.record.ready).status,'failed');assert.equal(p.doc.querySelector('a').getAttribute('href'),'#native');p.click();assert.ok(p.retry(),'failed control must not erase Retry');
});
for(const late of ['resolve','reject'])test(`timed-out old import ${late} cannot initialize, overwrite recovery, or steal focus`,async t=>{
 const p=await fixture(t);let inits=0;await p.tick(15000);failed(p);p.doc.querySelector('#outside').focus();if(late==='resolve')p.pending.resolve({init(){inits++;p.doc.querySelector('input').focus();}});else p.pending.reject(Error('late failure'));await flush();assert.equal(inits,0);failed(p);assert.equal(p.doc.activeElement.id,'outside');
});
for(const late of ['resolve','reject'])test(`retry wins independently; old ${late} cannot disturb new success`,async t=>{
 const old=deferred(),next=deferred();let inits=0;const p=await fixture(t,{load:n=>n===1?old.promise:next.promise});await p.tick(15000);const retry=p.retry();retry.focus();retry.click();retry.click();await flush();assert.equal(p.loads(),2);assert.equal(p.doc.activeElement,p.doc.querySelector('main'));next.resolve({init(){inits++;}});assert.equal((await p.record.ready).status,'ready');assert.equal(inits,1);p.doc.querySelector('#outside').focus();if(late==='resolve')old.resolve({init(){inits+=100;}});else old.reject(Error('old'));await flush();assert.equal(inits,1);assert.equal(p.notice(),null);assert.equal(p.doc.activeElement.id,'outside');assert.equal(p.timers.size,0);
});
test('old resolution while retry still pending cannot initialize the old attempt',async t=>{
 const old=deferred(),next=deferred();let inits=0;const p=await fixture(t,{load:n=>n===1?old.promise:next.promise});await p.tick(15000);p.retry().click();await flush();old.resolve({init(){inits+=100;}});await flush();assert.equal(inits,0);assert.equal(p.notice().getAttribute('aria-busy'),'true');next.resolve({init(){inits++;}});await p.record.ready;assert.equal(inits,1);
});
test('same pending import promise may remain stuck across retries; explicit recovery remains bounded',async t=>{
 const shared=deferred();let inits=0;const p=await fixture(t,{load:()=>shared.promise});await p.tick(15000);p.retry().click();await flush();assert.equal(p.loads(),2);await p.tick(15000);failed(p);shared.resolve({init(){inits++;}});await flush();assert.equal(inits,0,'both expired attempts are inert');p.retry().click();await p.record.ready;assert.equal(p.loads(),3);assert.equal(inits,1,'later explicit retry can consume an already-resolved module');
});
for(const result of ['success','sync-throw','reject'])test(`import ${result} clears its deadline immediately`,async t=>{
 const p=await fixture(t,{load:()=>{if(result==='sync-throw')throw Error('offline');if(result==='reject')return Promise.reject(Error('offline'));return {init(){}};}});assert.equal((await p.record.ready).status,result==='success'?'ready':'failed');assert.equal(p.timers.size,0);await p.tick(15000);if(result==='success')assert.equal(p.notice(),null);else failed(p);
});
test('import deadline does not time out an already-started async initializer',async t=>{
 const init=deferred();let inits=0;const p=await fixture(t,{load:()=>({init(){inits++;return init.promise;}})});assert.equal(inits,1);assert.equal(p.timers.size,0);await p.tick(60000);assert.equal(p.retry(),null);init.resolve();assert.equal((await p.record.ready).status,'ready');assert.equal(inits,1);
});
for(const asynchronous of [false,true])test(`partially initialized ${asynchronous?'async':'sync'} failure only offers refresh`,async t=>{
 let inits=0;const p=await fixture(t,{load:()=>({init(){inits++;if(asynchronous)return Promise.reject(Error('partial'));throw Error('partial');}})});assert.equal((await p.record.ready).status,'failed');assert.equal(p.retry().textContent,'刷新页面');assert.equal(inits,1);assert.equal(p.timers.size,0);
});
for(const away of ['hidden','pagehide'])test(`stage import that settles while ${away} waits without an import deadline until active`,async t=>{
 const p=await fixture(t,{id:'stage-engine'});let inits=0;if(away==='hidden'){Object.defineProperty(p.doc,'hidden',{value:true,configurable:true});p.doc.dispatchEvent(new p.win.Event('visibilitychange'));}else p.win.dispatchEvent(new p.win.Event('pagehide'));
 p.pending.resolve({init(){inits++;}});await flush();assert.equal(inits,0);assert.equal(p.timers.size,0);await p.tick(60000);assert.equal(p.retry(),null);if(away==='hidden'){Object.defineProperty(p.doc,'hidden',{value:false,configurable:true});p.doc.dispatchEvent(new p.win.Event('visibilitychange'));}else p.win.dispatchEvent(new p.win.Event('pageshow'));assert.equal((await p.record.ready).status,'ready');assert.equal(inits,1);
});
test('stage timed-out import cannot schedule initialization on a later pageshow',async t=>{
 const p=await fixture(t,{id:'stage-engine'});let inits=0;p.win.dispatchEvent(new p.win.Event('pagehide'));await p.tick(15000);p.pending.resolve({init(){inits++;}});await flush();p.win.dispatchEvent(new p.win.Event('pageshow'));await flush();assert.equal(inits,0);failed(p);
});
for(const away of ['hidden','pagehide','dialog','focus-moved'])test(`retry completion after ${away} preserves focus and cancels stale actions`,async t=>{
 const next=deferred();let clicks=0,inits=0;const p=await fixture(t,{load:n=>n===1?new Promise(()=>{}):next.promise});p.click();await p.tick(15000);const button=p.retry();button.focus();button.click();p.click();p.doc.querySelector('#outside').focus();
 if(away==='hidden'){Object.defineProperty(p.doc,'hidden',{value:true,configurable:true});p.doc.dispatchEvent(new p.win.Event('visibilitychange'));}else if(away==='pagehide')p.win.dispatchEvent(new p.win.Event('pagehide'));else if(away==='dialog'){p.doc.querySelector('dialog').open=true;p.doc.dispatchEvent(new p.win.Event('atelier:dialog-open'));}else {p.doc.querySelector('input').value='newer';p.doc.querySelector('input').dispatchEvent(new p.win.Event('input',{bubbles:true}));}
 next.resolve({init(){inits++;p.doc.querySelector('[data-next]').addEventListener('click',()=>clicks++);}});await p.record.ready;assert.equal(inits,1,'preserve existing non-GPU initialization contract');assert.equal(clicks,0);assert.equal(p.doc.activeElement.id,'outside');
});
test('timeout retains field values but drops the expired click intent',async t=>{
 let inits=0,clicks=0;const p=await fixture(t,{load:n=>n===1?new Promise(()=>{}):{init(){inits++;p.doc.querySelector('input').value='reset';p.doc.querySelector('[data-next]').addEventListener('click',()=>clicks++);}}});const input=p.doc.querySelector('input');input.value='数组';input.dispatchEvent(new p.win.CompositionEvent('compositionend',{bubbles:true}));p.click();await p.tick(15000);p.retry().click();await p.record.ready;assert.equal(input.value,'数组');assert.equal(inits,1);assert.equal(clicks,0);
});
for(const id of ['reader','studio'])test(`${id} audio intent never replays through timeout or retry`,async t=>{
 const next=deferred();let audio=0;const p=await fixture(t,{id,load:n=>n===1?new Promise(()=>{}):next.promise});const gesture=()=>id==='reader'?p.doc.querySelector('[data-speech-play]').click():p.doc.body.dispatchEvent(new p.win.KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true}));gesture();await p.tick(15000);p.retry().click();gesture();next.resolve({init(){p.doc.addEventListener(id==='reader'?'click':'keydown',()=>audio++);}});await p.record.ready;assert.equal(audio,0);assert.match(p.notice().textContent,/再次/);gesture();assert.equal(audio,1);
});
test('shared native-like import promise resolving during an active retry initializes only the current attempt',async t=>{
 const shared=deferred();let inits=0;const p=await fixture(t,{load:()=>shared.promise});await p.tick(15000);p.retry().click();await flush();shared.resolve({init(){inits++;}});await p.record.ready;assert.equal(inits,1);assert.equal(p.loads(),2);assert.equal(p.timers.size,0);
});
test('cached import rejection is not represented as a fresh network request or automatic recovery',async t=>{
 const cached=Promise.reject(Error('cached module evaluation failure'));const p=await fixture(t,{load:()=>cached});await p.record.ready;failed(p);for(let i=0;i<3;i++){p.retry().click();await p.record.ready;failed(p);}assert.equal(p.loads(),4);await p.tick(60000);assert.equal(p.loads(),4,'no automatic retry loop');
});
test('repeated explicit timeouts leave one retry entry and no settled timers',async t=>{
 const p=await fixture(t);for(let i=0;i<4;i++){await p.tick(15000);failed(p);assert.equal(p.doc.querySelectorAll('[data-feature-status] button').length,1);assert.equal(p.loads(),i+1);if(i<3){p.retry().click();await flush();assert.equal(p.timers.size,1);}}await p.tick(60000);assert.equal(p.loads(),4);
});
