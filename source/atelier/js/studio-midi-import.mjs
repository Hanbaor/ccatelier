import {preset,validateProject} from './studio-core.mjs';

// Deliberately narrow SMF 0/1 percussion importer, not a general MIDI player.
// SMF structure / running status: https://midi.org/standard-midi-files-specification
// Readable IMA specification mirror: https://www.cs.cmu.edu/~music/cmp/archives/cmsip/readings/Standard-MIDI-file-format-updated.pdf
// GM percussion map: https://midi.org/general-midi-level-1
const NOTES=new Map([[36,0],[38,1],[42,2],[39,3],[45,4],[37,5]]);
export const MIDI_IMPORT_MAX_BYTES=256*1024;
const fail=message=>{throw Error(message);};

export function parseDrumMidi(input){
 const bytes=input instanceof ArrayBuffer?new Uint8Array(input):input instanceof Uint8Array?input:null;
 if(!bytes)fail('请选择有效的 MIDI 二进制文件');
 if(bytes.length>MIDI_IMPORT_MAX_BYTES)fail('MIDI 文件不能超过 256 KiB');
 let pos=0,limit=bytes.length,eventCount=0;
 const take=n=>{if(!Number.isSafeInteger(n)||n<0||n>limit-pos)fail('MIDI 数据或区块长度不完整');const out=bytes.subarray(pos,pos+n);pos+=n;return out;};
 const number=n=>{let v=0;for(const b of take(n))v=v*256+b;return v;};
 const tag=()=>String.fromCharCode(...take(4));
 const vlq=()=>{let v=0;for(let i=0;i<4;i++){const b=number(1);if(i===0&&b===128)fail('MIDI 可变长度整数不是规范编码');v=v*128+(b&127);if(b<128)return v;}fail('MIDI 可变长度整数超过四字节');};
 if(tag()!=='MThd')fail('仅支持标准 SMF MIDI 文件，不支持 RIFF 容器');
 if(number(4)!==6)fail('MIDI 文件头长度必须为 6');
 const format=number(2),trackCount=number(2),ppq=number(2);
 if(![0,1].includes(format)||trackCount<1||trackCount>16||(format===0&&trackCount!==1))fail('仅支持 SMF 0 / 1，最多 16 条轨道');
 if(!ppq||(ppq&0x8000))fail('仅支持 PPQ 拍点时间，不支持 SMPTE');
 const events=[],tempos=[],meters=[],ends=[];let releaseVelocity=false;
 for(let track=0;track<trackCount;track++){
  if(tag()!=='MTrk')fail('MIDI 轨道区块无效');
  const length=number(4);if(length>bytes.length-pos)fail('MIDI 轨道长度超出文件');
  limit=pos+length;let tick=0,running=null,ended=false;
  while(pos<limit){
   if(++eventCount>10000)fail('MIDI 事件不能超过 10000 个');
   tick+=vlq();if(!Number.isSafeInteger(tick))fail('MIDI 绝对时间超出范围');
   let status=number(1);
   if(status<128){if(running===null)fail('MIDI running status 缺少状态字节');pos--;status=running;}
   else if(status<240)running=status;
   else running=null;
   if(status===255){
    const type=number(1);if(type>127)fail('MIDI 元事件类型无效');const data=take(vlq());
    if(type===47){if(data.length!==0||pos!==limit)fail('MIDI 轨道结束事件必须为空且位于末尾');ends.push(tick);ended=true;}
    else if(type===81){if(data.length!==3)fail('MIDI 速度事件长度无效');const tempo=data[0]*65536+data[1]*256+data[2];if(!tempo)fail('MIDI 速度不能为零');tempos.push({tick,tempo});}
    else if(type===88){if(data.length!==4||data[0]!==4||data[1]!==2||data[2]===0||data[3]!==8)fail('仅支持固定 4/4 拍');meters.push(tick);}
    else if(type>=1&&type<=9){/* Text annotations do not alter percussion playback. */}
    else fail('MIDI 含不支持的元事件；仅支持文本、速度、4/4 拍和轨道结束');
   }else{
    if(status>=240)fail('不支持 SysEx 或系统演奏事件');
    const kind=status>>4,channel=status&15;
    if(![8,9].includes(kind)||channel!==9)fail('仅支持通道 10 的纯鼓点，不支持控制器、程序或其他演奏事件');
    const note=number(1),velocity=number(1);if(note>127||velocity>127)fail('MIDI 音符数据字节无效');
    if(!NOTES.has(note))fail('仅支持底鼓、军鼓、踩镲、拍手、通鼓和边击六种鼓音');
    const on=kind===9&&velocity>0;if(!on&&kind===8&&velocity)releaseVelocity=true;
    events.push({tick,note,velocity,on,track,order:eventCount});
   }
  }
  if(!ended)fail('MIDI 轨道缺少结束事件');limit=bytes.length;
 }
 if(pos!==bytes.length)fail('MIDI 含多余区块或尾随数据');
 tempos.sort((a,b)=>a.tick-b.tick);
 const tempo=tempos[0]?.tempo??500000;
 if((tempos[0]?.tick>0&&tempo!==500000)||tempos.some(t=>t.tempo!==tempo))fail('仅支持整段固定速度，不支持变速');
 let bpm=60000000/tempo;
 // 180 BPM exports as 333333 us. Repair only this integer-tempo round trip.
 if(bpm>180&&Math.round(60000000/180)===tempo)bpm=180;
 if(bpm<60||bpm>180)fail('MIDI 速度须在 60–180 BPM 之间');
 const normalize=tick=>{const value=tick*960;if(!Number.isSafeInteger(value)||value%ppq)fail('MIDI 时间不能精确映射到 960 PPQ 网格');return value/ppq;};
 const end=Math.max(...ends.map(normalize));
 if(![3840,7680,15360,30720].includes(end))fail('MIDI 完整时长须为 16 / 32 步的 1、2 或 4 轮；不会裁切文件');
 events.forEach(e=>e.tick=normalize(e.tick));
 // Preserve each track's wire order. Reordering note-off before note-on can
 // hide an overlapping retrigger. SMF1 gives no cross-track order for the same
 // drum at the same tick, so reject that ambiguity rather than invent one.
 events.sort((a,b)=>a.tick-b.tick||a.order-b.order);
 let groupTick=-1;const groupTracks=new Map();
 for(const e of events){
  if(e.tick!==groupTick){groupTick=e.tick;groupTracks.clear();}
  const previous=groupTracks.get(e.note);
  if(previous!==undefined&&previous!==e.track)fail('同一鼓音在不同轨道的同一时刻发生事件，先后顺序有歧义');
  groupTracks.set(e.note,e.track);
 }
 const active=new Map(),notes=[];let delay=null;
 for(const e of events){
  if(e.on){
   if(active.has(e.note))fail('同一种鼓音发生重叠或重复触发');
   if(e.tick>=end)fail('鼓点位于完整时长之外');
   const pair=Math.floor(e.tick/480),offset=e.tick%480;
   let step;if(offset===0)step=pair*2;else if(offset>=240&&offset<=384){step=pair*2+1;const d=offset-240;if(delay!==null&&delay!==d)fail('奇数步延迟不一致，不能精确恢复统一 swing');delay=d;}else fail('鼓点不在可精确恢复的十六分音符 / swing 网格');
   const note={...e,step};active.set(e.note,note);notes.push(note);
  }else{
   const note=active.get(e.note);if(!note||e.tick<=note.tick)fail('MIDI 含孤立或无效的音符结束事件');
   note.off=e.tick;active.delete(e.note);
  }
 }
 if(active.size)fail('MIDI 鼓点缺少音符结束事件');
 const swing=(delay??0)/240,totalSteps=end/240;
 const slots=new Map();for(const n of notes){const key=`${n.note}:${n.step}`;if(slots.has(key))fail('同一种鼓音在同一步重复');slots.set(key,n);}
 let chosen=null;
 for(const steps of [16,32]){
  const loops=totalSteps/steps;if(![1,2,4].includes(loops))continue;
  let matches=true;
  for(const note of NOTES.keys())for(let step=0;step<totalSteps;step++){
   const a=slots.get(`${note}:${step}`),b=slots.get(`${note}:${step%steps}`);
   if(Boolean(a)!==Boolean(b)||(a&&(a.velocity!==b.velocity)))matches=false;
  }
  if(matches){chosen={steps,loops};break;}
 }
 if(!chosen)fail('MIDI 含超出 32 步的非重复编排，不能无损折叠；不会裁切文件');
 const project=preset('blank');project.name='导入的 MIDI 鼓点';project.bpm=bpm;project.steps=chosen.steps;project.swing=swing;
 project.tracks.forEach(t=>t.steps=Array(chosen.steps).fill(0));
 let requiresGateConfirmation=releaseVelocity;
 for(const n of notes){
  const next=(n.step+1)*240+((n.step+1)%2?(delay??0):0),expected=Math.min(n.tick+120,next,end);
  if(n.off!==expected)requiresGateConfirmation=true;
  if(n.step<chosen.steps)project.tracks[NOTES.get(n.note)].steps[n.step]=n.velocity/127;
 }
 const summary=[`${chosen.steps} 步 × ${chosen.loops} 轮，${notes.length} 个鼓点；保留完整时长与尾部休止`,tempos.length?'保留文件中的固定速度':'文件未声明速度，按 MIDI 默认 120 BPM 解释',meters.length?'固定 4/4 拍':'文件未声明拍号，按 MIDI 默认 4/4 拍解释','仅恢复鼓点时序与力度；音色、混音及静音前音符无法恢复，使用本站默认设置'];
 if(delay===null)summary.push('没有奇数步鼓点，swing 无法推断，使用 0');
 if(requiresGateConfirmation)summary.push('文件音长或释放力度与本站鼓触发方式不同；确认后将按本站鼓点触发处理');
 if(releaseVelocity)summary.push('音符释放力度不用于本站鼓音合成');
 return {project:validateProject(project),loops:chosen.loops,summary,requiresGateConfirmation};
}
