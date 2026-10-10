const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
async function setup(t,count=3){
 const dom=new JSDOM('<body data-root="/"><div class="article-body">原文</div><button data-notebook-open>札记</button><button id="outside">其他操作</button><div id="toast"></div></body>',{url:'https://ccatelier.test/writing/keyboard/'}),{window}=dom,document=window.document;
 Object.assign(globalThis,{window,document,location:window.location,localStorage:window.localStorage,CustomEvent:window.CustomEvent,NodeFilter:window.NodeFilter,getSelection:()=>window.getSelection(),innerWidth:1200,innerHeight:900,matchMedia:()=>({matches:false,addEventListener(){}})});
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;this.querySelector('button')?.focus();};
 window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));document.querySelector('[data-notebook-open]').focus();};
 const {vault}=await import('../source/atelier/js/vault.js'),original={...vault};
 let notes=Array.from({length:count},(_,i)=>({id:String(i+1),path:location.pathname,title:'文章',quote:'原文',note:'批注 '+(i+1),updated:count-i}));
 vault.put=async(_,record)=>{notes=notes.filter(n=>n.id!==record.id);notes.push(record);};vault.merge=async(_,records)=>{for(const record of records)await vault.put('notes',record);};
 const requests=[];vault.all=async()=>notes.map(n=>({...n}));vault.remove=(_,id)=>{const wait=deferred();requests.push({id,...wait});return wait.promise.then(()=>{notes=notes.filter(n=>n.id!==id);});};
 const {initNotebook}=await import('../source/atelier/js/notebook.js');initNotebook();
 const opener=document.querySelector('[data-notebook-open]'),open=async()=>{opener.focus();opener.click();await flush();};await open();
 t.after(()=>{Object.assign(vault,original);dom.window.close();});
 const row=id=>[...document.querySelectorAll('.notebook-note')].find(n=>n.dataset.notebookId===String(id));
 return {window,document,vault,requests,row,open,dialog:document.querySelector('#notebook-dialog'),remove:id=>row(id).querySelector('[data-notebook-delete]'),commit:async index=>{requests[index].resolve();await flush();}};
}
for(const [label,id,target] of [['first',1,2],['middle',2,3],['last',3,2]])test(`deleting the ${label} note retains logical keyboard position`,async t=>{
 const s=await setup(t),button=s.remove(id),untouched=s.row(target);button.focus();button.click();assert.equal(s.document.activeElement,button);assert.equal(button.getAttribute('aria-disabled'),'true');await s.commit(0);
 assert.equal(s.row(id),undefined);assert.equal(s.row(target),untouched,'unaffected rows are not rebuilt');assert.equal(s.document.activeElement,s.row(target).querySelector('button'));assert.equal(s.requests.length,1);
});
test('deleting the only note returns focus to the dialog close button',async t=>{
 const s=await setup(t,1);s.remove(1).focus();s.remove(1).click();await s.commit(0);assert.equal(s.document.activeElement,s.dialog.querySelector('.live-dialog-head button'));assert.equal(s.dialog.querySelectorAll('.notebook-note').length,0);assert.match(s.dialog.querySelector('.notebook-list').textContent,/还没有札记/);
});
test('a user who moves focus while deletion waits keeps their chosen control',async t=>{
 const s=await setup(t);s.remove(1).focus();s.remove(1).click();const chosen=s.remove(3);chosen.focus();await s.commit(0);assert.equal(s.document.activeElement,chosen);
});
test('leaving and returning to the deleting row does not trigger automatic relocation',async t=>{
 const s=await setup(t);s.remove(1).focus();s.remove(1).click();s.remove(3).focus();s.remove(1).focus();const calls=[];s.row(2).querySelector('button').focus=()=>calls.push('restore');await s.commit(0);assert.deepEqual(calls,[]);
});
test('late deletion never focuses a closed dialog or steals focus after reopening',async t=>{
 const s=await setup(t);s.remove(1).focus();s.remove(1).click();s.dialog.close();const outside=s.document.activeElement;await s.commit(0);assert.equal(s.document.activeElement,outside);assert.equal(s.dialog.open,false);
 await s.open();s.remove(2).focus();s.remove(2).click();s.dialog.close();await s.open();const close=s.document.activeElement;assert.equal(s.remove(2).getAttribute('aria-disabled'),'true');await s.commit(1);assert.equal(s.document.activeElement,close);assert.equal(s.row(2),undefined);
});
test('a failed delete keeps the exact row and focus, and permits an explicit retry',async t=>{
 const s=await setup(t),row=s.row(1),button=s.remove(1);button.focus();button.click();s.requests[0].reject(Error('保存失败'));await flush();assert.equal(s.row(1),row);assert.equal(s.document.activeElement,button);assert.equal(button.hasAttribute('aria-disabled'),false);assert.match(s.dialog.querySelector('.live-status').textContent,/保存失败/);button.click();await s.commit(1);assert.equal(s.row(1),undefined);
});
test('duplicate activation issues one delete; different rows may finish out of order',async t=>{
 const s=await setup(t);const first=s.remove(1);first.focus();first.click();first.click();first.dispatchEvent(new s.window.MouseEvent('click',{bubbles:true}));assert.equal(s.requests.length,1);
 const second=s.remove(2);second.focus();second.click();assert.equal(s.requests.length,2);await s.commit(1);const target=s.document.activeElement;assert.equal(target,s.row(3).querySelector('button'));await s.commit(0);assert.equal(s.document.activeElement,target);assert.equal(s.dialog.querySelectorAll('.notebook-note').length,1);
});
test('a stale list read cannot resurrect a committed deletion',async t=>{
 const s=await setup(t),snapshot=await s.vault.all('notes'),read=deferred();s.remove(1).focus();s.remove(1).click();s.vault.all=()=>read.promise;const reopening=s.open();await flush();await s.commit(0);read.resolve(snapshot);await reopening;await flush();assert.equal(s.row(1),undefined);assert.equal(s.dialog.querySelectorAll('.notebook-note').length,2);
});
test('a newer list read wins when dialog opens overlap',async t=>{
 const s=await setup(t),snapshot=await s.vault.all('notes'),reads=[deferred(),deferred()];let call=0;s.vault.all=()=>reads[call++].promise;
 await s.open();await s.open();reads[1].resolve(snapshot.slice(1));await flush();reads[0].resolve(snapshot);await flush();assert.equal(s.row(1),undefined);assert.equal(s.dialog.querySelectorAll('.notebook-note').length,2);
});
async function addNote(s,kind){
 if(kind==='import'){
  const file=s.dialog.querySelector('input[type=file]'),record={id:'new-note',path:location.pathname,title:'文章',quote:'原文',prefix:'',suffix:'',start:0,note:'新增札记',updated:100};
  Object.defineProperty(file,'files',{configurable:true,value:[{size:100,text:async()=>JSON.stringify({version:1,notes:[record]})}]});file.dispatchEvent(new s.window.Event('change'));await flush();
 }else{
  s.dialog.close();const range=s.document.createRange();range.setStart(s.document.querySelector('.article-body').firstChild,0);range.setEnd(s.document.querySelector('.article-body').firstChild,2);range.getBoundingClientRect=()=>({left:20,bottom:40});const selection=s.window.getSelection();selection.removeAllRanges();selection.addRange(range);s.document.dispatchEvent(new s.window.Event('selectionchange'));await new Promise(r=>setTimeout(r,110));
  s.document.querySelector('.selection-note').click();await flush();s.dialog.querySelector('textarea').value='新增札记';s.dialog.querySelector('.note-editor button').click();await flush();
 }
}
for(const kind of ['save','import'])for(const readFirst of [false,true])test(`${kind} additions survive when their list read ${readFirst?'finishes before':'waits across'} a delete commit`,async t=>{
 const s=await setup(t);s.remove(1).focus();s.remove(1).click();
 // Capture is opened before delaying reads, so the test targets the save/import refresh.
 const originalAll=s.vault.all,read=deferred();let snapshot;
 if(kind==='save'){
  // Opening the capture renders once, then the save renders again.
  let calls=0;s.vault.all=async store=>{const value=await originalAll(store);if(++calls===1)return value;snapshot=value;return read.promise;};
 }else s.vault.all=async store=>{snapshot=await originalAll(store);return read.promise;};
 await addNote(s,kind);assert.ok(snapshot.some(n=>n.note==='新增札记'));
 const chosen=s.remove(3);chosen.focus();
 if(readFirst){read.resolve(snapshot);await flush();await s.commit(0);}else{await s.commit(0);read.resolve(snapshot);await flush();}
 assert.equal(s.row(1),undefined);assert.ok([...s.document.querySelectorAll('.notebook-note p')].some(n=>n.textContent==='新增札记'));assert.equal(s.document.activeElement,chosen,'the independently focused row survives both completions');
});
test('a later explicit import may restore an ID deleted before that read began',async t=>{
 const s=await setup(t);const record=(await s.vault.all('notes'))[0];s.remove(1).click();await s.commit(0);await s.vault.merge('notes',[{...record,note:'重新导入'}]);await s.open();assert.equal(s.row(1).querySelector('p').textContent,'重新导入');
});
test('a refreshed record updates its quote and keeps a reordered focused row attached',async t=>{
 const s=await setup(t),row=s.row(3),control=row.querySelector('button');control.focus();const moves=[],insert=s.dialog.querySelector('.notebook-list').insertBefore.bind(s.dialog.querySelector('.notebook-list'));
 s.dialog.querySelector('.notebook-list').insertBefore=(node,before)=>{moves.push(node);return insert(node,before);};
 const record=(await s.vault.all('notes')).find(n=>n.id==='3');await s.vault.merge('notes',[{...record,quote:'改后引用',note:'改后笔记',updated:100}]);
 // Reopening triggers a refresh; put focus back before the asynchronous read completes.
 const reopening=s.open();control.focus();await reopening;assert.equal(s.row(3),row);assert.equal(row.querySelector('blockquote').textContent,'改后引用');assert.equal(row.notebookRecord.quote,'改后引用');assert.equal(s.document.activeElement,control);assert.ok(!moves.includes(row),'reordering must not detach the focused row');
 control.click();assert.equal(s.dialog.open,true,'locate must use the updated unmatched quote instead of the original matching quote');assert.match(s.dialog.querySelector('.live-status').textContent,/无法可靠定位/);
});
