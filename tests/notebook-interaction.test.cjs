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

const hexoCode='<figure class="iseeu highlight text"><table><tbody><tr><td class="gutter"><pre><span class="line">1</span><br><span class="line">2</span><br></pre></td><td class="code"><pre><span class="line">输入：12</span><br><span class="line">输出：34</span><br></pre></td></tr></tbody></table></figure>';
async function anchorSetup(t,html) {
 // Drain selectionchange's debounce before closing this DOM. An open dialog
 // keeps the capture listener inactive during teardown, as it is in the UI.
 t.after(async()=>{s.dialog.open=true;await flush();await new Promise(r=>setTimeout(r,110));});
 const s=await setup(t,0);s.document.querySelector('.article-body').innerHTML=html;
 s.window.HTMLElement.prototype.scrollIntoView=()=>{};
 const {articleText,textRange}=await import('../source/atelier/js/text-anchors.js');
 const {anchorQuote,locateQuote}=await import('../source/atelier/js/notebook-core.mjs');
 const article=s.document.querySelector('.article-body');
 const clean=articleText(article),legacy=articleText(article,{legacyCodeGutter:true});
 const add=async(id,anchor)=>{await s.vault.put('notes',{id,path:location.pathname,title:'文章',note:'保留批注',updated:100,...anchor});await s.open();};
 return {...s,article,clean,legacy,anchorQuote,locateQuote,textRange,add};
}
test('old exact gutter prefix/suffix anchors fall back to legacy text without changing their saved records',async t=>{
 const s=await anchorSetup(t,`<p>前言合法数字12</p>${hexoCode}<p>结语56</p>`);
 for(const [id,quote] of [['prefix','输入：12'],['suffix','前言合法数字12']]) {
  const start=s.legacy.text.indexOf(quote),anchor=s.anchorQuote(s.legacy.text,start,start+quote.length);
  assert.equal(s.locateQuote(s.clean.text,anchor),-1,'old gutter context requires the legacy snapshot');
  await s.add(id,anchor);const before=await s.vault.all('notes');
  s.row(id).querySelector('button').click();
  assert.equal(s.dialog.open,false);assert.equal(s.window.getSelection().toString(),quote);
  const range=s.window.getSelection().getRangeAt(0);
  assert.equal(range.startContainer.parentElement.closest('td.gutter'),null);
  assert.deepEqual(await s.vault.all('notes'),before,'locating does not rewrite old anchors');
 }
});
test('clean-only anchors locate and duplicate exact excerpts still refuse unreliable location',async t=>{
 const s=await anchorSetup(t,`<p>前言</p>${hexoCode}<p>结束</p>`);
 const start=s.clean.text.indexOf('输入：12'),anchor=s.anchorQuote(s.clean.text,start,start+5);
 assert.equal(s.locateQuote(s.legacy.text,anchor),-1);
 await s.add('clean',anchor);s.row('clean').querySelector('button').click();
 assert.equal(s.dialog.open,false);assert.equal(s.window.getSelection().toString(),'输入：12');
 s.article.innerHTML=hexoCode+hexoCode;
 await s.add('ambiguous',{quote:'输入：12',prefix:'',suffix:'',start:999});
 const before=await s.vault.all('notes');s.row('ambiguous').querySelector('button').click();
 assert.equal(s.dialog.open,true);assert.match(s.dialog.querySelector('.live-status').textContent,/无法可靠定位；摘录仍被保留/);
 assert.deepEqual(await s.vault.all('notes'),before);
});
test('changed legacy context stays unlocated even when the excerpt itself is unique',async t=>{
 const s=await anchorSetup(t,`<p>原来前言</p>${hexoCode}<p>结尾</p>`);
 const start=s.legacy.text.indexOf('输入：12'),anchor=s.anchorQuote(s.legacy.text,start,start+5);
 await s.add('changed',anchor);s.article.querySelector('p').textContent='已经修改前言';
 const before=await s.vault.all('notes');s.row('changed').querySelector('button').click();
 assert.equal(s.dialog.open,true);assert.match(s.dialog.querySelector('.live-status').textContent,/无法可靠定位/);
 assert.deepEqual(await s.vault.all('notes'),before);
});
test('new notebook capture saves clean code context and relocates real numerical text',async t=>{
 const s=await anchorSetup(t,`<p>正文数字12</p>${hexoCode}<p>尾声34</p>`);
 s.dialog.close();
 const start=s.clean.text.indexOf('输入：12'),range=s.textRange(s.clean,start,start+5);
 range.getBoundingClientRect=()=>({left:20,bottom:40});
 const selection=s.window.getSelection();selection.removeAllRanges();selection.addRange(range);
 s.document.dispatchEvent(new s.window.Event('selectionchange'));await new Promise(r=>setTimeout(r,110));
 s.document.querySelector('.selection-note').click();await flush();
 s.dialog.querySelector('textarea').value='新批注';s.dialog.querySelector('.note-editor button').click();await flush();
 const records=await s.vault.all('notes');assert.equal(records.length,1);
 const record=records[0];assert.equal(record.quote,'输入：12');assert.equal(record.prefix,'正文数字12');assert.equal(record.suffix,'输出：34尾声34');
 const before=structuredClone(record);s.row(record.id).querySelector('button').click();
 assert.equal(s.dialog.open,false);assert.equal(selection.toString(),'输入：12');
 assert.deepEqual((await s.vault.all('notes'))[0],before);
});

