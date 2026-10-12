const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const settleSearch=()=>new Promise(resolve=>setTimeout(resolve,190));
const deferred=()=>{let resolve;const promise=new Promise(yes=>{resolve=yes;});return {promise,resolve};};
let modules;

async function page(){
 const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../public/hot100/001/index.html'),'utf8'),{url:'https://ccatelier.test/hot100/001/',pretendToBeVisual:true}),{window}=dom,doc=window.document,scrolled=[];
 Object.assign(globalThis,{window,document:doc,location:window.location,localStorage:window.localStorage,CustomEvent:window.CustomEvent,NodeFilter:window.NodeFilter,innerHeight:900,innerWidth:1440,matchMedia:()=>({matches:false,addEventListener(){}}),requestAnimationFrame:()=>0,getSelection:()=>window.getSelection()});
 window.HTMLElement.prototype.scrollIntoView=function(){scrolled.push(this);};
 window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
 window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 modules||={reader:await import('../source/atelier/js/reader.js'),notebook:await import('../source/atelier/js/notebook.js'),code:await import('../source/atelier/js/code-studio.js')};
 return {dom,window,doc,scrolled};
}

test('real reader keeps latest fields when a pending action is cancelled by dialog, pagehide, or visibility',async()=>{
 const {startFeature,routeFeatures}=await import('../source/atelier/js/route-features.js');
 for(const event of ['atelier:dialog-open','pagehide','visibilitychange']){
  const {dom,window,doc,scrolled}=await page(),pending=deferred(),feature=routeFeatures.find(f=>f.id==='reader');
  try{
   const record=startFeature(feature,{root:doc,load:()=>pending.promise}),input=doc.querySelector('#reader-find'),size=doc.querySelector('[data-reader-size]'),leading=doc.querySelector('[data-reader-leading]'),width=doc.querySelector('[data-reader-width]');
   input.value='数组';input.dispatchEvent(new window.CompositionEvent('compositionend',{bubbles:true}));
   size.value='22';size.dispatchEvent(new window.Event('input',{bubbles:true}));leading.value='22';leading.dispatchEvent(new window.Event('input',{bubbles:true}));width.value='narrow';width.dispatchEvent(new window.Event('change',{bubbles:true}));
   doc.querySelector('[data-find-next]').click();
   if(event==='atelier:dialog-open'){
    const {openDialog}=await import('../source/atelier/js/ui.js');openDialog('menu-dialog');doc.querySelector('#menu-dialog').close();
   }else if(event==='visibilitychange'){
    Object.defineProperty(doc,'hidden',{value:true,configurable:true});doc.dispatchEvent(new window.Event(event));
   }else window.dispatchEvent(new window.Event(event));
   pending.resolve(modules.reader);assert.equal((await record.ready).status,'ready');await settleSearch();
   assert.equal(input.value,'数组',event);assert.match(doc.querySelector('[data-find-status]').textContent,/^\d+ 处匹配$/,event);
   assert.equal(size.value,'22',event);assert.equal(leading.value,'22',event);assert.equal(width.value,'narrow',event);assert.equal(doc.querySelector('.reading-studio').style.getPropertyValue('--reader-size'),'22px',event);
   assert.equal(scrolled.length,0,'cancelled navigation must not run after '+event);
  }finally{dom.window.close();}
 }
});

test('real reader never lets an older queued clear erase newer typing',async()=>{
 const {startFeature,routeFeatures}=await import('../source/atelier/js/route-features.js'),{dom,window,doc}=await page(),pending=deferred();
 try{
  const record=startFeature(routeFeatures.find(f=>f.id==='reader'),{root:doc,load:()=>pending.promise}),input=doc.querySelector('#reader-find');
  input.value='数组';input.dispatchEvent(new window.Event('input',{bubbles:true}));doc.querySelector('[data-find-clear]').click();
  input.value='两数';input.dispatchEvent(new window.CompositionEvent('compositionend',{bubbles:true}));pending.resolve(modules.reader);
  assert.equal((await record.ready).status,'ready');await settleSearch();assert.equal(input.value,'两数');assert.notEqual(doc.querySelector('[data-find-status]').textContent,'输入关键词');
 }finally{dom.window.close();}
});

