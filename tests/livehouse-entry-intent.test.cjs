const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const {pathToFileURL} = require('node:url');
const root = process.env.REPO_ROOT || path.resolve(__dirname, '..');
const repoRequire = createRequire(path.join(root, 'package.json'));
const {JSDOM} = repoRequire('jsdom');
const ejs = repoRequire('ejs');

const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

async function entry(t, {multiple = false, sharedImport = false, entrance = 'cover'} = {}) {
 const dom = new JSDOM(read('public/index.html'), {url:'https://ccatelier.test/'});
 const {window} = dom, {document} = window;
 document.querySelector('#livehouse-dialog').outerHTML = ejs.render(read('custom/redefine/nijika/livehouse.ejs'), {url_for:value=>'/'+value, partial:()=>''});
 const saved = new Map(), errors = [], loads = [], shown = [];
 let hidden = false, initializations = 0, stageLoads = 0, reloads = 0;
 let now = 0, timerId = 0; const timers = new Map();
 window.setTimeout = (fn, ms) => {const id = ++timerId; timers.set(id, {fn, at: now + ms}); return id;};
 window.clearTimeout = id => timers.delete(id);
 const flush = async () => {for (let i = 0; i < 24; i++) await Promise.resolve();};
 const tick = async ms => {const end = now + ms; while (true) {const next = [...timers].filter(([,v]) => v.at <= end).sort((a,b) => a[1].at-b[1].at)[0]; if (!next) break; now = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();} now = end; await flush();};
 for (const [name,value] of Object.entries({window,document,location:window.location,localStorage:window.localStorage,CustomEvent:window.CustomEvent,matchMedia:()=>({matches:true,addEventListener(){}}),requestAnimationFrame:()=>1,cancelAnimationFrame(){}})) {
  saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));
  Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
 }
 t.after(()=>{
  try { window.dispatchEvent(new window.Event('pagehide')); window.close(); }
  finally { for (const [name,descriptor] of saved) { if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name]; } }
 });
 Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
 window.addEventListener('error',event=>{errors.push(event.error);event.preventDefault();});
 window.HTMLCanvasElement.prototype.getContext = () => null;
 window.HTMLDialogElement.prototype.showModal = function(){shown.push(this.id);this.open=true;this.querySelector('button')?.focus();};
 window.HTMLDialogElement.prototype.close = function(){if(this.open){this.open=false;this.dispatchEvent(new window.Event('close'));}};
 const ui = await import(pathToFileURL(path.join(root, 'source/atelier/js/ui.js')).href);
 ui.motion.enabled = false;
 const live = await import(pathToFileURL(path.join(root, 'source/atelier/js/livehouse.js')).href);
 let shared;
 const load = () => {
  let gate;
  if (sharedImport && shared) gate = shared;
  else {
   gate = {};
   gate.promise = new Promise((resolve,reject) => {
    gate.reject = reject;
    gate.resolve = module => resolve(module || {initLivehouse(){initializations++;return live.initLivehouse({loadStage:async()=>{stageLoads++;return {createLiveStage:async()=>null};}});}});
   });
   if (sharedImport) shared = gate;
  }
  loads.push(gate);return gate.promise;
 };
 // Execute the actual entry module. Only unrelated eager bootstraps are no-ops;
 // retain real dialogs and livehouse, replacing the network import with a gate.
 const entranceTemplate = read(`custom/redefine/nijika/${entrance}.ejs`).match(/<button[^>]*data-live-open[\s\S]*?<\/button>/)[0];
 document.querySelector('[data-live-open]').outerHTML = ejs.render(entranceTemplate, {partial:()=>read('custom/redefine/nijika/editorial-arrow.ejs')});
 if (multiple) {
  const original = document.querySelector('[data-live-open]');
  original.after(original.cloneNode(true));
 }
 const source = process.env.MAIN_SOURCE ? fs.readFileSync(process.env.MAIN_SOURCE, 'utf8') : read('source/atelier/js/main.js');
 const names = [...source.matchAll(/^import \{([^}]+)\} from .*;$/gm)].flatMap(match=>match[1].split(',').map(name=>name.trim()));
 const executable = source.replace(/^import .*;\n/gm,'').replace("import('./livehouse.js')",'load()').replaceAll('window.location.reload()', 'requestReload()');
 new Function(...names,'load','requestReload',executable)(...names.map(name=>name==='initDialogs'?ui.initDialogs:()=>{}),load,()=>{reloads++;});
 const button = document.querySelector('[data-live-open]');
 const dialog = document.querySelector('#livehouse-dialog');
 return {window,document,button,dialog,loads,shown,errors,timers,tick,
  get reloads(){return reloads;},
  get initializations(){return initializations;},get stageLoads(){return stageLoads;},
  click(){button.focus();button.click();},
  menu(){document.querySelector('.menu-open').click();},
  other(){ui.openDialog('credits-dialog');},
  visibility(value){hidden=value;document.dispatchEvent(new window.Event('visibilitychange'));},
  pagehide(){window.dispatchEvent(new window.Event('pagehide'));},
  close(){dialog.querySelector('[data-live-close]').click();},
 };
}

