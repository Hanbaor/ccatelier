const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const ejs = require('ejs');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const settle = () => new Promise(resolve => setImmediate(resolve));

async function entry(t, {multiple = false} = {}) {
 const dom = new JSDOM(read('public/index.html'), {url:'https://ccatelier.test/'});
 const {window} = dom, {document} = window;
 document.querySelector('#livehouse-dialog').outerHTML = ejs.render(read('custom/redefine/nijika/livehouse.ejs'), {url_for:value=>'/'+value, partial:()=>''});
 const saved = new Map(), errors = [], loads = [], shown = [];
 let hidden = false, initializations = 0, stageLoads = 0;
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
 const ui = await import('../source/atelier/js/ui.js');
 ui.motion.enabled = false;
 const live = await import('../source/atelier/js/livehouse.js');
 const load = () => new Promise((resolve,reject)=>loads.push({reject,resolve:()=>resolve({initLivehouse(){initializations++;return live.initLivehouse({loadStage:async()=>{stageLoads++;return {createLiveStage:async()=>null};}});}})}));
 // Execute the actual entry module. Only unrelated eager bootstraps are no-ops;
 // retain real dialogs and livehouse, replacing the network import with a gate.
 if (multiple) {
  const original = document.querySelector('[data-live-open]');
  original.after(original.cloneNode(true));
 }
 const source = read('source/atelier/js/main.js');
 const names = [...source.matchAll(/^import \{([^}]+)\} from .*;$/gm)].flatMap(match=>match[1].split(',').map(name=>name.trim()));
 const executable = source.replace(/^import .*;\n/gm,'').replace("import('./livehouse.js')",'load()');
 new Function(...names,'load',executable)(...names.map(name=>name==='initDialogs'?ui.initDialogs:()=>{}),load);
 const button = document.querySelector('[data-live-open]');
 const dialog = document.querySelector('#livehouse-dialog');
 return {window,document,button,dialog,loads,shown,errors,
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
