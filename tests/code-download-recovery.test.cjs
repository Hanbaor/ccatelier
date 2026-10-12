'use strict';
// Source-function regression with modeled download APIs; no actual saved file/browser claim.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{createRequire}=require('node:module'),{pathToFileURL}=require('node:url');
const repo=process.env.CC_REPO||path.resolve(__dirname,'..'),sourceRoot=process.env.CC_SOURCE_ROOT||repo,req=createRequire(path.join(repo,'package.json'));
const {JSDOM,VirtualConsole}=req('jsdom');
const requested='已请求下载源码，请检查浏览器中的下载结果。';
const failed='未能发起下载。代码和所选行仍保留；可重试，或使用‘复制全部’后自行保存。';
const code='  globalThis.__workbenchArticleCodeExecuted = true;\n\n\treturn 1;';
async function setup(mode='ok',language='Cpp'){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<article class="article-body"><div class="code-container"><table><tr><td class="gutter"><pre></pre></td><td class="code"><pre></pre></td></tr></table></div></article><div id="toast"></div>',{url:'https://example.test/writing/post/',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,d=w.document;
 const container=d.querySelector('.code-container');container.dataset.rel=language;
 code.split('\n').forEach((line,i)=>{for(const [selector,text]of [['.code pre',line],['.gutter pre',String(i+1)]]){const span=d.createElement('span');span.className='line';span.textContent=text;d.querySelector(selector).append(span,d.createElement('br'));}});
 const globals={window:w,document:d,location:w.location,CustomEvent:w.CustomEvent,matchMedia:()=>({matches:false,addEventListener(){}}),__workbenchArticleCodeExecuted:false},saved=new Map(Object.keys(globals).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 for(const [k,value]of Object.entries(globals))Object.defineProperty(globalThis,k,{value,writable:true,configurable:true});
 w.__workbenchArticleCodeExecuted=false;w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 const copies=[],created=[],revoked=[],clicks=[],timers=[];let blobCalls=0,currentMode=mode;
 Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>copies.push(text)}});
 const realBlob=globalThis.Blob,realTimer=globalThis.setTimeout,urlCreate=Object.getOwnPropertyDescriptor(URL,'createObjectURL'),urlRevoke=Object.getOwnPropertyDescriptor(URL,'revokeObjectURL');
 globalThis.Blob=class extends realBlob{constructor(parts,options){blobCalls++;if(currentMode==='blob')throw new Error('Modeled Blob allocation failed');super(parts,options);}};
 URL.createObjectURL=blob=>{if(currentMode==='create')throw new Error('Modeled object URL rejected');const url='blob:https://example.test/'+(created.length+1);created.push({url,blob});return url;};URL.revokeObjectURL=url=>revoked.push(url);
 globalThis.setTimeout=(fn,ms,...args)=>{if(ms===30000){timers.push(()=>fn(...args));return 9000+timers.length;}return realTimer(fn,ms,...args);};
 w.HTMLAnchorElement.prototype.click=function(){clicks.push({href:this.href,name:this.download});if(currentMode==='click')throw new Error('Modeled click rejected');};
 function cleanup(){dom.window.close();globalThis.Blob=realBlob;globalThis.setTimeout=realTimer;if(urlCreate)Object.defineProperty(URL,'createObjectURL',urlCreate);else delete URL.createObjectURL;if(urlRevoke)Object.defineProperty(URL,'revokeObjectURL',urlRevoke);else delete URL.revokeObjectURL;for(const[k,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,k,descriptor);else delete globalThis[k];}}
 try{
  const module=await import(pathToFileURL(path.join(sourceRoot,'source/atelier/js/code-studio.js')).href);module.initCodeStudio();
  const dialog=d.querySelector('#code-studio-dialog'),button=[...dialog.querySelectorAll('button')].find(b=>b.textContent==='下载源码'),status=dialog.querySelector('.live-status');
  function row(n){return dialog.querySelectorAll('.code-lines>div>button')[n-1];}
  function prepare(){d.querySelector('.code-workbench-open').click();row(1).click();row(2).dispatchEvent(new w.MouseEvent('click',{bubbles:true,shiftKey:true}));dialog.querySelector('[data-code-reference-extend]').click();button.focus();}
  const selection=()=>({pressed:[...dialog.querySelectorAll('.code-lines button')].map(b=>b.getAttribute('aria-pressed')),extend:dialog.querySelector('[data-code-reference-extend]').getAttribute('aria-pressed'),source:container.querySelector('.code pre').innerHTML,gutter:container.querySelector('.gutter pre').innerHTML,language:container.dataset.rel});
  return {w,d,dialog,button,status,row,prepare,selection,copies,created,revoked,clicks,timers,errors,setMode:value=>currentMode=value,get blobCalls(){return blobCalls;},cleanup,
   checkIdle(){assert.equal(blobCalls,0);assert.equal(created.length,0);assert.equal(clicks.length,0);assert.equal(copies.length,0);assert.equal(w.__workbenchArticleCodeExecuted,false);assert.equal(globalThis.__workbenchArticleCodeExecuted,false);},
   checkPreserved(before){assert.deepEqual(selection(),before);assert.equal(d.activeElement,button);assert.equal(dialog.open,true);assert.equal(copies.length,0);assert.equal(w.__workbenchArticleCodeExecuted,false);assert.equal(globalThis.__workbenchArticleCodeExecuted,false);assert.deepEqual(errors,[]);}
  };
 }catch(e){cleanup();throw e;}
}
test('source download reports only request, preserves selected code/focus, and retains delayed cleanup without automatic actions',async()=>{
 const s=await setup();try{s.checkIdle();s.prepare();s.checkIdle();const before=s.selection();s.button.click();assert.equal(s.status.getAttribute('role'),'status');assert.equal(s.status.textContent,requested);assert.doesNotMatch(s.status.textContent,/下载成功|保存成功|已保存/);assert.equal(s.created.length,1);assert.equal(await s.created[0].blob.text(),code);assert.equal(s.created[0].blob.type,'text/plain;charset=utf-8');assert.deepEqual(s.clicks,[{href:s.created[0].url,name:'cc-code.cpp'}]);assert.deepEqual(s.revoked,[]);assert.equal(s.timers.length,1);s.checkPreserved(before);s.timers[0]();assert.deepEqual(s.revoked,[s.created[0].url]);}finally{s.cleanup();}
});
for(const failure of ['blob','create','click'])test('source '+failure+' failure gives actionable status, preserves selection, and retry replaces stale failure truthfully',async()=>{
 const s=await setup(failure,failure==='blob'?'Plaintext':'Cpp');try{s.checkIdle();s.prepare();const before=s.selection();s.button.click();assert.equal(s.status.textContent,failed);s.checkPreserved(before);assert.equal(s.timers.length,0);assert.equal(s.created.length,failure==='click'?1:0);assert.deepEqual(s.revoked,failure==='click'?[s.created[0].url]:[]);assert.equal(s.clicks.length,failure==='click'?1:0);
 s.setMode('ok');s.button.click();assert.equal(s.status.textContent,requested);s.checkPreserved(before);assert.equal(s.created.length,failure==='click'?2:1);assert.equal(await s.created.at(-1).blob.text(),code);assert.equal(s.clicks.at(-1).name,failure==='blob'?'cc-code.txt':'cc-code.cpp');assert.equal(s.timers.length,1);s.timers[0]();assert.deepEqual(s.revoked,s.created.map(x=>x.url));
 // The still-armed endpoint selection survives failure/retry and remains usable.
 s.row(3).click();assert.equal(s.dialog.querySelectorAll('.line-focused').length,3);assert.equal(s.copies.length,0);assert.deepEqual(s.errors,[]);
 }finally{s.cleanup();}
});