for (const interrupt of ['menu','other','visibility','pagehide']) test(`delayed first entrance is canceled by ${interrupt} and cached for explicit reentry`,async t=>{
 const f=await entry(t);
 f.click(); assert.equal(f.loads.length,1);assert.equal(f.button.disabled,true);
 if(interrupt==='visibility'){f.visibility(true);f.visibility(false);}else f[interrupt]();
 const focused=f.document.activeElement;
 assert.equal(f.button.disabled,false,'an abandoned request releases its entry button immediately');
 f.loads[0].resolve();await settle();
 assert.equal(f.dialog.open,false);assert.equal(f.stageLoads,0);assert.equal(f.initializations,1);
 assert.equal(f.document.activeElement,focused,'late resolution must not steal focus');
 if(interrupt==='menu')assert.equal(f.document.querySelector('#menu-dialog').open,true);
 f.click();await settle();
 assert.equal(f.dialog.open,true);assert.equal(f.loads.length,1);assert.equal(f.initializations,1);assert.equal(f.stageLoads,1);
 assert.equal(f.document.activeElement,f.dialog.querySelector('[data-live-close]'));assert.deepEqual(f.errors,[]);
});

test('normal first entrance and close/reopen retain one initialized module and native dialog behavior',async t=>{
 const f=await entry(t);f.menu();f.click();f.loads[0].resolve();await settle();
 assert.equal(f.dialog.open,true);assert.equal(f.document.querySelector('#menu-dialog').open,false);
 assert.equal(f.button.disabled,false);assert.equal(f.stageLoads,1);
 f.close();assert.equal(f.dialog.open,false);assert.equal(f.document.activeElement,f.button);
 f.click();await settle();assert.equal(f.dialog.open,true);assert.equal(f.loads.length,1);assert.equal(f.initializations,1);assert.equal(f.stageLoads,2);
 assert.deepEqual(f.errors,[]);
});

test('cancel then click again before import settles opens only the latest intent',async t=>{
 const f=await entry(t);f.click();f.menu();f.click();
 assert.equal(f.loads.length,1);assert.equal(f.button.disabled,true);
 f.loads[0].resolve();await settle();
 assert.equal(f.dialog.open,true);assert.equal(f.shown.filter(id=>id==='livehouse-dialog').length,1);
 assert.equal(f.stageLoads,1);assert.equal(f.button.disabled,false);assert.deepEqual(f.errors,[]);
});

test('rapid repeated clicks do not duplicate the import, open, or stage',async t=>{
 const f=await entry(t);f.click();f.button.click();
 // Dispatch bypasses disabled native activation to stress two awaiting handlers.
 f.button.dispatchEvent(new f.window.MouseEvent('click',{bubbles:true}));
 f.loads[0].resolve();await settle();
 assert.equal(f.loads.length,1);assert.equal(f.initializations,1);assert.equal(f.stageLoads,1);
 assert.equal(f.shown.filter(id=>id==='livehouse-dialog').length,1);assert.equal(f.button.disabled,false);
});

test('failed shared load releases buttons and the next explicit click retries',async t=>{
 const f=await entry(t);f.click();f.loads[0].reject(new Error('offline'));await settle();
 assert.equal(f.dialog.open,false);assert.equal(f.button.disabled,false);assert.match(f.button.textContent,/载入失败/);
 f.click();assert.equal(f.loads.length,2);f.loads[1].resolve();await settle();
 assert.equal(f.dialog.open,true);assert.equal(f.initializations,1);assert.equal(f.stageLoads,1);assert.deepEqual(f.errors,[]);
});

