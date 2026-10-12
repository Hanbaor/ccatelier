const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ejs=require('ejs'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(t,count=3){
 const html=ejs.render(fs.readFileSync(path.join(__dirname,'../custom/redefine/nijika/studio.ejs'),'utf8'),{theme:{nijika:{studio_art:'/atelier/images/studio.webp'}},url_for:p=>p,nijika_art_srcset:()=>'',partial:()=>''});
 const dom=new JSDOM(html+'<div id="toast"></div>',{url:'https://atelier.test/studio/',pretendToBeVisual:true}),{window}=dom,{document}=window,previous=new Map();
 for(const [key,value] of Object.entries({window,document,CustomEvent:window.CustomEvent,localStorage:window.localStorage,matchMedia:()=>({matches:true,addEventListener(){}}),devicePixelRatio:1,ResizeObserver:class{observe(){}},requestAnimationFrame:()=>0,cancelAnimationFrame(){}})){
  previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 }
 window.HTMLCanvasElement.prototype.getContext=()=>null;
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
 const {vault}=await import('../source/atelier/js/vault.js'),oldAll=vault.all,oldRemove=vault.remove;
 const {preset}=await import('../source/atelier/js/studio-core.mjs');
 let records=Array.from({length:count},(_,i)=>({id:String(i),name:'磁带 '+i,updated:count-i,project:preset()})),pending=[];
 vault.all=async()=>records.slice();
 vault.remove=(store,id)=>new Promise((resolve,reject)=>pending.push({id,resolve(){records=records.filter(p=>p.id!==id);resolve();},reject}));
 // Avoid keeping the toast timer alive after a simulated failure.
 const oldSetTimeout=globalThis.setTimeout;
 globalThis.setTimeout=(fn,delay,...args)=>delay===2200?0:oldSetTimeout(fn,delay,...args);
 t.after(()=>{window.dispatchEvent(new window.Event('pagehide'));vault.all=oldAll;vault.remove=oldRemove;globalThis.setTimeout=oldSetTimeout;dom.window.close();for(const [key,value] of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
 const {initStudio}=await import('../source/atelier/js/studio.js');initStudio();
 const trigger=document.querySelector('[data-studio-load]');trigger.focus();trigger.click();await tick();
 const dialog=document.querySelector('#studio-projects'),rows=()=>[...dialog.querySelectorAll('.queue-row')],remove=row=>row.querySelectorAll('button')[1];
 const reads=[];
 return {window,document,dialog,trigger,rows,remove,pending,reads,restoreRecord(id){records.push({id,name:'重新保存 '+id,updated:count+1,project:preset()});},deferReads(){vault.all=()=>new Promise((resolve,reject)=>{const snapshot=records.slice();reads.push({resolve:()=>resolve(snapshot),reject});});},close:dialog.querySelector('.live-dialog-head button')};
}
test('saved project deletion follows next/previous matching controls and ends on close',async t=>{
 const x=await fixture(t),[first,middle,last]=x.rows();
 for(const [row,expected] of [[middle,x.remove(last)],[last,x.remove(first)],[first,x.close]]){
  x.remove(row).focus();x.remove(row).click();assert.equal(x.document.activeElement,x.remove(row),'pending deletion retains its control');
  x.pending.shift().resolve();await tick();assert.equal(x.document.activeElement,expected);assert.equal(row.isConnected,false);
 }
 assert.equal(x.rows().length,0);assert.equal(x.dialog.open,true);assert.equal(x.dialog.querySelectorAll('[data-saved-empty]').length,1);assert.match(x.dialog.textContent,/还没有保存的录音带/);
});
test('failed saved project deletion preserves row and current focus',async t=>{
 const x=await fixture(t),row=x.rows()[0],button=x.remove(row);button.focus();button.click();x.pending.shift().reject(Error('无法删除'));await tick();
 assert.equal(x.rows().length,3);assert.equal(x.document.activeElement,button);assert.match(x.document.querySelector('#toast').textContent,/无法删除/);
});
for(const state of ['another row','close control','closed dialog','detached dialog','hidden document','reopened dialog'])test('pending saved deletion never steals focus after '+state,async t=>{
 const x=await fixture(t),row=x.rows()[0],button=x.remove(row);button.focus();button.click();
 if(state==='another row')x.remove(x.rows()[2]).focus();
 if(state==='close control')x.close.focus();
 if(state==='closed dialog'){x.dialog.close();x.trigger.focus();}
 if(state==='detached dialog'){x.dialog.remove();x.trigger.focus();}
 if(state==='hidden document')Object.defineProperty(x.document,'hidden',{configurable:true,value:true});
 if(state==='reopened dialog'){x.dialog.close();x.trigger.click();await tick();x.remove(x.rows()[1]).focus();}
 const before=x.document.activeElement;
 x.pending.shift().resolve();await tick();
 assert.equal(x.document.activeElement,before===button?x.document.body:before);
});
test('overlapping deletes choose remaining neighbors without late focus jumps',async t=>{
 const x=await fixture(t),[first,middle,last]=x.rows();
 x.remove(first).focus();x.remove(first).click();x.remove(middle).focus();x.remove(middle).click();
 x.pending[1].resolve();await tick();assert.equal(x.document.activeElement,x.remove(last));
 x.pending[0].resolve();await tick();assert.equal(x.document.activeElement,x.remove(last));assert.deepEqual(x.rows(),[last]);
});
test('completion follows the currently focused operation within the deleted row',async t=>{
 const x=await fixture(t),[first,next]=x.rows();x.remove(first).focus();x.remove(first).click();first.querySelector('button').focus();
 x.pending.shift().resolve();await tick();assert.equal(x.document.activeElement,next.querySelector('button'));
});
test('duplicate deletion completion cannot move focus again from an already removed row',async t=>{
 const x=await fixture(t),first=x.rows()[0];x.remove(first).focus();x.remove(first).click();x.remove(first).click();
 x.pending[1].resolve();await tick();assert.equal(x.document.activeElement,x.remove(x.rows()[0]));
 x.close.focus();x.pending[0].resolve();await tick();assert.equal(x.document.activeElement,x.close);assert.equal(x.rows().length,2);
});
test('newest saved project read wins without duplicate or stale rows',async t=>{
 const x=await fixture(t);x.deferReads();x.trigger.click();x.trigger.click();
 x.reads[1].resolve();await tick();const current=x.rows();assert.equal(current.length,3);x.remove(current[1]).focus();
 x.reads[0].resolve();await tick();assert.deepEqual(x.rows(),current);assert.equal(x.document.activeElement,x.remove(current[1]));
});
test('pending deletion removes its reopened replacement row without reclaiming focus',async t=>{
 const x=await fixture(t),first=x.rows()[0];x.remove(first).focus();x.remove(first).click();x.dialog.close();x.trigger.click();await tick();
 const next=x.rows()[1];x.remove(next).focus();x.pending.shift().resolve();await tick();
 assert.equal(x.rows().length,2);assert.ok(!x.rows().some(row=>row.textContent.includes('磁带 0')));assert.equal(x.document.activeElement,x.remove(next));
});
test('read snapshots predating deletion cannot resurrect records, but a fresh same-ID save remains visible',async t=>{
 const x=await fixture(t),first=x.rows()[0];x.remove(first).focus();x.remove(first).click();x.deferReads();x.trigger.click();
 x.pending.shift().resolve();await tick();x.reads[0].resolve();await tick();assert.equal(x.rows().length,2);assert.ok(!x.rows().some(row=>row.dataset.savedProject==='0'));
 x.restoreRecord('0');x.trigger.click();x.reads[1].resolve();await tick();assert.equal(x.rows().length,3);assert.match(x.rows()[0].textContent,/重新保存 0/);
});
test('focused replacement row deletion restores its current neighbor, then shows empty state once',async t=>{
 const x=await fixture(t,1);x.remove(x.rows()[0]).focus();x.remove(x.rows()[0]).click();x.dialog.close();x.trigger.click();await tick();
 x.remove(x.rows()[0]).focus();x.pending.shift().resolve();await tick();assert.equal(x.document.activeElement,x.close);assert.equal(x.rows().length,0);assert.equal(x.dialog.querySelectorAll('[data-saved-empty]').length,1);
});
for(const state of ['closed','detached','pagehide'])test('late saved read cannot populate after '+state,async t=>{
 const x=await fixture(t);x.deferReads();x.trigger.click();
 if(state==='closed')x.dialog.close();
 if(state==='detached')x.dialog.remove();
 if(state==='pagehide')x.window.dispatchEvent(new x.window.Event('pagehide'));
 x.trigger.focus();x.reads[0].resolve();await tick();assert.equal(x.rows().length,0);assert.equal(x.document.activeElement,x.trigger);
});
test('stale read errors do not append notices to a newer list or closed dialog',async t=>{
 const x=await fixture(t);x.deferReads();x.trigger.click();x.trigger.click();x.reads[1].resolve();await tick();
 x.reads[0].reject(Error('旧读取失败'));await tick();assert.doesNotMatch(x.dialog.textContent,/旧读取失败/);assert.equal(x.rows().length,3);
 x.trigger.click();x.dialog.close();x.reads[2].reject(Error('关闭后失败'));await tick();assert.doesNotMatch(x.dialog.textContent,/关闭后失败/);
});
test('current saved read error is visible and a subsequent open can recover without loading a project',async t=>{
 const x=await fixture(t),name=x.document.querySelector('[data-project-name]').value;x.deferReads();x.trigger.click();x.reads[0].reject(Error('本机读取失败'));await tick();assert.match(x.dialog.textContent,/本机读取失败/);
 x.trigger.click();x.reads[1].resolve();await tick();assert.equal(x.rows().length,3);assert.doesNotMatch(x.dialog.textContent,/本机读取失败/);assert.equal(x.document.querySelector('[data-project-name]').value,name);
});
