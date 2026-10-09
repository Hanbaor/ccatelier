import {$,$$} from './ui.js';
import {RhythmTake} from './livehouse-recording-core.mjs';
import {saveRecording} from './livehouse-recording-store.mjs';
import {flattenPractice} from './practice-core.mjs';
import {download} from './archive-store.js';

/** Pad events only. This never accesses a microphone, uploads, or enables audio. */
export function initLiveRecorder({dialog, audio, isSoundEnabled, beforeStart, silence, pulse}) {
 const panel=$('[data-live-recorder]',dialog),record=$('[data-live-record]',panel),replay=$('[data-live-replay]',panel),send=$('[data-live-send]',panel),exportButton=$('[data-live-record-export]',panel),bpm=$('[data-live-record-bpm]',panel),bars=$('[data-live-record-bars]',panel),status=$('[data-live-record-status]',panel),position=$('[data-live-record-position]',panel),strip=$('[data-live-record-strip]',panel);
 let state='idle',take=null,completed=null,timer=0,origin=0,cursor=0,nextBeat=0,generation=0,lastStep=-1,events=[],visuals=new Set();
 const say=text=>{status.textContent=text;};
 const busy=()=>state==='counting'||state==='recording'||state==='replaying';
 function sync() {
  record.setAttribute('aria-pressed',String(state==='counting'||state==='recording'));
  record.textContent=state==='counting'||state==='recording'?'取消录制':completed?'重录这段':'开始录制';
  replay.setAttribute('aria-pressed',String(state==='replaying'));replay.textContent=state==='replaying'?'停止回放':'回放';
  replay.disabled=!completed||state==='counting'||state==='recording';send.disabled=exportButton.disabled=!completed||busy();
  bpm.disabled=bars.disabled=busy();dialog.classList.toggle('livehouse-recording',state==='recording');
 }
 function clearWork() {
  generation++;clearInterval(timer);timer=0;visuals.forEach(clearTimeout);visuals.clear();lastStep=-1;
  $$('.is-current',strip).forEach(cell=>cell.classList.remove('is-current'));
 }
 function cancel(message='录制已取消；上一段保留。') {
  const active=busy();clearWork();state='idle';take=null;position.textContent='准备';if(completed)paint(completed);else strip.replaceChildren();sync();
  if(active){silence();say(message);}
 }
 function paint(project) {
  strip.replaceChildren();
  for(let index=0;index<project.bars.length*16;index++){
   const cell=document.createElement('i');cell.dataset.recordCell=index;cell.className=project.bars[Math.floor(index/16)].hits.some(hit=>hit.step===index%16)?'has-hit':'';strip.append(cell);
  }
  strip.style.setProperty('--take-steps',String(project.bars.length*16));
 }
 function scheduleVisual(callback,delay) {
  const token=generation,id=setTimeout(()=>{visuals.delete(id);if(token===generation&&busy())callback();},Math.max(0,delay));visuals.add(id);
 }
 function finishRecording() {
  const result=take.finish(),count=take.size;clearWork();take=null;state='idle';
  if(count){completed=result;paint(completed);position.textContent=`${completed.bars.length} 小节 · ${count} 个鼓点`;say('录好了。回放检查，或送去排练；尚未保存。');}
  else {if(completed)paint(completed);else strip.replaceChildren();position.textContent='没有鼓点';say(completed?'没有录到鼓点；上一段保留。':'没有录到鼓点，数完四拍后再敲鼓面。');}
  sync();
 }
 function tickRecording() {
  if(!dialog.open||document.hidden){cancel('录制已取消；回到现场后可重新录制。');return;}
  const elapsed=performance.now()-origin,beatMs=60000/take.project.bpm,playAt=beatMs*4;
  if(elapsed>=playAt+take.durationMs){finishRecording();return;}
  if(elapsed>=playAt&&state==='counting'){state='recording';say('正在录制，只收下你敲出的鼓点。');sync();}
  const beat=Math.floor(elapsed/beatMs);
  position.textContent=elapsed<0?'预备':elapsed<playAt?'预备 '+(beat+1):`${Math.floor((elapsed-playAt)/beatMs/4)+1} / ${take.project.bars.length} · ${Math.floor((elapsed-playAt)/beatMs)%4+1}`;
  // Missed callbacks never generate a burst of catch-up clicks.
  nextBeat=Math.max(nextBeat,Math.floor(elapsed/beatMs));
  while(nextBeat*beatMs<=elapsed+80&&nextBeat<4+take.project.bars.length*4){
   const ordinal=nextBeat++,delay=ordinal*beatMs-elapsed;
   if(delay>=-80&&isSoundEnabled())audio.click(ordinal%4===0,Math.max(0,delay)/1000);
  }
  if(elapsed>=playAt){const step=Math.min(take.project.bars.length*16-1,Math.floor((elapsed-playAt)/take.stepMs));if(step!==lastStep){$$('.is-current',strip).forEach(cell=>cell.classList.remove('is-current'));$('[data-record-cell="'+step+'"]',strip)?.classList.add('is-current');lastStep=step;}}
 }
 function startRecording() {
  if(!dialog.open||document.hidden)return;
  if(state==='counting'||state==='recording'){cancel();return;}
  cancel('回放已停止。');beforeStart();
  const tempo=Math.round(Math.max(40,Math.min(220,Number(bpm.value)||112)));bpm.value=String(tempo);
  const id='live-'+Date.now().toString(36)+'-'+(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)).replaceAll('-','').slice(0,20);
  take=new RhythmTake({id,bpm:tempo,bars:Number(bars.value)});take.project.title='现场灵感 · '+new Date().toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});state='counting';origin=performance.now()+120;nextBeat=0;
  paint(take.finish());say('先数四拍，再录 '+take.project.bars.length+' 小节。'+(isSoundEnabled()?'':' 当前静音，可开启声音。'));sync();timer=setInterval(tickRecording,25);tickRecording();
 }
 function tickReplay() {
  if(!dialog.open||document.hidden){cancel('回放已停止。');return;}
  const elapsed=performance.now()-origin,stepMs=60000/completed.bpm/4,length=completed.bars.length*16;
  if(elapsed>=length*stepMs){clearWork();state='idle';position.textContent='回放结束';sync();say('回放结束；可以送去排练。');return;}
  const step=Math.max(0,Math.floor(elapsed/stepMs));
  if(step!==lastStep){$$('.is-current',strip).forEach(cell=>cell.classList.remove('is-current'));$('[data-record-cell="'+step+'"]',strip)?.classList.add('is-current');lastStep=step;position.textContent=`回放 ${Math.floor(step/16)+1} / ${completed.bars.length}`;}
  while(cursor<events.length&&events[cursor].beat*60000/completed.bpm<=elapsed+80){
   const event=events[cursor++],delay=event.beat*60000/completed.bpm-elapsed;if(delay< -100)continue;
   if(isSoundEnabled())audio.hit(event.type,event.velocity,48,Math.max(0,delay)/1000);
   scheduleVisual(()=>pulse(event.type,event.velocity),delay);
  }
 }
 record.addEventListener('click',startRecording);
 replay.addEventListener('click',()=>{
  if(!completed||!dialog.open)return;if(state==='replaying'){cancel('回放已停止。');return;}
  cancel();beforeStart();state='replaying';origin=performance.now()+120;cursor=0;events=flattenPractice(completed);paint(completed);sync();say(isSoundEnabled()?'回放量化后的节奏。':'静音回放，可开启声音。');timer=setInterval(tickReplay,25);tickReplay();
 });
 send.addEventListener('click',()=>{
  if(!completed||busy()||!dialog.open)return;
  try{saveRecording(window.localStorage,completed);}
  catch(error){say(error.message?.includes('录音已满')?error.message:'本机保存不可用。请下载 JSON，再到排练室导入。');return;}
  const url=new URL(send.dataset.practiceUrl,window.location.href);url.searchParams.set('recording',completed.id);say('已保存到独立录音，正在打开排练室。');
  const handoff=new CustomEvent('atelier:recording-ready',{detail:{id:completed.id},cancelable:true});
  const handled=window.location.pathname===url.pathname&&!document.dispatchEvent(handoff);
  if(handled){const current=new URL(window.location.href);current.searchParams.set('recording',completed.id);window.history.replaceState(window.history.state,'',current.href);}
  dialog.close();if(!handled)window.location.assign(url.href);
 });
 exportButton.addEventListener('click',()=>{if(completed&&!busy())download('cc-live-rhythm.json',JSON.stringify(completed,null,2));});
 panel.addEventListener('toggle',()=>{if(!panel.open&&busy())cancel('录制或回放已取消；已完成的节奏保留。');});
 sync();
 return {
  capture(type){
   if(!take||!['counting','recording'].includes(state))return;
   const elapsed=performance.now()-origin-240000/take.project.bpm;
   if(take.capture(type,elapsed)){const step=Math.min(take.project.bars.length*16-1,Math.round(elapsed/take.stepMs));$('[data-record-cell="'+step+'"]',strip)?.classList.add('has-hit');}
  },
  cancel,
 };
}
