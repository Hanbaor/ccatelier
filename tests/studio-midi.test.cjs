const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const core=()=>import('../source/atelier/js/studio-core.mjs');
const midi=()=>import('../source/atelier/js/studio-midi.mjs');

// Independent binary SMF reader: bounds, chunks, VLQs, running status and MIDI
// data bytes are parsed rather than comparing the encoder to its own helpers.
function parse(bytes){
 const b=Buffer.from(bytes);let p=0;
 const take=n=>{assert.ok(p+n<=b.length,'truncated file');const out=b.subarray(p,p+n);p+=n;return out;};
 assert.equal(take(4).toString(),'MThd');assert.equal(take(4).readUInt32BE(),6);
 const format=take(2).readUInt16BE(),tracks=take(2).readUInt16BE(),division=take(2).readUInt16BE();
 assert.equal(format,0);assert.equal(tracks,1);assert.equal(division&0x8000,0);
 assert.equal(take(4).toString(),'MTrk');const length=take(4).readUInt32BE(),end=p+length;assert.equal(end,b.length);
 function variable(){let value=0;for(let i=0;i<4;i++){const byte=take(1)[0];assert.ok(p<=end);if(i===0&&byte===128)assert.fail('noncanonical VLQ');value=value*128+(byte&127);if(byte<128)return value;}assert.fail('VLQ longer than four bytes');}
 const events=[];let tick=0,running=null;
 while(p<end){const delta=variable();tick+=delta;let status=take(1)[0];if(status<128){assert.ok(running);p--;status=running;}else if(status<240)running=status;
  if(status===255){running=null;const type=take(1)[0],data=[...take(variable())];events.push({tick,delta,meta:type,data});if(type===47){assert.equal(data.length,0);assert.equal(p,end,'end-of-track must be final');}}
  else{assert.ok(status>=128&&status<240);const kind=status>>4,channel=status&15,data=[...take(kind===12||kind===13?1:2)];assert.ok(data.every(v=>v<128));events.push({tick,delta,kind,channel,data});}
  assert.ok(p<=end);
 }
 assert.equal(events.at(-1).meta,47);return {division,events};
}
const on=result=>result.events.filter(e=>e.kind===9);
function balanced(result){const active=new Set();for(const e of result.events){if(e.kind===9){assert.equal(e.channel,9);assert.ok(e.data[1]>0);assert.ok(!active.has(e.data[0]),'note overlaps its retrigger');active.add(e.data[0]);}else if(e.kind===8){assert.equal(e.channel,9);assert.ok(active.delete(e.data[0]),'unmatched note off');assert.equal(e.data[1],0);}}assert.equal(active.size,0);}

test('SMF format 0 has declared chunks, GM channel 10 map, tempo, 4/4 and end-of-track',async()=>{
 const {preset}=await core(),{encodeMidi}=await midi(),p=preset('blank');p.bpm=120;p.tracks.forEach(t=>t.steps[0]=1);
 const result=parse(encodeMidi(p,1));assert.equal(result.division,960);
 assert.deepEqual(result.events.filter(e=>e.meta===81).map(e=>[e.tick,e.data]),[[0,[7,161,32]]]);
 assert.deepEqual(result.events.find(e=>e.meta===88).data,[4,2,24,8]);
 assert.equal(Buffer.from(result.events.find(e=>e.meta===3).data).toString(),'CC Atelier Drums');
 assert.deepEqual(on(result).map(e=>e.data),[[36,127],[38,127],[42,127],[39,127],[45,127],[37,127]]);
 assert.equal(result.events.at(-1).tick,3840);balanced(result);
});

test('16/32 steps × 1/2/4 loops preserve live swing, tempo, velocities and exact loop end',async()=>{
 const {preset,stepTime,loopDuration}=await core(),{encodeMidi}=await midi();
 for(const steps of [16,32])for(const loops of [1,2,4])for(const swing of [0,.3456789,.6])for(const bpm of [60,123.456789,180]){
  const p=preset('blank');p.steps=steps;p.bpm=bpm;p.swing=swing;p.tracks.forEach(t=>t.steps=Array(steps).fill(0));p.tracks[0].steps=Array.from({length:steps},(_,s)=>s%3===0?1:s%3===1?.5:.000001);
  const before=structuredClone(p),result=parse(encodeMidi(p,loops)),notes=on(result);assert.deepEqual(p,before);assert.equal(notes.length,steps*loops);
  for(let i=0;i<notes.length;i++){const loop=Math.floor(i/steps),s=i%steps,ticks=notes[i].tick;
   const expectedSeconds=loop*loopDuration(steps,bpm)+stepTime(s,bpm,swing);
   assert.ok(Math.abs(ticks/960*60/bpm-expectedSeconds)<=.50001/960*60/bpm);
   assert.equal(notes[i].data[1],[127,64,1][s%3]);
  }
  const tempo=result.events.find(e=>e.meta===81).data.reduce((n,v)=>n*256+v,0);assert.equal(tempo,Math.round(60000000/bpm));
  assert.equal(result.events.at(-1).tick,steps*240*loops);balanced(result);
 }
});

