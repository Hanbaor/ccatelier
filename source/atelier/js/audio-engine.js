import {stepTime,loopDuration,validateProject,encodeWav} from './studio-core.mjs';
const noiseBuffers=new WeakMap();
function noise(ctx){let buffer=noiseBuffers.get(ctx);if(!buffer){buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*1.5),ctx.sampleRate);const data=buffer.getChannelData(0);let seed=73421;for(let i=0;i<data.length;i++){seed=(seed*16807)%2147483647;data[i]=seed/1073741823.5-1;}noiseBuffers.set(ctx,buffer);}return buffer;}
function output(ctx,volume){const gain=ctx.createGain(),compressor=ctx.createDynamicsCompressor(),analyser=ctx.createAnalyser();gain.gain.value=volume*.48;compressor.threshold.value=-12;compressor.knee.value=12;compressor.ratio.value=4;analyser.fftSize=1024;gain.connect(compressor);compressor.connect(analyser);analyser.connect(ctx.destination);return {gain,analyser};}
export function synth(ctx,destination,track,time,velocity=1){
 const gain=ctx.createGain(),pan=ctx.createStereoPanner();pan.pan.value=track.pan;gain.connect(pan);pan.connect(destination);const decay=track.decay,amp=Math.max(.0001,velocity*track.volume*.8);let source,filter;
 if(['kick','tom','rim'].includes(track.type)){source=ctx.createOscillator();source.type=track.type==='rim'?'triangle':'sine';const start=track.type==='kick'?110+track.tone*90:track.type==='tom'?130+track.tone*180:600+track.tone*600;source.frequency.setValueAtTime(start,time);source.frequency.exponentialRampToValueAtTime(track.type==='kick'?35+track.tone*20:start*.45,time+decay*.6);source.connect(gain);}
 else{source=ctx.createBufferSource();source.buffer=noise(ctx);filter=ctx.createBiquadFilter();filter.type=track.type==='hat'?'highpass':'bandpass';filter.frequency.value=track.type==='hat'?4000+track.tone*6000:800+track.tone*4200;filter.Q.value=track.type==='clap'?.7:.3;source.connect(filter);filter.connect(gain);}
 const duration=track.type==='hat'?decay*.3:track.type==='rim'?decay*.18:decay;
 gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(amp,time+.003);
 if(track.type==='clap'){for(let i=1;i<=3;i++){gain.gain.setValueAtTime(amp*.2,time+i*.012);gain.gain.setValueAtTime(amp,time+i*.012+.004);}}
 gain.gain.exponentialRampToValueAtTime(.0001,time+Math.max(.05,duration));source.start(time);source.stop(time+Math.max(.05,duration)+.02);source.onended=()=>{source.disconnect();filter?.disconnect();gain.disconnect();pan.disconnect();};
}
export class AudioEngine{
 constructor(onStep=()=>{}){this.onStep=onStep;this.context=null;this.master=null;this.playing=false;this.generation=0;this.events=new Set();}
 async ready(){const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)throw Error('浏览器未提供 Web Audio');if(!this.context){this.context=new Ctx();this.master=output(this.context,.65);}if(this.context.state!=='running')await this.context.resume();return this.context;}
 async start(project){
  const clean=validateProject(project);this.stop();const token=this.generation;
  try{await this.ready();}catch(error){if(token===this.generation)this.stop();throw error;}
  if(token!==this.generation)return false;if(document.hidden){this.stop();return false;}
  this.playing=true;this.project=clean;this.master.gain.gain.value=clean.master*.48;
  this.nextTime=this.context.currentTime+.06;this.clock=null;this.step=0;this.cycle=0;this.lastVisualTime=-Infinity;
  this.timer=setInterval(()=>this.schedule(),25);this.schedule();return true;
 }
 update(project){this.project=validateProject(project);if(this.master&&this.context?.state==='running')this.master.gain.gain.setTargetAtTime(this.project.master*.48,this.context.currentTime,.02);}
 // Audio inside the lookahead is committed. Keep the next boundary fixed on edits;
 // new tempo/swing govern intervals after it, and new content starts at that boundary.
 advance(p,count=1){
  if(!this.clock||this.clock.bpm!==p.bpm||this.clock.swing!==p.swing)this.clock={time:this.nextTime,index:this.step%2,count:0,bpm:p.bpm,swing:p.swing};
  const clock=this.clock;clock.count+=count;
  // Evaluate against an anchor, rather than accumulating fractional step durations.
  this.nextTime=clock.time+stepTime(clock.index+clock.count,p.bpm,p.swing)-stepTime(clock.index,p.bpm,p.swing);this.step+=count;
 }
 visual(ctx,index,time,energy,expires){
  const token=this.generation;
  const queue=(minimum=0)=>{const event=setTimeout(()=>{
   this.events.delete(event);if(token!==this.generation||!this.playing||ctx!==this.context)return;
   // Timer delivery uses wall time; audio can be suspended or the main thread delayed.
   if(ctx.currentTime<time-.005||ctx.state!=='running'){queue(25);return;}
   if(ctx.currentTime>=expires||time<=this.lastVisualTime||index>=this.project.steps)return;
   this.lastVisualTime=time;this.onStep(index);
   if(energy)document.dispatchEvent(new CustomEvent('atelier:beat',{detail:{energy:Math.min(1,energy/2),step:index}}));
  },Math.max(minimum,(time-ctx.currentTime)*1000));this.events.add(event);};queue();
 }
 schedule(){
  if(!this.playing||!this.context||this.context.state!=='running')return;
  const ctx=this.context,p=this.project,now=ctx.currentTime,cutoff=now-.02,duration=loopDuration(p.steps,p.bpm);
  // Skip elapsed whole loops in constant time; examine at most one loop plus lookahead.
  const loops=Math.max(0,Math.floor((cutoff-this.nextTime)/duration));
  if(loops)this.advance(p,loops*p.steps);
  const solo=p.tracks.some(t=>t.solo);
  for(let count=0;count<p.steps+8&&this.nextTime<=now+.12;count++){
   if(this.step>=p.steps){this.cycle+=Math.floor(this.step/p.steps);this.step%=p.steps;}
   const index=this.step,time=this.nextTime;
   if(time>=cutoff){let energy=0;
    for(const t of p.tracks){const v=t.steps[index];if(v&&!t.mute&&(!solo||t.solo)){synth(ctx,this.master.gain,t,Math.max(time,now),v);energy+=v*t.volume;}}
    this.visual(ctx,index,time,energy,time+Math.min(.08,stepTime(index+1,p.bpm,p.swing)-stepTime(index,p.bpm,p.swing)));
   }
   this.advance(p);
  }
 }
 async audition(track){const token=this.generation;await this.ready();if(token!==this.generation||document.hidden)return;synth(this.context,this.master.gain,track,this.context.currentTime+.005,1);document.dispatchEvent(new CustomEvent('atelier:beat',{detail:{energy:track.volume,track:track.type}}));}
 stop(){this.generation++;this.playing=false;clearInterval(this.timer);this.events.forEach(clearTimeout);this.events.clear();const ctx=this.context;this.context=null;this.master=null;if(ctx&&ctx.state!=='closed')ctx.close().catch(()=>{});this.onStep(-1);document.dispatchEvent(new CustomEvent('atelier:audio-stop'));}
 get analyser(){return this.master?.analyser;}
}
export async function renderWav(project,loops=2){const p=validateProject(project);if(![1,2,4].includes(loops))throw Error('请选择 1、2 或 4 轮');const Ctx=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!Ctx)throw Error('当前浏览器不支持离线音频导出');const rate=44100,duration=loopDuration(p.steps,p.bpm),ctx=new Ctx(2,Math.ceil((duration*loops+1.25)*rate),rate),master=output(ctx,p.master),solo=p.tracks.some(t=>t.solo);for(let loop=0;loop<loops;loop++)for(let s=0;s<p.steps;s++)for(const t of p.tracks){const v=t.steps[s];if(v&&!t.mute&&(!solo||t.solo))synth(ctx,master.gain,t,loop*duration+stepTime(s,p.bpm,p.swing),v);}const buffer=await ctx.startRendering();return encodeWav([buffer.getChannelData(0),buffer.getChannelData(1)],rate);}
