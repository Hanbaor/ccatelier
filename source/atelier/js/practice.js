import {$,$$} from './ui.js';
import {LivehouseAudio} from './livehouse-audio.js';
import {PRACTICE_DEMOS,validatePractice,flattenPractice} from './practice-core.mjs';
import {initPracticeChallenge} from './practice-challenge.js';
import {CHALLENGE_WINDOW,challengeInputTime} from './practice-challenge-core.mjs';
import {download,readImport} from './archive-store.js';
import {listRecordings,readRecording,removeRecording} from './livehouse-recording-store.mjs';
const controllers=new WeakMap();
let descriptionId=0;
const NS='http://www.w3.org/2000/svg',names={kick:'底鼓',snare:'军鼓',hat:'踩镲',tom:'通鼓'};
const node=(tag,attributes={},text)=>{const n=document.createElementNS(NS,tag);for(const [key,value] of Object.entries(attributes))n.setAttribute(key,value);if(text!==undefined)n.textContent=text;return n;};

// A fixed sixteenth-note grid with percussion staff positions, not an image of a licensed score.
export function renderPracticeBar(bar,index){
 const button=document.createElement('button');button.type='button';button.className='practice-measure';button.dataset.practiceBar=index;button.setAttribute('aria-label','第 '+(index+1)+' 小节，设为起点');button.setAttribute('aria-pressed','false');
 const label=document.createElement('span');label.textContent=String(index+1).padStart(2,'0');button.append(label);
 const svg=node('svg',{viewBox:'0 0 340 130',role:'img','aria-label':bar.hits.filter(h=>h.velocity>0).map(h=>names[h.type]+' 第'+(h.step+1)+'格').join('，')||'休止小节'});
 const description=node('desc',{id:'practice-description-'+(++descriptionId)},svg.getAttribute('aria-label'));svg.append(description);button.setAttribute('aria-describedby',description.id);
 const cursor=node('rect',{x:30,y:15,width:18,height:94,class:'practice-cursor',rx:2});svg.append(cursor);
 for(let line=0;line<5;line++)svg.append(node('line',{x1:24,y1:40+line*12,x2:329,y2:40+line*12,class:'practice-staff'}));
 for(let beat=0;beat<=4;beat++)svg.append(node('line',{x1:30+beat*72,y1:20,x2:30+beat*72,y2:99,class:'practice-staff','stroke-dasharray':beat===0||beat===4?'':'2 4'}));
 for(let s=0;s<16;s++)svg.append(node('text',{x:39+s*18,y:121,'text-anchor':'middle',class:'practice-count'},s%4===0?String(s/4+1):s%4===2?'&':s%4===1?'e':'a'));
 const y={kick:82,snare:58,hat:34,tom:46};
 for(const hit of bar.hits.filter(h=>h.velocity>0)){
  const x=39+hit.step*18,cy=y[hit.type],group=node('g',{class:'practice-note',opacity:hit.velocity<.6?.58:1});
  if(hit.type==='hat'){group.append(node('path',{d:`M${x-3.5} ${cy-3.5}l7 7m-7 0 7-7`,fill:'none'}));}else group.append(node('ellipse',{cx:x,cy,rx:4.7,ry:3.1,transform:`rotate(-20 ${x} ${cy})`}));
  // Each marked grid cell is a discrete percussion attack; stems show voice direction.
  if(hit.type==='kick')group.append(node('line',{x1:x-4,y1:cy,x2:x-4,y2:107}));else group.append(node('line',{x1:x+4,y1:cy,x2:x+4,y2:17}));
  svg.append(group);
 }
 button.append(svg);return button;
}

