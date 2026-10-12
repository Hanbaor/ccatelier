const test=require('node:test'),assert=require('node:assert/strict');
const modules=async()=>({...await import('../source/atelier/js/studio-core.mjs'),...await import('../source/atelier/js/studio-midi.mjs'),...await import('../source/atelier/js/studio-midi-import.mjs')});
const vlq=n=>{const a=[n&127];while((n=Math.floor(n/128)))a.unshift((n&127)|128);return a;};
const u32=n=>[n>>>24,n>>>16&255,n>>>8&255,n&255];
const chunk=(tag,data)=>[...Buffer.from(tag),...u32(data.length),...data];
const smf=(tracks,{format=tracks.length===1?0:1,ppq=960}={})=>Uint8Array.from([...chunk('MThd',[0,format,0,tracks.length,ppq>>8,ppq&255]),...tracks.flatMap(t=>chunk('MTrk',t))]);
const event=(tick,data)=>({tick,data});
const end=(tick=3840)=>event(tick,[255,47,0]);
const tempo=(n=500000,tick=0)=>event(tick,[255,81,3,n>>>16,n>>>8&255,n&255]);
const sig=()=>event(0,[255,88,4,4,2,24,8]);
const on=(tick,n=36,v=127)=>event(tick,[153,n,v]);
const off=(tick,n=36,v=0)=>event(tick,[137,n,v]);
const track=events=>{let previous=0;return events.flatMap(e=>{const d=e.tick-previous;previous=e.tick;return [...vlq(d),...e.data];});};
// Independent event reader for encoder output. Compare musical events, not metadata labels.
function music(bytes){const b=Buffer.from(bytes),out=[];let p=22,tick=0;const variable=()=>{let n=0,c;do{c=b[p++];n=n*128+(c&127);}while(c&128);return n;};while(p<b.length){tick+=variable();const status=b[p++];if(status===255){const type=b[p++],len=variable(),data=[...b.subarray(p,p+len)];p+=len;if(type===81||type===47)out.push([tick,status,type,...data]);}else out.push([tick,status,b[p++],b[p++]]);}return out;}

test('360 exported arrangements round trip every on/off, tempo and full EOT',async()=>{
 const {preset,encodeMidi,parseDrumMidi}=await modules();let count=0;
 for(const steps of [16,32])for(const loops of [1,2,4])for(const swing of [0,.01,.3456789,.6])for(const bpm of [60,123.456789,180])for(const mode of ['full','sparse','blank','mute','solo']){
  const p=preset('blank');Object.assign(p,{steps,swing,bpm});
  p.tracks.forEach((t,i)=>{t.steps=Array.from({length:steps},(_,s)=>mode==='blank'?0:mode==='sparse'?(s%4===0?1:0):[1,.5,.000001,0][(s+i)%4]);t.mute=mode==='mute'&&i%2===0;t.solo=mode==='solo'&&i===2;});
  const original=encodeMidi(p,loops),result=parseDrumMidi(original);
  assert.equal(result.requiresGateConfirmation,false,JSON.stringify({steps,loops,swing,bpm,mode}));
  assert.deepEqual(music(encodeMidi(result.project,result.loops)),music(original));assert.ok(result.summary.every(s=>typeof s==='string'));count++;
 }
 assert.equal(count,360);
});

test('SMF1 conductor, separate drums and trailing silence retain full duration',async()=>{
 const {parseDrumMidi,encodeMidi}=await modules();const input=smf([track([tempo(),sig(),end(0)]),track([on(0),off(120),end(7680)]),track([on(3840,38,64),off(3960,38),end(3960)])]);
 const r=parseDrumMidi(input);assert.equal(r.project.steps,32);assert.equal(r.loops,1);assert.equal(r.project.tracks[1].steps[16],64/127);assert.equal(music(encodeMidi(r.project,r.loops)).at(-1)[0],7680);
});

test('running status and zero-velocity on as off work; metadata clears running status',async()=>{
 const {parseDrumMidi}=await modules();const data=[0,153,36,100,...vlq(120),36,0,...vlq(3720),255,47,0];const r=parseDrumMidi(smf([data]));assert.equal(r.project.tracks[0].steps[0],100/127);
 assert.throws(()=>parseDrumMidi(smf([[0,153,36,100,0,255,1,0,...vlq(120),36,0,...vlq(3720),255,47,0]])),/running status/);
});

