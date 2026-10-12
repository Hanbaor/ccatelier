const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('incomplete shelf row reports recovery actions and never reasserts a known broken saved status from lightweight metadata',async t=>{
 const dom=new JSDOM('<button class="offline-open">书架</button><button data-offline-save>离线保存</button>',{url:'https://offline.test/a/'}),{window}=dom,{document}=window;t.after(()=>window.close());
 const row={path:'/a/',title:'A',updated:1700000000000,snapshot:'copy-1'},calls=[];let incomplete=true;
 const element=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;},action=(label,fn)=>{const button=element('button','',label);button.addEventListener('click',fn);return button;};
 const message=async data=>{calls.push(data);if(data.type==='list')return{rows:[{...row,...(!data.metadataOnly&&incomplete?{unavailable:true}:{})}],bytes:40};if(data.type==='save'){row.snapshot='copy-2';incomplete=false;}return{};};
 const context=vm.createContext({document,window,navigator:window.navigator,location:window.location,element,action,message,toast(){},makeDialog(){const dialog=document.createElement('dialog');document.body.append(dialog);return{dialog,open(){dialog.open=true;}};}});
 vm.runInContext(fs.readFileSync('source/atelier/js/offline.js','utf8').replace(/^import[^\n]+\n/gm,'').replace('export function','function'),context);context.initOffline();await tick();
 document.querySelector('.offline-open').click();await tick();const dialog=document.querySelector('dialog'),save=document.querySelector('[data-offline-save]');
 assert.match(dialog.textContent,/副本不完整，可更新或移除/);assert.doesNotMatch(save.textContent,/已离线保存/);assert.equal(dialog.querySelector('a').getAttribute('href'),'/a/');
 for(const label of ['更新','移除'])assert.ok([...dialog.querySelectorAll('button')].some(button=>button.textContent===label));
 assert.ok(calls.every(call=>call.type==='list'),'listing does not silently mutate');
 dialog.open=false;window.dispatchEvent(new window.Event('focus'));await tick();assert.doesNotMatch(save.textContent,/已离线保存/);
 dialog.open=true;[...dialog.querySelectorAll('button')].find(button=>button.textContent==='更新').click();await tick();assert.match(save.textContent,/已离线保存/);assert.doesNotMatch(dialog.textContent,/副本不完整/);
});

test('corrupt metadata never becomes a shelf navigation link or breaks metadata-only status',async t=>{
 const dom=new JSDOM('<button class="offline-open">书架</button><button data-offline-save>离线保存</button>',{url:'https://offline.test/a/'}),{window}=dom,{document}=window;t.after(()=>window.close());
 const element=(tag,cls,text)=>{const el=document.createElement(tag);el.className=cls;if(text!==undefined)el.textContent=text;return el;},action=(label,fn)=>{const el=element('button','',label);el.addEventListener('click',fn);return el;};
 const context=vm.createContext({document,window,navigator:window.navigator,location:window.location,element,action,toast(){},message:async()=>({rows:[null,{path:'javascript:alert(1)',title:'Bad'},{path:'https://evil.test/',title:'Foreign'},{path:'/api/private/',title:'Private'}],bytes:0}),makeDialog(){const dialog=document.createElement('dialog');document.body.append(dialog);return{dialog,open(){dialog.open=true;}};}});
 vm.runInContext(fs.readFileSync('source/atelier/js/offline.js','utf8').replace(/^import[^\n]+\n/gm,'').replace('export function','function'),context);context.initOffline();await tick();document.querySelector('.offline-open').click();await tick();
 assert.equal(document.querySelectorAll('dialog a').length,0);assert.match(document.querySelector('dialog').textContent,/记录损坏/);assert.doesNotMatch(document.querySelector('[data-offline-save]').textContent,/已离线保存/);
});
