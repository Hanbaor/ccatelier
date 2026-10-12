const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function fixture(t,id='reader',file='hot100/001/index.html'){
 const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../public',file),'utf8'),{url:'https://ccatelier.test/'+file,pretendToBeVisual:true}),{window}=dom,doc=window.document;
 t.after(()=>window.close());
 const {startFeature,routeFeatures}=await import('../source/atelier/js/route-features.js'),feature=routeFeatures.find(f=>f.id===id),pending=deferred();let calls=0;
 const record=startFeature(feature,{root:doc,load:()=>++calls===1?Promise.reject(Error('offline')):pending.promise});
 await record.ready;const notice=doc.querySelector(`[data-feature-status="${id}"]`),details=notice.closest('details');if(details)details.open=true;
 return {window,doc,feature,pending,record,notice,retry:()=>notice.querySelector('button'),target:details?.querySelector('summary')||doc.querySelector(feature.selector).querySelector('figure[tabindex]')||doc.querySelector(feature.selector),calls:()=>calls};
}
for(const [id,file] of [['reader','hot100/001/index.html'],['notebook','hot100/001/index.html'],['code','hot100/001/index.html'],['algorithm-demo','hot100/001/index.html'],['archive','notes/index.html'],['stage-engine','studio/index.html'],['studio','studio/index.html'],['practice','studio/practice/index.html']])test(`${id} rendered Retry hands off keyboard focus before removal and repeated activation loads once`,async t=>{
 const f=await fixture(t,id,file),retry=f.retry();retry.focus();retry.click();retry.click();
 assert.equal(f.doc.activeElement,f.target,'focus must stay at the feature while its module arrives');assert.ok(f.target.isConnected);
 await Promise.resolve();assert.equal(f.calls(),2,'a detached or repeated retry cannot start another import');
 f.pending.reject(Error('still offline'));await f.record.ready;assert.equal(f.doc.activeElement,f.target);assert.ok(f.retry());
 f.retry().focus();f.retry().click();assert.equal(f.doc.activeElement,f.target);await f.record.ready;assert.equal(f.doc.activeElement,f.target);
});
for(const result of ['success','failure'])test(`reader retry ${result} does not take focus from subsequent navigation or programmatic activation`,async t=>{
 for(const focused of [true,false]){
  const f=await fixture(t),input=f.doc.querySelector('#reader-find');input.focus();if(focused)f.retry().focus();f.retry().click();input.focus();
  if(result==='success')f.pending.resolve({initReader(){}});else f.pending.reject(Error('offline'));
  await f.record.ready;assert.equal(f.doc.activeElement,input);
 }
});
for(const away of ['hidden','pagehide','dialog','closed','detached'])test(`Retry while ${away} never moves focus or replays abandoned actions`,async t=>{
 const f=await fixture(t),retry=f.retry();retry.focus();let clicks=0;
 if(away==='hidden'){Object.defineProperty(f.doc,'hidden',{value:true,configurable:true});f.doc.dispatchEvent(new f.window.Event('visibilitychange'));}
 if(away==='pagehide')f.window.dispatchEvent(new f.window.Event('pagehide'));
 if(away==='dialog'){f.doc.querySelector('dialog').setAttribute('open','');f.doc.dispatchEvent(new f.window.Event('atelier:dialog-open'));}
 if(away==='closed')f.notice.closest('details').open=false;
 if(away==='detached')f.notice.closest('details').remove();
 let focuses=0;f.target.addEventListener('focus',()=>focuses++);retry.click();f.pending.resolve({initReader(){clicks++;}});await f.record.ready;
 assert.equal(focuses,0);assert.equal(clicks,1,'focus recovery does not change route initialization rules');
});
test('real reader initializes after keyboard retry without losing fields or stealing focus on completion',async t=>{
 const f=await fixture(t),saved=new Map();
 for(const [name,value] of Object.entries({window:f.window,document:f.doc,location:f.window.location,localStorage:f.window.localStorage,NodeFilter:f.window.NodeFilter,matchMedia:()=>({matches:false,addEventListener(){}}),getSelection:()=>f.window.getSelection()})){
  saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
 }
 t.after(()=>{for(const [name,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
 const input=f.doc.querySelector('#reader-find'),size=f.doc.querySelector('[data-reader-size]');input.value='数组';input.dispatchEvent(new f.window.CompositionEvent('compositionend',{bubbles:true}));size.value='22';size.dispatchEvent(new f.window.Event('input',{bubbles:true}));
 f.retry().focus();f.retry().click();assert.equal(f.doc.activeElement,f.target);
 f.pending.resolve(await import('../source/atelier/js/reader.js'));assert.equal((await f.record.ready).status,'ready');
 assert.equal(f.doc.activeElement,f.target);assert.equal(input.value,'数组');assert.equal(size.value,'22');assert.match(f.doc.querySelector('[data-find-status]').textContent,/^\d+ 处匹配$/);assert.equal(f.notice.isConnected,false);
});
test('focus handoff preserves existing tabindex and removes only its temporary host stop on blur',async t=>{
 for(const existing of [false,true]){
  const f=await fixture(t,'studio','studio/index.html');if(existing)f.target.setAttribute('tabindex','0');
  f.retry().focus();f.retry().click();assert.equal(f.doc.activeElement,f.target);assert.equal(f.target.getAttribute('tabindex'),existing?'0':'-1');
  const outside=f.doc.querySelector('a[href]');outside.focus();assert.equal(f.target.getAttribute('tabindex'),existing?'0':null);
  f.pending.resolve({initStudio(){}});await f.record.ready;assert.equal(f.doc.activeElement,outside);
 }
});