test('abandoned rejection does not overwrite the button and still allows retry',async t=>{
 const f=await entry(t),label=f.button.textContent;
 f.click();f.menu();f.loads[0].reject(new Error('offline'));await settle();
 assert.equal(f.button.textContent,label);assert.equal(f.button.disabled,false);assert.equal(f.dialog.open,false);
 f.click();assert.equal(f.loads.length,2);f.loads[1].resolve();await settle();assert.equal(f.dialog.open,true);
});

test('a hidden document cannot enter even when clicked programmatically',async t=>{
 const f=await entry(t);f.visibility(true);f.click();await settle();
 assert.equal(f.loads.length,0);assert.equal(f.button.disabled,false);assert.equal(f.dialog.open,false);
 f.visibility(false);f.click();f.visibility(true);f.loads[0].resolve();await settle();
 assert.equal(f.dialog.open,false);assert.equal(f.stageLoads,0);
});


test('two entrance buttons share loading while the newest click owns focus restoration',async t=>{
 const f=await entry(t,{multiple:true});
 const second=f.document.querySelectorAll('[data-live-open]')[1];
 f.click();second.focus();second.click();
 assert.equal(f.loads.length,1);assert.equal(f.button.disabled,false);assert.equal(second.disabled,true);
 f.loads[0].resolve();await settle();
 assert.equal(f.dialog.open,true);assert.equal(f.stageLoads,1);assert.equal(second.disabled,false);
 assert.equal(f.shown.filter(id=>id==='livehouse-dialog').length,1);
 f.close();assert.equal(f.document.activeElement,second);assert.deepEqual(f.errors,[]);
});

function failed(f) {assert.equal(f.button.disabled,false);assert.match(f.button.textContent,/载入失败.*重试/);assert.equal(f.dialog.open,false);assert.equal(f.timers.size,0);}
function refresh(f) {assert.equal(f.button.disabled,false);assert.match(f.button.textContent,/刷新页面/);assert.equal(f.timers.size,0);}

test('pending import expires exactly at 15000 ms; explicit retry has a fresh UI deadline',async t=>{
 const f=await entry(t);f.click();await f.tick(14999);assert.equal(f.button.disabled,true);assert.equal(f.timers.size,1);
 await f.tick(1);failed(f);assert.equal(f.initializations,0);assert.equal(f.loads.length,1);
 f.click();assert.equal(f.loads.length,2);await f.tick(14999);assert.equal(f.button.disabled,true);await f.tick(1);failed(f);
});

test('canceled pending import reentry shares remaining bounded deadline, then permits explicit retry',async t=>{
 const f=await entry(t);f.click();await f.tick(10000);f.menu();assert.equal(f.button.disabled,false);f.click();assert.equal(f.loads.length,1);
 await f.tick(4999);assert.equal(f.button.disabled,true);await f.tick(1);failed(f);
 f.click();assert.equal(f.loads.length,2);f.loads[1].resolve();await settle();assert.equal(f.dialog.open,true);assert.equal(f.initializations,1);assert.equal(f.timers.size,0);
});

for(const outcome of ['resolve','reject'])test(`expired import ${outcome} cannot initialize or disturb retry success`,async t=>{
 const f=await entry(t);f.click();await f.tick(15000);failed(f);f.click();f.loads[1].resolve();await settle();
 assert.equal(f.initializations,1);assert.equal(f.dialog.open,true);const focus=f.document.activeElement,label=f.button.textContent;
 if(outcome==='resolve')f.loads[0].resolve();else f.loads[0].reject(Error('old failure'));await settle();
 assert.equal(f.initializations,1);assert.equal(f.document.activeElement,focus);assert.equal(f.button.textContent,label);assert.equal(f.stageLoads,1);assert.equal(f.timers.size,0);
});

for(const outcome of ['resolve','reject'])test(`expired import ${outcome} cannot disturb a newer pending request`,async t=>{
 const f=await entry(t);f.click();await f.tick(15000);f.click();
 if(outcome==='resolve')f.loads[0].resolve();else f.loads[0].reject(Error('old failure'));await settle();
 assert.equal(f.initializations,0);assert.equal(f.button.disabled,true);assert.equal(f.timers.size,1);
 f.loads[1].resolve();await settle();assert.equal(f.initializations,1);assert.equal(f.dialog.open,true);
});

