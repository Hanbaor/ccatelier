const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ejs=require('ejs'),{JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function file(bytes,extra={}){const b=Buffer.from(bytes);return {name:'misleading.json',type:'application/json',size:b.length,slice:(a,z)=>({arrayBuffer:async()=>Uint8Array.from(b.subarray(a,z)).buffer}),arrayBuffer:async()=>Uint8Array.from(b).buffer,text:async()=>b.toString(),...extra};}
async function setup(t){
 const html=ejs.render(read('custom/redefine/nijika/studio.ejs'),{theme:{nijika:{studio_art:'/atelier/images/studio.webp'}},url_for:p=>p,nijika_art_srcset:()=>'',partial:()=>''});
 const dom=new JSDOM(html,{pretendToBeVisual:true,url:'https://atelier.test/studio/'}),{window}=dom,{document}=window,previous=new Map();
 for(const [name,value] of Object.entries({window,document,CustomEvent:window.CustomEvent,localStorage:window.localStorage,matchMedia:()=>({matches:true,addEventListener(){}}),devicePixelRatio:1,ResizeObserver:class{observe(){}},requestAnimationFrame:()=>0,cancelAnimationFrame(){}})){previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});}
 window.HTMLCanvasElement.prototype.getContext=()=>null;window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
 let audio=0,writes=0,stops=0;window.AudioContext=class{constructor(){audio++;throw Error('unexpected audio');}};
 const {AudioEngine}=await import('../source/atelier/js/audio-engine.js'),oldStop=AudioEngine.prototype.stop;AudioEngine.prototype.stop=function(){stops++;return oldStop.call(this);};
 const {vault}=await import('../source/atelier/js/vault.js'),oldPut=vault.put;vault.put=async()=>{writes++;};const oldSet=window.Storage.prototype.setItem;window.Storage.prototype.setItem=function(){writes++;};
 t.after(()=>{window.dispatchEvent(new window.Event('pagehide'));AudioEngine.prototype.stop=oldStop;vault.put=oldPut;window.Storage.prototype.setItem=oldSet;dom.window.close();for(const [name,value] of previous){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}});
 const {initStudio}=await import('../source/atelier/js/studio.js');initStudio();initStudio();const q=s=>document.querySelector(s),input=q('[data-project-import]');
 const select=f=>{Object.defineProperty(input,'files',{configurable:true,value:f?[f]:[]});input.dispatchEvent(new window.Event('change',{bubbles:true}));};
 const change=(s,value,type='change')=>{q(s).value=value;q(s).dispatchEvent(new window.Event(type,{bubbles:true}));};
 const {preset}=await import('../source/atelier/js/studio-core.mjs'),{encodeMidi}=await import('../source/atelier/js/studio-midi.mjs');
 return {q,window,document,select,change,preset,encodeMidi,counts:()=>({audio,writes,stops})};
}
// Construct using an explicit event list, including the entire 3840-tick duration.
function gated(){const events=Buffer.from([0,0x99,36,127,60,0x89,36,0,0x9d,0x44,0xff,0x2f,0]);const h=Buffer.from('4d546864000000060000000103c04d54726b00000000','hex');h.writeUInt32BE(events.length,18);return Buffer.concat([h,events]);}

