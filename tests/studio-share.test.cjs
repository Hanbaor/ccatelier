const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ejs=require('ejs'),{JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const codec=()=>import('../source/atelier/js/studio-share.mjs');
const core=()=>import('../source/atelier/js/studio-core.mjs');
const raw=value=>'#rhythm=v1.'+Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
test('share codec exactly preserves Unicode and all 16/32-step floating-point controls',async()=>{
 const {preset}=await core(),{encodeShare,decodeShare,createShareURL}=await codec();
 for(const steps of [16,32]){
  const p=preset();p.name='夏夜 🎛️ / Café — 雨';p.steps=steps;p.bpm=123.456789;p.swing=.34567890123456;p.master=.876543210987;
  p.tracks.forEach((t,i)=>{t.volume=.1234567890123;t.pan=-.345678912345;t.tone=.987654321;t.decay=1.123456789;t.mute=i%2===0;t.solo=i===3;t.steps=Array.from({length:steps},(_,n)=>n%3===0?0:n%3===1?1:.123456789012345);});
  assert.deepEqual(decodeShare(encodeShare(p)),p);
  const url=createShareURL(p,'https://atelier.test/lab/studio/?private=secret#old','https://atelier.test/lab/studio/');
  assert.equal(new URL(url).search,'');assert.deepEqual(decodeShare(new URL(url).hash),p);assert.ok(!url.includes('secret'));
  for(const source of ['https://evil.test/lab/studio/','https://atelier.test/studio/','https://user:pass@atelier.test/lab/studio/','javascript:alert(1)'])assert.throws(()=>createShareURL(p,source,'https://atelier.test/lab/studio/'));
 }
});
test('share decoder ignores anchors and rejects malformed, oversized, unknown-version and prototype-bearing inputs',async()=>{
 const {preset}=await core(),{decodeShare,MAX_SHARE_HASH}=await codec();
 for(const hash of ['','#rhythm-desk','#other=private'])assert.equal(decodeShare(hash),null);
 for(const hash of ['#rhythm=','#rhythm=v2.e30','#rhythm=v1.a','#rhythm=v1.!!!!','#rhythm=v1.e30=','#rhythm=v1.'+'a'.repeat(MAX_SHARE_HASH),raw('not json'),raw('{}'),raw({...preset(),steps:17}),raw({...preset(),extra:'no'}),raw({...preset(),version:2}),raw(JSON.stringify(preset()).replace('"version":1','"__proto__":{},"version":1')),raw(JSON.stringify(preset()).replace('"type":"kick"','"constructor":{},"type":"kick"')),raw({...preset(),name:'a'.repeat(61)}),'#rhythm=v1._w'])assert.throws(()=>decodeShare(hash));
 const p=preset();p.tracks[0].steps[0]=2;assert.throws(()=>decodeShare(raw(p)));
});
test('shared-link UI loads silently, preserves storage, undoes, copies only on request and restores focus',async t=>{
 const {preset}=await core(),{encodeShare,decodeShare}=await codec(),incoming=preset('halftime');incoming.name='朋友的节奏 🎧';
 const html=ejs.render(read('custom/redefine/nijika/studio.ejs'),{theme:{nijika:{studio_art:'/atelier/images/studio.webp'}},url_for:p=>'/'+p.replace(/^\//,''),nijika_art_srcset:()=>'',partial:()=>''});
 const dom=new JSDOM(html,{pretendToBeVisual:true,url:'https://atelier.test/studio/?secret=hidden'+encodeShare(incoming)}),{window}=dom,{document}=window;const previous=new Map();let audio=0,writes=0,copies=0;
 for(const [name,value] of Object.entries({window,document,CustomEvent:window.CustomEvent,localStorage:window.localStorage,matchMedia:()=>({matches:true,addEventListener(){}}),devicePixelRatio:1,ResizeObserver:class{observe(){}},requestAnimationFrame:()=>0,cancelAnimationFrame(){}})){previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});}
 window.HTMLCanvasElement.prototype.getContext=()=>null;
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
 window.AudioContext=class{constructor(){audio++;throw Error('unexpected audio');}};
 const {vault}=await import('../source/atelier/js/vault.js'),oldPut=vault.put;vault.put=async()=>{writes++;};
 const oldSet=window.Storage.prototype.setItem;window.Storage.prototype.setItem=function(){writes++;};
 t.after(()=>{window.dispatchEvent(new window.Event('pagehide'));vault.put=oldPut;window.Storage.prototype.setItem=oldSet;dom.window.close();for(const [name,value] of previous){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}});
 const {initStudio}=await import('../source/atelier/js/studio.js');initStudio();initStudio();
 const q=s=>document.querySelector(s),status=q('[data-studio-status]'),share=q('[data-studio-share]');
 assert.equal(q('[data-project-name]').value,incoming.name);assert.equal(q('[data-bpm]').value,'86');assert.equal(audio,0);assert.equal(writes,0);assert.match(q('[data-share-arrival-message]').textContent,/已载入分享/);assert.equal(q('[data-share-arrival]').hidden,false);assert.ok(q('[data-share-arrival-message]').textContent.includes(incoming.name));assert.equal(document.activeElement,document.body);assert.equal(window.scrollY,0);assert.equal(q('[data-studio-undo]').disabled,false);assert.equal(document.querySelectorAll('#studio-share').length,1);
 q('[data-studio-undo]').click();assert.equal(q('[data-project-name]').value,preset().name);assert.match(status.textContent,/已撤销/);assert.equal(q('[data-share-arrival]').hidden,true);assert.equal(q('[data-share-arrival-message]').textContent,'');assert.doesNotMatch(status.textContent,/已载入分享/);
 q('[data-studio-redo]').click();assert.equal(q('[data-project-name]').value,incoming.name);
 share.focus();share.click();const dialog=q('#studio-share'),field=q('#studio-share-url'),copy=dialog.querySelector(':scope>button'),notice=dialog.querySelector('[role=status]');
 assert.equal(dialog.open,true);assert.equal(document.activeElement,copy);assert.deepEqual(decodeShare(new URL(field.value).hash),incoming);assert.equal(new URL(field.value).search,'');assert.equal(copies,0);
 copy.click();await new Promise(r=>setImmediate(r));assert.match(notice.textContent,/未能自动复制/);assert.equal(document.activeElement,field);assert.equal(field.selectionStart,0);assert.equal(field.selectionEnd,field.value.length);assert.equal(copy.disabled,false);
 Object.defineProperty(window.navigator,'clipboard',{configurable:true,value:{writeText:async text=>{copies++;assert.equal(text,field.value);}}});copy.click();await new Promise(r=>setImmediate(r));assert.match(notice.textContent,/链接已复制/);assert.equal(copies,1);
 dialog.close();assert.equal(document.activeElement,share);assert.equal(field.value,'');share.click();
 let resolve;window.navigator.clipboard.writeText=()=>new Promise(r=>{resolve=r;});copy.click();dialog.close();share.click();resolve();await new Promise(r=>setImmediate(r));assert.doesNotMatch(notice.textContent,/已复制/);assert.equal(copy.disabled,false);
 // Delayed clipboard completion must not steal focus while the page is hidden.
 copy.click();Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new window.Event('visibilitychange'));resolve();await new Promise(r=>setImmediate(r));assert.doesNotMatch(notice.textContent,/已复制/);assert.equal(copy.disabled,false);Object.defineProperty(document,'hidden',{configurable:true,value:false});
 window.history.replaceState(null,'','#rhythm=v1.bad');window.dispatchEvent(new window.HashChangeEvent('hashchange'));assert.equal(q('[data-project-name]').value,incoming.name);assert.match(status.textContent,/无效/);assert.equal(q('[data-share-arrival]').hidden,false);assert.match(q('[data-share-arrival-message]').textContent,/当前编排未改变/);
 window.history.replaceState(null,'','#rhythm-desk');window.dispatchEvent(new window.HashChangeEvent('hashchange'));assert.equal(q('[data-project-name]').value,incoming.name);
 const name=q('[data-project-name]');name.value='尚未失焦的编辑';name.dispatchEvent(new window.Event('input'));assert.equal(q('[data-share-arrival]').hidden,true);
 copy.click();
 window.history.replaceState(null,'',encodeShare(preset('blank')));window.dispatchEvent(new window.HashChangeEvent('hashchange'));assert.equal(q('[data-project-name]').value,'空白录音带');assert.equal(dialog.open,false);resolve();await new Promise(r=>setImmediate(r));assert.doesNotMatch(notice.textContent,/已复制/);q('[data-studio-undo]').click();assert.equal(q('[data-project-name]').value,'尚未失焦的编辑');
 // Incoming names are literal text, never HTML; anchor navigation leaves the project intact.
 const named=preset();named.name='<img src=x onerror=alert(1)> 节奏';window.history.replaceState(null,'',encodeShare(named));window.dispatchEvent(new window.HashChangeEvent('hashchange'));
 const arrival=q('[data-share-arrival]');assert.equal(arrival.hidden,false);assert.equal(arrival.querySelector('img'),null);assert.ok(arrival.textContent.includes(named.name));assert.equal(arrival.querySelector('a').getAttribute('href'),'#rhythm-desk');
 window.history.replaceState(null,'','#rhythm-desk');window.dispatchEvent(new window.HashChangeEvent('hashchange'));assert.equal(q('[data-project-name]').value,named.name);assert.equal(arrival.hidden,false);
 q('[data-studio-starter="blank"]').click();assert.equal(arrival.hidden,true);q('[data-studio-undo]').click();assert.equal(arrival.hidden,true);q('[data-studio-redo]').click();assert.equal(arrival.hidden,true);
 window.history.replaceState(null,'',encodeShare(named));window.dispatchEvent(new window.HashChangeEvent('hashchange'));q('[data-studio-step]').click();assert.equal(arrival.hidden,true);
 // BFCache return allows new copies, but never revives a prior asynchronous attempt.
 share.click();copy.click();const oldResolve=resolve;
 window.dispatchEvent(new window.PageTransitionEvent('pagehide',{persisted:true}));assert.equal(dialog.open,false);
 window.dispatchEvent(new window.PageTransitionEvent('pageshow',{persisted:true}));share.click();
 oldResolve();await new Promise(r=>setImmediate(r));assert.doesNotMatch(notice.textContent,/已复制/);assert.equal(copy.disabled,false);
 window.navigator.clipboard.writeText=async()=>{};copy.click();await new Promise(r=>setImmediate(r));assert.match(notice.textContent,/链接已复制/);
 window.navigator.clipboard.writeText=async()=>{throw Error('denied');};copy.click();await new Promise(r=>setImmediate(r));assert.match(notice.textContent,/未能自动复制/);assert.equal(document.activeElement,field);assert.equal(field.selectionEnd,field.value.length);
 // Native close events are queued. A later close event must not pull focus out of a newer dialog.
 const other=document.querySelector('#studio-projects'),otherFocus=other.querySelector('button');
 dialog.close=function(){this.open=false;setTimeout(()=>this.dispatchEvent(new window.Event('close')),0);};
 dialog.close();other.showModal();otherFocus.focus();await new Promise(r=>setTimeout(r,10));assert.equal(document.activeElement,otherFocus);other.close();
 // Nor may a queued close event erase a newly opened sharing snapshot.
 share.click();dialog.close();share.click();const snapshot=field.value;await new Promise(r=>setTimeout(r,10));assert.equal(field.value,snapshot);assert.equal(document.activeElement,copy);
 window.dispatchEvent(new window.Event('pagehide'));await new Promise(r=>setTimeout(r,10));assert.equal(dialog.open,false);assert.equal(audio,0);assert.equal(writes,0);
});
test('codec is only in studio route graph and included by automatic offline manifest at both roots',()=>{
 const {report}=require('../tools/module-graph.cjs'),result=report(path.resolve(__dirname,'../source'));
 assert.ok(!result.initial.files.some(f=>f.path.endsWith('studio-share.mjs')));
 for(const row of result.routes)assert.equal(row.files.some(f=>f.path.endsWith('studio-share.mjs')),row.route==='/studio/',row.route);
 const generators=new Map(),previous=globalThis.hexo;
 try{globalThis.hexo={extend:{generator:{register:(name,fn)=>generators.set(name,fn)},helper:{register(){}}}};const file=require.resolve('../scripts/live-archive.js');delete require.cache[file];require(file);
  for(const root of ['/','/preview/']){const artifacts=generators.get('live-archive').call({config:{root},base_dir:path.resolve(__dirname,'..')},{posts:{sort:()=>({toArray:()=>[]})},data:{}});const shell=JSON.parse(artifacts.find(a=>a.path==='atelier/data/offline-shell.json').data);assert.ok(shell.includes(root+'atelier/js/studio-share.mjs'));}
 }finally{if(previous===undefined)delete globalThis.hexo;else globalThis.hexo=previous;}
});

test('share arrival is hidden without JavaScript and precedes the hero with an accessible desk link',()=>{
 const html=ejs.render(read('custom/redefine/nijika/studio.ejs'),{theme:{nijika:{studio_art:'/atelier/images/studio.webp'}},url_for:p=>p,nijika_art_srcset:()=>'',partial:()=>''}),dom=new JSDOM(html),doc=dom.window.document;
 try{const arrival=doc.querySelector('[data-share-arrival]');assert.equal(arrival.hidden,true);assert.equal(arrival.nextElementSibling,doc.querySelector('.studio-mast'));assert.equal(arrival.querySelector('a').hash,'#rhythm-desk');assert.ok(doc.querySelector(arrival.querySelector('a').getAttribute('href')));assert.equal(arrival.querySelector('[role=status]').textContent,'');const css=read('source/atelier/css/studio.css');assert.match(css,/\.studio-share-arrival\[hidden\]\{display:none\}/);assert.match(css,/\.studio-share-arrival a\{[^}]*min-height:44px[^}]*font-size:13px/);assert.match(css,/\.studio-share-arrival p\{[^}]*overflow-wrap:anywhere/);}finally{dom.window.close();}
});