test('mute overrides solo, a muted solo silences other tracks, blank files retain duration',async()=>{
 const {preset}=await core(),{encodeMidi}=await midi(),p=preset();p.tracks[0].solo=true;p.tracks[0].mute=true;
 assert.equal(on(parse(encodeMidi(p))).length,0);
 p.tracks[1].solo=true;const solo=on(parse(encodeMidi(p)));assert.ok(solo.length);assert.ok(solo.every(e=>e.data[0]===38));
 p.tracks.forEach(t=>{t.mute=true;});assert.equal(on(parse(encodeMidi(p))).length,0);
 const blank=parse(encodeMidi(preset('blank'),4));assert.equal(blank.events.at(-1).tick,15360);assert.equal(on(blank).length,0);
});

test('simultaneous note-offs precede retriggers and even maximum swing has no hanging last notes',async()=>{
 const {preset}=await core(),{encodeMidi}=await midi(),p=preset('blank');p.swing=.6;p.tracks.forEach(t=>t.steps.fill(1));
 const r=parse(encodeMidi(p,4));balanced(r);
 const at480=r.events.filter(e=>e.tick===480);assert.deepEqual(at480.map(e=>e.kind),[8,8,8,8,8,8,9,9,9,9,9,9]);
 const last=r.events.at(-1).tick;assert.ok(r.events.filter(e=>e.kind===8).every(e=>e.tick<=last));
});

test('binary reader checks long VLQs independently and catches malformed output',async()=>{
 const {preset}=await core(),{encodeMidi}=await midi();
 const p=preset('blank');p.steps=32;p.tracks.forEach(t=>t.steps=Array(32).fill(0));
 const data=encodeMidi(p,4),r=parse(data);assert.equal(r.events.at(-1).delta,30720);
 // 30,720 ticks is a three-byte, big-endian VLQ: 81 F0 00.
 assert.deepEqual([...data.slice(-6)],[0x81,0xf0,0,255,47,0]);
 const broken=Uint8Array.from(data);broken[21]--;assert.throws(()=>parse(broken));assert.throws(()=>parse(data.slice(0,-1)));
});

test('invalid project and loop boundaries fail; mixer changes do not pretend to reproduce synth audio',async()=>{
 const {preset}=await core(),{encodeMidi}=await midi();
 for(const loops of [0,-1,3,5,Infinity,NaN,'2',null])assert.throws(()=>encodeMidi(preset(),loops));
 for(const patch of [{bpm:59},{bpm:181},{bpm:NaN},{swing:-.1},{swing:.61},{steps:17},{master:2}])assert.throws(()=>encodeMidi({...preset(),...patch}));
 const p=preset(),a=encodeMidi(p);p.master=0;p.tracks.forEach(t=>{t.volume=0;t.pan=-1;t.tone=1;t.decay=1.2;});assert.deepEqual(encodeMidi(p),a);
 p.tracks[0].steps[0]=1.1;assert.throws(()=>encodeMidi(p));
});

