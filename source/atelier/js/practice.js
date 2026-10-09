import {$,$$} from './ui.js';
import {LivehouseAudio} from './livehouse-audio.js';
import {PRACTICE_DEMOS,validatePractice,flattenPractice} from './practice-core.mjs';
import {download,readImport} from './archive-store.js';
const NS='http://www.w3.org/2000/svg',names={kick:'底鼓',snare:'军鼓',hat:'踩镲',tom:'通鼓'};
const node=(tag,attributes={},text)=>{const n=document.createElementNS(NS,tag);for(const [key,value] of Object.entries(attributes))n.setAttribute(key,value);if(text!==undefined)n.textContent=text;return n;};

// A fixed sixteenth-note grid with percussion staff positions, not an image of a licensed score.
export function renderPracticeBar(bar,index){
 const button=document.createElement('button');button.type='button';button.className='practice-measure';button.dataset.practiceBar=index;button.setAttribute('aria-label','第 '+(index+1)+' 小节，设为起点');button.setAttribute('aria-pressed','false');
 const label=document.createElement('span');label.textContent=String(index+1).padStart(2,'0');button.append(label);
 const svg=node('svg',{viewBox:'0 0 340 130',role:'img','aria-label':bar.hits.filter(h=>h.velocity>0).map(h=>names[h.type]+' 第'+(h.step+1)+'格').join('，')||'休止小节'});
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
 const host=$('[data-practice]');if(!host)return;
 const sheet=$('[data-practice-sheet]',host),select=$('[data-practice-demo]',host),play=$('[data-practice-play]',host),status=$('[data-practice-status]',host),position=$('[data-practice-position]',host),from=$('[data-practice-start]',host),to=$('[data-practice-end]',host),bpm=$('[data-practice-bpm]',host),audio=new LivehouseAudio();audio.setVolume(.25);
 let project=validatePractice(PRACTICE_DEMOS[0]),startBar=0,endBar=project.bars.length-1,tempo=project.bpm,state='stopped',generation=0,timer=0,origin=0,next=-16,visuals=new Set(),active=-1;
 const say=text=>{status.textContent=text;};
 function clearVisuals(){visuals.forEach(clearTimeout);visuals.clear();$$('.practice-measure',sheet).forEach(b=>b.classList.remove('is-current'));$$('.practice-beats i',host).forEach(b=>b.classList.remove('active'));active=-1;}
 function stop(message='已停止；谱面和选区保留。'){generation++;clearInterval(timer);timer=0;audio.stop();state='stopped';play.setAttribute('aria-pressed','false');play.textContent='开始跟练';clearVisuals();position.textContent='准备';if(message)say(message);}
 function paintRange(){
  from.value=String(startBar);to.value=String(endBar);
  $$('[data-practice-bar]',sheet).forEach(b=>{const n=Number(b.dataset.practiceBar);b.classList.toggle('is-outside',n<startBar||n>endBar);b.setAttribute('aria-pressed',String(n===startBar));});
 }
 function render(){
  $('[data-practice-title]',host).textContent=project.title;$('[data-practice-description]',host).textContent=project.description;bpm.value=String(tempo);$('[data-practice-bpm-label]',host).textContent=String(tempo);
  sheet.replaceChildren();from.replaceChildren();to.replaceChildren();project.bars.forEach((bar,index)=>{
   for(const s of [from,to]){const o=document.createElement('option');o.value=String(index);o.textContent=(index+1)+' 小节';s.append(o);}
   const button=renderPracticeBar(bar,index);button.addEventListener('click',()=>{stop('从第 '+(index+1)+' 小节开始。');startBar=index;endBar=Math.max(index,endBar);paintRange();});sheet.append(button);
  });paintRange();
 }
 function clickBeat(strong,delay){
  const ctx=audio.context;if(!ctx||ctx.state!=='running'||!audio.master)return;
  const osc=ctx.createOscillator(),gain=ctx.createGain(),at=ctx.currentTime+Math.max(0,delay);osc.type='sine';osc.frequency.value=strong?1400:1000;gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.15,at+.002);gain.gain.exponentialRampToValueAtTime(.0001,at+.035);osc.connect(gain);gain.connect(audio.master);osc.start(at);osc.stop(at+.04);osc.onended=()=>{osc.disconnect();gain.disconnect();};
 }
 function paintStep(ordinal,length){
  if(ordinal<0){position.textContent='预备 '+(Math.floor((ordinal+16)/4)+1);$$('.practice-beats i',host).forEach((n,i)=>n.classList.toggle('active',i===Math.floor((ordinal+16)/4)));return;}
  const step=ordinal%length,bar=startBar+Math.floor(step/16),within=step%16;
  if(active!==bar){$$('.practice-measure',sheet).forEach(b=>b.classList.toggle('is-current',Number(b.dataset.practiceBar)===bar));active=bar;}
  const current=$('[data-practice-bar="'+bar+'"]',sheet);$('.practice-cursor',current).setAttribute('x',30+within*18);position.textContent=(bar+1)+' / '+project.bars.length+' · '+(Math.floor(within/4)+1);$$('.practice-beats i',host).forEach((n,i)=>n.classList.toggle('active',i===Math.floor(within/4)));
 }
 async function start(){
  if(state!=='stopped'){stop();return;}
  state='starting';const token=++generation;play.textContent='准备中…';play.setAttribute('aria-pressed','true');
  try{
   const ready=await audio.enable();if(!ready||token!==generation||document.hidden){if(token===generation)stop('未能启动音频，请再次点击。');return;}
   state='playing';play.textContent='暂停跟练';say('先数四拍，再一起开始。');origin=performance.now()+100;next=-16;
   const length=(endBar-startBar+1)*16,events=flattenPractice(project,startBar,endBar),byStep=new Map();for(const e of events){const step=Math.round(e.beat*4);if(!byStep.has(step))byStep.set(step,[]);byStep.get(step).push(e);}
   function schedule(){
    if(token!==generation||state!=='playing'||document.hidden)return;
    const elapsed=(performance.now()-origin)/1000,stepSeconds=60/tempo/4;
    if(!$('[data-practice-loop]',host).checked&&elapsed>=(length+16)*stepSeconds){stop('这一遍练完了。');return;}
    const current=Math.floor(elapsed/stepSeconds)-16;if(current-next>32)next=Math.max(-16,current);
    let count=0;
    while((next+16)*stepSeconds<=elapsed+.1&&count++<32){
     const ordinal=next++,delay=(ordinal+16)*stepSeconds-elapsed;if(delay<-.15)continue;
     if(ordinal>=length&&!$('[data-practice-loop]',host).checked){const end=setTimeout(()=>{visuals.delete(end);if(token===generation)stop('这一遍练完了。');},Math.max(0,delay*1000));visuals.add(end);clearInterval(timer);timer=0;return;}
     if(ordinal<0){if(ordinal%4===0)clickBeat(ordinal===-16,delay);}else{
      if($('[data-practice-drums]',host).checked)for(const e of byStep.get(ordinal%length)||[])audio.hit(e.type,e.velocity,48,delay);
      if(ordinal%4===0&&$('[data-practice-metronome]',host).checked)clickBeat(ordinal%16===0,delay);
     }
     const event=setTimeout(()=>{visuals.delete(event);if(token!==generation)return;paintStep(ordinal,length);if(ordinal===0)say('正在跟练；切后台会自动停止。');},Math.max(0,delay*1000));visuals.add(event);
    }
   }
   timer=setInterval(schedule,25);schedule();
  }catch(error){if(token===generation)stop(error.message||'音频未能启动，请重试。');}
 }
 for(const demo of PRACTICE_DEMOS){const o=document.createElement('option');o.value=demo.id;o.textContent=demo.title;select.append(o);}
 select.addEventListener('change',()=>{stop('原创练习已切换。');const demo=PRACTICE_DEMOS.find(d=>d.id===select.value);if(!demo)return;project=validatePractice(demo);startBar=0;endBar=project.bars.length-1;tempo=project.bpm;render();});
 play.addEventListener('click',start);$('[data-practice-stop]',host).addEventListener('click',()=>stop());
 bpm.addEventListener('input',e=>{stop('速度已调整，点击开始重新数拍。');tempo=Math.max(40,Math.min(220,Number(e.target.value)||project.bpm));$('[data-practice-bpm-label]',host).textContent=String(tempo);});
 $('[data-practice-volume]',host).addEventListener('input',e=>audio.setVolume(Number(e.target.value)/100));
 from.addEventListener('change',()=>{stop();startBar=Number(from.value);endBar=Math.max(startBar,endBar);paintRange();});to.addEventListener('change',()=>{stop();endBar=Number(to.value);startBar=Math.min(startBar,endBar);paintRange();});
 $('[data-practice-loop]',host).addEventListener('change',()=>stop('循环设置已更新。'));
 $('[data-practice-reset]',host).addEventListener('click',()=>{stop('已恢复原速。');tempo=project.bpm;bpm.value=String(tempo);$('[data-practice-bpm-label]',host).textContent=String(tempo);});
 $('[data-practice-export]',host).addEventListener('click',()=>download('cc-original-drum-practice.json',JSON.stringify({...project,bpm:tempo},null,2)));
 $('[data-practice-import]',host).addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;stop();const ticket=generation;try{const value=validatePractice(await readImport(file,1));if(ticket!==generation)return;project=value;tempo=value.bpm;startBar=0;endBar=value.bars.length-1;let imported=$('option[value="local-import"]',select);if(!imported){imported=document.createElement('option');imported.value='local-import';select.append(imported);}imported.textContent='本机导入 · '+value.title;select.value='local-import';render();say('鼓谱已在本机载入，没有上传。');}catch(error){if(ticket===generation)say(error.message||'导入失败；原谱面未改变。');}e.target.value='';});
 document.addEventListener('click',event=>{if(state!=='stopped'&&event.target.closest('.rhythm-open,.menu-open,.lighting-open,.search-open,[data-practice-import]'))stop('已暂停；可随时回到谱面继续。');});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop('已暂停，点击开始继续练习。');});window.addEventListener('pagehide',()=>stop(''));document.addEventListener('atelier:livehouse-open',()=>stop(''));
 render();$('.practice-app',host).hidden=false;
}
