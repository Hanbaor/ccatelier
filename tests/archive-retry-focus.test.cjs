const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const settle=()=>new Promise(resolve=>setImmediate(resolve));

async function fixture(t){
 const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../public/notes/index.html'),'utf8'),{url:'https://ccatelier.test/notes/?q=STL',pretendToBeVisual:true}),{window}=dom,doc=window.document;
 Object.assign(globalThis,{window,document:doc,location:window.location,history:window.history,CustomEvent:window.CustomEvent,localStorage:window.localStorage,innerWidth:1440,innerHeight:900,devicePixelRatio:1,matchMedia:()=>({matches:false,addEventListener(){}}),requestAnimationFrame:()=>0,cancelAnimationFrame(){}});
 globalThis.fetch=async()=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(__dirname,'../public/atelier/data/archive.json'),'utf8'))});delete globalThis.Worker;
 const pending=[];let created=0;
 const {initArchive}=await import('../source/atelier/js/archive.js');
 await initArchive({loadConstellation:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))});
 const $=selector=>doc.querySelector(selector),graphButton=$('[data-view=graph]'),input=$('#archive-q');
 graphButton.click();await settle();pending.shift().reject(Error('unavailable'));await settle();
 t.after(()=>{window.dispatchEvent(new window.Event('pagehide'));for(const request of pending)request.resolve({createConstellation(){throw Error('hidden page must not create graph');}});dom.window.close();});
 return {window,doc,$,graphButton,input,get created(){return created;},retry:()=>$('.constellation [role=status] button'),fail:()=>pending.shift().reject(Error('unavailable')),succeed(){pending.shift().resolve({createConstellation(){created++;return {setPosts(){},pause(){}};}});}};
}

test('graph Retry immediately returns keyboard focus to the stable graph control through repeated failure and success',async t=>{
 const f=await fixture(t),url=f.window.location.href;
 f.$('.archive-options').open=false;assert.equal(f.graphButton.closest('.archive-options'),null);
 const retry=f.retry();assert.equal(retry.type,'button');retry.focus();retry.click();assert.equal(f.doc.activeElement,f.graphButton);assert.equal(f.graphButton.disabled,false);
 await settle();f.fail();await settle();assert.equal(f.doc.activeElement,f.graphButton);assert.ok(f.retry());
 f.retry().focus();f.retry().click();assert.equal(f.doc.activeElement,f.graphButton);await settle();f.succeed();await settle();
 assert.equal(f.doc.activeElement,f.graphButton);assert.equal(f.created,1);assert.equal(f.retry(),null);assert.equal(f.window.location.href,url);assert.equal(f.input.value,'STL');assert.equal(f.$('.archive-options').open,false);
});

test('programmatic graph Retry leaves focus on another control',async t=>{
 const f=await fixture(t);f.input.focus();f.input.setSelectionRange(0,2);f.retry().click();assert.equal(f.doc.activeElement,f.input);
 await settle();f.succeed();await settle();assert.equal(f.doc.activeElement,f.input);assert.equal(f.input.selectionStart,0);assert.equal(f.input.selectionEnd,2);
});

test('switching to list during graph Retry keeps newer focus and discards late graph creation',async t=>{
 const f=await fixture(t);f.retry().focus();f.retry().click();await settle();
 const list=f.$('[data-view=list]');list.focus();list.click();const url=f.window.location.href;f.succeed();await settle();
 assert.equal(f.doc.activeElement,list);assert.equal(f.created,0);assert.equal(f.$('[data-archive-results]').hidden,false);assert.equal(f.window.location.href,url);
});

test('pagehide during graph Retry cannot create a graph or reclaim focus on return',async t=>{
 const f=await fixture(t);f.retry().focus();f.retry().click();await settle();f.window.dispatchEvent(new f.window.PageTransitionEvent('pagehide',{persisted:true}));
 f.input.focus();f.succeed();await settle();assert.equal(f.doc.activeElement,f.input);assert.equal(f.created,0);
 f.window.dispatchEvent(new f.window.PageTransitionEvent('pageshow',{persisted:true}));await settle();assert.equal(f.doc.activeElement,f.input);f.succeed();await settle();assert.equal(f.doc.activeElement,f.input);assert.equal(f.created,1);
});