test('shared input sniffs MIDI magic, imports once, restores loops with undo/redo and retains JSON support',async t=>{
 const {q,select,change,preset,encodeMidi,counts}=await setup(t),original=q('[data-project-name]').value,p=preset('halftime');
 assert.match(q('.studio-import').textContent,/导入 JSON \/ MIDI/);assert.match(q('[data-project-import]').accept,/\.mid/);
 select(file(encodeMidi(p,4)));await flush();assert.equal(q('[data-export-loops]').value,'4');assert.equal(q('[data-bpm]').value,'86');assert.match(q('[data-studio-status]').textContent,/重复 4 轮已折叠.*可撤销/);assert.equal(q('[data-project-import]').value,'');assert.deepEqual(counts(),{audio:0,writes:0,stops:1});
 q('[data-studio-undo]').click();assert.equal(q('[data-project-name]').value,original);assert.equal(q('[data-export-loops]').value,'2');assert.equal(q('[data-studio-undo]').disabled,true);q('[data-studio-redo]').click();assert.equal(q('[data-export-loops]').value,'4');
 // Identical project with only recording length different is a real undo step.
 select(file(encodeMidi(p,1)));await flush();assert.equal(q('[data-export-loops]').value,'1');q('[data-studio-undo]').click();assert.equal(q('[data-export-loops]').value,'4');q('[data-studio-redo]').click();assert.equal(q('[data-export-loops]').value,'1');
 change('[data-export-loops]','2');select(file(encodeMidi(p,4)));await flush();q('[data-studio-undo]').click();assert.equal(q('[data-export-loops]').value,'2');
 // Branch after undo drops the old redo and preserves the correct loops.
 const json=preset('blank');json.name='<img src=x onerror=alert(1)>';select(file(JSON.stringify(json),{name:'actually-json.mid'}));await flush();assert.equal(q('[data-project-name]').value,json.name);assert.equal(q('[data-studio-redo]').disabled,true);assert.equal(q('[data-export-loops]').value,'2');assert.equal(q('[data-studio-status] img'),null);
 q('[data-studio-undo]').click();assert.equal(q('[data-export-loops]').value,'2');q('[data-studio-redo]').click();assert.equal(q('[data-project-name]').value,json.name);
});

test('gate confirmation is keyboard-cancellable, non-mutating until accepted and returns focus',async t=>{
 const {q,select,window,counts}=await setup(t),name=q('[data-project-name]').value;
 select(file(gated()));await flush();const dialog=q('#studio-midi-import');assert.ok(dialog.open);assert.match(dialog.textContent,/保留敲击力度与节奏/);assert.equal(window.document.activeElement,q('[data-import-cancel]'));assert.deepEqual(counts(),{audio:0,writes:0,stops:0});assert.equal(q('[data-studio-undo]').disabled,true);
 dialog.dispatchEvent(new window.Event('cancel',{cancelable:true}));await flush();assert.equal(dialog.open,false);assert.equal(q('[data-project-name]').value,name);assert.equal(window.document.activeElement,q('[data-project-import]'));assert.equal(counts().stops,0);
 select(file(gated()));await flush();q('[data-import-confirm]').click();await flush();assert.equal(dialog.open,false);assert.equal(counts().stops,1);assert.equal(q('[data-studio-play]').getAttribute('aria-pressed'),'false');assert.match(q('[data-studio-status]').textContent,/默认 120 BPM.*默认 4\/4/);q('[data-studio-undo]').click();assert.equal(q('[data-project-name]').value,name);assert.equal(q('[data-studio-undo]').disabled,true);
});

test('invalid, oversized and cancelled inputs never stop or overwrite current work',async t=>{
 const {q,select,preset,encodeMidi,counts}=await setup(t),name=q('[data-project-name]').value;
 for(const f of [file('bad JSON'),file('MThd'),file(encodeMidi(preset()),{size:256*1024+1,arrayBuffer:()=>{throw Error('must not read large MIDI');}}),file('{}',{size:5*1024*1024+1,text:()=>{throw Error('must not read large JSON');}})]){select(f);await flush();assert.match(q('[data-studio-status]').textContent,/未导入/);assert.equal(q('[data-project-name]').value,name);assert.equal(q('[data-studio-undo]').disabled,true);assert.deepEqual(counts(),{audio:0,writes:0,stops:0});}
 const status=q('[data-studio-status]').textContent;select(null);await flush();assert.equal(q('[data-studio-status]').textContent,status);
});