test('same native import promise can expire twice and only later explicit intent initializes',async t=>{
 const f=await entry(t,{sharedImport:true});f.click();await f.tick(15000);failed(f);f.click();assert.equal(f.loads[0].promise,f.loads[1].promise);await f.tick(15000);failed(f);
 f.loads[0].resolve();await settle();assert.equal(f.initializations,0);assert.equal(f.dialog.open,false);
 f.click();await settle();assert.equal(f.loads.length,3);assert.equal(f.initializations,1);assert.equal(f.dialog.open,true);assert.equal(f.timers.size,0);
});

for(const interrupt of ['menu','other','visibility','pagehide'])test(`canceled timeout after ${interrupt} is silent and late completion stays inert`,async t=>{
 const f=await entry(t),label=f.button.textContent;f.click();if(interrupt==='visibility')f.visibility(true);else f[interrupt]();const focus=f.document.activeElement;
 await f.tick(15000);assert.equal(f.button.disabled,false);assert.equal(f.button.textContent,label);assert.equal(f.timers.size,0);
 f.loads[0].resolve();await settle();assert.equal(f.initializations,0);assert.equal(f.dialog.open,false);assert.equal(f.stageLoads,0);assert.equal(f.document.activeElement,focus);
});

test('real partial initialization failure only offers refresh and cannot duplicate listeners',async t=>{
 const f=await entry(t),panel=f.dialog.querySelector('[data-live-recorder]'),show=f.dialog.querySelector('[data-live-show]');
 let bound=0;const addPanel=panel.addEventListener.bind(panel),addShow=show.addEventListener.bind(show);
 panel.addEventListener=(type,...rest)=>{if(type==='toggle')bound++;return addPanel(type,...rest);};
 let fail=true;show.addEventListener=(type,...rest)=>{if(fail&&type==='click'){fail=false;throw Error('controlled partial init failure');}return addShow(type,...rest);};
 f.click();f.loads[0].resolve();await settle();refresh(f);assert.equal(bound,2);assert.equal(f.initializations,1);
 f.click();await settle();assert.equal(f.reloads,1);assert.equal(f.loads.length,1);assert.equal(f.initializations,1);assert.equal(bound,2);assert.equal(f.dialog.open,false);
});

test('controller open failure only offers refresh and retains successful initialization',async t=>{
 const f=await entry(t);let shows=0;f.dialog.showModal=()=>{shows++;throw Error('controlled partial open failure');};
 f.click();f.loads[0].resolve();await settle();refresh(f);assert.equal(f.initializations,1);assert.equal(shows,1);
 f.click();await settle();assert.equal(f.reloads,1);assert.equal(f.loads.length,1);assert.equal(f.initializations,1);assert.equal(shows,1);
});

for(const phase of ['init','open'])test(`canceled ${phase} failure cannot relabel an abandoned button or silently reload`,async t=>{
 const f=await entry(t),label=f.button.textContent;f.click();
 if(phase==='init'){
  f.menu();f.loads[0].resolve({initLivehouse(){throw Error('init failure after cancellation');}});
 }else{
  f.dialog.showModal=()=>{f.menu();throw Error('open failed after a newer dialog intent');};f.loads[0].resolve();
 }
 await settle();assert.equal(f.button.textContent,label);assert.equal(f.button.disabled,false);assert.equal(f.reloads,0);
 f.click();await settle();refresh(f);assert.equal(f.reloads,0,'first explicit click explains the recovery action');
 f.click();assert.equal(f.reloads,1);assert.equal(f.loads.length,1);
});

for(const outcome of ['resolve','reject'])test(`async initialization ${outcome} is not governed by the pure-import deadline`,async t=>{
 const f=await entry(t);let resolve,reject,inits=0;const pending=new Promise((yes,no)=>{resolve=yes;reject=no;});
 f.click();f.loads[0].resolve({initLivehouse(){inits++;return pending;}});await settle();assert.equal(inits,1);assert.equal(f.timers.size,0);
 await f.tick(60000);assert.equal(f.button.disabled,true);assert.equal(f.reloads,0);
 if(outcome==='reject'){reject(Error('async partial failure'));await settle();refresh(f);f.click();assert.equal(f.reloads,1);}
 else {let opens=0;resolve({open(){opens++;}});await settle();assert.equal(opens,1);assert.equal(f.button.disabled,false);}
 assert.equal(inits,1);
});