test('explicit MIDI clicks snapshot current edits and length without audio, storage or history writes',async t=>{
 const ejs=require('ejs'),{JSDOM}=require('jsdom'),read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 const html=ejs.render(read('custom/redefine/nijika/studio.ejs'),{theme:{nijika:{studio_art:'/atelier/images/studio.webp'}},url_for:p=>'/'+p.replace(/^\//,''),nijika_art_srcset:()=>'',partial:()=>''});
 const dom=new JSDOM(html,{pretendToBeVisual:true,url:'https://atelier.test/lab/studio/'}),{window}=dom,{document}=window,previous=new Map();let audio=0,writes=0;const downloads=[],blobs=[];
 for(const [name,value] of Object.entries({window,document,CustomEvent:window.CustomEvent,localStorage:window.localStorage,matchMedia:()=>({matches:true,addEventListener(){}}),devicePixelRatio:1,ResizeObserver:class{observe(){}},requestAnimationFrame:()=>0,cancelAnimationFrame(){}})){previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});}
 window.HTMLCanvasElement.prototype.getContext=()=>null;window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
 window.AudioContext=window.OfflineAudioContext=class{constructor(){audio++;throw Error('unexpected audio');}};
 const {vault}=await import('../source/atelier/js/vault.js'),oldPut=vault.put;vault.put=async()=>{writes++;};
 const oldSet=window.Storage.prototype.setItem;window.Storage.prototype.setItem=function(){writes++;};
 const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:export-'+blobs.length;};URL.revokeObjectURL=()=>{};
 window.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,href:this.href});};
 t.after(()=>{window.dispatchEvent(new window.Event('pagehide'));vault.put=oldPut;window.Storage.prototype.setItem=oldSet;URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;dom.window.close();for(const [name,value] of previous){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}});
 const {initStudio}=await import('../source/atelier/js/studio.js');initStudio();initStudio();const q=s=>document.querySelector(s),button=q('[data-midi-export]');
 assert.equal(downloads.length,0);assert.equal(button.type,'button');assert.equal(q('#studio-midi-note').id,button.getAttribute('aria-describedby'));assert.match(q('#studio-midi-note').textContent,/音色、效果与混音不随文件保存/);
 const change=(selector,value,type='change')=>{q(selector).value=value;q(selector).dispatchEvent(new window.Event(type,{bubbles:true}));};
 change('[data-step-count]','32');change('[data-bpm]','137');change('[data-swing]','60','input');change('[data-export-loops]','4');q('[data-studio-track="0"][data-studio-step="1"]').click();
 const undo=q('[data-studio-undo]').disabled,redo=q('[data-studio-redo]').disabled;
 // Do not retain the download helper's 30-second URL cleanup timer in Node.
 const oldTimeout=globalThis.setTimeout;globalThis.setTimeout=(fn,ms,...args)=>{const timer=oldTimeout(fn,ms,...args);if(ms===30000)timer.unref();return timer;};
 try{button.click();button.click();}finally{globalThis.setTimeout=oldTimeout;}
 assert.equal(downloads.length,2);assert.ok(downloads.every(d=>d.name==='cc-rhythm.mid'));assert.equal(blobs[0].type,'audio/midi');assert.deepEqual(await blobs[0].arrayBuffer(),await blobs[1].arrayBuffer());
 const r=parse(new Uint8Array(await blobs[0].arrayBuffer()));assert.equal(r.events.at(-1).tick,30720);assert.ok(on(r).some(e=>e.tick===384&&e.data[0]===36));
 assert.equal(q('[data-studio-undo]').disabled,undo);assert.equal(q('[data-studio-redo]').disabled,redo);assert.equal(audio,0);assert.equal(writes,0);assert.match(q('[data-studio-status]').textContent,/4 轮/);assert.equal(q('[data-studio-play]').getAttribute('aria-pressed'),'false');
 // Invalid length is reported without creating a Blob or triggering a download.
 change('[data-export-loops]','invalid');button.click();assert.equal(downloads.length,2);assert.match(q('[data-studio-status]').textContent,/请选择/);
});

test('MIDI is studio-only, root-relative-module safe and included in the offline manifest',()=>{
 const repo=path.resolve(__dirname,'..'),{report}=require('../tools/module-graph.cjs'),r=report(path.join(repo,'source'));
 assert.ok(!r.initial.files.some(f=>f.path.endsWith('studio-midi.mjs')));for(const row of r.routes)assert.equal(row.files.some(f=>f.path.endsWith('studio-midi.mjs')),row.route==='/studio/',row.route);
 const generators=new Map(),previous=globalThis.hexo;
 try{globalThis.hexo={extend:{generator:{register:(name,fn)=>generators.set(name,fn)},helper:{register(){}}}};const file=require.resolve('../scripts/live-archive.js');delete require.cache[file];require(file);
  for(const root of ['/','/preview/']){const artifacts=generators.get('live-archive').call({config:{root},base_dir:repo},{posts:{sort:()=>({toArray:()=>[]})},data:{}});const shell=JSON.parse(artifacts.find(a=>a.path==='atelier/data/offline-shell.json').data);assert.ok(shell.includes(root+'atelier/js/studio-midi.mjs'));}
 }finally{if(previous===undefined)delete globalThis.hexo;else globalThis.hexo=previous;}
});
