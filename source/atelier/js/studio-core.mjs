// Pure sequencer timing and project boundaries.
export const tracks=['kick','snare','hat','clap','tom','rim'];
export const trackNames={kick:'底鼓',snare:'军鼓',hat:'踩镲',clap:'拍手',tom:'通鼓',rim:'边击'};
export function stepTime(step,bpm,swing=0){return (step+(step%2?swing:0))*60/bpm/4;}
export function loopDuration(steps,bpm){return steps*60/bpm/4;}
export function preset(name='indie'){
 const patterns=name==='halftime'?[[0,7,10],[8],[0,2,4,6,8,10,12,14],[8],[],[3,11]]:name==='blank'?[[],[],[],[],[],[]]:[[0,6,8,14],[4,12],[0,2,4,6,8,10,12,14],[12],[15],[3,11]];
 return {version:1,name:name==='halftime'?'慢半拍':name==='blank'?'空白录音带':'放学后的排练',bpm:name==='halftime'?86:112,steps:16,swing:0,master:.65,tracks:tracks.map((type,i)=>({type,volume:type==='hat'?.38:.7,pan:type==='hat'?.2:type==='tom'?-.25:0,tone:.5,decay:.3,mute:false,solo:false,steps:Array.from({length:16},(_,s)=>patterns[i].includes(s)?1:0)}))};
}
const finite=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
export function validateProject(p){
 if(p?.version!==1||typeof p.name!=='string'||p.name.length<1||p.name.length>60||!finite(p.bpm,60,180)||![16,32].includes(p.steps)||!finite(p.swing,0,.6)||!finite(p.master,0,1)||!Array.isArray(p.tracks)||p.tracks.length!==tracks.length)throw Error('这不是有效的节奏项目');
 const clean={version:1,name:p.name,bpm:p.bpm,steps:p.steps,swing:p.swing,master:p.master,tracks:p.tracks.map((t,i)=>{
  if(!t||t.type!==tracks[i]||!finite(t.volume,0,1)||!finite(t.pan,-1,1)||!finite(t.tone,0,1)||!finite(t.decay,.05,1.2)||typeof t.mute!=='boolean'||typeof t.solo!=='boolean'||!Array.isArray(t.steps)||t.steps.length!==p.steps||!t.steps.every(v=>finite(v,0,1)))throw Error('轨道参数或音符数据无效');
  return {type:t.type,volume:t.volume,pan:t.pan,tone:t.tone,decay:t.decay,mute:t.mute,solo:t.solo,steps:[...t.steps]};
 })};return clean;
}
export class History{
 constructor(initial){this.items=[structuredClone(initial)];this.position=0;}
 get current(){return structuredClone(this.items[this.position]);}
 get canUndo(){return this.position>0;}
 get canRedo(){return this.position<this.items.length-1;}
 push(value){if(JSON.stringify(value)===JSON.stringify(this.items[this.position]))return;this.items=this.items.slice(0,this.position+1);this.items.push(structuredClone(value));if(this.items.length>80)this.items.shift();this.position=this.items.length-1;}
 undo(){if(this.canUndo)this.position--;return this.current;}
 redo(){if(this.canRedo)this.position++;return this.current;}
}
export function encodeWav(channels,sampleRate){
 if(!channels.length||channels.length>2||!channels.every(c=>c.length===channels[0].length)||!finite(sampleRate,8000,192000))throw Error('无效音频数据');
 const frames=channels[0].length,bytes=frames*channels.length*2,buffer=new ArrayBuffer(44+bytes),v=new DataView(buffer),ascii=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
 ascii(0,'RIFF');v.setUint32(4,36+bytes,true);ascii(8,'WAVE');ascii(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels.length,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*channels.length*2,true);v.setUint16(32,channels.length*2,true);v.setUint16(34,16,true);ascii(36,'data');v.setUint32(40,bytes,true);
 for(let i=0;i<frames;i++)for(let c=0;c<channels.length;c++){const x=Math.max(-1,Math.min(1,channels[c][i]));v.setInt16(44+(i*channels.length+c)*2,Math.round(x<0?x*32768:x*32767),true);}return buffer;
}
