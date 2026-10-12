const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const row=n=>({path:`/writing/${n}/`,title:`Article ${n}`,updated:1700000000000});
async function setup(t){
 const dom=new JSDOM('<body data-root="/"><div id="toast"></div><button class="offline-open">书架</button><button id="outside">Outside</button></body>',{url:'https://example.test/notes/',pretendToBeVisual:true}),{window}=dom;
 const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value:window.navigator});t.after(()=>{if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;});
 Object.assign(globalThis,{window,document:window.document,location:window.location,localStorage:window.localStorage,CustomEvent:window.CustomEvent,matchMedia:()=>({matches:false,addEventListener(){}})});
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
 let rows=[row(1),row(2),row(3)],defer=false;const reads=[],mutations=[];
 globalThis.offlineFocusMessage=data=>data.type==='list'?(defer?new Promise((resolve,reject)=>reads.push({resolve,reject})):Promise.resolve({rows,bytes:100})):new Promise((resolve,reject)=>mutations.push({data,resolve,reject}));
 const base=pathToFileURL(path.resolve('source/atelier/js/offline.js')),source=fs.readFileSync(base,'utf8').replace("import {offlineMessage as message} from './offline-client.js';",'const message=globalThis.offlineFocusMessage;').replace(/from '(\.\/[^']+)'/g,(_,file)=>`from '${new URL(file,base)}'`);
 const {initOffline}=await import('data:text/javascript;base64,'+Buffer.from(source+'\n// '+Math.random()).toString('base64'));initOffline();
 t.after(()=>{dom.window.close();delete globalThis.offlineFocusMessage;});document.querySelector('.offline-open').click();await tick();
 return{window,reads,mutations,dialog:document.querySelector('#offline-dialog'),set rows(value){rows=value;},set defer(value){defer=value;},refresh:()=>document.dispatchEvent(new window.CustomEvent('atelier:offline')),control:(n,kind='remove')=>document.querySelector(`[data-offline-path="/writing/${n}/"] [data-offline-action="${kind}"]`)};
}
test('offline deletion follows the removed row to its neighbor and empty shelf to close',async t=>{
 const s=await setup(t);s.control(1).focus();s.control(1).click();s.rows=[row(2),row(3)];s.mutations.shift().resolve({});await tick();assert.equal(document.activeElement,s.control(2));
 s.control(3).focus();s.control(3).click();s.rows=[row(2)];s.mutations.shift().resolve({});await tick();assert.equal(document.activeElement,s.control(2));
 s.control(2).click();s.rows=[];s.mutations.shift().resolve({});await tick();assert.equal(document.activeElement,s.dialog.querySelector('.live-dialog-head button'));
});
test('offline completion preserves a deliberately chosen surviving row control or link',async t=>{
 const s=await setup(t);s.control(1).focus();s.control(1).click();s.control(3,'save').focus();s.rows=[row(2),row(3)];s.mutations.shift().resolve({});await tick();assert.equal(document.activeElement,s.control(3,'save'));
 s.defer=true;s.refresh();const link=s.dialog.querySelector('[data-offline-path="/writing/2/"] a');link.focus();s.reads.shift().resolve({rows:[row(2),row(3)],bytes:100});await tick();assert.equal(document.activeElement,s.dialog.querySelector('[data-offline-path="/writing/2/"] a'));
});
test('offline failures retain list, focused control, and permit retry',async t=>{
 const s=await setup(t),button=s.control(1);button.focus();button.click();s.mutations.shift().reject(Error('remove failed'));await tick();assert.equal(s.control(1),button);assert.equal(document.activeElement,button);assert.equal(button.disabled,false);assert.match(s.dialog.textContent,/remove failed/);
 s.defer=true;s.refresh();s.reads.shift().reject(Error('read failed'));await tick();assert.equal(s.control(1),button);assert.equal(document.activeElement,button);
});
test('offline reverse-order refresh commits only latest list and leaves outside focus alone',async t=>{
 const s=await setup(t);s.defer=true;s.control(2).focus();s.refresh();s.refresh();const first=s.reads.shift(),second=s.reads.shift();second.resolve({rows:[row(2)],bytes:100});await tick();assert.equal(document.activeElement,s.control(2));first.resolve({rows:[row(1)],bytes:100});await tick();assert.equal(document.activeElement,s.control(2));assert.equal(s.control(1),null);
 s.refresh();document.querySelector('#outside').focus();s.reads.shift().resolve({rows:[row(3)],bytes:100});await tick();assert.equal(document.activeElement.id,'outside');
});
test('offline close and reopen invalidate stale reads and mutation errors without stealing focus',async t=>{
 const s=await setup(t);s.control(1).focus();s.control(1).click();s.defer=true;s.refresh();const old=s.reads.shift();s.dialog.close();document.querySelector('#outside').focus();old.resolve({rows:[],bytes:0});await tick();assert.equal(document.activeElement.id,'outside');assert.ok(s.control(1));
 document.querySelector('.offline-open').click();const fresh=s.reads.shift();s.dialog.querySelector('.live-dialog-head button').focus();fresh.resolve({rows:[row(2)],bytes:100});await tick();const text=s.dialog.textContent;s.mutations.shift().reject(Error('obsolete failure'));await tick();assert.equal(s.dialog.textContent,text);assert.equal(document.activeElement,s.dialog.querySelector('.live-dialog-head button'));
});
test('offline mutation completion while closed never reopens or pulls focus into the hidden list',async t=>{
 const s=await setup(t);s.control(1).focus();s.control(1).click();s.dialog.close();document.querySelector('#outside').focus();s.rows=[row(2)];s.mutations.shift().resolve({});await tick();assert.equal(s.dialog.open,false);assert.equal(document.activeElement.id,'outside');
 document.querySelector('.offline-open').click();await tick();assert.equal(s.control(1),null);assert.ok(s.control(2));assert.equal(document.activeElement.id,'outside');
});
for(const kind of ['hidden','detached','pagehide'])test(`offline refresh cannot restore focus after ${kind}`,async t=>{
 const s=await setup(t);s.control(2).focus();s.defer=true;s.refresh();let focusCalls=0;const focus=s.window.HTMLElement.prototype.focus;s.window.HTMLElement.prototype.focus=function(...args){focusCalls++;return focus.apply(this,args);};
 if(kind==='hidden')Object.defineProperty(document,'hidden',{configurable:true,value:true});else if(kind==='detached')s.dialog.remove();else s.window.dispatchEvent(new s.window.Event('pagehide'));
 s.reads.shift().resolve({rows:[row(2)],bytes:100});await tick();assert.equal(focusCalls,0);if(kind==='pagehide')assert.ok(s.control(1),'expired list request does not commit');
});
