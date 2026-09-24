import {$,$$,motion,storage} from './ui.js';
import {makeDialog} from './live-dialog.js';
import {element,action,root} from './archive-store.js';

// A single low-resolution GPU pass draws light, dust and the latest pressure wave.
// Audio uniforms come only from actual Web Audio playback; ambient motion is separate.
export function initStageEngine(){
 const lightButton=action('◒',()=>{},'icon-button lighting-open');lightButton.setAttribute('aria-label','打开舞台调光台');$('.utility-controls')?.prepend(lightButton);
 const canvas=element('canvas','stage-field');canvas.setAttribute('aria-hidden','true');document.body.prepend(canvas);
 const fallback=element('div','stage-field-fallback');fallback.setAttribute('aria-hidden','true');document.body.prepend(fallback);
 let settings={intensity:.6,dust:.5,speed:.4};try{const p=JSON.parse(storage.get('cc-stage-engine'));if(p&&['intensity','dust','speed'].every(k=>Number.isFinite(p[k])&&p[k]>=0&&p[k]<=1))settings=p;}catch{}
 let gl;try{gl=canvas.getContext('webgl',{alpha:true,antialias:false,depth:false,powerPreference:'low-power',premultipliedAlpha:false});}catch{}
 const vertex='attribute vec2 position;void main(){gl_Position=vec4(position,0.,1.);}';
 const fragment=`precision mediump float;
 uniform vec2 resolution,pointer,ripple; uniform float time,intensity,dust,beat,spectrum,rippleAge,quiet; uniform vec3 tint;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 void main(){vec2 uv=gl_FragCoord.xy/resolution;float aspect=resolution.x/resolution.y;vec2 p=vec2(uv.x*aspect,uv.y);vec2 aim=vec2(pointer.x*aspect,pointer.y);
 float ray=0.;for(int i=0;i<3;i++){float f=float(i);vec2 origin=vec2((.14+f*.37)*aspect,1.2);vec2 dir=normalize(vec2((aim.x-origin.x)*.3+sin(time*.13+f)*.18,-1.));vec2 v=p-origin;float along=dot(v,dir);float width=.018+max(0.,along)*(.055+beat*.015);float distance=abs(v.x*dir.y-v.y*dir.x);ray+=exp(-pow(distance/width,2.))*max(0.,1.-length(v)*.4);}
 vec2 field=vec2(p.x*34.,p.y*34.+time*.15);vec2 cell=floor(field);vec2 point=fract(field)-vec2(hash(cell),hash(cell+7.));float particle=(1.-smoothstep(.015,.075,length(point)))*step(.91,hash(cell+23.))*dust*(.4+.3*sin(time+hash(cell)*20.));
 float radius=length(vec2((uv.x-ripple.x)*aspect,uv.y-ripple.y));float wave=exp(-pow((radius-rippleAge*.32)/.006,2.))*max(0.,1.-rippleAge/.95)*step(0.,rippleAge);
 float alpha=(ray*.045*(1.+spectrum*2.+beat)+particle*.42+wave*.15)*intensity*quiet;gl_FragColor=vec4(tint,min(.23,alpha));}`;
 let program,uniforms={},frame=0,last=0,elapsed=0,px=.6,py=.5,tx=.6,ty=.5,beat=0,spectrum=0,ripple={x:-2,y:-2,at:-5000};
 function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
 if(gl)try{program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error();gl.useProgram(program);const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);for(const name of ['resolution','pointer','ripple','time','intensity','dust','beat','spectrum','rippleAge','quiet','tint'])uniforms[name]=gl.getUniformLocation(program,name);fallback.hidden=true;document.body.classList.add('has-stage-engine');}catch{gl=null;}
 if(!gl)canvas.hidden=true;
 const magnets=$$('.admission-ticket,.studio-play,[data-magnetic]').map(el=>({el,x:0,y:0,tx:0,ty:0}));
 for(const m of magnets){m.el.addEventListener('pointermove',e=>{if(!motion.enabled||e.pointerType!=='mouse')return;const r=m.el.getBoundingClientRect();m.tx=(e.clientX-r.left-r.width/2)*.06;m.ty=(e.clientY-r.top-r.height/2)*.09;});m.el.addEventListener('pointerleave',()=>{m.tx=0;m.ty=0;});}
 function draw(now){frame=0;const dt=Math.min(40,now-last||16);last=now;if(motion.enabled)elapsed+=dt*(.25+settings.speed*.8)/1000;px+=(tx-px)*.06;py+=(ty-py)*.06;beat*=Math.exp(-dt/180);spectrum*=Math.exp(-dt/180);
  if(gl){const colors={amber:[1,.76,.34],rose:[1,.45,.35],moon:[.48,.65,1]},tint=colors[document.body.dataset.stageLight]||colors.amber;const quiet=$('.article-body')?.12:document.body.classList.contains('light')?.4:1;
   gl.uniform2f(uniforms.resolution,canvas.width,canvas.height);gl.uniform2f(uniforms.pointer,px,1-py);gl.uniform2f(uniforms.ripple,ripple.x,1-ripple.y);gl.uniform1f(uniforms.time,elapsed);gl.uniform1f(uniforms.intensity,settings.intensity);gl.uniform1f(uniforms.dust,motion.enabled?settings.dust:0);gl.uniform1f(uniforms.beat,motion.enabled?beat:0);gl.uniform1f(uniforms.spectrum,motion.enabled?spectrum:0);gl.uniform1f(uniforms.rippleAge,motion.enabled?(now-ripple.at)/1000:5);gl.uniform1f(uniforms.quiet,quiet);gl.uniform3fv(uniforms.tint,tint);gl.drawArrays(gl.TRIANGLES,0,6);
  }
  if(motion.enabled)for(const m of magnets){m.x+=(m.tx-m.x)*.14;m.y+=(m.ty-m.y)*.14;m.el.style.translate=m.x.toFixed(2)+'px '+m.y.toFixed(2)+'px';}
  if(motion.enabled&&!document.hidden&&settings.intensity>0)frame=requestAnimationFrame(draw);
 }
 function resize(){if(gl){const scale=Math.min(1,960/innerWidth);canvas.width=Math.round(innerWidth*scale);canvas.height=Math.round(innerHeight*scale);gl.viewport(0,0,canvas.width,canvas.height);}wake();}
 function wake(){cancelAnimationFrame(frame);frame=0;last=0;if(!document.hidden)frame=requestAnimationFrame(draw);}
 window.addEventListener('pointermove',e=>{tx=e.clientX/innerWidth;ty=e.clientY/innerHeight;},{passive:true});
 window.addEventListener('pointerdown',e=>{if(!motion.enabled||e.target.closest('.article-body,input,textarea'))return;ripple={x:e.clientX/innerWidth,y:e.clientY/innerHeight,at:performance.now()};},{passive:true});
 document.addEventListener('atelier:beat',e=>{beat=Math.max(beat,Number(e.detail?.energy)||0);});document.addEventListener('atelier:spectrum',e=>{spectrum=Math.max(0,Math.min(1,Number(e.detail?.energy)||0));});document.addEventListener('atelier:audio-stop',()=>{spectrum=0;beat=0;});
 document.addEventListener('visibilitychange',wake);document.addEventListener('atelier:motion',()=>{for(const m of magnets){m.x=m.y=m.tx=m.ty=0;m.el.style.translate='';}wake();});window.addEventListener('resize',resize,{passive:true});window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);frame=0;});window.addEventListener('pageshow',wake);
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelAnimationFrame(frame);gl=null;canvas.hidden=true;fallback.hidden=false;});
 const desk=makeDialog('lighting-dialog','舞台调光台'),intro=element('p','live-status','把灯光调到舒服的位置。鼓点和音频会带动光场，阅读时灯光自动收敛。'),presets=element('div','light-presets');
 for(const [key,label] of [['amber','暖金 / NIJIKA'],['rose','朱红 / ENCORE'],['moon','月蓝 / AFTER HOURS']]){const b=action(label,()=>{document.body.dataset.stageLight=key;storage.set('cc-light',key);sync();wake();});b.dataset.lightPreset=key;presets.append(b);}
 desk.dialog.append(intro,presets);
 for(const [key,label] of [['intensity','灯光亮度'],['dust','星尘密度'],['speed','流动速度']]){const l=element('label','light-fader',label),input=element('input'),out=element('output','',Math.round(settings[key]*100)+'%');input.type='range';input.min=0;input.max=100;input.value=Math.round(settings[key]*100);input.addEventListener('input',()=>{settings[key]=Number(input.value)/100;out.textContent=input.value+'%';fallback.style.opacity=settings.intensity*.2;if(!frame)wake();});input.addEventListener('change',()=>{if(!storage.set('cc-stage-engine',JSON.stringify(settings)))intro.textContent='当前设置无法跨页面保存，可以继续在这一页使用。';});l.append(input,out);desk.dialog.append(l);}
 const foot=element('div','lighting-links');const studio=element('a','','去节奏实验室，亲手点亮舞台 ↗');studio.href=root+'studio/';foot.append(studio,element('span','',gl?'光场已就绪':'当前设备使用柔光背景'));desk.dialog.append(foot);
 function sync(){$$('[data-light-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.lightPreset===(document.body.dataset.stageLight||'amber'))));}
 document.addEventListener('click',e=>{if(e.target.closest('.lighting-open')){sync();desk.open();}});
 new MutationObserver(()=>{if(!motion.enabled)wake();}).observe(document.body,{attributes:true,attributeFilter:['class','data-stage-light']});resize();
}