test('canceled late initialization, timeout recovery and explicit open never construct audio context',async t=>{
 const f=await entry(t);let audioContexts=0;f.window.AudioContext=function(){audioContexts++;throw Error('unexpected automatic audio');};
 f.click();f.menu();f.loads[0].resolve();await settle();assert.equal(audioContexts,0);assert.equal(f.dialog.open,false);
 f.click();await settle();assert.equal(f.dialog.open,true);assert.equal(audioContexts,0);assert.equal(f.dialog.querySelector('[data-live-sound]').getAttribute('aria-pressed'),'false');
});

for(const outcome of ['resolve','reject'])test(`import ${outcome} clears its timer without waiting for the deadline`,async t=>{
 const f=await entry(t);f.click();assert.equal(f.timers.size,1);
 if(outcome==='resolve')f.loads[0].resolve();else f.loads[0].reject(Error('offline'));await settle();assert.equal(f.timers.size,0);assert.equal(f.button.disabled,false);
 await f.tick(60000);assert.equal(f.timers.size,0);if(outcome==='resolve')assert.equal(f.dialog.open,true);else failed(f);
});

for(const outcome of ['resolve','reject'])test(`expired import ${outcome} without retry preserves recovery and outside focus`,async t=>{
 const f=await entry(t);f.click();await f.tick(15000);failed(f);f.document.querySelector('.menu-open').focus();const focus=f.document.activeElement,label=f.button.textContent;
 if(outcome==='resolve')f.loads[0].resolve();else f.loads[0].reject(Error('late failure'));await settle();
 failed(f);assert.equal(f.initializations,0);assert.equal(f.document.activeElement,focus);assert.equal(f.button.textContent,label);
});

test('timeout then successful retry and old completion cannot enable audio',async t=>{
 const f=await entry(t);let audioContexts=0;f.window.AudioContext=function(){audioContexts++;throw Error('unexpected automatic audio');};
 f.click();await f.tick(15000);failed(f);f.click();f.loads[1].resolve();await settle();f.loads[0].resolve();await settle();
 assert.equal(f.initializations,1);assert.equal(f.dialog.open,true);assert.equal(audioContexts,0);assert.equal(f.dialog.querySelector('[data-live-sound]').getAttribute('aria-pressed'),'false');
});

test('failure after native modal opening closes the modal and restores a usable refresh entrance',async t=>{
 const f=await entry(t),nativeShow=f.dialog.showModal.bind(f.dialog);let audioContexts=0;
 f.window.AudioContext=function(){audioContexts++;throw Error('unexpected audio');};
 f.dialog.showModal=()=>{nativeShow();throw Error('controlled failure after native modal opening');};
 f.click();f.loads[0].resolve();await settle();refresh(f);
 assert.equal(f.dialog.open,false);assert.equal(f.document.activeElement,f.button);assert.equal(f.button.disabled,false);
 assert.equal(f.document.body.classList.contains('livehouse-opened'),false);assert.equal(f.dialog.dataset.liveStageState,'closed');
 assert.equal(f.stageLoads,0);assert.equal(audioContexts,0);assert.equal(f.initializations,1);
 f.click();assert.equal(f.reloads,1);assert.equal(f.loads.length,1);assert.equal(f.initializations,1);
});

for(const closeResult of ['throw','no-op'])test(`post-modal failure with ${closeResult} close keeps an in-dialog refresh button reachable`,async t=>{
 const f=await entry(t),nativeShow=f.dialog.showModal.bind(f.dialog);let closes=0,audioContexts=0;
 f.window.AudioContext=function(){audioContexts++;throw Error('unexpected audio');};
 f.dialog.showModal=()=>{nativeShow();throw Error('controlled post-modal failure');};
 f.dialog.close=()=>{closes++;if(closeResult==='throw')throw Error('controlled close failure');};
 f.click();f.loads[0].resolve();await settle();refresh(f);
 assert.equal(closes,1);assert.equal(f.dialog.open,true,'do not pretend close succeeded');
 const reload=f.dialog.querySelector('[data-live-reload]');assert.ok(reload);assert.equal(reload.disabled,false);assert.equal(f.document.activeElement,reload);assert.match(reload.textContent,/刷新页面/);
 reload.click();assert.equal(f.reloads,1);assert.equal(f.loads.length,1);assert.equal(f.initializations,1);assert.equal(f.stageLoads,0);assert.equal(audioContexts,0);
 // Restore teardown primitive; the assertions above used the deliberately broken one.
 f.dialog.close=f.window.HTMLDialogElement.prototype.close.bind(f.dialog);
});