export function initPractice(){
 const host=$('[data-practice]');if(!host)return;if(controllers.has(host))return controllers.get(host);
 const listeners=[],barListeners=[];let destroyed=false;
 const listen=(target,event,handler)=>{target.addEventListener(event,handler);listeners.push(()=>target.removeEventListener(event,handler));};
 const sheet=$('[data-practice-sheet]',host),select=$('[data-practice-demo]',host),play=$('[data-practice-play]',host),status=$('[data-practice-status]',host),position=$('[data-practice-position]',host),from=$('[data-practice-start]',host),to=$('[data-practice-end]',host),bpm=$('[data-practice-bpm]',host),remove=$('[data-practice-remove-recording]',host),recordings=new Map(),audio=new LivehouseAudio();audio.setVolume(Number($('[data-practice-volume]',host).value)/100);
 let project=validatePractice(PRACTICE_DEMOS[0]),importedProject=null,startBar=0,endBar=project.bars.length-1,tempo=project.bpm,state='stopped',generation=0,timer=0,origin=0,next=-16,visuals=new Set(),active=-1;
 const say=text=>{status.textContent=text;};
 const challenge=initPracticeChallenge({host,listen,start:()=>start(true),stop,elapsed:event=>((challengeInputTime(event?.timeStamp,performance.now(),performance.timeOrigin)-origin)/1000)-4*60/tempo,sound:type=>audio.hit(type,.75)});
 const configureChallenge=()=>challenge.configure(project,tempo,startBar,endBar);
 function clearVisuals(){visuals.forEach(clearTimeout);visuals.clear();$$('.practice-measure',sheet).forEach(b=>b.classList.remove('is-current'));$$('.practice-beats i',host).forEach(b=>b.classList.remove('active'));active=-1;}
 function stop(message='已停止；谱面和选区保留。'){generation++;clearInterval(timer);timer=0;audio.stop();state='stopped';challenge.cancel();play.setAttribute('aria-pressed','false');play.textContent='开始跟练';clearVisuals();position.textContent='准备';if(message)say(message);}
 function paintRange(){
  from.value=String(startBar);to.value=String(endBar);
  $$('[data-practice-bar]',sheet).forEach(b=>{const n=Number(b.dataset.practiceBar);b.classList.toggle('is-outside',n<startBar||n>endBar);b.setAttribute('aria-pressed',String(n===startBar));});configureChallenge();
 }
 function render(){
  remove.hidden=!select.value.startsWith('recording:');
  $('[data-practice-title]',host).textContent=project.title;$('[data-practice-description]',host).textContent=project.description;bpm.value=String(tempo);$('[data-practice-bpm-label]',host).textContent=String(tempo);
  barListeners.splice(0).forEach(remove=>remove());sheet.replaceChildren();from.replaceChildren();to.replaceChildren();project.bars.forEach((bar,index)=>{
   for(const s of [from,to]){const o=document.createElement('option');o.value=String(index);o.textContent=(index+1)+' 小节';s.append(o);}
   const button=renderPracticeBar(bar,index),choose=()=>{stop('从第 '+(index+1)+' 小节开始。');startBar=index;endBar=Math.max(index,endBar);paintRange();};button.addEventListener('click',choose);barListeners.push(()=>button.removeEventListener('click',choose));sheet.append(button);
  });paintRange();
 }
 function clickBeat(strong,delay){
  const ctx=audio.context;if(!ctx||ctx.state!=='running'||!audio.master)return;
  const osc=ctx.createOscillator(),gain=ctx.createGain(),at=ctx.currentTime+Math.max(0,delay);osc.type='sine';osc.frequency.value=strong?1400:1000;gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.15,at+.002);gain.gain.exponentialRampToValueAtTime(.0001,at+.035);osc.connect(gain);gain.connect(audio.master);osc.start(at);osc.stop(at+.04);osc.onended=()=>{osc.disconnect();gain.disconnect();};
 }
 function paintStep(ordinal,length){
  challenge.paint(ordinal,length);
  if(ordinal<0){position.textContent='预备 '+(Math.floor((ordinal+16)/4)+1);$$('.practice-beats i',host).forEach((n,i)=>n.classList.toggle('active',i===Math.floor((ordinal+16)/4)));return;}
  const step=ordinal%length,bar=startBar+Math.floor(step/16),within=step%16;
  if(active!==bar){$$('.practice-measure',sheet).forEach(b=>b.classList.toggle('is-current',Number(b.dataset.practiceBar)===bar));active=bar;}
  const current=$('[data-practice-bar="'+bar+'"]',sheet);$('.practice-cursor',current).setAttribute('x',30+within*18);position.textContent=(bar+1)+' / '+project.bars.length+' · '+(Math.floor(within/4)+1);$$('.practice-beats i',host).forEach((n,i)=>n.classList.toggle('active',i===Math.floor(within/4)));
 }
 async function start(isChallenge=false){
  if(destroyed||document.hidden||(isChallenge&&$('dialog[open]')))return;
  if(state!=='stopped'){const switching=isChallenge&&!challenge.busy();stop();if(!switching)return;}
  if(isChallenge&&!challenge.prepare())return;
  document.dispatchEvent(new CustomEvent('atelier:practice-start'));
  state='starting';const token=++generation;play.textContent='准备中…';play.setAttribute('aria-pressed','true');
  try{
   const ready=await audio.enable();if(!ready||token!==generation||document.hidden){if(token===generation)stop('未能启动音频，请再次点击。');return;}
   state='playing';play.textContent=isChallenge?'停止挑战':'暂停跟练';say('先数四拍，再一起开始。');origin=performance.now()+100;next=-16;if(isChallenge)challenge.begin();
   const length=(endBar-startBar+1)*16,events=flattenPractice(project,startBar,endBar),byStep=new Map();for(const e of events){const step=Math.round(e.beat*4);if(!byStep.has(step))byStep.set(step,[]);byStep.get(step).push(e);}
   function schedule(){
    if(token!==generation||state!=='playing'||document.hidden)return;
    const elapsed=(performance.now()-origin)/1000,stepSeconds=60/tempo/4;
    if(isChallenge&&elapsed>=(length+16)*stepSeconds+CHALLENGE_WINDOW){challenge.finish();stop('这一遍挑战完成，成绩在挑战面板。');return;}
    if(!isChallenge&&!$('[data-practice-loop]',host).checked&&elapsed>=(length+16)*stepSeconds){stop('这一遍练完了。');return;}
    const current=Math.floor(elapsed/stepSeconds)-16;if(current-next>32)next=Math.max(-16,current);
    let count=0;
    while((next+16)*stepSeconds<=elapsed+.1&&count++<32){
     const ordinal=next++,delay=(ordinal+16)*stepSeconds-elapsed;if(delay<-.15)continue;
     if(isChallenge&&ordinal>=length)return;
     if(ordinal>=length&&!$('[data-practice-loop]',host).checked){const end=setTimeout(()=>{visuals.delete(end);if(token===generation)stop('这一遍练完了。');},Math.max(0,delay*1000));visuals.add(end);clearInterval(timer);timer=0;return;}
     if(ordinal<0){if(ordinal%4===0)clickBeat(ordinal===-16,delay);}else{
      if(!isChallenge&&$('[data-practice-drums]',host).checked)for(const e of byStep.get(ordinal%length)||[])audio.hit(e.type,e.velocity,48,delay);
      if(ordinal%4===0&&$('[data-practice-metronome]',host).checked)clickBeat(ordinal%16===0,delay);
     }
     const event=setTimeout(()=>{visuals.delete(event);if(token!==generation)return;paintStep(ordinal,length);if(ordinal===0)say(isChallenge?'正在跟拍；切后台会自动停止。':'正在跟练；切后台会自动停止。');},Math.max(0,delay*1000));visuals.add(event);
    }
   }
   timer=setInterval(schedule,25);schedule();
  }catch(error){if(token===generation)stop(error.message||'音频未能启动，请重试。');}
 }
 select.replaceChildren();
 for(const demo of PRACTICE_DEMOS){const o=document.createElement('option');o.value=demo.id;o.textContent=demo.title;select.append(o);}
 function addRecording(value){
  const key='recording:'+value.id;recordings.set(key,value);let option=Array.from(select.options).find(o=>o.value===key);
  if(!option){option=document.createElement('option');option.value=key;select.append(option);}
  option.textContent='现场录音 · '+value.title+' · '+value.id.slice(-5);return key;
 }
 function choose(demo,message='练习已切换。'){stop(message);project=validatePractice(demo);startBar=0;endBar=project.bars.length-1;tempo=project.bpm;render();}
 function receiveRecording(id){
  try{const value=readRecording(window.localStorage,id);if(!value)throw Error('找不到这段本机录音。');select.value=addRecording(value);choose(value,'现场录音已载入，点击开始后数四拍。');return true;}
  catch{say('无法读取这段本机录音；原谱面保留。可从现场下载 JSON 后导入。');return false;}
 }
 try{for(const value of listRecordings(window.localStorage))addRecording(value);}catch{ /* Demos and JSON import work without local storage. */ }
 listen(select,'change',()=>{const demo=select.value==='local-import'?importedProject:recordings.get(select.value)||PRACTICE_DEMOS.find(d=>d.id===select.value);if(demo)choose(demo);});
 listen(remove,'click',()=>{
  const value=recordings.get(select.value);if(!value)return;stop();
  if(!window.confirm('从本机移除这段现场录音？需要备份时，请先导出鼓谱。'))return;
  try{removeRecording(window.localStorage,value.id);recordings.delete(select.value);select.selectedOptions[0].remove();select.value=PRACTICE_DEMOS[0].id;choose(PRACTICE_DEMOS[0],'本机录音已移除，其他练习保留。');}
  catch{say('未能移除录音；原谱面保留。');}
 });
 listen(play,'click',()=>start());listen($('[data-practice-stop]',host),'click',()=>stop());
 listen(bpm,'input',e=>{stop('速度已调整，点击开始重新数拍。');tempo=Math.max(40,Math.min(220,Number(e.target.value)||project.bpm));$('[data-practice-bpm-label]',host).textContent=String(tempo);configureChallenge();});
 listen($('[data-practice-volume]',host),'input',e=>audio.setVolume(Number(e.target.value)/100));
 listen(from,'change',()=>{stop();startBar=Number(from.value);endBar=Math.max(startBar,endBar);paintRange();});listen(to,'change',()=>{stop();endBar=Number(to.value);startBar=Math.min(startBar,endBar);paintRange();});
 listen($('[data-practice-loop]',host),'change',()=>stop('循环设置已更新。'));
 listen($('[data-practice-reset]',host),'click',()=>{stop('已恢复原速。');tempo=project.bpm;bpm.value=String(tempo);$('[data-practice-bpm-label]',host).textContent=String(tempo);configureChallenge();});
 listen($('[data-practice-export]',host),'click',()=>download('cc-original-drum-practice.json',JSON.stringify({...project,bpm:tempo},null,2)));
 listen($('[data-practice-import]',host),'change',async e=>{
  const input=e.currentTarget,file=input.files[0];input.value='';if(!file)return;
  stop();const ticket=generation;
  try{
   const value=validatePractice(await readImport(file,1));if(ticket!==generation)return;
   importedProject=value;project=validatePractice(value);tempo=value.bpm;startBar=0;endBar=value.bars.length-1;
   let imported=$('option[value="local-import"]',select);if(!imported){imported=document.createElement('option');imported.value='local-import';select.append(imported);}
   imported.textContent='本机导入 · '+value.title;select.value='local-import';render();say('鼓谱已在本机载入，没有上传。');
  }catch(error){if(ticket===generation)say(error.message||'导入失败；原谱面未改变。');}
 });
 // Every dialog entry point (including keyboard shortcuts) shares this event.
 // It also invalidates an in-flight import or audio enable before it can finish.
 listen(document,'atelier:dialog-open',()=>stop('已暂停；可随时回到谱面继续。'));
 listen(document,'atelier:recording-ready',event=>{if(receiveRecording(event.detail?.id))event.preventDefault();});
 listen(document,'click',event=>{if(state!=='stopped'&&event.target.closest('[data-practice-import]'))stop('已暂停；可随时回到谱面继续。');});
 listen(document,'visibilitychange',()=>{if(document.hidden)stop('已暂停，点击开始继续练习。');});listen(window,'pagehide',()=>stop(''));listen(document,'atelier:livehouse-open',()=>stop(''));listen(document,'atelier:studio-start',()=>stop(''));
 const controller={destroy(){if(destroyed)return;destroyed=true;stop('');listeners.splice(0).forEach(remove=>remove());barListeners.splice(0).forEach(remove=>remove());controllers.delete(host);}};
 controllers.set(host,controller);render();const requested=new URL(window.location.href).searchParams.get('recording');if(requested)receiveRecording(requested);$('.practice-app',host).hidden=false;return controller;
}
