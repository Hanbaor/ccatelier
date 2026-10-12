const test=require('node:test'),assert=require('node:assert/strict');

async function harness(t){
 const keys=['window','document','CustomEvent','setTimeout','clearTimeout','setInterval','clearInterval'],original=new Map(keys.map(k=>[k,global[k]]));
 const starts=[],contexts=[],timeouts=new Map(),intervals=new Map(),beats=[],steps=[];let id=0;
 const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}});
 const node=props=>({connect(){},disconnect(){},...props});
 class Context{
  constructor(){this.currentTime=0;this.state='suspended';this.sampleRate=100;this.destination=node({});contexts.push(this);}
  resume(){this.state='running';return Promise.resolve();}close(){this.state='closed';return Promise.resolve();}
  createGain(){return node({gain:param()});}createDynamicsCompressor(){return node(Object.fromEntries(['threshold','knee','ratio'].map(k=>[k,param()])));}
  createAnalyser(){return node({});}createStereoPanner(){return node({pan:param()});}
  createOscillator(){const ctx=this;return node({frequency:param(),start(at){starts.push({at,ctx});},stop(){}});}
  createBufferSource(){return this.createOscillator();}createBiquadFilter(){return node({frequency:param(),Q:param()});}
  createBuffer(_channels,length){return {getChannelData:()=>new Float32Array(length)};}
 }
 global.window={AudioContext:Context};global.document={hidden:false,dispatchEvent:e=>beats.push(e)};global.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options?.detail;}};
 global.setTimeout=(fn,delay)=>{timeouts.set(++id,{fn,delay});return id;};global.clearTimeout=key=>timeouts.delete(key);
 global.setInterval=fn=>{intervals.set(++id,fn);return id;};global.clearInterval=key=>intervals.delete(key);
 let engine;t.after(()=>{engine?.stop();for(const [key,value]of original)if(value===undefined)delete global[key];else global[key]=value;});
 const {AudioEngine}=await import('../source/atelier/js/audio-engine.js'),{preset}=await import('../source/atelier/js/studio-core.mjs');
 const project=preset('blank');project.bpm=120;project.tracks[0].steps.fill(1);
 engine=new AudioEngine(step=>steps.push(step));
 return {engine,project,starts,contexts,timeouts,intervals,beats,steps,Context,flush(){const pending=[...timeouts];for(const [key,event]of pending){timeouts.delete(key);event.fn();}}};
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} should equal ${b}`);

test('live tempo edits keep the already committed next boundary, then use new intervals',async t=>{
 const h=await harness(t);assert.equal(h.contexts.length,0);assert.equal(h.intervals.size,0);await h.engine.start(h.project);for(const time of [.1,.22,.34]){h.contexts[0].currentTime=time;h.engine.schedule();}
 assert.equal(h.starts.length,4);h.starts.forEach((n,i)=>near(n.at,.06+i*.125));
 h.engine.update({...h.project,bpm:60});h.contexts[0].currentTime=.45;h.engine.schedule();
 near(h.starts.at(-1).at,.56);
 h.contexts[0].currentTime=.7;h.engine.schedule();near(h.starts.at(-1).at,.81);
});

test('one scheduler tick recovers after a long stall instead of crawling through old loops',async t=>{
 const h=await harness(t);await h.engine.start(h.project);h.contexts[0].currentTime=120.01;h.engine.schedule();
 assert.ok(h.starts.length>1,'a current note must be scheduled on the first recovery tick');
 assert.ok(h.starts.length<=3,'missed notes must not burst');assert.ok(h.starts.at(-1).at>=120.01);
});

const resize=(p,length)=>({...p,steps:length,tracks:p.tracks.map(track=>({...track,steps:Array.from({length},(_,i)=>track.steps[i%p.steps])}))});

test('live speed-up and swing preserve the pending timestamp and the following long/short pair',async t=>{
 const h=await harness(t);await h.engine.start(h.project);
 h.engine.update({...h.project,bpm:180,swing:.6});
 h.contexts[0].currentTime=.07;h.engine.schedule();near(h.starts.at(-1).at,.185);
 // Step one is already committed at the old tempo; its outgoing swung interval is short.
 h.contexts[0].currentTime=.12;h.engine.schedule();near(h.starts.at(-1).at,.185+(15/180)*.4);
 h.contexts[0].currentTime=.24;h.engine.schedule();near(h.starts.at(-1).at,.185+(15/180)*2);
 assert.ok(h.starts.every((n,i)=>i===0||n.at>h.starts[i-1].at));
});

test('extending 16 to 32 steps at the pending wrap continues into step 16',async t=>{
 const h=await harness(t);await h.engine.start(h.project);
 for(let time=.025;time<1.89;time+=.025){h.contexts[0].currentTime=time;h.engine.schedule();}
 assert.equal(h.engine.step,16);
 const longer=resize(h.project,32);longer.tracks[0].steps[16]=0;h.engine.update(longer);
 h.contexts[0].currentTime=1.95;h.engine.schedule();assert.equal(h.engine.step,17);
 assert.equal(h.starts.length,16,'new silent step 16 must replace the pending old wrap');
 h.contexts[0].currentTime=2.06;h.flush();assert.equal(h.steps.at(-1),16);
 h.contexts[0].currentTime=2.075;h.engine.schedule();near(h.starts.at(-1).at,2.185);
});

test('shrinking 32 to 16 wraps the next unscheduled index without moving its timestamp',async t=>{
 const h=await harness(t);await h.engine.start(resize(h.project,32));
 for(let time=.025;time<2.1;time+=.025){h.contexts[0].currentTime=time;h.engine.schedule();}
 const next=h.engine.nextTime,expected=h.engine.step%16;h.engine.update(h.project);
 h.contexts[0].currentTime=next-.1;h.engine.schedule();near(h.starts.at(-1).at,next);
 h.contexts[0].currentTime=next;h.flush();assert.equal(h.steps.at(-1),expected);
});

test('delayed visual timers drop obsolete beats and never cross stop/restart generations',async t=>{
 const h=await harness(t);await h.engine.start(h.project);const oldCallbacks=[...h.timeouts.values()];
 h.contexts[0].currentTime=4;h.flush();assert.deepEqual(h.steps,[-1]);assert.equal(h.beats.filter(e=>e.type==='atelier:beat').length,0);
 h.engine.stop();assert.equal(h.timeouts.size,0);assert.equal(h.intervals.size,0);assert.equal(h.contexts[0].state,'closed');
 await h.engine.start(h.project);const stepCount=h.steps.length,beatCount=h.beats.length;oldCallbacks.forEach(event=>event.fn());
 assert.equal(h.steps.length,stepCount);assert.equal(h.beats.length,beatCount);
 h.contexts[1].currentTime=.06;h.flush();assert.equal(h.steps.at(-1),0);
});

test('visual timers wait for the AudioContext clock when audio is suspended',async t=>{
 const h=await harness(t);await h.engine.start(h.project);const ctx=h.contexts[0];ctx.state='suspended';
 h.flush();assert.deepEqual(h.steps,[-1]);assert.equal(h.timeouts.size,1);
 h.engine.schedule();assert.equal(h.starts.length,1);
 ctx.state='running';ctx.currentTime=.06;h.flush();assert.equal(h.steps.at(-1),0);assert.equal(h.timeouts.size,0);
});

test('stop during asynchronous resume cannot start audio or interfere with the replacement context',async t=>{
 const h=await harness(t);let resumeFirst;const resume=h.Context.prototype.resume;
 h.Context.prototype.resume=function(){if(h.contexts.length===1)return new Promise(resolve=>{resumeFirst=()=>{this.state='running';resolve();};});return resume.call(this);};
 const first=h.engine.start(h.project);assert.equal(h.starts.length,0);h.engine.stop();
 assert.equal(h.contexts[0].state,'closed');await h.engine.start(h.project);const second=h.engine.context;
 resumeFirst();assert.equal(await first,false);assert.equal(h.engine.context,second);assert.equal(h.starts.length,1);assert.equal(h.intervals.size,1);
});

test('hidden and failed resume starts close their contexts and leave no transport timers',async t=>{
 const h=await harness(t);document.hidden=true;assert.equal(await h.engine.start(h.project),false);
 assert.equal(h.contexts[0].state,'closed');assert.equal(h.engine.context,null);assert.equal(h.timeouts.size,0);assert.equal(h.intervals.size,0);
 document.hidden=false;h.Context.prototype.resume=()=>Promise.reject(Error('resume blocked'));
 await assert.rejects(h.engine.start(h.project),/resume blocked/);assert.equal(h.contexts[1].state,'closed');assert.equal(h.engine.context,null);
});

test('live mute and solo apply only to unscheduled notes while silent steps retain their playhead',async t=>{
 const h=await harness(t);await h.engine.start(h.project);const p=structuredClone(h.project);p.tracks[0].mute=true;h.engine.update(p);
 h.contexts[0].currentTime=.07;h.engine.schedule();assert.equal(h.starts.length,1);
 h.contexts[0].currentTime=.185;h.flush();assert.equal(h.steps.at(-1),1);
 p.tracks[0].mute=false;p.tracks[1].solo=true;h.engine.update(p);h.contexts[0].currentTime=.2;h.engine.schedule();assert.equal(h.starts.length,1);
 p.tracks[0].solo=true;h.engine.update(p);h.contexts[0].currentTime=.32;h.engine.schedule();assert.equal(h.starts.length,2);near(h.starts.at(-1).at,.435);
});

test('stall recovery stays bounded and on phase at all tempo/swing/length extremes',async t=>{
 const h=await harness(t);
 for(const bpm of [60,180])for(const swing of [0,.6])for(const length of [16,32]){
  const p={...resize(h.project,length),bpm,swing};await h.engine.start(p);const ctx=h.engine.context,started=h.starts.length;
  let advances=0;const advance=h.engine.advance;h.engine.advance=function(...args){advances++;return advance.apply(this,args);};
  ctx.currentTime=3600.007;h.engine.schedule();h.engine.advance=advance;
  assert.ok(advances<=length+8);assert.ok(h.starts.length-started<=5);assert.ok(h.engine.nextTime>ctx.currentTime+.12);
  for(const note of h.starts.slice(started)){
   assert.ok(note.at>=ctx.currentTime&&note.at<=ctx.currentTime+.12);
   if(note.at>ctx.currentTime){const unit=15/bpm,pair=(note.at-.06)/(unit*2),fraction=pair-Math.floor(pair);assert.ok(Math.min(Math.abs(fraction),Math.abs(fraction-1),Math.abs(fraction-(1+swing)/2))<1e-7);}
  }
 }
});

test('a late visual never replays the prior fast swung step after the following step began',async t=>{
 const h=await harness(t);await h.engine.start({...h.project,bpm:180,swing:.6});
 h.contexts[0].currentTime=.11;h.engine.schedule();
 h.contexts[0].currentTime=.24;h.engine.schedule();h.flush();
 assert.deepEqual(h.steps,[-1,2]);assert.deepEqual(h.beats.filter(e=>e.type==='atelier:beat').map(e=>e.detail.step),[2]);
});

test('shrinking preserves queued audio but suppresses now-out-of-range visual indices',async t=>{
 const h=await harness(t);await h.engine.start(resize(h.project,32));
 for(let time=.025;time<2.1;time+=.025){h.contexts[0].currentTime=time;h.engine.schedule();}
 const count=h.starts.length;h.engine.update(h.project);h.contexts[0].currentTime=2.185;h.flush();
 assert.equal(h.starts.length,count);assert.ok(h.steps.every(step=>step<16));
});

test('long-running fractional tempo boundaries are calculated from an anchor without per-step accumulation',async t=>{
 const h=await harness(t);await h.engine.start({...h.project,bpm:137,swing:.37});
 // Advance timing without allocating synthesizer nodes or timers for 100,000 beats.
 for(let i=0;i<100000;i++){h.engine.step%=16;h.engine.advance(h.engine.project);}
 const count=100001;near(h.engine.nextTime,.06+(count+(count%2?.37:0))*15/137);
});

test('failed pad resume releases its context so the next audition can retry cleanly',async t=>{
 const h=await harness(t),resume=h.Context.prototype.resume;
 h.Context.prototype.resume=()=>Promise.reject(Error('pad resume blocked'));
 await assert.rejects(h.engine.audition(h.project.tracks[0]),/pad resume blocked/);
 assert.equal(h.contexts[0].state,'closed');assert.equal(h.engine.context,null);
 h.Context.prototype.resume=resume;
 assert.equal(await h.engine.audition(h.project.tracks[0]),true);
 assert.equal(h.contexts.length,2);assert.equal(h.starts.length,1);
});

test('cancelled pad resume returns false and cannot touch a replacement playback',async t=>{
 const h=await harness(t),resume=h.Context.prototype.resume;let rejectFirst;
 h.Context.prototype.resume=function(){if(h.contexts.length===1)return new Promise((resolve,reject)=>{rejectFirst=reject;});return resume.call(this);};
 const pad=h.engine.audition(h.project.tracks[0]);h.engine.stop();await h.engine.start(h.project);const replacement=h.engine.context;
 rejectFirst(Error('closed while resuming'));assert.equal(await pad,false);
 assert.equal(h.engine.context,replacement);assert.equal(h.engine.playing,true);assert.equal(h.starts.length,1);assert.equal(h.intervals.size,1);
});

test('late pad resume after stop or hiding reports cancellation without a beat',async t=>{
 const h=await harness(t);let resume;
 h.Context.prototype.resume=function(){return new Promise(resolve=>{resume=()=>{if(this.state!=='closed')this.state='running';resolve();};});};
 const pad=h.engine.audition(h.project.tracks[0]);h.engine.stop();resume();assert.equal(await pad,false);
 assert.equal(h.starts.length,0);assert.equal(h.beats.filter(e=>e.type==='atelier:beat').length,0);
 const hidden=h.engine.audition(h.project.tracks[0]);document.hidden=true;resume();assert.equal(await hidden,false);
 assert.equal(h.starts.length,0);assert.equal(h.contexts[1].state,'closed');assert.equal(h.engine.context,null);
});
