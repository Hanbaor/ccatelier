import {$,$$} from './ui.js';
import {PracticeChallenge, readChallengeBest, saveChallengeBest} from './practice-challenge-core.mjs';

const voices = {kick:['底鼓','A'],snare:['军鼓','S'],hat:['踩镲','D'],tom:['通鼓','F']};
const keys = {a:'kick',s:'snare',d:'hat',f:'tom'};

/** Visuals and inputs share the practice transport's elapsed clock. No second timer. */
export function initPracticeChallenge({host, listen, start, stop, elapsed, sound}) {
 const panel=$('[data-challenge]',host),button=$('[data-challenge-start]',panel),feedback=$('[data-challenge-feedback]',panel),result=$('[data-challenge-result]',panel),best=$('[data-challenge-best]',panel),grid=$('[data-challenge-grid]',panel),barLabel=$('[data-challenge-bar]',panel),pads=$$('[data-challenge-pad]',panel);
 let config,run=null,ready=false,activeBar=-1,pressedKeys=new Set(),pointers=new Map(),cells=new Map();
 const busy=()=>run!==null;
 function clearHeld(){pressedKeys.clear();pointers.clear();}
 function availability(){button.setAttribute('aria-pressed',String(busy()));button.textContent=busy()?'停止挑战':'开始挑战';pads.forEach(pad=>{pad.disabled=!ready;});}
 function readBest(){try{const value=readChallengeBest(window.localStorage,config.signature);best.textContent=value===null?'成绩仅存本机':'同谱同速最佳 '+value+'% · 本机';}catch{best.textContent='本机存储不可用，仍可练习';}}
 function drawBar(index,model=config){
  activeBar=index;grid.replaceChildren();cells.clear();barLabel.textContent='第 '+(index+1)+' 小节';
  const corner=document.createElement('span');grid.append(corner);
  for(let step=0;step<16;step++){const count=document.createElement('span');count.className='challenge-count';count.textContent=step%4===0?String(step/4+1):['','e','&','a'][step%4];grid.append(count);}
  for(const [type,[name]] of Object.entries(voices)){
   const label=document.createElement('span');label.className='challenge-lane-name';label.textContent=name;grid.append(label);
   for(let step=0;step<16;step++){
    const cell=document.createElement('span'),target=model.targets.find(hit=>hit.bar===index&&hit.step===step&&hit.type===type);cell.className='challenge-cell';cell.classList.toggle('has-note',!!target);cell.classList.toggle('is-caught',target?.offset!==null&&!!target);cell.textContent=target?(type==='hat'?'×':'●'):'';if(step%4===0)cell.classList.add('beat-edge');grid.append(cell);cells.set(type+':'+step,cell);
   }
  }
 }
 function configure(project,bpm,from,to){config=new PracticeChallenge(project,bpm,from,to);config.firstBar=from;result.hidden=true;result.textContent='';feedback.textContent=config.targets.length?'先数四拍，再接住每一拍。':'这段都是休止，换一段有鼓点的选区吧。';button.disabled=!config.targets.length;drawBar(from);readBest();availability();}
 function prepare(){if(!config.targets.length||!panel.open)return false;run=config;drawBar(config.firstBar);ready=false;clearHeld();result.hidden=true;feedback.textContent='准备中…';availability();return true;}
 function begin(){ready=true;feedback.textContent='数四拍 · 准备接拍';availability();}
 function paint(ordinal,length){
  if(!run)return;
  if(ordinal<0){feedback.textContent='预备 '+(Math.floor((ordinal+16)/4)+1)+' / 4';return;}
  const bar=run.firstBar+Math.floor((ordinal%length)/16),step=ordinal%16;
  if(activeBar!==bar)drawBar(bar,run);
  for(const [key,cell] of cells)cell.classList.toggle('is-now',Number(key.split(':')[1])===step);
  if(ordinal===0)feedback.textContent='跟上黄色拍位 · A / S / D / F';
 }
 function strike(type,event){
  if(!ready||!run||!panel.open||document.hidden||$('dialog[open]'))return;
  const outcome=run.strike(type,elapsed(event));if(!outcome)return;
  sound(type);
  const text={center:'合拍',early:'稍早一点',late:'稍晚一点',extra:'再对齐拍位'}[outcome.kind];feedback.textContent=voices[type][0]+' · '+text;
  if(outcome.target&&outcome.target.bar===activeBar)cells.get(type+':'+outcome.target.step)?.classList.add('is-caught');
 }
 function cancel(){
  const wasBusy=busy();run=null;ready=false;clearHeld();availability();cells.forEach(cell=>cell.classList.remove('is-now'));
  if(wasBusy){feedback.textContent='已停下，准备好再来一遍。';resetModel();}
 }
 function resetModel(){if(!config)return;config.targets.forEach(target=>{target.offset=null;});config.extra=0;config.closed=false;config.lastStrike.clear();}
 function finish(){
  if(!run)return;const summary=run.finish(),signature=run.signature;run=null;ready=false;clearHeld();availability();cells.forEach(cell=>cell.classList.remove('is-now'));
  result.hidden=false;result.textContent='这一遍 · '+summary.score+'% 跟拍率｜接住 '+summary.hit+' / '+summary.total+'｜合拍 '+summary.center+'｜额外敲击 '+summary.extra;
  feedback.textContent=summary.hit===summary.total?'整段接住了，下一遍也按自己的速度来。':'练完一遍了，可以慢一点再来。';
  try{const value=saveChallengeBest(window.localStorage,signature,summary.score);best.textContent='同谱同速最佳 '+value+'% · 本机';}catch{best.textContent='本次成绩未存入本机，仍可再练';}
  resetModel();
 }
 listen(button,'click',()=>{if(busy())stop();else start();});
 listen(panel,'toggle',()=>{if(!panel.open&&busy())stop('已收起挑战；点击开始可重新数拍。');});
 for(const pad of pads){
  const type=pad.dataset.challengePad;
  listen(pad,'pointerdown',event=>{if(event.button!==0||!ready)return;event.preventDefault();event.stopPropagation();if(pointers.has(event.pointerId)||[...pointers.values()].includes(type))return;pointers.set(event.pointerId,type);pad.focus({preventScroll:true});strike(type,event);});
  listen(pad,'click',event=>{if(event.detail===0)strike(type,event);});
 }
 listen(window,'pointerup',event=>pointers.delete(event.pointerId));listen(window,'pointercancel',event=>pointers.delete(event.pointerId));
 listen(window,'blur',()=>{clearHeld();if(busy())stop('窗口已离开，挑战已暂停。');});
 listen(document,'keyup',event=>pressedKeys.delete(event.key.toLowerCase()));
 listen(document,'keydown',event=>{
  if(!ready||!panel.open||$('dialog[open]'))return;
  if(event.repeat&&event.target.closest('[data-challenge-pad]')&&['Enter',' '].includes(event.key)){event.preventDefault();return;}
  if(event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey||event.isComposing||event.target.closest('input,select,textarea,[contenteditable]'))return;
  const key=event.key.toLowerCase(),type=keys[key];if(!type)return;event.preventDefault();if(pressedKeys.has(key))return;pressedKeys.add(key);strike(type,event);
 });
 return {configure,prepare,begin,paint,cancel,finish,busy};
}
