import {synth} from './audio-engine.js';
const midi = note => 440 * 2 ** ((note - 69) / 12);
// No context exists until the explicit sound control is pressed.
export class LivehouseAudio {
 constructor(){this.context=null;this.master=null;this.analyser=null;this.volume=.3;this.generation=0;}
 async enable(){
  const token=++this.generation,Ctx=window.AudioContext||window.webkitAudioContext;
  if(!Ctx)throw Error('当前浏览器不支持音频，仍可体验静音舞台。');
  const ctx=this.context||new Ctx();this.context=ctx;
  if(!this.master){
   const master=ctx.createGain(),limiter=ctx.createDynamicsCompressor(),analyser=ctx.createAnalyser();
   master.gain.value=this.volume*.7;limiter.threshold.value=-15;limiter.knee.value=15;limiter.ratio.value=8;limiter.attack.value=.004;limiter.release.value=.18;analyser.fftSize=256;
   master.connect(limiter);limiter.connect(analyser);analyser.connect(ctx.destination);this.master=master;this.limiter=limiter;this.analyser=analyser;this.createVoiceBus();
  }
  await ctx.resume();
  if(token!==this.generation||ctx!==this.context){if(ctx.state!=='closed')ctx.close().catch(()=>{});return false;}
  return ctx.state==='running';
 }
 setVolume(value){this.volume=Math.max(0,Math.min(.6,Number(value)||0));if(this.context&&this.master)this.master.gain.setTargetAtTime(this.volume*.7,this.context.currentTime,.035);}
 click(strong=false,delay=0){
  const ctx=this.context;if(!ctx||ctx.state!=='running'||!this.master)return;
  const osc=ctx.createOscillator(),gain=ctx.createGain(),at=ctx.currentTime+Math.max(0,delay);
  osc.type='sine';osc.frequency.value=strong?1400:1000;gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.12,at+.002);gain.gain.exponentialRampToValueAtTime(.0001,at+.035);
  osc.connect(gain);gain.connect(this.voiceBus||this.master);osc.start(at);osc.stop(at+.04);osc.onended=()=>{osc.disconnect();gain.disconnect();};
 }
 hit(instrument,velocity=1,note=48,delay=0){
  const ctx=this.context;if(!ctx||ctx.state!=='running'||!this.master)return;
  const at=ctx.currentTime+Math.max(0,delay),destination=this.voiceBus||this.master;
  if(instrument==='bass'||instrument==='chord'){
   const bass=instrument==='bass',notes=bass?[note]:[note,note+7,note+12,note+16];
   notes.forEach((pitch,i)=>{
    const osc=ctx.createOscillator(),gain=ctx.createGain(),filter=ctx.createBiquadFilter();
    osc.type=bass?'triangle':'sine';osc.frequency.value=midi(pitch);osc.detune.value=bass?0:(i%2?4:-4);filter.type='lowpass';filter.frequency.value=bass?650:1800;
    const duration=bass?.45:1.95,level=velocity*(bass?.18:.055);gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(Math.max(.0001,level),at+(bass?.008:.075));gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    osc.connect(filter);filter.connect(gain);gain.connect(destination);osc.start(at);osc.stop(at+duration+.03);osc.onended=()=>{osc.disconnect();filter.disconnect();gain.disconnect();};
   });
  }else {
   const type=instrument==='crash'?'hat':instrument;
   if(!['kick','snare','hat','tom'].includes(type))return;
   synth(ctx,destination,{type,pan:type==='hat'?.3:type==='tom'?-.28:0,tone:instrument==='crash'?.35:type==='tom'?.35:.45,decay:instrument==='crash'?1.2:type==='kick'?.32:type==='hat'?.2:.25,volume:instrument==='crash'?.32:type==='hat'?.3:.65},at,Math.max(0,Math.min(1,velocity)));
  }
 }
 cancelScheduled(){if(!this.context||!this.master)return;if(this.voiceBus)this.voiceBus.disconnect();else {return this.createVoiceBus();}this.createVoiceBus();}
 createVoiceBus(){this.voiceBus=this.context.createGain();this.voiceBus.gain.value=1;this.voiceBus.connect(this.master);}
 stop(){this.generation++;const ctx=this.context;this.context=null;this.master=null;this.voiceBus=null;this.analyser=null;if(ctx&&ctx.state!=='closed')ctx.close().catch(()=>{});}
}