test('real post-showModal resize failure safely closes without repeating initialization',async t=>{
 const f=await entry(t),bounds=f.dialog.getBoundingClientRect.bind(f.dialog);let fail=true;
 f.dialog.getBoundingClientRect=()=>{if(fail){fail=false;throw Error('controlled real resize failure');}return bounds();};
 f.click();f.loads[0].resolve();await settle();refresh(f);
 assert.equal(f.shown.filter(id=>id==='livehouse-dialog').length,1);assert.equal(f.dialog.open,false);assert.equal(f.document.activeElement,f.button);assert.equal(f.initializations,1);assert.equal(f.stageLoads,0);
 f.click();assert.equal(f.reloads,1);assert.equal(f.initializations,1);
});

test('post-modal failure after visibility cancellation leaves focus alone and offers in-dialog refresh',async t=>{
 const f=await entry(t),nativeShow=f.dialog.showModal.bind(f.dialog);let focus,closes=0;
 f.dialog.showModal=()=>{nativeShow();f.visibility(true);focus=f.document.activeElement;throw Error('post-modal failure after cancellation');};
 const nativeClose=f.dialog.close.bind(f.dialog);f.dialog.close=()=>{closes++;nativeClose();};
 f.click();f.loads[0].resolve();await settle();assert.equal(closes,0);assert.equal(f.document.activeElement,focus);assert.equal(f.dialog.open,true);
 const reload=f.dialog.querySelector('[data-live-reload]');assert.ok(reload);assert.equal(f.reloads,0);
 f.visibility(false);reload.click();assert.equal(f.reloads,1);assert.equal(f.initializations,1);
});

for(const entrance of ['cover','studio'])for(const outcome of ['timeout','reject'])for(const cancel of [false,true])test(`${entrance} original text/arrow nodes survive ${outcome}, retry${cancel?' cancellation and reentry':' success'}`,async t=>{
 const f=await entry(t,{entrance}),nodes=[...f.button.childNodes],originalText=f.button.textContent,arrow=f.button.querySelector('span'),svg=f.button.querySelector('svg');
 assert.ok(arrow);if(entrance==='studio')assert.ok(svg);
 let notifications=0;arrow.addEventListener('audit-node-identity',()=>notifications++);
 const restored=()=>{
  assert.equal(f.button.textContent,originalText);assert.equal(f.button.childNodes.length,nodes.length);nodes.forEach((node,index)=>assert.equal(f.button.childNodes[index],node));
  assert.equal(f.button.querySelector('span'),arrow);assert.equal(f.button.querySelector('svg'),svg);
  arrow.dispatchEvent(new f.window.Event('audit-node-identity'));assert.equal(notifications,1);notifications=0;
 };
 f.click();if(outcome==='timeout')await f.tick(15000);else {f.loads[0].reject(Error('offline'));await settle();}
 failed(f);assert.equal(arrow.isConnected,false);
 f.click();restored();assert.equal(f.button.disabled,true,'original content is restored while retry is still loading');
 if(cancel){f.menu();restored();assert.equal(f.button.disabled,false);}
 f.loads[1].resolve();await settle();restored();assert.equal(f.dialog.open,!cancel);
 if(cancel){f.click();await settle();restored();assert.equal(f.dialog.open,true);}
 assert.equal(f.initializations,1);assert.equal(f.loads.length,2);assert.equal(f.button.disabled,false);
});

test('original entrance restoration never erases the sticky refresh action',async t=>{
 const f=await entry(t,{entrance:'studio'}),arrow=f.button.querySelector('svg');f.click();
 f.loads[0].resolve({initLivehouse(){throw Error('partial initialization');}});await settle();refresh(f);const label=f.button.textContent;assert.equal(arrow.isConnected,false);
 f.click();assert.equal(f.reloads,1);assert.equal(f.button.textContent,label);assert.equal(arrow.isConnected,false);assert.equal(f.loads.length,1);
});
