import {$,$$,motion,closeDialogs} from './ui.js';
import {LivehouseAudio} from './livehouse-audio.js';
import {initLiveRecorder} from './livehouse-recorder.js';
import {originalPerformance,evaluateAt} from './performance-core.mjs';
import {PerformanceTransport} from './performance-transport.mjs';
import {initDirector} from './livehouse-director.js';

export function initLivehouse({loadStage=()=>import('./livehouse-stage.js')}={}){
 const dialog=$('#livehouse-dialog');if(!dialog)return {open(){}};
 const canvas=$('[data-live-canvas]',dialog),ctx=canvas.getContext('2d'),audio=new LivehouseAudio();
 let project=originalPerformance(),staticFrameKey='';
 const transportClock=new PerformanceTransport(project,{schedule:(event,delay)=>{if(sound)audio.hit(event.instrument,event.velocity,event.note,delay);},cancel:()=>audio.cancelScheduled()});
 const pauseButton=$('[data-live-pause]',dialog),framing=$('[data-live-framing]',dialog);
 const showButton=$('[data-live-show]',dialog),soundButton=$('[data-live-sound]',dialog),motionButton=$('[data-live-motion]',dialog),status=$('[data-live-status]',dialog),announcement=$('[data-live-announcement]',dialog),scene=$('[data-live-scene]',dialog),progress=$('[data-live-progress]',dialog),timeline=progress.parentElement;
 const pads=new Map($$('[data-live-pad]',dialog).map(p=>[p.dataset.livePad,p]));
 const sections={arrival:'灯光亮起',build:'找到节奏',chorus:'这一刻，尽情演奏',finale:'最后一拍，也属于你'};
 let opener=null,sound=false,playing=false,scheduler=0,raf=0,last=0,clock=0,energy=0,visualAt=-1000,localMotion=true,generation=0,section='',hits=0,width=0,height=0;
 let pointer=.5,target=.5,rings=[],visualTimers=new Set(),padTimers=new Map(),padLast=new Map();
 const wave=new Uint8Array(256);
 let stage=null,stageAbort=null,stageGeneration=0,hitSummary=0,summaryVersion=0,soundGeneration=0;
 const animated=()=>motion.enabled&&localMotion;
 function clearHitSummary(){clearTimeout(hitSummary);hitSummary=0;summaryVersion++;}
 function say(text){clearHitSummary();status.textContent=text;if(announcement)announcement.textContent=text;}
 function summarizeHits(text){
  clearHitSummary();status.textContent=text;const version=summaryVersion;
  // Keep the visual counter immediate; announce only after a pause in playing.
  hitSummary=setTimeout(()=>{if(version!==summaryVersion)return;hitSummary=0;if(dialog.open&&!document.hidden&&announcement)announcement.textContent=text;},700);
 }
 function syncSound(){soundButton.setAttribute('aria-pressed',String(sound));$('span',soundButton).textContent=sound?'声音已开启':'开启声音';}
 function syncMotion(){const active=animated();dialog.classList.toggle('livehouse-still',!active);motionButton.setAttribute('aria-pressed',String(active));motionButton.textContent=active?'动态灯光':'静态灯光';motionButton.disabled=!motion.enabled;motionButton.title=motion.enabled?'只切换现场动效':'已遵循全站或系统减少动态设置';stage?.setMotion(active);wake();}
 function pulse(type,velocity=.7){
  const now=performance.now();
  if(transportClock.state==='stopped'||transportClock.state==='ended')stage?.strike(type,velocity);
  // Soft light envelopes, never high-frequency full-screen flashes.
  if(now-visualAt>=400){energy=Math.max(energy,velocity*.65);visualAt=now;if(animated()){rings.push({at:now,type});rings=rings.slice(-5);}}
  const pad=pads.get(type);if(!pad||!animated()||now-(padLast.get(type)||-1000)<400)return;
  padLast.set(type,now);pad.classList.add('is-hit');clearTimeout(padTimers.get(type));padTimers.set(type,setTimeout(()=>{pad.classList.remove('is-hit');padTimers.delete(type);},430));wake();
 }
 function hit(type){if(!dialog.open||document.hidden)return;audio.hit(type);pulse(type);recorder.capture(type);hits++;summarizeHits(sound?'即兴演奏 · '+hits+' 拍':'静音试奏 · '+hits+' 拍');}
 function clearVisuals(){visualTimers.forEach(clearTimeout);visualTimers.clear();padTimers.forEach(clearTimeout);padTimers.clear();pads.forEach(p=>p.classList.remove('is-hit'));rings=[];energy=0;stage?.clear();}
 function syncPauseControl(){
  if(!pauseButton)return;const active=transportClock.state==='playing';
  // Keep keyboard focus in the transport before removing its focused control.
  if(!active&&dialog.open&&document.activeElement===pauseButton)showButton.focus({preventScroll:true});
  pauseButton.disabled=!active;pauseButton.hidden=!active;pauseButton.textContent='暂停';pauseButton.setAttribute('aria-label','暂停演出');
 }
 function paintPerformance(render=false){
  const beat=transportClock.position,frame=evaluateAt(project,beat,{motion:animated()});
  section=frame.section;if(transportClock.state==='playing'||transportClock.state==='paused')scene.textContent=sections[section];dialog.dataset.liveScene=section;
  progress.style.setProperty('--show-progress',beat>=project.beats?'100%':(beat/project.beats*100).toFixed(2)+'%');timeline.setAttribute('aria-valuemax',String(project.beats));timeline.setAttribute('aria-valuenow',String(Math.floor(beat)));director.paint(beat);
  const shot=frame.shot,narrow=window.innerWidth<=760,factor=narrow?.45:1;
  if(framing){framing.style.transform=`translate(${shot.x*factor}%,${shot.y*factor}%) scale(${1+(shot.scale-1)*factor})`;framing.style.setProperty('--performance-light',frame.light.color.map(Math.round).join(','));framing.style.setProperty('--performance-level',frame.light.level);}
  if(render)stage?.setTimeline?.(transportClock.state==='stopped'||transportClock.state==='ended'?null:frame.strikes,frame.light);
  if(transportClock.state!=='stopped'){
   pads.forEach((pad,type)=>{const hit=frame.strikes[type];pad.classList.toggle('performance-hit',animated()&&hit.elapsed<180&&hit.velocity>0);});
  }
  syncPauseControl();
  return frame;
 }
 function stopShow(message='演出已停止'){
  playing=false;generation++;clearInterval(scheduler);scheduler=0;transportClock.stop();clearVisuals();pads.forEach(p=>p.classList.remove('performance-hit'));showButton.setAttribute('aria-pressed','false');$('span',showButton).textContent='再来一场';dialog.classList.remove('livehouse-playing');paintPerformance(true);wake();if(message)say(message);
 }
 function silence(){soundGeneration++;clearHitSummary();transportClock.clock(()=>performance.now()/1000);sound=false;soundButton.disabled=false;audio.stop();syncSound();}
 function transport(){
  if(!playing||!dialog.open||document.hidden)return;
  transportClock.tick();const frame=paintPerformance();if(!animated()){const key=JSON.stringify([frame.light,frame.shot]);if(key!==staticFrameKey){staticFrameKey=key;wake();}}
  if(transportClock.state==='ended'){playing=false;clearInterval(scheduler);scheduler=0;showButton.setAttribute('aria-pressed','false');$('span',showButton).textContent='再来一场';dialog.classList.remove('livehouse-playing');say('演出结束 · 轮到你了');scene.textContent='舞台还在，继续你的节奏';}
 }
 function toggleShow(){
  recorder.cancel('录制或回放已取消；已完成的节奏保留。');
  if(playing){stopShow();silence();return;}
  if(transportClock.state==='paused'){pauseShow();return;}
  clearVisuals();playing=true;generation++;transportClock.seek(0);transportClock.play();section='';showButton.setAttribute('aria-pressed','true');$('span',showButton).textContent='停止演出';dialog.classList.add('livehouse-playing');say(sound?'导演现场 · '+Math.round(project.beats*60/project.bpm)+' 秒':'静音演出 · 可随时开启声音');scheduler=setInterval(transport,25);transport();wake();
 }
 function pauseShow(){
  if(transportClock.state==='playing'){transportClock.pause();playing=false;clearInterval(scheduler);scheduler=0;showButton.setAttribute('aria-pressed','false');$('span',showButton).textContent='继续演出';dialog.classList.remove('livehouse-playing');say('已暂停，编排与位置保留。');}
  else if(transportClock.state==='paused'){transportClock.play();playing=true;showButton.setAttribute('aria-pressed','true');$('span',showButton).textContent='停止演出';dialog.classList.add('livehouse-playing');scheduler=setInterval(transport,25);transport();say(sound?'继续演出':'继续静音演出');}
  paintPerformance();wake();
 }
 async function toggleSound(){
  if(!dialog.open||document.hidden)return;
  if(sound){silence();say('声音已关闭，灯光继续');return;}
  const token=++soundGeneration;soundButton.disabled=true;say('正在开启声音…');
  try{const ready=await audio.enable();if(token!==soundGeneration)return;if(!dialog.open||document.hidden){audio.stop();return;}if(!ready){audio.stop();say('声音未开启，可继续静音体验。');return;}sound=true;transportClock.clock(()=>audio.context?.currentTime??performance.now()/1000);syncSound();say(playing?'声音已开启 · 可一起敲击鼓面':'声音已开启 · 从轻轻一拍开始');}
  catch(error){if(token!==soundGeneration||!dialog.open||document.hidden)return;audio.stop();say(error.message||'音频未能开启，可继续静音体验。');}
  finally{if(token===soundGeneration)soundButton.disabled=false;}
 }
 function draw(now){
  raf=0;if(!dialog.open||document.hidden||!ctx)return;
  if(now-last<32){raf=requestAnimationFrame(draw);return;}const dt=Math.min(80,now-last||33);last=now;
  const performanceFrame=paintPerformance(true);clock=performanceFrame.beat*60/project.bpm;pointer+=(target-pointer)*.035;energy*=Math.exp(-dt/600);
  ctx.clearRect(0,0,width,height);
  const active=animated(),phase=dialog.dataset.liveScene,boost=performanceFrame.light.level*1.2,lightColor=performanceFrame.light.color.map(Math.round).join(',');
  // Conical, feathered spotlights originate above the rig and aim toward the kit.
  for(let i=0;i<4;i++){
   const x=width*(.12+i*.255),y=-height*.1,angle=(i%2?-.22:.22)+(active?Math.sin(clock*.22+i*1.8)*.18:0);
   ctx.save();ctx.translate(x,y);ctx.rotate(angle);const g=ctx.createLinearGradient(0,0,0,height*.95);g.addColorStop(0,'rgba(255,235,183,0)');g.addColorStop(.3,`rgba(${lightColor},${(.07+energy*.10)*boost})`);g.addColorStop(1,'rgba(119,181,207,0)');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(-2,0);ctx.lineTo(-width*.105,height);ctx.lineTo(width*.105,height);ctx.lineTo(2,0);ctx.fill();ctx.restore();
  }
  // A continuous low-contrast floor lattice gives the illustrated stage depth.
  const horizon=height*.65;ctx.strokeStyle='rgba(124,183,205,.10)';ctx.lineWidth=1;
  for(let i=-4;i<=4;i++){ctx.beginPath();ctx.moveTo(width*.5+i*width*.035,horizon);ctx.lineTo(width*.5+i*width*.19,height*.87);ctx.stroke();}
  for(let i=0;i<5;i++){const y=horizon+(i*i/25)*height*.2;ctx.beginPath();ctx.ellipse(width*.5,y,width*(.24+i*.065),height*.021,0,0,Math.PI*2);ctx.stroke();}
  if(active){
   rings=rings.filter(r=>now-r.at<1600);for(const ring of rings){const age=(now-ring.at)/1600;ctx.strokeStyle=`rgba(240,206,138,${(1-age)*.19})`;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(width*.5,height*.74,width*(.12+age*.36),height*(.018+age*.09),0,0,Math.PI*2);ctx.stroke();}
   if(sound&&audio.analyser){audio.analyser.getByteTimeDomainData(wave);ctx.beginPath();ctx.strokeStyle='rgba(159,214,229,.34)';for(let i=0;i<wave.length;i++){const x=i/(wave.length-1)*width,y=height*.81+(wave[i]-128)/128*height*.09;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}
  }
  if(active&&(playing||energy>.01||rings.length))raf=requestAnimationFrame(draw);
 }
 function wake(){cancelAnimationFrame(raf);raf=0;last=0;if(dialog.open&&!document.hidden)raf=requestAnimationFrame(draw);}
 function resize(){const rect=dialog.getBoundingClientRect();width=rect.width;height=Math.max(rect.height,660);const scale=Math.min(1.5,1440/Math.max(width,1));canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);ctx?.setTransform(scale,0,0,scale,0,0);stage?.resize();wake();}
 function cleanup(){director.invalidate();dialog.dataset.liveStageState='closed';stageGeneration++;stageAbort?.abort();stageAbort=null;stage?.dispose();stage=null;recorder.cancel('录制或回放已取消；已完成的节奏保留。');stopShow('静音待场');silence();cancelAnimationFrame(raf);raf=0;document.body.classList.remove('livehouse-opened');dialog.classList.remove('livehouse-playing');opener?.focus({preventScroll:true});}
 async function enhanceStage(){
  const token=++stageGeneration;stageAbort=new AbortController();const signal=stageAbort.signal;
  const current=()=>!signal.aborted&&token===stageGeneration&&dialog.open;
  dialog.dataset.liveStageState='loading';let loaded=false;
  try{const module=await loadStage();if(!current())return;loaded=true;
   const created=await module.createLiveStage({dialog,kit:$('.livehouse-kit',dialog),pads,signal,isCurrent:()=>token===stageGeneration&&dialog.open,isMotion:animated});
   if(signal.aborted||token!==stageGeneration||!dialog.open){created?.dispose();return;}stage=created;if(!stage&&dialog.dataset.liveStageState==='loading')dialog.dataset.liveStageState='fallback';stage?.setVisible(!document.hidden);stage?.setMotion(animated());if(!document.hidden)paintPerformance(true);
  }catch{if(current())dialog.dataset.liveStageState=loaded?'init-failed':'module-load-failed';/* Native controls remain available. */}
 }
 const recorder=initLiveRecorder({dialog,audio,isSoundEnabled:()=>sound,silence,pulse,beforeStart(){clearHitSummary();if(transportClock.state!=='stopped'){const wasPlaying=playing;stopShow('演出已停止，舞台留给你的节奏');if(wasPlaying)silence();}clearVisuals();}});
 const director=initDirector({dialog,getProject:()=>project,change(value){recorder.cancel();project=value;transportClock.replace(project);playing=false;clearInterval(scheduler);scheduler=0;clearVisuals();showButton.setAttribute('aria-pressed','false');$('span',showButton).textContent='继续演出';dialog.classList.remove('livehouse-playing');paintPerformance();wake();},seek(beat){recorder.cancel();transportClock.seek(beat);if(transportClock.state==='stopped'||transportClock.state==='ended')transportClock.pause();clearVisuals();paintPerformance();wake();},onToggle(open){if(open){const recording=$('[data-live-recorder]',dialog);recording.open=false;}resize();}});
 const recordingPanel=$('[data-live-recorder]',dialog);recordingPanel.addEventListener('toggle',()=>{if(recordingPanel.open)$('[data-live-director]',dialog)?.removeAttribute('open');resize();});
 pauseButton?.addEventListener('click',()=>{if(transportClock.state==='playing')pauseShow();});syncPauseControl();
 showButton.addEventListener('click',toggleShow);soundButton.addEventListener('click',toggleSound);$('[data-live-close]',dialog).addEventListener('click',()=>dialog.close());
 $('[data-live-volume]',dialog).addEventListener('input',e=>audio.setVolume(Number(e.target.value)/100));motionButton.addEventListener('click',()=>{localMotion=!localMotion;clearVisuals();syncMotion();});
 pads.forEach((pad,type)=>{
  // Capture contact, not release: touch players use the same clock as keys.
  pad.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();pad.focus({preventScroll:true});hit(type);});
  // Native keyboard/assistive clicks have detail 0; pointer clicks already hit.
  pad.addEventListener('click',e=>{if(e.detail===0)hit(type);});
 });
 dialog.addEventListener('keydown',e=>{if(e.repeat&&e.target.closest('[data-live-pad]')&&['Enter',' '].includes(e.key)){e.preventDefault();return;}if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey||e.isComposing||e.target.closest('input,select,textarea,[contenteditable],[data-live-director]'))return;const type={a:'kick',s:'snare',d:'hat',f:'tom'}[e.key.toLowerCase()];if(type){e.preventDefault();hit(type);}});
 dialog.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'&&animated()&&transportClock.state==='stopped'){target=(e.clientX-dialog.getBoundingClientRect().left)/Math.max(width,1);stage?.pointer(target);}},{passive:true});
 dialog.addEventListener('close',cleanup);
 document.addEventListener('atelier:motion',syncMotion);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)director.invalidate();stage?.setVisible(!document.hidden);if(document.hidden&&dialog.open){recorder.cancel('录制已取消；回到现场后可重新录制。');stopShow('已暂停，点击重新开场');silence();cancelAnimationFrame(raf);raf=0;}else if(dialog.open)wake();});
 window.addEventListener('pagehide',()=>{if(dialog.open)dialog.close();else cleanup();});window.addEventListener('resize',()=>{if(dialog.open)resize();},{passive:true});
 return {open(button){
  if(dialog.open)return;opener=button;closeDialogs();document.dispatchEvent(new CustomEvent('atelier:livehouse-open'));
  $$('[data-src]',dialog).forEach(img=>{img.src=img.dataset.src;delete img.dataset.src;});$$('[data-srcset]',dialog).forEach(el=>{el.srcset=el.dataset.srcset;delete el.dataset.srcset;});
  sound=false;hits=0;section='';dialog.dataset.liveScene='arrival';scene.textContent='舞台交给你';progress.style.setProperty('--show-progress','0%');timeline.setAttribute('aria-valuenow','0');$('span',showButton).textContent='开始演出';syncSound();say('静音待场');document.body.classList.add('livehouse-opened');dialog.showModal();syncMotion();resize();$('[data-live-close]',dialog).focus({preventScroll:true});enhanceStage();
 }};
}