test('every positive velocity is preserved and external gates/releases require confirmation',async()=>{
 const {parseDrumMidi}=await modules();for(let v=1;v<=127;v++){const r=parseDrumMidi(smf([track([on(0,36,v),off(120),end()])]));assert.equal(r.project.tracks[0].steps[0],v/127);}
 for(const [tick,velocity] of [[121,0],[120,64],[20,127]])assert.equal(parseDrumMidi(smf([track([on(0),off(tick,36,velocity),end()])])).requiresGateConfirmation,true);
});

test('tempo defaults are explicit, duplicate declarations allowed, late changes rejected',async()=>{
 const {parseDrumMidi}=await modules();const r=parseDrumMidi(smf([track([end()])]));assert.equal(r.project.bpm,120);assert.match(r.summary.join(' '),/默认 120 BPM/);assert.match(r.summary.join(' '),/默认 4\/4/);
 assert.equal(parseDrumMidi(smf([track([tempo(333333),tempo(333333,100),end()])])).project.bpm,180);
 assert.equal(parseDrumMidi(smf([track([tempo(500000,100),end()])])).project.bpm,120);
 for(const events of [[tempo(600000,100),end()],[tempo(),tempo(600000,100),end()],[tempo(333332),end()],[tempo(1000001),end()],[tempo(0),end()]])assert.throws(()=>parseDrumMidi(smf([track(events)])));
});

test('exact PPQ normalization permits equivalent grids but never snaps humanized data',async()=>{
 const {parseDrumMidi}=await modules();assert.equal(parseDrumMidi(smf([track([on(192),off(240),end(1920)])],{ppq:480})).project.swing,.6);
 for(const data of [[on(1),off(121),end()],[on(385),off(400),end()],[on(240),off(360),on(721,38),off(800,38),end()]])assert.throws(()=>parseDrumMidi(smf([track(data)])));
 assert.throws(()=>parseDrumMidi(smf([track([on(1),off(61),end(1920)])],{ppq:1000})),/精确|时长/);
});

test('full repetition chooses shortest legal arrangement, preserves nonrepeated second half and rejects truncation',async()=>{
 const {parseDrumMidi}=await modules();const sequence=[];for(let i=0;i<8;i++)sequence.push(on(i*3840),off(i*3840+120));sequence.push(end(30720));const r=parseDrumMidi(smf([track(sequence)]));assert.equal(r.project.steps,32);assert.equal(r.loops,4);
 const half=parseDrumMidi(smf([track([on(3840),off(3960),end(7680)])]));assert.equal(half.project.steps,32);assert.equal(half.project.tracks[0].steps[16],1);
 for(const ticks of [0,3839,3841,11520,34560])assert.throws(()=>parseDrumMidi(smf([track([end(ticks)])])));
 assert.throws(()=>parseDrumMidi(smf([track([on(0),off(120),end(15360)])])),/非重复/);
 // Gate lengths may differ between repeated loops only after explicit conversion.
 assert.equal(parseDrumMidi(smf([track([on(0),off(120),on(3840),off(4000),end(7680)])])).requiresGateConfirmation,true);
});

test('overlapping, duplicate, dangling, orphan and zero-length notes reject whole input',async()=>{
 const {parseDrumMidi}=await modules();for(const data of [[on(0),on(0),off(120),end()],[on(0),on(240),off(360),end()],[on(0),end()],[off(120),end()],[on(0),off(0),end()]]){
  assert.throws(()=>parseDrumMidi(smf([track(data)])));
 }
 assert.throws(()=>parseDrumMidi(smf([track([on(0),off(120),end()]),track([on(0),off(120),end()])])));
});

test('reject unsupported musical events, channels, drums, meter and semantic metadata',async()=>{
 const {parseDrumMidi}=await modules();for(const bytes of [[144,36,100],[153,40,100],[185,7,100],[201,1],[217,100],[233,0,64],[169,36,100],[240,1,247],[255,88,4,3,2,24,8],[255,84,5,0,0,0,0,0],[255,89,2,0,0]])assert.throws(()=>parseDrumMidi(smf([track([event(0,bytes),end()])])));
});