test('new selection, edits, navigation and dialog dismissal invalidate every older async import',async t=>{
 const {q,select,change,window,document,preset,encodeMidi,counts}=await setup(t),a=preset(),b=preset('halftime');b.name='新选择';
 const late=deferred();select(file(encodeMidi(a),{arrayBuffer:()=>late.promise}));await flush();select(file(JSON.stringify(b)));await flush();const receipt=q('[data-studio-status]').textContent;late.reject(Error('old read failure'));await flush();assert.equal(q('[data-project-name]').value,b.name);assert.equal(q('[data-studio-status]').textContent,receipt);
 const older=deferred();select(file(encodeMidi(a),{arrayBuffer:()=>older.promise}));await flush();select(file(JSON.stringify(b)));await flush();older.resolve(encodeMidi(a).buffer);await flush();assert.equal(q('[data-project-name]').value,b.name);
 const slow=deferred();select(file(encodeMidi(a),{arrayBuffer:()=>slow.promise}));await flush();change('[data-project-name]','输入尚未提交','input');slow.resolve(encodeMidi(a).buffer);await flush();assert.equal(q('[data-project-name]').value,'输入尚未提交');
 for(const interrupt of [()=>q('#studio-midi-import').close(),()=>q('[data-studio-starter="blank"]').click(),()=>q('[data-studio-undo]').click(),()=>window.dispatchEvent(new window.HashChangeEvent('hashchange')),()=>document.dispatchEvent(new window.CustomEvent('atelier:practice-start')),()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new window.Event('visibilitychange'));},()=>window.dispatchEvent(new window.Event('pagehide'))]){
  Object.defineProperty(document,'hidden',{configurable:true,value:false});window.dispatchEvent(new window.Event('pageshow'));select(file(gated()));await flush();assert.equal(q('#studio-midi-import').open,true);interrupt();const after=q('[data-project-name]').value;q('[data-import-confirm]').click();await flush();assert.equal(q('[data-project-name]').value,after);assert.equal(q('#studio-midi-import').open,false);
 }
 assert.equal(counts().audio,0);assert.equal(counts().writes,0);
});

test('recording length history stays aligned beyond eighty snapshots',async t=>{
 const {q,select,change,preset,encodeMidi}=await setup(t);
 for(let i=0;i<84;i++)change('[data-bpm]',String(70+i));change('[data-export-loops]','1');select(file(encodeMidi(preset('halftime'),4)));await flush();q('[data-studio-undo]').click();assert.equal(q('[data-bpm]').value,'153');assert.equal(q('[data-export-loops]').value,'1');q('[data-studio-redo]').click();assert.equal(q('[data-export-loops]').value,'4');
});

test('MIDI parsing remains a relative lazy dependency outside the initial and static studio graph',()=>{
 const source=read('source/atelier/js/studio.js');assert.match(source,/await import\('\.\/studio-midi-import\.mjs'\)/);assert.doesNotMatch(source,/^import .*studio-midi-import/m);
 const {report}=require('../tools/module-graph.cjs'),r=report(path.resolve(__dirname,'../source'));assert.ok(!r.initial.files.some(f=>f.path.endsWith('studio-midi-import.mjs')));for(const row of r.routes)assert.ok(!row.files.some(f=>f.path.endsWith('studio-midi-import.mjs')));
});


test('failed and cancelled imports leave an already-playing transport untouched',async t=>{
 const {q,select,counts}=await setup(t),{AudioEngine}=await import('../source/atelier/js/audio-engine.js'),oldStart=AudioEngine.prototype.start;
 AudioEngine.prototype.start=async function(){this.playing=true;return true;};t.after(()=>{AudioEngine.prototype.start=oldStart;});
 q('[data-studio-play]').click();await flush();assert.equal(q('[data-studio-play]').getAttribute('aria-pressed'),'true');const before=counts().stops;
 select(file('invalid'));await flush();assert.equal(counts().stops,before);assert.equal(q('[data-studio-play]').getAttribute('aria-pressed'),'true');
 select(file(gated()));await flush();assert.equal(q('[data-studio-play]').getAttribute('aria-pressed'),'true');q('[data-import-cancel]').click();await flush();assert.equal(counts().stops,before);assert.equal(q('[data-studio-play]').getAttribute('aria-pressed'),'true');
 select(file(gated()));await flush();q('[data-import-confirm]').click();await flush();assert.equal(counts().stops,before+1);assert.equal(q('[data-studio-play]').getAttribute('aria-pressed'),'false');
});


