import {validateProject,stepTime} from './studio-core.mjs';

// SMF 1.0 / GM Level 1: https://midi.org/standard-midi-files-specification
// https://midi.org/general-midi-level-1
// Readable IMA specification mirror, sections 1.1, 2.1, 3.1 and Appendix 1.5:
// https://www.cs.cmu.edu/~music/cmp/archives/cmsip/readings/Standard-MIDI-file-format-updated.pdf
// Format 0, one percussion track, channel 10 (zero-based channel 9).
// Only note timing/velocity is portable: synth tone, decay, pan, volume and
// master effects are deliberately not represented as misleading GM controls.
// Timing error: <= 0.5 tick (<= 0.521 ms at 60 BPM), plus <= 0.5 us
// per quarter-note from integer tempo. Velocity is quantized to 7 bits,
// with positive sub-1/127 notes retained at 1 rather than MIDI note-off 0.
const PPQ=960,STEP_TICKS=PPQ/4;
const DRUM_NOTES=Object.freeze({kick:36,snare:38,hat:42,clap:39,tom:45,rim:37});
function vlq(value){
 if(!Number.isInteger(value)||value<0||value>0x0fffffff)throw Error('MIDI 时间超出范围');
 const bytes=[value&127];while((value=Math.floor(value/128))>0)bytes.unshift((value&127)|128);return bytes;
}
const ascii=text=>Array.from(text,c=>c.charCodeAt(0));
const uint32=value=>[value>>>24,(value>>>16)&255,(value>>>8)&255,value&255];

export function encodeMidi(project,loops=2){
 const p=validateProject(project);
 if(![1,2,4].includes(loops))throw Error('请选择 1、2 或 4 轮');
 const tempo=Math.round(60000000/p.bpm),end=p.steps*STEP_TICKS*loops;
 const events=[
  {tick:0,order:0,bytes:[255,81,3,(tempo>>>16)&255,(tempo>>>8)&255,tempo&255]},
  {tick:0,order:0,bytes:[255,88,4,4,2,24,8]},
  {tick:0,order:0,bytes:[255,3,16,...ascii('CC Atelier Drums')]},
 ];
 const solo=p.tracks.some(t=>t.solo);
 for(let loop=0;loop<loops;loop++)for(let step=0;step<p.steps;step++){
  // Reuse the live/WAV swing semantics, quantized to the nearest 960-PPQ tick.
  const tick=loop*p.steps*STEP_TICKS+Math.round(stepTime(step,p.bpm,p.swing)*p.bpm/60*PPQ);
  const next=loop*p.steps*STEP_TICKS+Math.round(stepTime(step+1,p.bpm,p.swing)*p.bpm/60*PPQ);
  // Short editable drum gates, clipped before the next step / loop boundary.
  // These are not synthesized audio tails. At equal times note-off precedes on.
  const off=Math.min(tick+STEP_TICKS/2,next,end);
  for(const track of p.tracks){
   const velocity=track.steps[step];if(!velocity||track.mute||(solo&&!track.solo))continue;
   const note=DRUM_NOTES[track.type];
   events.push({tick,order:2,bytes:[0x99,note,Math.max(1,Math.round(velocity*127))]});
   events.push({tick:off,order:1,bytes:[0x89,note,0]});
  }
 }
 events.push({tick:end,order:3,bytes:[255,47,0]});
 events.sort((a,b)=>a.tick-b.tick||a.order-b.order);
 const data=[];let previous=0;
 for(const event of events){data.push(...vlq(event.tick-previous),...event.bytes);previous=event.tick;}
 return new Uint8Array([...ascii('MThd'),0,0,0,6,0,0,0,1,PPQ>>>8,PPQ&255,...ascii('MTrk'),...uint32(data.length),...data]);
}
