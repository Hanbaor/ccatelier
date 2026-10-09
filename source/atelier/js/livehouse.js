import {$,$$,motion,closeDialogs} from './ui.js';
import {LivehouseAudio} from './livehouse-audio.js';
import {SCORE_BPM,SCORE_BEATS,SCORE_DURATION,scoreEvents,sectionAt} from './livehouse-score.mjs';
import {initLiveRecorder} from './livehouse-recorder.js';

export function initLivehouse(){
 const dialog=$('#livehouse-dialog');if(!dialog)return {open(){}};
 const canvas=$('[data-live-canvas]',dialog),ctx=canvas.getContext('2d'),audio=new LivehouseAudio(),score=scoreEvents();
 const showButton=$('[data-live-show]',dialog),soundButton=$('[data-live-sound]',dialog),motionButton=$('[data-live-motion]',dialog),status=$('[data-live-status]',dialog),scene=$('[data-live-scene]',dialog),progress=$('[data-live-progress]',dialog),timeline=progress.parentElement;
 const pads=new Map($$('[data-live-pad]',dialog).map(p=>[p.dataset.livePad,p]));
 const sections={arrival:'灯光亮起',build:'找到节奏',chorus:'这一刻，尽情演奏',finale:'最后一拍，也属于你'};
 let opener=null,sound=false,playing=false,start=0,cursor=0,scheduler=0,raf=0,last=0,clock=0,energy=0,visualAt=-1000,localMotion=true,generation=0,section='',hits=0,width=0,height=0;
 let pointer=.5,target=.5,rings=[],visualTimers=new Set(),padTimers=new Map(),padLast=new Map();
 const wave=new Uint8Array(256);
 const animated=()=>motion.enabled&&localMotion;
 function say(text){status.textContent=text;}
 function syncSound(){soundButton.setAttribute('aria-pressed',String(sound));$('span',soundButton).textContent=sound?'声音已开启':'开启声音';}
 function syncMotion(){const active=animated();dialog.classList.toggle('livehouse-still',!active);motionButton.setAttribute('aria-pressed',String(active));motionButton.textContent=active?'动态灯光':'静态灯光';motionButton.disabled=!motion.enabled;motionButton.title=motion.enabled?'只切换现场动效':'已遵循全站或系统减少动态设置';wake();}
 function pulse(type,velocity=.7){
  const now=performance.now();
  // Soft light envelopes, never high-frequency full-screen flashes.
  if(now-visualAt>=400){energy=Math.max(energy,velocity*.65);visualAt=now;if(animated()){rings.push({at:now,type});rings=rings.slice(-5);}}
  const pad=pads.get(type);if(!pad||!animated()||now-(padLast.get(type)||-1000)<400)return;
  padLast.set(type,now);pad.classList.add('is-hit');clearTimeout(padTimers.get(type));padTimers.set(type,setTimeout(()=>{pad.classList.remove('is-hit');padTimers.delete(type);},430));wake();
 }
 function hit(type){if(!dialog.open||document.hidden)return;audio.hit(type);pulse(type);recorder.capture(type);hits++;say(sound?'即兴演奏 · '+hits+' 拍':'静音试奏 · '+hits+' 拍');}
 function clearVisuals(){visualTimers.forEach(clearTimeout);visualTimers.clear();padTimers.forEach(clearTimeout);padTimers.clear();pads.forEach(p=>p.classList.remove('is-hit'));rings=[];energy=0;}
 function stopShow(message='演出已停止'){playing=false;generation++;clearInterval(scheduler);scheduler=0;clearVisuals();showButton.setAttribute('aria-pressed','false');$('span',showButton).textContent='再来一场';dialog.classList.remove('livehouse-playing');if(message)say(message);}
 function silence(){sound=false;audio.stop();syncSound();}
 function transport(){
  if(!playing||!dialog.open||document.hidden)return;
  const elapsed=(performance.now()-start)/1000,beat=elapsed*SCORE_BPM/60;
  if(elapsed>=SCORE_DURATION){stopShow('演出结束 · 轮到你了');scene.textContent='舞台还在，继续你的节奏';progress.style.setProperty('--show-progress','100%');timeline.setAttribute('aria-valuenow',String(SCORE_BEATS));return;}
  const name=sectionAt(beat);if(name!==section){section=name;scene.textContent=sections[name];dialog.dataset.liveScene=name;}
  progress.style.setProperty('--show-progress',(Math.max(0,beat)/SCORE_BEATS*100).toFixed(2)+'%');timeline.setAttribute('aria-valuenow',String(Math.max(0,Math.floor(beat))));
  while(cursor<score.length&&score[cursor].beat*60/SCORE_BPM<=elapsed+.10){
   const event=score[cursor++],delay=event.beat*60/SCORE_BPM-elapsed;if(delay<-.15)continue;
   if(sound)audio.hit(event.instrument,event.velocity,event.note,delay);
   if(['kick','snare','hat','tom','crash'].includes(event.instrument)){
    const token=generation,timer=setTimeout(()=>{visualTimers.delete(timer);if(token===generation&&playing)pulse(event.instrument,event.velocity);},Math.max(0,delay*1000));visualTimers.add(timer);
   }
  }
 }
 function toggleShow(){
  recorder.cancel('录制或回放已取消；已完成的节奏保留。');
  if(playing){stopShow();silence();return;}
  clearVisuals();playing=true;generation++;start=performance.now()+120;cursor=0;section='';showButton.setAttribute('aria-pressed','true');$('span',showButton).textContent='停止演出';dialog.classList.add('livehouse-playing');say(sound?'原创现场 · 34 秒':'静音演出 · 可随时开启声音');scheduler=setInterval(transport,25);transport();wake();
 }
 async function toggleSound(){
  if(sound){silence();say('声音已关闭，灯光继续');return;}
  soundButton.disabled=true;
  try{const ready=await audio.enable();if(!ready||!dialog.open||document.hidden){audio.stop();return;}sound=true;syncSound();say(playing?'声音已开启 · 可一起敲击鼓面':'声音已开启 · 从轻轻一拍开始');}
  catch(error){audio.stop();say(error.message||'音频未能开启，可继续静音体验。');}
  finally{soundButton.disabled=false;}
 }
 function draw(now){
  raf=0;if(!dialog.open||document.hidden||!ctx)return;
  if(now-last<32){raf=requestAnimationFrame(draw);return;}const dt=Math.min(80,now-last||33);last=now;
  if(animated())clock+=dt/1000;pointer+=(target-pointer)*.035;energy*=Math.exp(-dt/600);
  ctx.clearRect(0,0,width,height);
  const active=animated(),phase=dialog.dataset.liveScene,boost=phase==='chorus'?1.15:.8;
  // Conical, feathered spotlights originate above the rig and aim toward the kit.
  for(let i=0;i<4;i++){
   const x=width*(.12+i*.255),y=-height*.1,angle=(i%2?-.22:.22)+(active?Math.sin(clock*.22+i*1.8)*.18+(pointer-.5)*.25:0);
   ctx.save();ctx.translate(x,y);ctx.rotate(angle);const g=ctx.createLinearGradient(0,0,0,height*.95);g.addColorStop(0,'rgba(255,235,183,0)');g.addColorStop(.3,`rgba(${i%2?'104,180,216':'238,198,128'},${(.07+energy*.10)*boost})`);g.addColorStop(1,'rgba(119,181,207,0)');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(-2,0);ctx.lineTo(-width*.105,height);ctx.lineTo(width*.105,height);ctx.lineTo(2,0);ctx.fill();ctx.restore();
  }
  // A continuous low-contrast floor lattice gives the illustrated stage depth.
  const horizon=height*.65;ctx.strokeStyle='rgba(124,183,205,.10)';ctx.lineWidth=1;
  for(let i=-4;i<=4;i++){ctx.beginPath();ctx.moveTo(width*.5+i*width*.035,horizon);ctx.lineTo(width*.5+i*width*.19,height*.87);ctx.stroke();}
  for(let i=0;i<5;i++){const y=horizon+(i*i/25)*height*.2;ctx.beginPath();ctx.ellipse(width*.5,y,width*(.24+i*.065),height*.021,0,0,Math.PI*2);ctx.stroke();}
  if(active){
   rings=rings.filter(r=>now-r.at<1600);for(const ring of rings){const age=(now-ring.at)/1600;ctx.strokeStyle=`rgba(240,206,138,${(1-age)*.19})`;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(width*.5,height*.74,width*(.12+age*.36),height*(.018+age*.09),0,0,Math.PI*2);ctx.stroke();}
   if(sound&&audio.analyser){audio.analyser.getByteTimeDomainData(wave);ctx.beginPath();ctx.strokeStyle='rgba(159,214,229,.34)';for(let i=0;i<wave.length;i++){const x=i/(wave.length-1)*width,y=height*.81+(wave[i]-128)/128*height*.09;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}
  }
  if(active)raf=requestAnimationFrame(draw);
 }
 function wake(){cancelAnimationFrame(raf);raf=0;last=0;if(dialog.open&&!document.hidden)raf=requestAnimationFrame(draw);}
 function resize(){const rect=dialog.getBoundingClientRect();width=rect.width;height=Math.max(rect.height,660);const scale=Math.min(1.5,1440/Math.max(width,1));canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);ctx?.setTransform(scale,0,0,scale,0,0);wake();}
 function cleanup(){recorder.cancel('录制或回放已取消；已完成的节奏保留。');stopShow('静音待场');silence();cancelAnimationFrame(raf);raf=0;document.body.classList.remove('livehouse-opened');dialog.classList.remove('livehouse-playing');opener?.focus({preventScroll:true});}
 const recorder=initLiveRecorder({dialog,audio,isSoundEnabled:()=>sound,silence,pulse,beforeStart(){if(playing){stopShow('演出已停止，舞台留给你的节奏');silence();}clearVisuals();}});
 showButton.addEventListener('click',toggleShow);soundButton.addEventListener('click',toggleSound);$('[data-live-close]',dialog).addEventListener('click',()=>dialog.close());
 $('[data-live-volume]',dialog).addEventListener('input',e=>audio.setVolume(Number(e.target.value)/100));motionButton.addEventListener('click',()=>{localMotion=!localMotion;clearVisuals();syncMotion();});
 pads.forEach((pad,type)=>{
  // Capture contact, not release: touch players use the same clock as keys.
  pad.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();pad.focus({preventScroll:true});hit(type);});
  // Native keyboard/assistive clicks have detail 0; pointer clicks already hit.
  pad.addEventListener('click',e=>{if(e.detail===0)hit(type);});
 });
 dialog.addEventListener('keydown',e=>{if(e.repeat&&e.target.closest('[data-live-pad]')&&['Enter',' '].includes(e.key)){e.preventDefault();return;}if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.shiftKey||e.isComposing||e.target.closest('input,select,textarea,[contenteditable]'))return;const type={a:'kick',s:'snare',d:'hat',f:'tom'}[e.key.toLowerCase()];if(type){e.preventDefault();hit(type);}});
 dialog.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'&&animated())target=(e.clientX-dialog.getBoundingClientRect().left)/Math.max(width,1);},{passive:true});
 dialog.addEventListener('close',cleanup);
 document.addEventListener('atelier:motion',syncMotion);
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&dialog.open){recorder.cancel('录制已取消；回到现场后可重新录制。');stopShow('已暂停，点击重新开场');silence();cancelAnimationFrame(raf);raf=0;}else if(dialog.open)wake();});
 window.addEventListener('pagehide',()=>{if(dialog.open)dialog.close();else cleanup();});window.addEventListener('resize',()=>{if(dialog.open)resize();},{passive:true});
 return {open(button){
  if(dialog.open)return;opener=button;closeDialogs();document.dispatchEvent(new CustomEvent('atelier:livehouse-open'));
  $$('[data-src]',dialog).forEach(img=>{img.src=img.dataset.src;delete img.dataset.src;});$$('[data-srcset]',dialog).forEach(el=>{el.srcset=el.dataset.srcset;delete el.dataset.srcset;});
  sound=false;hits=0;cursor=0;section='';dialog.dataset.liveScene='arrival';scene.textContent='舞台交给你';progress.style.setProperty('--show-progress','0%');timeline.setAttribute('aria-valuenow','0');$('span',showButton).textContent='开始演出';syncSound();say('静音待场');document.body.classList.add('livehouse-opened');dialog.showModal();syncMotion();resize();$('[data-live-close]',dialog).focus({preventScroll:true});
 }};
}
