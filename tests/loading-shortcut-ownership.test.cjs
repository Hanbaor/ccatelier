const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module'),{pathToFileURL}=require('node:url');
const root=process.env.REPO_ROOT||path.resolve(__dirname,'..'),req=createRequire(path.join(root,'package.json'));
const {JSDOM}=req('jsdom'),ejs=req('ejs');
async function fixture(t,owner){
 const html=ejs.render(fs.readFileSync(path.join(root,'custom/redefine/nijika/studio.ejs'),'utf8'),{theme:{nijika:{studio_art:'/atelier/images/studio.webp'}},url_for:p=>p,nijika_art_srcset:()=>'',partial:()=>''});
 const dom=new JSDOM(html+'<dialog></dialog>',{url:'https://atelier.test/studio/',pretendToBeVisual:true}),{window}=dom,doc=window.document,previous=new Map();
 for(const [key,value] of Object.entries({window,document:doc,CustomEvent:window.CustomEvent,localStorage:window.localStorage,matchMedia:()=>({matches:true,addEventListener(){}}),devicePixelRatio:1,ResizeObserver:class{observe(){}},requestAnimationFrame:()=>0,cancelAnimationFrame(){}})){
  previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 }
 window.HTMLCanvasElement.prototype.getContext=()=>null;
 const {AudioEngine}=await import(pathToFileURL(path.join(root,'source/atelier/js/audio-engine.js'))),originals=new Map(),calls={start:0,audition:0,studioStart:0};
 for(const [key,value] of Object.entries({start:async()=>{calls.start++;return false;},audition:async()=>{calls.audition++;return false;},stop(){}})){originals.set(key,AudioEngine.prototype[key]);AudioEngine.prototype[key]=value;}
 doc.addEventListener('atelier:studio-start',()=>calls.studioStart++);
 let ownerCalls=0;
 if(owner==='earlier-document-capture')doc.addEventListener('keydown',e=>{ownerCalls++;e.preventDefault();},true);
 const {startFeature,routeFeatures}=await import(pathToFileURL(process.env.ROUTE_SOURCE||path.join(root,'source/atelier/js/route-features.js')));
 let resolve;const pending=new Promise(yes=>{resolve=yes;});
 const record=startFeature(routeFeatures.find(f=>f.id==='studio'),{root:doc,load:()=>pending});
 if(owner==='later-document-capture')doc.addEventListener('keydown',e=>{ownerCalls++;e.preventDefault();},true);
 if(owner==='target')doc.body.addEventListener('keydown',e=>{ownerCalls++;e.preventDefault();});
 const module=await import(pathToFileURL(process.env.STUDIO_SOURCE||path.join(root,'source/atelier/js/studio.js')));
 t.after(()=>{window.dispatchEvent(new window.Event('pagehide'));for(const [key,value] of originals)AudioEngine.prototype[key]=value;window.close();for(const [key,value] of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
 return {doc,calls,owners:()=>ownerCalls,notice:()=>doc.querySelector('[data-feature-status=studio]'),async ready(){resolve(module);assert.equal((await record.ready).status,'ready');},key(options={},target=doc.body){const {altGraph=false,...rest}=options,event=new window.KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true,...rest});if(altGraph)Object.defineProperty(event,'getModifierState',{value:key=>key==='AltGraph'});target.dispatchEvent(event);return event;}};
}
const keys=[['Space',{key:' ',code:'Space'}],['A',{key:'a',code:'KeyA'}]];
for(const [label,options] of [['already cancelled',{}],['legacy IME',{keyCode:229}],['composition',{isComposing:true}],['repeat',{repeat:true}],['Control',{ctrlKey:true}],['Meta',{metaKey:true}],['Alt',{altKey:true}]])for(const [key,keyOptions] of keys)test(`pending route leaves ${label} ${key} unclaimed`,async t=>{
 const x=await fixture(t,label==='already cancelled'?'earlier-document-capture':undefined),event=x.key({...keyOptions,...options});
 const captured={prevented:event.defaultPrevented,className:x.notice().className};await x.ready();
 assert.deepEqual(x.calls,{start:0,audition:0,studioStart:0});
 assert.equal(captured.prevented,label==='already cancelled');assert.equal(captured.className,'sr-only');assert.equal(x.notice(),null,'unclaimed key must not prompt a second gesture');
 assert.equal(x.key({...keyOptions,...options}).defaultPrevented,label==='already cancelled');assert.deepEqual(x.calls,{start:0,audition:0,studioStart:0},'ready phase must reject the same input');
});
test('pending route preserves Shift+Space',async t=>{const x=await fixture(t),event=x.key({shiftKey:true});await x.ready();assert.equal(event.defaultPrevented,false);assert.equal(x.notice(),null);assert.equal(x.calls.studioStart,0);assert.equal(x.key({shiftKey:true}).defaultPrevented,false);assert.equal(x.calls.studioStart,0);});
for(const [label,options] of [...keys,['Shift+A',{key:'A',code:'KeyA',shiftKey:true}]])test(`pending ${label} prompts, never replays; fresh key performs`,async t=>{
 const x=await fixture(t),event=x.key(options);assert.equal(event.defaultPrevented,true);assert.match(x.notice().textContent,/正在加载，请稍候/);await x.ready();assert.deepEqual(x.calls,{start:0,audition:0,studioStart:0});assert.match(x.notice().textContent,/已就绪.*再次/);x.key(options);assert.equal(x.calls.studioStart,1);assert.equal(x.calls.start,label==='Space'?1:0);assert.equal(x.calls.audition,label==='Space'?0:1);
});
for(const owner of ['target','later-document-capture'])test(`capture cannot observe future ${owner} cancellation`,async t=>{const x=await fixture(t,owner);x.key();assert.equal(x.owners(),0,'route capture currently claims before later handlers can run');await x.ready();assert.equal(x.calls.studioStart,0);assert.match(x.notice().textContent,/再次/);x.key();assert.equal(x.owners(),1);assert.equal(x.calls.studioStart,0,'ready bubble handler can see cancellation that pending capture cannot');});
for(const tag of ['input','textarea','select','button','div'])test(`pending route preserves editable/control ${tag}`,async t=>{const x=await fixture(t),target=x.doc.createElement(tag);if(tag==='div')target.setAttribute('contenteditable','true');x.doc.body.append(target);for(const [,options] of keys)assert.equal(x.key(options,target).defaultPrevented,false);await x.ready();assert.equal(x.notice(),null);assert.equal(x.calls.studioStart,0);});
test('pending route preserves dialog and unrelated keys',async t=>{const x=await fixture(t);assert.equal(x.key({key:'z',code:'KeyZ'}).defaultPrevented,false);x.doc.querySelector('dialog').open=true;for(const [,options] of keys)assert.equal(x.key(options).defaultPrevented,false);await x.ready();assert.equal(x.notice(),null);assert.equal(x.calls.studioStart,0);});
for(const cancel of ['pagehide','atelier:dialog-open','visibilitychange'])test(`pending gesture cancelled by ${cancel} never replays or prompts`,async t=>{const x=await fixture(t);x.key();if(cancel==='visibilitychange')Object.defineProperty(x.doc,'hidden',{value:true,configurable:true});const target=cancel==='pagehide'?x.doc.defaultView:x.doc;target.dispatchEvent(new x.doc.defaultView.Event(cancel));await x.ready();assert.equal(x.calls.studioStart,0);assert.equal(x.notice(),null);});