test('conflicting unique clean and legacy matches refuse location without changing the record',async t=>{
 const s=await anchorSetup(t,`<p>A12</p>${hexoCode}<p>A</p>${hexoCode}`);
 const anchor={quote:'输入：12',prefix:'A12',suffix:'',start:3};
 const cleanAt=s.locateQuote(s.clean.text,anchor),legacyAt=s.locateQuote(s.legacy.text,anchor);
 assert.ok(cleanAt>=0&&legacyAt>=0);
 const cleanRange=s.textRange(s.clean,cleanAt,cleanAt+anchor.quote.length),legacyRange=s.textRange(s.legacy,legacyAt,legacyAt+anchor.quote.length);
 assert.notEqual(cleanRange.startContainer,legacyRange.startContainer,'the two extraction modes genuinely disagree');
 await s.add('priority',anchor);s.row('priority').querySelector('button').click();
 assert.equal(s.dialog.open,true);
 assert.match(s.dialog.querySelector('.live-status').textContent,/无法可靠定位/);
 assert.deepEqual((await s.vault.all('notes'))[0].quote,anchor.quote);
});

test('an actual 40-character legacy anchor refuses a conflicting clean occurrence',async t=>{
 const block=hexoCode.replace('输入：12','目标摘录'+'后'.repeat(45)).replace('输出：34','');
 const s=await anchorSetup(t,`<p>${'前'.repeat(38)}12</p>${block}<p>${'前'.repeat(38)}</p>${block}`);
 const start=s.legacy.text.lastIndexOf('目标摘录'),anchor=s.anchorQuote(s.legacy.text,start,start+4);
 assert.equal(anchor.prefix.length,40);assert.equal(anchor.suffix.length,40);
 assert.equal(s.locateQuote(s.legacy.text,anchor),131);assert.equal(s.locateQuote(s.clean.text,anchor),40);
 await s.add('old-real',anchor);const before=await s.vault.all('notes');
 const selection=s.window.getSelection();selection.removeAllRanges();s.row('old-real').querySelector('button').click();
 assert.equal(s.dialog.open,true);assert.equal(selection.rangeCount,0);
 assert.match(s.dialog.querySelector('.live-status').textContent,/无法可靠定位；摘录仍被保留/);
 assert.deepEqual(await s.vault.all('notes'),before);
});
for(const mode of ['legacy','clean'])test(`${mode} ambiguity cannot be overridden by the other snapshot's unique match`,async t=>{
 const html=mode==='legacy'?`<p>12</p>${hexoCode}<p>尾声</p>${hexoCode}`:`<p>A12</p>${hexoCode}${hexoCode.replace('输入：12','A12输入：12')}`;
 const s=await anchorSetup(t,html),anchor={quote:'输入：12',prefix:mode==='legacy'?'12':'A12',suffix:'',start:0};
 const {locateQuoteCandidates}=await import('../source/atelier/js/notebook-core.mjs');
 assert.equal(locateQuoteCandidates(s.clean.text,anchor).length,mode==='clean'?2:1);
 assert.equal(locateQuoteCandidates(s.legacy.text,anchor).length,mode==='legacy'?2:1);
 await s.add('ambiguous-mode',anchor);const before=await s.vault.all('notes');s.row('ambiguous-mode').querySelector('button').click();
 assert.equal(s.dialog.open,true);assert.match(s.dialog.querySelector('.live-status').textContent,/无法可靠定位/);
 assert.deepEqual(await s.vault.all('notes'),before);
});
test('both snapshots locating the same DOM range remain usable despite shifted text offsets',async t=>{
 const s=await anchorSetup(t,`${hexoCode}<p>${'前'.repeat(45)}共同摘录${'后'.repeat(45)}</p>`);
 const start=s.clean.text.indexOf('共同摘录'),anchor=s.anchorQuote(s.clean.text,start,start+4);
 assert.equal(s.locateQuote(s.legacy.text,anchor),start+2);
 await s.add('same-range',anchor);s.row('same-range').querySelector('button').click();
 assert.equal(s.dialog.open,false);assert.equal(s.window.getSelection().toString(),'共同摘录');
});