test('strict binary bounds, header, EOT, VLQ and event/file/track budgets',async()=>{
 const {parseDrumMidi,MIDI_IMPORT_MAX_BYTES}=await modules();const valid=smf([track([end()])]);
 for(let i=0;i<valid.length;i++)assert.throws(()=>parseDrumMidi(valid.slice(0,i)));
 const changed=(at,value)=>{const b=valid.slice();b[at]=value;return b;};
 for(const b of [changed(0,82),changed(7,7),changed(9,2),changed(11,0),changed(12,128),changed(12,0).map((v,i)=>i===13?0:v),changed(21,255),Uint8Array.from([...valid,0]),new Uint8Array(MIDI_IMPORT_MAX_BYTES+1)])assert.throws(()=>parseDrumMidi(b));
 for(const data of [[128,0,255,47,0],[129,128,128,128,0,255,47,0],[0,255,47,1,0],[0,255,47,0,0,255,1,0],[0,255,1,0],[0,153,128,100,0,255,47,0]])assert.throws(()=>parseDrumMidi(smf([data])));
 assert.throws(()=>parseDrumMidi(smf(Array.from({length:17},()=>track([end()])))));
 const many=Array.from({length:10000},()=>[0,255,1,0]).flat();many.push(...track([end()]));assert.throws(()=>parseDrumMidi(smf([many])),/10000/);
 assert.throws(()=>parseDrumMidi('MThd'));assert.throws(()=>parseDrumMidi(null));
 assert.deepEqual(parseDrumMidi(valid.buffer),parseDrumMidi(valid));
});


test('inclusive limits accept 16 tracks, 10000 events and 256 KiB without unbounded work',async()=>{
 const {parseDrumMidi,MIDI_IMPORT_MAX_BYTES}=await modules();
 assert.equal(parseDrumMidi(smf(Array.from({length:16},()=>track([end()])))).project.steps,16);
 const events=Array.from({length:9999},()=>[0,255,1,0]).flat();events.push(...track([end()]));assert.equal(parseDrumMidi(smf([events])).loops,1);
 const padding=MIDI_IMPORT_MAX_BYTES-33,data=[0,255,1,...vlq(padding),...Array(padding).fill(65),...track([end()])];const exact=smf([data]);assert.equal(exact.length,MIDI_IMPORT_MAX_BYTES);assert.equal(parseDrumMidi(exact).loops,1);
});

test('metadata is bounded and cannot supply a project name or alter semantic settings',async()=>{
 const {parseDrumMidi}=await modules();const text=Buffer.from('<script>alert(1)</script>');const r=parseDrumMidi(smf([track([event(0,[255,3,text.length,...text]),end()])]));assert.equal(r.project.name,'导入的 MIDI 鼓点');
 for(const bytes of [[255,81,2,1,2],[255,88,4,4,2,24,0],[255,88,4,4,2,0,8],[255,127,0],[255,128,0]])assert.throws(()=>parseDrumMidi(smf([track([event(0,bytes),end()])])));
});


test('same-tick events retain track order and ambiguous cross-track drum transitions reject',async()=>{
 const {parseDrumMidi}=await modules();
 const overlap=track([on(0,36,100),on(240,36,90),off(240),off(360),end()]);
 assert.throws(()=>parseDrumMidi(smf([overlap])),/重叠/);
 const valid=track([on(0,36,100),off(240),on(240,36,90),off(360),end()]);
 const r=parseDrumMidi(smf([valid]));assert.equal(r.project.tracks[0].steps[1],90/127);assert.equal(r.requiresGateConfirmation,true);
 assert.throws(()=>parseDrumMidi(smf([track([on(0,36,100),on(240,36,90),on(240,36,0),on(360,36,0),end()])])),/重叠/);
 assert.equal(parseDrumMidi(smf([track([on(0,36,100),on(240,36,0),on(240,36,90),on(360,36,0),end()])])).project.tracks[0].steps[1],90/127);
 const first=track([on(0),off(240),end()]),second=track([on(240),off(360),end()]);
 for(const tracks of [[first,second],[second,first]])assert.throws(()=>parseDrumMidi(smf(tracks)),/歧义/);
 const different=track([on(240,38),off(360,38),end()]);assert.equal(parseDrumMidi(smf([first,different])).project.tracks[1].steps[1],1);
});