test('new play, stop or audition intent cancels an older pending import',async t=>{
 const {q,select,preset,encodeMidi,counts}=await setup(t),{AudioEngine}=await import('../source/atelier/js/audio-engine.js'),oldStart=AudioEngine.prototype.start,oldAudition=AudioEngine.prototype.audition;
 AudioEngine.prototype.start=async function(){this.playing=true;return true;};AudioEngine.prototype.audition=async()=>{};
 t.after(()=>{AudioEngine.prototype.start=oldStart;AudioEngine.prototype.audition=oldAudition;});
 const original=q('[data-project-name]').value;
 for(const selector of ['[data-studio-play]','[data-studio-stop]','.track-name>button']){
  q('[data-studio-stop]').click();const delayed=deferred(),bytes=encodeMidi(preset('halftime'));
  select(file(bytes,{arrayBuffer:()=>delayed.promise}));await flush();q(selector).click();await flush();const stops=counts().stops,playing=q('[data-studio-play]').getAttribute('aria-pressed'),status=q('[data-studio-status]').textContent;
  delayed.resolve(bytes.buffer);await flush();assert.equal(q('[data-project-name]').value,original);assert.equal(counts().stops,stops);assert.equal(q('[data-studio-play]').getAttribute('aria-pressed'),playing);assert.equal(q('[data-studio-status]').textContent,status);assert.equal(q('[data-studio-undo]').disabled,true);
 }
});


test('tempo display is concise without rounding the project or re-exported MIDI tempo',async t=>{
 const {q,select,preset,encodeMidi,window,counts}=await setup(t),blobs=[],oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL,oldTimeout=globalThis.setTimeout;
 URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:test-tempo';};URL.revokeObjectURL=()=>{};window.HTMLAnchorElement.prototype.click=function(){};
 globalThis.setTimeout=(fn,ms,...args)=>{const timer=oldTimeout(fn,ms,...args);if(ms===30000)timer.unref();return timer;};
 t.after(()=>{URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;globalThis.setTimeout=oldTimeout;});
 const {AudioEngine}=await import('../source/atelier/js/audio-engine.js'),oldStart=AudioEngine.prototype.start;
 AudioEngine.prototype.start=async function(){this.playing=true;this.cycle=0;return true;};
 t.after(()=>{AudioEngine.prototype.start=oldStart;});
 const tempo=bytes=>{const b=Buffer.from(bytes),at=b.indexOf(Buffer.from([0xff,0x51,3]));assert.ok(at>=0);return b.readUIntBE(at+3,3);};
 for(const [bpm,display] of [[86,'86'],[123.456789,'123.457']]){
  const p=preset('halftime');p.bpm=bpm;const original=encodeMidi(p,1),expectedTempo=tempo(original),exactBpm=60000000/expectedTempo;
  select(file(original));await flush();assert.equal(q('[data-bpm]').value,display);
  assert.ok(q('[data-studio-overview]').textContent.startsWith(display+' BPM · '));
  assert.ok(q('[data-studio-status]').textContent.includes(' · '+display+' BPM；'));
  q('[data-studio-play]').click();await flush();assert.equal(q('[data-studio-play]').getAttribute('aria-pressed'),'true');
  assert.equal(q('[data-studio-time]').textContent,'LOOP 01 · '+display+' BPM');assert.equal(counts().audio,0);
  q('[data-project-export]').click();const saved=JSON.parse(await blobs.at(-1).text());assert.equal(saved.bpm,exactBpm);assert.notEqual(saved.bpm,Number(display));
  q('[data-midi-export]').click();assert.equal(tempo(await blobs.at(-1).arrayBuffer()),expectedTempo);
 }
});
