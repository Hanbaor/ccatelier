import {scoreEvents,SCORE_BPM,SCORE_BEATS,sectionAt} from './livehouse-score.mjs';
export const DRUMS=Object.freeze(['kick','snare','hat','tom']);
export const SHOTS=Object.freeze({wide:{scale:1,x:0,y:0},kit:{scale:1.09,x:0,y:-2},side:{scale:1.05,x:-2,y:1}});
export const LIGHTS=Object.freeze({amber:[238,198,128],blue:[104,180,216],rose:[210,150,164]});
const instruments=[...DRUMS,'bass','chord','crash'];
const fail=()=>{throw new TypeError('演出工程无效：请使用本站导出的完整工程。');};
const finite=(x,a,b)=>Number.isFinite(x)&&x>=a&&x<=b;
function shape(x,keys){if(!x||Object.getPrototypeOf(x)!==Object.prototype||Reflect.ownKeys(x).length!==keys.length||keys.some(k=>!Object.getOwnPropertyDescriptor(x,k)||!('value' in Object.getOwnPropertyDescriptor(x,k))))fail();}
function list(x,max){if(!Array.isArray(x)||Object.getPrototypeOf(x)!==Array.prototype||x.length>max||Reflect.ownKeys(x).length!==x.length+1)fail();for(let i=0;i<x.length;i++)if(!Object.getOwnPropertyDescriptor(x,String(i))||!('value' in Object.getOwnPropertyDescriptor(x,String(i))))fail();}
export function validatePerformance(p){
 shape(p,['version','title','bpm','beats','notes','lights','shots']);
 if(p.version!==1||typeof p.title!=='string'||!p.title.trim()||p.title.length>80||/[\u0000-\u001f\u007f]/u.test(p.title)||!finite(p.bpm,40,220)||!Number.isInteger(p.beats)||p.beats<4||p.beats>256||p.beats%4)fail();
 list(p.notes,4096);list(p.lights,65);list(p.shots,65);
 const seen=new Set(),notes=p.notes.map(n=>{shape(n,['beat','instrument','velocity','note']);if(!finite(n.beat,0,p.beats-.25)||!Number.isInteger(n.beat*4)||!instruments.includes(n.instrument)||!finite(n.velocity,0,1)||!Number.isInteger(n.note)||!finite(n.note,24,96))fail();const key=n.beat+':'+n.instrument;if(seen.has(key))fail();seen.add(key);return {...n};}).sort((a,b)=>a.beat-b.beat||instruments.indexOf(a.instrument)-instruments.indexOf(b.instrument));
 function cues(values,type){const used=new Set();const result=values.map(v=>{shape(v,type==='lights'?['beat','color','level']:['beat','shot']);if(!Number.isInteger(v.beat)||v.beat%4||!finite(v.beat,0,p.beats-4)||used.has(v.beat))fail();used.add(v.beat);if(type==='lights'?(typeof v.color!=='string'||!Object.hasOwn(LIGHTS,v.color)||!finite(v.level,.1,1)):(typeof v.shot!=='string'||!Object.hasOwn(SHOTS,v.shot)))fail();return {...v};}).sort((a,b)=>a.beat-b.beat);if(result[0]?.beat!==0)fail();return result;}
 return {version:1,title:p.title.trim(),bpm:p.bpm,beats:p.beats,notes,lights:cues(p.lights,'lights'),shots:cues(p.shots,'shots')};
}
export function originalPerformance(){return validatePerformance({version:1,title:'After the last light · 原创现场',bpm:SCORE_BPM,beats:SCORE_BEATS,notes:scoreEvents().map(n=>({...n,note:n.note??48})),lights:[{beat:0,color:'blue',level:.35},{beat:8,color:'amber',level:.55},{beat:24,color:'amber',level:.95},{beat:40,color:'rose',level:.75},{beat:56,color:'blue',level:.4}],shots:[{beat:0,shot:'wide'},{beat:8,shot:'side'},{beat:24,shot:'kit'},{beat:40,shot:'side'},{beat:56,shot:'wide'}]});}
const mix=(a,b,t)=>a+(b-a)*t;
function cueAt(cues,beat){let i=0;while(i+1<cues.length&&cues[i+1].beat<=beat)i++;return {current:cues[i],previous:cues[Math.max(0,i-1)]};}
/** Pure, seekable state: no elapsed-frame accumulation, random source or DOM. */
export function evaluateAt(project,position,{motion=true}={}){
 const beat=Math.max(0,Math.min(project.beats,Number(position)||0)),light=cueAt(project.lights,beat),shot=cueAt(project.shots,beat);
 const easing=cue=>{if(!motion)return 1;const t=Math.max(0,Math.min(1,(beat-cue.current.beat)/2));return t*t*(3-2*t);};
 const lt=easing(light),st=easing(shot),from=SHOTS[shot.previous.shot],to=SHOTS[shot.current.shot];
 const strikes=Object.fromEntries(DRUMS.map(type=>[type,{elapsed:Infinity,velocity:0}]));
 for(const n of project.notes){if(n.beat>beat)break;const type=n.instrument==='crash'?'hat':n.instrument;if(Object.hasOwn(strikes,type)&&n.velocity>0)strikes[type]={elapsed:(beat-n.beat)*60000/project.bpm,velocity:n.velocity};}
 return {beat,section:sectionAt(beat),light:{color:LIGHTS[light.current.color].map((v,i)=>mix(LIGHTS[light.previous.color][i],v,lt)),level:mix(light.previous.level,light.current.level,lt)},shot:{name:shot.current.shot,scale:mix(from.scale,to.scale,st),x:mix(from.x,to.x,st),y:mix(from.y,to.y,st)},strikes};
}
export function setDrum(project,bar,type,step){if(!DRUMS.includes(type)||!Number.isInteger(bar)||bar<0||bar>=project.beats/4||!Number.isInteger(step)||step<0||step>15)fail();const p=structuredClone(project),beat=bar*4+step/4,index=p.notes.findIndex(n=>n.beat===beat&&n.instrument===type),old=p.notes[index];if(index>=0)p.notes.splice(index,1);const velocity=!old?1:old.velocity>=.75?.5:0;if(velocity)p.notes.push({beat,instrument:type,velocity,note:48});return validatePerformance(p);}
export function setCue(project,kind,bar,value){if(!['lights','shots'].includes(kind))fail();const p=structuredClone(project),beat=bar*4;p[kind]=p[kind].filter(c=>c.beat!==beat);p[kind].push({beat,...value});return validatePerformance(p);}
