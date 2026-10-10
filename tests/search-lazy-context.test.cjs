const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(loadContext){
 const dom=new JSDOM('<body data-root="/" data-search="/search.json"><button class="search-open"></button><dialog id="search-dialog"><select id="search-scope"><option value="site">全站</option><option value="offline">本机离线</option></select><p id="search-status"></p><input id="search-input"><div id="search-results"></div></dialog></body>',{url:'https://ccatelier.test/'});
 const {window}=dom;Object.assign(globalThis,{window,document:window.document,location:window.location,CustomEvent:window.CustomEvent,matchMedia:()=>({matches:false,addEventListener(){}})});
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const site=[{title:'Site',url:'/site/',content:'needle site-only'}],offline=[{title:'Saved',url:'/saved/',content:'needle offline-only'}];
 globalThis.fetch=async()=>({ok:true,json:async()=>site});
 const {initSearch}=await import('../source/atelier/js/search.js');
 initSearch({loadContext,loadOffline:async()=>({version:1,entries:offline,unavailable:0})});
 const input=document.querySelector('input'),scope=document.querySelector('select'),box=document.querySelector('#search-results'),dialog=document.querySelector('dialog');
 return {dom,window,input,scope,box,dialog,open:()=>document.querySelector('.search-open').click(),query:value=>{input.value=value;input.dispatchEvent(new window.Event('input'));},change:mode=>{scope.value=mode;scope.dispatchEvent(new window.Event('change'));}};
}

test('match context loads only when opened, enriches current scope/query in place, and keeps keyboard focus',async()=>{
 let resolveModule,calls=0;
 const module=await import('../source/atelier/js/search-context.mjs');
 const h=await setup(()=>{calls++;return new Promise(resolve=>resolveModule=resolve);});
 try{
  await tick();assert.equal(calls,0);
  h.query('needle');h.open();await tick();assert.equal(calls,1);
  assert.equal(h.box.querySelector('a').getAttribute('href'),'/site/');
  assert.equal(h.box.querySelector('mark'),null);
  h.change('offline');h.query('offline-only');await tick();
  const link=h.box.querySelector('a');link.focus();
  resolveModule(module);await tick();
  assert.equal(h.box.querySelector('a'),link);
  assert.equal(document.activeElement,link);
  assert.equal(link.querySelector('mark').textContent,'offline-only');
  assert.doesNotMatch(link.textContent,/Site|site-only/);
  h.dialog.close();h.open();await tick();assert.equal(calls,1);
 }finally{h.dom.window.close();}
});

test('late context does not change a closed dialog, and reopen uses the latest input',async()=>{
 let resolveModule;
 const module=await import('../source/atelier/js/search-context.mjs');
 const h=await setup(()=>new Promise(resolve=>resolveModule=resolve));
 try{
  h.query('needle');h.open();await tick();
  const copy=h.box.innerHTML;h.dialog.close();resolveModule(module);await tick();
  assert.equal(h.dialog.open,false);assert.equal(h.box.innerHTML,copy);
  h.query('site-only');h.open();await tick();
  assert.equal(h.box.querySelector('mark').textContent,'site-only');
 }finally{h.dom.window.close();}
});

test('context failure preserves usable basic results and a later opening retries',async()=>{
 let calls=0;
 const module=await import('../source/atelier/js/search-context.mjs');
 const h=await setup(()=>{calls++;return calls===1?Promise.reject(Error('offline module unavailable')):Promise.resolve(module);});
 try{
  h.query('needle');h.open();await tick();
  assert.equal(calls,1);assert.equal(h.box.querySelector('a').getAttribute('href'),'/site/');
  assert.doesNotMatch(h.box.textContent,/暂无|载入失败/);assert.equal(h.box.querySelector('mark'),null);
  h.dialog.close();h.open();await tick();
  assert.equal(calls,2);assert.equal(h.box.querySelector('mark').textContent,'needle');
 }finally{h.dom.window.close();}
});
