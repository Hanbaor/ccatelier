/** Explicit, lossless grid handoff. Imported Practice data is never normalized
 * into a different rhythm: unrepresentable selections fail before linking. */
import {validatePractice} from './practice-core.mjs';
import {preset, validateProject} from './studio-core.mjs';
import {encodeShare} from './studio-share.mjs';

export function practiceToStudio(source, startBar, endBar, bpm) {
 const clean=validatePractice(source);
 if(!Number.isInteger(startBar)||!Number.isInteger(endBar)||startBar<0||endBar<startBar||endBar>=clean.bars.length||endBar-startBar>1)throw Error('请用「从 / 到」选择连续 1–2 个完整小节，再进入编排。');
 if(!Number.isFinite(bpm)||bpm<60||bpm>180)throw Error('Studio 支持 60–180 BPM；请先调整练习速度，不会自动改速。');
 if(clean.title.length>60)throw Error('练习标题超过 Studio 的 60 字符上限；请在源 JSON 中缩短标题后重新导入，不会自动截断。');
 const project=preset('blank');
 project.name=clean.title;project.bpm=bpm;project.steps=(endBar-startBar+1)*16;
 for(const track of project.tracks)track.steps=Array(project.steps).fill(0);
 for(let bar=startBar;bar<=endBar;bar++)for(const hit of clean.bars[bar].hits){
  // A zero in Studio means no event. Dropping an explicit silent Practice hit
  // would lose that distinction, even though it has no audible attack.
  if(hit.velocity===0)throw Error('选区含零力度事件，Studio 无法区分它与休止；请在源 JSON 中明确处理后重新导入。');
  project.tracks.find(track=>track.type===hit.type).steps[(bar-startBar)*16+hit.step]=hit.velocity;
 }
 return validateProject(project);
}

/** Only the template's adjacent Studio route, never a general URL redirect.
 * The current Practice query (e.g. a local recording id) is never forwarded. */
export function practiceStudioURL(project, destination, current) {
 let base;try{base=new URL(current);}catch{throw Error('无法确认 Studio 地址，请刷新页面重试。');}
 const expected=base.pathname.replace(/\/studio\/practice\/$/,'/studio/');
 if(!['https:','http:'].includes(base.protocol)||base.username||base.password||expected===base.pathname||typeof destination!=='string'||destination!==expected||!/^\/(?:[^/?#\\]+\/)*studio\/$/.test(destination)||destination.split('/').some(part=>part==='.'||part==='..')||/%(?:2f|5c|2e|25)/i.test(destination))throw Error('Studio 地址无效；只能打开本站对应的节奏实验室。');
 const url=new URL(destination,base);
 if(url.origin!==base.origin||url.pathname!==expected||url.search||url.hash||url.username||url.password)throw Error('Studio 地址无效；只能打开本站对应的节奏实验室。');
 return url.origin+url.pathname+encodeShare(project);
}
