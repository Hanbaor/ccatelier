import {DRUMS,originalPerformance,setDrum,setCue,validatePerformance} from './performance-core.mjs';
import {savePerformance,loadPerformance,PerformanceImport} from './performance-store.mjs';
import {download} from './archive-store.js';
const names={kick:'底鼓',snare:'军鼓',hat:'踩镲',tom:'通鼓'},colors={amber:'琥珀',blue:'冷蓝',rose:'玫瑰'},shots={wide:'全景',kit:'鼓组',side:'侧光'};
const el=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
export function initDirector({dialog,getProject,change,seek,onToggle=()=>{}}){
 const panel=dialog.querySelector('[data-live-director]');if(!panel)return {paint(){},invalidate(){}};
 const body=panel.querySelector('[data-director-body]'),projectTitle=el('p'),status=el('p','选一个小节，把鼓点、灯光和景别写进同一场演出。'),overview=el('div'),grid=el('div'),editor=el('div'),heading=el('h3'),controls=el('div'),actions=el('div'),position=el('output');
 status.setAttribute('role','status');overview.className='director-overview';grid.className='director-drum-grid';editor.className='director-editor';controls.className='director-cues';actions.className='director-actions';
 const imports=new PerformanceImport();
 let latestBeat=0,paintedBar=null,paintedPosition=null,barButtons=[];
 let bar=0,history=[getProject()],index=0,scrubbing=false,drumFocus={type:'kick',step:0};
 grid.addEventListener('focusin',event=>{const b=event.target.closest('[data-drum]');if(!b)return;drumFocus={type:b.dataset.drum,step:Number(b.dataset.step)};for(const cell of grid.querySelectorAll('button'))cell.tabIndex=cell===b?0:-1;});
 function button(text,handler){const b=el('button',text);b.type='button';b.addEventListener('click',handler);return b;}
 const scrub=el('input');scrub.type='range';scrub.min='0';scrub.step='.25';scrub.dataset.directorSeek='';scrub.setAttribute('aria-label','演出播放位置，单位拍');scrub.addEventListener('input',()=>seek(Number(scrub.value)));scrub.addEventListener('pointerdown',event=>{scrubbing=true;scrub.setPointerCapture?.(event.pointerId);});scrub.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))scrubbing=true;});for(const event of ['pointerup','pointercancel','lostpointercapture','keyup','blur'])scrub.addEventListener(event,()=>{scrubbing=false;});
 const scrubRow=el('label','播放位置');scrubRow.className='director-scrub';scrubRow.append(scrub,position);
 const undo=button('撤销',()=>{if(index>0){imports.invalidate();index--;change(structuredClone(history[index]));render();status.textContent='已撤销；工程尚未保存。';}}),redo=button('重做',()=>{if(index<history.length-1){imports.invalidate();index++;change(structuredClone(history[index]));render();status.textContent='已重做；工程尚未保存。';}});
 function commit(project,message){imports.invalidate();const clean=validatePerformance(project);history=history.slice(0,index+1);history.push(clean);if(history.length>60)history.shift();index=history.length-1;change(structuredClone(clean));render();status.textContent=message+' · 尚未保存';}
 function select(label,values){const wrapper=el('label',label),input=el('select');input.setAttribute('aria-label',label);for(const [value,text] of Object.entries(values)){const option=el('option',text);option.value=value;input.append(option);}wrapper.append(input);controls.append(wrapper);return input;}
 const color=select('灯光',colors),level=select('亮度',{'0.35':'微光','0.6':'柔和','0.95':'明亮'}),shot=select('景别',shots);
 const putLight=event=>commit(setCue(getProject(),'lights',bar,{color:color.value,level:event.currentTarget===level?Number(level.value):active(getProject().lights).level}),'灯光关键点已写入第 '+(bar+1)+' 小节');
 color.addEventListener('change',putLight);level.addEventListener('change',putLight);shot.addEventListener('change',()=>commit(setCue(getProject(),'shots',bar,{shot:shot.value}),'景别关键点已写入第 '+(bar+1)+' 小节'));
 const removeCue=button('移除此处关键点',()=>{if(!bar)return;const p=structuredClone(getProject());p.lights=p.lights.filter(c=>c.beat!==bar*4);p.shots=p.shots.filter(c=>c.beat!==bar*4);commit(p,'此处恢复沿用前一关键点');});controls.append(removeCue);
 function active(cues){return [...cues].reverse().find(c=>c.beat<=bar*4)||cues[0];}
 function paint(beat){
  latestBeat=beat;
  if(!panel.open||!dialog.open)return;
  const beats=getProject().beats,at=Math.max(0,Math.min(beats,beat)),playingBar=Math.floor(at/4);
  if(!scrubbing&&scrub.value!==String(at))scrub.value=String(at);
  if(paintedBar!==playingBar){
   for(const b of barButtons[paintedBar]||[])b.classList.remove('is-playing');
   for(const b of barButtons[playingBar]||[])b.classList.add('is-playing');
   paintedBar=playingBar;
  }
  const text=`${Math.min(beats/4,playingBar+1)} / ${beats/4} 小节`;
  if(paintedPosition!==text){position.textContent=text;paintedPosition=text;}
 }
 function render(){
  // Capture the current logical focus at rebuild time, not when an async read starts.
  const focused=document.activeElement,focus=grid.contains(focused)?{drum:focused.dataset.drum,step:focused.dataset.step}:overview.contains(focused)?{track:focused.dataset.directorTrack,bar:Number(focused.dataset.directorBar)}:null;
  const p=getProject();barButtons=[];paintedBar=null;paintedPosition=null;projectTitle.textContent=p.title;projectTitle.className='director-project-title';bar=Math.min(bar,p.beats/4-1);scrub.max=String(p.beats);panel.querySelector('summary span').textContent=`DIRECTOR’S CUT / ${p.beats/4} BARS`;overview.replaceChildren();
  for(const [kind,label] of [['notes','鼓点'],['lights','灯光'],['shots','镜头']]){const row=el('div'),name=el('span',label);row.className='director-track';row.style.gridTemplateColumns=`42px repeat(${p.beats/4},minmax(36px,1fr))`;row.append(name);for(let b=0;b<p.beats/4;b++){const cue=kind==='notes'?null:p[kind].find(c=>c.beat===b*4),count=kind==='notes'?p.notes.filter(n=>DRUMS.includes(n.instrument)&&n.beat>=b*4&&n.beat<(b+1)*4&&n.velocity>0).length:0;const text=kind==='notes'?String(b+1):cue?(kind==='lights'?colors[cue.color]:shots[cue.shot]):'·';const cell=button(text,()=>{bar=b;render();overview.querySelector(`[data-director-track="${kind}"][data-director-bar="${b}"]`)?.focus({preventScroll:true});seek(b*4);});(barButtons[b]??=[]).push(cell);cell.dataset.directorBar=b;cell.dataset.directorTrack=kind;cell.tabIndex=b===bar?0:-1;cell.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();const kinds=['notes','lights','shots'],track=kinds[Math.max(0,Math.min(2,kinds.indexOf(kind)+(event.key==='ArrowUp'?-1:event.key==='ArrowDown'?1:0)))],next=event.key==='Home'?0:event.key==='End'?p.beats/4-1:Math.max(0,Math.min(p.beats/4-1,b+(event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:0)));const target=overview.querySelector(`[data-director-track="${track}"][data-director-bar="${next}"]`);for(const sibling of target.parentElement.querySelectorAll('button'))sibling.tabIndex=sibling===target?0:-1;target.focus();});cell.setAttribute('aria-label',`第 ${b+1} 小节${label}${kind==='notes'?'，'+count+' 个鼓点':cue?'，'+text:'，沿用前一关键点'}`);cell.setAttribute('aria-pressed',String(b===bar));if(cue||count)cell.classList.add('has-cue');row.append(cell);}overview.append(row);}
  heading.textContent='第 '+String(bar+1).padStart(2,'0')+' 小节 / '+p.beats/4;grid.replaceChildren();
  for(const type of DRUMS){grid.append(el('span',names[type]));for(let step=0;step<16;step++){const note=p.notes.find(n=>n.instrument===type&&n.beat===bar*4+step/4),v=note?.velocity||0;const b=button(v>=.75?'●':v?'◐':'',()=>{drumFocus={type,step};commit(setDrum(getProject(),bar,type,step),'鼓点已更新');grid.querySelector(`[data-drum="${type}"][data-step="${step}"]`)?.focus({preventScroll:true});});b.dataset.drum=type;b.dataset.step=step;b.tabIndex=drumFocus.type===type&&drumFocus.step===step?0:-1;b.className=v>=.75?'strong':v?'soft':'';b.setAttribute('aria-label',`${names[type]} 第${step+1}格：${v>=.75?'强拍':v?'轻拍':'休止'}`);b.setAttribute('aria-pressed',String(v>0));b.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();const t=Math.max(0,Math.min(3,DRUMS.indexOf(type)+(event.key==='ArrowUp'?-1:event.key==='ArrowDown'?1:0))),s=event.key==='Home'?0:event.key==='End'?15:(step+(event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:0)+16)%16;grid.querySelector(`[data-drum="${DRUMS[t]}"][data-step="${s}"]`)?.focus();});grid.append(b);}}
  const light=active(p.lights);color.value=light.color;level.value=String([.35,.6,.95].reduce((a,b)=>Math.abs(b-light.level)<Math.abs(a-light.level)?b:a));shot.value=active(p.shots).shot;removeCue.disabled=!bar;undo.disabled=index===0;redo.disabled=index===history.length-1;
  paint(latestBeat);
  if(focus&&panel.open&&dialog.open){
   const target=focus.drum?grid.querySelector(`[data-drum="${focus.drum}"][data-step="${focus.step}"]`):overview.querySelector(`[data-director-track="${focus.track}"][data-director-bar="${Math.min(focus.bar,p.beats/4-1)}"]`);
   if(target&&!target.disabled){
    if(focus.track)for(const sibling of target.parentElement.querySelectorAll('button'))sibling.tabIndex=sibling===target?0:-1;
    target.focus({preventScroll:true});
   }
  }
 }
 const save=button('保存到本机',()=>{try{savePerformance(window.localStorage,getProject());status.textContent='完整演出已保存到本机；鼓点、灯光与镜头一起保留。';}catch{status.textContent='本机保存不可用，工程仍在。请下载 JSON 备份。';}});
 const load=button('载入已保存',()=>{imports.invalidate();try{const p=loadPerformance(window.localStorage);if(!p){status.textContent='还没有保存的导演工程。';return;}commit(p,'本机工程已载入，可撤销回到刚才');}catch{status.textContent='未能读取保存的工程；当前演出保留。';}});
 const input=el('input');input.type='file';input.accept='.json,application/json';input.setAttribute('aria-label','导入完整演出 JSON');input.addEventListener('change',async()=>{const file=input.files?.[0];input.value='';if(!file)return;try{if(file.size>500000){imports.invalidate();throw Error('工程文件过大，最大 500 KB。');}const p=await imports.read(()=>file.text());if(!p||!dialog.open)return;commit(p,'工程已导入，可撤销回到刚才');}catch(error){status.textContent=(error.message||'导入失败')+' 当前演出保留。';}});
 const importLabel=el('label','导入 JSON');importLabel.className='director-import';importLabel.append(input);
 actions.append(undo,redo,save,load,button('下载工程',()=>{download('cc-directed-performance.json',JSON.stringify(getProject(),null,2));status.textContent='已下载完整演出工程；没有上传。';}),importLabel,button('恢复原创',()=>commit(originalPerformance(),'原创演出已恢复，可撤销')));
 const note=el('p','强拍 → 轻拍 → 休止。灯光与镜头在两拍内柔和过渡；景别是 2.5D 构图。原创伴奏随工程保存，录音与排练数据独立保留。');note.className='director-note';editor.append(heading,grid,controls);body.append(projectTitle,scrubRow,overview,editor,actions,status,note);panel.addEventListener('toggle',()=>{onToggle(panel.open);if(panel.open)paint(latestBeat);});render();
 return {paint,invalidate(){scrubbing=false;imports.invalidate();}};
}
