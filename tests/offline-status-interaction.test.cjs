const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const source=fs.readFileSync('source/atelier/js/offline.js','utf8').replace(/^import[^\n]+\n/gm,'').replace('export function','function');
function setup(t,{article=true,path='/lab/a/',initialRows=[]}={}){
 const dom=new JSDOM(`<body><button class="offline-open">书架</button>${article?'<button data-offline-save><span>⇩</span>离线保存</button>':''}</body>`,{url:'https://example.test'+path});
 const {window}=dom,{document}=window,reads=[],mutations=[],notices=[],requests=[];let rows=initialRows,defer=false,readError=null;
 const element=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
 const action=(label,fn)=>{const el=element('button','',label);el.addEventListener('click',fn);return el;};
 const message=data=>{
  requests.push(data);
  if(data.type==='list'){const snapshot={rows:rows.map(row=>({...row})),...(!data.metadataOnly?{bytes:2*1024*1024}:{})};if(defer)return new Promise((resolve,reject)=>reads.push({resolve,reject,snapshot}));return readError?Promise.reject(readError):Promise.resolve(snapshot);}
  return new Promise((resolve,reject)=>mutations.push({data,resolve,reject})).finally(()=>document.dispatchEvent(new window.CustomEvent('atelier:offline')));
 };
 const context=vm.createContext({document,window,location:window.location,navigator:window.navigator,element,action,message,toast:message=>notices.push(message),makeDialog:()=>{const dialog=element('dialog');document.body.append(dialog);return{dialog,open:()=>{dialog.open=true;}};}});
 vm.runInContext(source,context);context.initOffline();
 t.after(()=>window.close());
 return{window,document,reads,mutations,notices,requests,button:document.querySelector('[data-offline-save]'),set rows(value){rows=value;},set defer(value){defer=value;},set readError(value){readError=value;},notify:()=>document.dispatchEvent(new window.CustomEvent('atelier:offline')),open:()=>document.querySelector('.offline-open').click(),control:label=>[...document.querySelectorAll('dialog button')].find(el=>el.textContent===label)};
}
const row=path=>({path,title:'Article',updated:1700000000000});
test('save, shelf remove, clear and cross-page changes synchronize the article button',async t=>{
 const app=setup(t);await tick();const original=app.button.innerHTML;
 app.button.click();app.button.click();assert.equal(app.mutations.length,1);assert.equal(app.button.disabled,true);assert.equal(app.button.textContent,'保存中…');
 app.rows=[row('/lab/a/')];app.mutations.shift().resolve({});await tick();assert.equal(app.button.textContent,'✓ 已离线保存');assert.equal(app.button.disabled,false);
 app.open();await tick();app.control('移除').click();assert.equal(app.mutations[0].data.type,'remove');app.rows=[];app.mutations.shift().resolve({});await tick();assert.equal(app.button.innerHTML,original);assert.match(app.document.querySelector('dialog').textContent,/0 篇/);
 app.rows=[row('/lab/a/'),row('/lab/b/')];app.notify();await tick();assert.equal(app.button.textContent,'✓ 已离线保存');
 app.control('释放全部离线空间').click();assert.equal(app.mutations[0].data.type,'clear');app.rows=[];app.mutations.shift().resolve({});await tick();assert.equal(app.button.innerHTML,original);assert.match(app.document.querySelector('dialog').textContent,/0 篇/);
 app.rows=[row('/lab/b/')];app.notify();await tick();assert.equal(app.button.innerHTML,original,'another article does not mark this one saved');
});
test('initial, focus and restored-page reads reflect saved state; failures preserve known state',async t=>{
 const app=setup(t,{initialRows:[row('/lab/a/')]});await tick();assert.equal(app.button.textContent,'✓ 已离线保存');
 app.button.click();app.mutations.shift().reject(Error('download failed'));await tick();assert.equal(app.button.textContent,'✓ 已离线保存');assert.equal(app.button.disabled,false);assert.ok(app.notices.includes('download failed'));
 app.open();await tick();for(const label of ['移除','释放全部离线空间']){app.control(label).click();app.mutations.shift().reject(Error('mutation failed'));await tick();assert.equal(app.button.textContent,'✓ 已离线保存');assert.equal(app.control(label).disabled,false);}
 app.readError=Error('list failed');app.notify();await tick();assert.equal(app.button.textContent,'✓ 已离线保存');
 app.readError=null;app.rows=[];app.window.dispatchEvent(new app.window.Event('focus'));await tick();assert.match(app.button.textContent,/离线保存/);assert.doesNotMatch(app.button.textContent,/已离线保存/);
 const original=app.button.innerHTML;app.button.click();app.mutations.shift().reject(Error('save failed'));await tick();assert.equal(app.button.innerHTML,original);
 app.rows=[row('/lab/a/')];app.window.dispatchEvent(new app.window.Event('pageshow'));await tick();assert.equal(app.button.textContent,'✓ 已离线保存');
});
test('late list success or failure cannot override newer mutations, shelf state or saving feedback',async t=>{
 const app=setup(t);await tick();app.open();await tick();app.defer=true;app.rows=[row('/lab/a/')];app.notify();const stale=app.reads.shift();
 app.rows=[];app.notify();app.reads.shift().resolve({rows:[],bytes:0});await tick();stale.resolve(stale.snapshot);await tick();assert.doesNotMatch(app.button.textContent,/已离线保存/);assert.match(app.document.querySelector('dialog').textContent,/0 篇/);
 app.notify();const staleError=app.reads.shift();app.notify();app.reads.shift().resolve({rows:[],bytes:0});await tick();staleError.reject(Error('stale failure'));await tick();assert.doesNotMatch(app.document.querySelector('dialog').textContent,/stale failure/);
 app.notify();const beforeSave=app.reads.shift();app.button.click();beforeSave.resolve({rows:[row('/lab/a/')],bytes:1});await tick();assert.equal(app.button.textContent,'保存中…');
 app.rows=[row('/lab/a/')];app.mutations.shift().resolve({});await tick();assert.equal(app.button.textContent,'保存中…');const pending=app.reads.splice(0);app.rows=[];app.notify();app.reads.shift().resolve({rows:[],bytes:0});await tick();for(const read of pending)read.resolve({rows:[row('/lab/a/')],bytes:1});await tick();assert.equal(app.button.disabled,false);assert.doesNotMatch(app.button.textContent,/已离线保存/);assert.match(app.document.querySelector('dialog').textContent,/0 篇/);
});
test('pages without article controls stay lazy until the shelf is opened',async t=>{
 const app=setup(t,{article:false});app.defer=true;app.notify();app.window.dispatchEvent(new app.window.Event('focus'));await tick();assert.equal(app.reads.length,0);app.open();assert.equal(app.reads.length,1);app.reads.shift().resolve({rows:[],bytes:0});await tick();
});

test('article status reads only metadata; opening the shelf requests complete storage totals',async t=>{
 const app=setup(t,{initialRows:[row('/lab/a/')]});await tick();assert.equal(app.button.textContent,'✓ 已离线保存');assert.ok(app.requests.length>0);assert.ok(app.requests.every(request=>request.type==='list'&&request.metadataOnly===true));
 app.window.dispatchEvent(new app.window.Event('focus'));app.notify();await tick();assert.ok(app.requests.every(request=>request.metadataOnly===true));
 app.open();await tick();assert.equal(app.requests.at(-1).type,'list');assert.equal(app.requests.at(-1).metadataOnly,undefined);assert.match(app.document.querySelector('dialog').textContent,/1 篇 · 2.0 MB/);
 app.document.querySelector('dialog').open=false;app.window.dispatchEvent(new app.window.Event('focus'));await tick();assert.equal(app.requests.at(-1).metadataOnly,true);
});
