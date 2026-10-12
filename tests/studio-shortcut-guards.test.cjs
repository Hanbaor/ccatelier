const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module'),{pathToFileURL}=require('node:url');
const root=process.env.REPO_ROOT||path.resolve(__dirname,'..'),repoRequire=createRequire(path.join(root,'package.json'));
const ejs=repoRequire('ejs'),{JSDOM,VirtualConsole}=repoRequire('jsdom');
async function fixture(t){
 const html=ejs.render(fs.readFileSync(path.join(root,'custom/redefine/nijika/studio.ejs'),'utf8'),{theme:{nijika:{studio_art:'/atelier/images/studio.webp'}},url_for:p=>p,nijika_art_srcset:()=>'',partial:()=>''});
 const errors=[],virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(error));
 const dom=new JSDOM(html,{url:'https://atelier.test/studio/',pretendToBeVisual:true,virtualConsole}),{window}=dom,{document}=window,previous=new Map();
 for(const [key,value] of Object.entries({window,document,CustomEvent:window.CustomEvent,localStorage:window.localStorage,matchMedia:()=>({matches:true,addEventListener(){}}),devicePixelRatio:1,ResizeObserver:class{observe(){}},requestAnimationFrame:()=>0,cancelAnimationFrame(){}})){
  previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 }
 window.HTMLCanvasElement.prototype.getContext=()=>null;
 // Model the dialog state and close notification JSDOM lacks, not native focus or top-layer behavior.
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 window.HTMLDialogElement.prototype.close=function(){if(this.open){this.open=false;this.dispatchEvent(new window.Event('close'));}};
 const {AudioEngine}=await import(pathToFileURL(path.join(root,'source/atelier/js/audio-engine.js')));
 const originals=new Map(),calls={start:0,audition:[],studioStart:0};
 for(const [key,value] of Object.entries({start:async()=>{calls.start++;return false;},audition:async track=>{calls.audition.push(track.type);return false;},stop(){}})){
  originals.set(key,AudioEngine.prototype[key]);AudioEngine.prototype[key]=value;
 }
 document.addEventListener('atelier:studio-start',()=>calls.studioStart++);
 t.after(()=>{
  try{window.dispatchEvent(new window.Event('pagehide'));dom.window.close();}
  finally{for(const [key,value] of originals)AudioEngine.prototype[key]=value;for(const [key,value] of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
  // Event-listener exceptions do not escape dispatchEvent, including during pagehide cleanup.
  assert.deepEqual(errors,[],'Studio must not report unexpected JSDOM errors, including during teardown');
 });
 const {initStudio}=await import(pathToFileURL(process.env.STUDIO_SOURCE||path.join(root,'source/atelier/js/studio.js')));initStudio();
 return {document,window,calls,key(options={},target=document.body){const event=new window.KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true,...options});target.dispatchEvent(event);return event;}};
}
test('Studio fixture models dialog open state and idempotent close notifications',async t=>{
 const x=await fixture(t),dialog=x.document.createElement('dialog');x.document.body.append(dialog);let closes=0;
 dialog.addEventListener('close',()=>{closes++;assert.equal(dialog.open,false);});
 dialog.close();assert.equal(closes,0);
 dialog.showModal();assert.equal(dialog.open,true);assert.equal(dialog.hasAttribute('open'),true);
 dialog.close();assert.equal(dialog.open,false);assert.equal(dialog.hasAttribute('open'),false);assert.equal(closes,1);
 dialog.close();assert.equal(closes,1);
});
for(const [label,options] of [['already handled',{}],['composing',{isComposing:true}],['legacy composition boundary',{keyCode:229}]]){
 for(const [key,code] of [[' ','Space'],['a','KeyA']])test(`Studio ignores ${label} ${code}`,async t=>{
  const x=await fixture(t);if(label==='already handled')x.document.body.addEventListener('keydown',e=>e.preventDefault(),{once:true});
  const event=x.key({key,code,...options});
  assert.equal(x.calls.studioStart,0,'ignored key must not dispatch studio-start');assert.equal(x.calls.start,0);assert.deepEqual(x.calls.audition,[]);
  assert.equal(event.defaultPrevented,label==='already handled','Studio must not newly consume ignored input');
 });
}
test('Studio leaves Shift+Space available to native behavior',async t=>{const x=await fixture(t),event=x.key({shiftKey:true});assert.equal(x.calls.studioStart,0);assert.equal(x.calls.start,0);assert.equal(event.defaultPrevented,false);});
test('Studio retains plain Space transport',async t=>{const x=await fixture(t),event=x.key();assert.equal(x.calls.start,1);assert.equal(x.calls.studioStart,1);assert.equal(event.defaultPrevented,true);});
test('Studio retains lowercase, uppercase and Shift-letter auditions',async t=>{
 const x=await fixture(t);
 for(const shiftKey of [false,true])for(const letter of 'asdfgh')for(const key of [letter,letter.toUpperCase()])assert.equal(x.key({key,code:'Key'+letter.toUpperCase(),shiftKey}).defaultPrevented,true);
 assert.equal(x.calls.audition.length,24);assert.equal(x.calls.start,0);assert.equal(x.calls.studioStart,24);
 assert.equal(new Set(x.calls.audition).size,6);
});
for(const flag of ['repeat','ctrlKey','metaKey','altKey'])test('Studio retains '+flag+' exclusion',async t=>{const x=await fixture(t);for(const [key,code] of [[' ','Space'],['a','KeyA']])assert.equal(x.key({key,code,[flag]:true}).defaultPrevented,false);assert.equal(x.calls.studioStart,0);});
for(const tag of ['input','textarea','select','button','contenteditable'])test('Studio leaves '+tag+' input alone',async t=>{const x=await fixture(t),target=x.document.createElement(tag==='contenteditable'?'div':tag);if(tag==='contenteditable')target.contentEditable='true',target.setAttribute('contenteditable','true');x.document.body.append(target);for(const [key,code] of [[' ','Space'],['a','KeyA']])assert.equal(x.key({key,code},target).defaultPrevented,false);assert.equal(x.calls.studioStart,0);});
test('Studio retains dialog and unrelated key exclusions',async t=>{const x=await fixture(t);assert.equal(x.key({key:'z',code:'KeyZ'}).defaultPrevented,false);x.document.querySelector('dialog').open=true;for(const [key,code] of [[' ','Space'],['a','KeyA']])assert.equal(x.key({key,code}).defaultPrevented,false);assert.equal(x.calls.studioStart,0);});

test('Studio grid leaves handled, composition and browser chords alone while retaining Shift and repeat navigation',async t=>{
 const f=await fixture(t),first=f.document.querySelector('[data-studio-step="0"][data-studio-track="0"]');
 for(const key of ['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Home','End'])for(const flag of ['handled','isComposing','keyCode','ctrlKey','metaKey','altKey','AltGraph']){
  first.focus();const event=new f.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...(flag==='handled'||flag==='AltGraph'?{}:{[flag]:flag==='keyCode'?229:true})});
  if(flag==='handled')event.preventDefault();if(flag==='AltGraph')Object.defineProperty(event,'getModifierState',{value:name=>name==='AltGraph'});
  first.dispatchEvent(event);assert.equal(f.document.activeElement,first,key+' '+flag);assert.equal(event.defaultPrevented,flag==='handled');
 }
 for(const options of [{},{shiftKey:true},{repeat:true},{shiftKey:true,repeat:true}]){first.focus();const event=f.key({key:'ArrowRight',code:'ArrowRight',...options},first);assert.equal(event.defaultPrevented,true);assert.equal(f.document.activeElement.dataset.studioStep,'1');}
});