test('unfinished reader IME input is not searched or navigated until its real compositionend',async()=>{
 const {startFeature,routeFeatures}=await import('../source/atelier/js/route-features.js'),{dom,window,doc,scrolled}=await page(),pending=deferred();
 try{
  const record=startFeature(routeFeatures.find(f=>f.id==='reader'),{root:doc,load:()=>pending.promise}),input=doc.querySelector('#reader-find');
  input.dispatchEvent(new window.CompositionEvent('compositionstart',{bubbles:true}));input.value='数组';input.dispatchEvent(new window.InputEvent('input',{bubbles:true,isComposing:true}));
  const enter=new window.KeyboardEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,bubbles:true,cancelable:true});input.dispatchEvent(enter);assert.equal(enter.defaultPrevented,false,'IME commit must not be intercepted as find-next');
  pending.resolve(modules.reader);assert.equal((await record.ready).status,'ready');await settleSearch();
  assert.equal(input.value,'数组');assert.equal(doc.querySelector('[data-find-status]').textContent,'输入关键词');assert.equal(scrolled.length,0);
  input.dispatchEvent(new window.CompositionEvent('compositionend',{bubbles:true,data:'数组'}));assert.match(doc.querySelector('[data-find-status]').textContent,/^\d+ 处匹配$/);assert.equal(scrolled.length,0);
 }finally{dom.window.close();}
});

test('real reader, notebook, and code initializers work in every import completion order',async()=>{
 const {initRouteFeatures}=await import('../source/atelier/js/route-features.js');
 const orders=[['reader','notebook','code'],['reader','code','notebook'],['notebook','reader','code'],['notebook','code','reader'],['code','reader','notebook'],['code','notebook','reader']];
 for(const order of orders){
  const {dom,window,doc}=await page(),pending=Object.fromEntries(order.map(id=>[id,deferred()]));
  try{
   const boot=initRouteFeatures({root:doc,loaders:Object.fromEntries(order.map(id=>[id,()=>pending[id].promise]))});
   for(const id of order){pending[id].resolve(modules[id]);await flush();}
   assert.ok((await boot).every(r=>r.status==='ready'),order.join(' -> '));
   assert.equal(doc.querySelectorAll('#notebook-dialog').length,1);assert.equal(doc.querySelectorAll('#code-studio-dialog').length,1);assert.equal(doc.querySelectorAll('.code-workbench-open').length,doc.querySelectorAll('.article-body .code-container').length);
   const input=doc.querySelector('#reader-find');input.value='数组';input.dispatchEvent(new window.CompositionEvent('compositionend',{bubbles:true}));assert.match(doc.querySelector('[data-find-status]').textContent,/^\d+ 处匹配$/);
   await initRouteFeatures({root:doc});assert.equal(doc.querySelectorAll('#notebook-dialog').length,1);assert.equal(doc.querySelectorAll('#code-studio-dialog').length,1);
  }finally{dom.window.close();}
 }
});

test('an early notebook open cannot erase fields retained by the slower real reader',async()=>{
 const {initRouteFeatures}=await import('../source/atelier/js/route-features.js'),{dom,window,doc}=await page(),pending=Object.fromEntries(['reader','notebook','code'].map(id=>[id,deferred()]));
 try{
  const boot=initRouteFeatures({root:doc,loaders:Object.fromEntries(Object.entries(pending).map(([id,p])=>[id,()=>p.promise]))}),input=doc.querySelector('#reader-find'),size=doc.querySelector('[data-reader-size]');
  input.value='数组';input.dispatchEvent(new window.CompositionEvent('compositionend',{bubbles:true}));size.value='22';size.dispatchEvent(new window.Event('input',{bubbles:true}));doc.querySelector('[data-notebook-open]').click();
  pending.notebook.resolve(modules.notebook);await flush();assert.equal(doc.querySelector('#notebook-dialog').open,true);
  pending.reader.resolve(modules.reader);pending.code.resolve(modules.code);assert.ok((await boot).every(r=>r.status==='ready'));await settleSearch();
  assert.equal(size.value,'22');assert.equal(input.value,'数组');assert.match(doc.querySelector('[data-find-status]').textContent,/^\d+ 处匹配$/);assert.equal(doc.querySelector('#notebook-dialog').open,true);
 }finally{dom.window.close();}
});
