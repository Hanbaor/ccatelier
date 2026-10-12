const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const settle=()=>new Promise(resolve=>setImmediate(resolve));

async function fixture(t,mode){
 const dom=new JSDOM('<body data-root="/" data-search="/search.json"><button class="search-open">搜索</button><dialog id="search-dialog"><button data-close="search-dialog">关闭</button><select id="search-scope"><option value="site">全站</option><option value="offline">本机离线</option></select><p id="search-status"></p><input id="search-input"><div id="search-results"></div></dialog></body>',{url:'https://ccatelier.test/'});
 const {window}=dom,doc=window.document;
 Object.assign(globalThis,{window,document:doc,location:window.location,CustomEvent:window.CustomEvent,matchMedia:()=>({matches:false,addEventListener(){}})});
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const requests=[],read=()=>new Promise((resolve,reject)=>requests.push({resolve,reject}));
 globalThis.fetch=read;
 const {initSearch}=await import('../source/atelier/js/search.js');
 initSearch({loadOffline:read,loadContext:async()=>({searchResultText:item=>({title:[{text:item.title}],excerpt:[]})})});
 const input=doc.querySelector('input'),scope=doc.querySelector('select'),dialog=doc.querySelector('dialog'),box=doc.querySelector('#search-results'),opener=doc.querySelector('.search-open');
 scope.value=mode;input.value='needle';opener.click();requests.shift().reject(Error('unavailable'));await settle();
 input.setSelectionRange(1,4);
 t.after(()=>{for(const request of requests)request.reject(Error('cleanup'));dom.window.close();});
 return {window,doc,input,scope,dialog,box,opener,retry:()=>box.querySelector('button'),fail:()=>requests.shift().reject(Error('unavailable')),succeed(){const entries=[{title:'needle result',content:'needle',url:'/result/'}];requests.shift().resolve(mode==='site'?{ok:true,json:async()=>entries}:{version:1,entries,unavailable:0});}};
}

for(const mode of ['site','offline']){
 test(`${mode} Retry preserves query and selection with continuous keyboard focus through success and another failure`,async t=>{
  const f=await fixture(t,mode);const retry=f.retry();assert.equal(retry.type,'button');retry.focus();retry.click();
  assert.equal(f.doc.activeElement,f.input);assert.equal(f.input.value,'needle');assert.equal(f.input.selectionStart,1);assert.equal(f.input.selectionEnd,4);
  f.fail();await settle();assert.equal(f.doc.activeElement,f.input);assert.ok(f.retry());
  f.retry().focus();f.retry().click();assert.equal(f.doc.activeElement,f.input);f.succeed();await settle();
  assert.equal(f.doc.activeElement,f.input);assert.equal(f.input.value,'needle');assert.equal(f.input.selectionStart,1);assert.equal(f.input.selectionEnd,4);assert.equal(f.box.querySelector('a').getAttribute('href'),'/result/');
 });

 test(`${mode} programmatic Retry does not take focus from another control`,async t=>{
  const f=await fixture(t,mode);f.scope.focus();f.retry().click();assert.equal(f.doc.activeElement,f.scope);
  f.succeed();await settle();assert.equal(f.doc.activeElement,f.scope);
 });

 test(`${mode} Retry completion does not take focus after the user moves or closes search`,async t=>{
  const f=await fixture(t,mode);f.retry().focus();f.retry().click();
  const close=f.doc.querySelector('[data-close]');close.focus();f.fail();await settle();assert.equal(f.doc.activeElement,close);
  f.retry().focus();f.retry().click();f.dialog.close();f.opener.focus();f.succeed();await settle();
  assert.equal(f.dialog.open,false);assert.equal(f.doc.activeElement,f.opener);
 });
}
