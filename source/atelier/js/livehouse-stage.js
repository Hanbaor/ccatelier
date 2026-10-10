import {STAGE_LIMITS,stageResolution,stagePadLayout,stageEllipseLayout,strikeEnvelope,canStageAnimate} from './livehouse-stage-core.mjs';

/** Optional decoration only. Native buttons remain the entire input surface. */
export async function createLiveStage({dialog,kit,pads,signal,isCurrent=()=>dialog.open,isMotion=()=>true,loadThree=()=>import('../vendor/three/0.186.0/livehouse-three.js')}){
 if(!kit||!isCurrent()||signal?.aborted||typeof window.WebGL2RenderingContext!=='function')return null;
 const canvas=document.createElement('canvas');canvas.className='livehouse-stage';canvas.setAttribute('aria-hidden','true');canvas.dataset.liveStage='';
 let context;try{context=canvas.getContext('webgl2',{alpha:true,antialias:true,powerPreference:'low-power',failIfMajorPerformanceCaveat:true});}catch{return null;}
 if(!context)return null;
 let renderer=null,scene=null,camera=null,observer=null,disposed=false,lost=false,visible=!document.hidden,motion=isMotion(),frame=0,last=0,until=0,layoutUntil=0,light=null,target=.5,pointer=.5;
 let width=1,height=1,bufferWidth=0,bufferHeight=0,models=new Map(),geometries=new Set(),materials=new Set(),textures=new Set(),releases=[];
 const active=()=>!disposed&&!lost&&visible&&isCurrent();
 const animated=()=>canStageAnimate({open:isCurrent(),visible,motion,disposed,lost});
 const fallback=()=>kit.classList.remove('livehouse-3d-ready');
 const listen=(element,type,callback,options)=>{element.addEventListener(type,callback,options);releases.push(()=>element.removeEventListener(type,callback,options));};
 function cancelFrame(){cancelAnimationFrame(frame);frame=0;last=0;until=layoutUntil=0;}
 function dispose(){
  if(disposed)return;disposed=true;cancelFrame();fallback();observer?.disconnect();releases.forEach(release=>release());releases=[];
  geometries.forEach(item=>item.dispose());materials.forEach(item=>item.dispose());textures.forEach(item=>item.dispose());geometries.clear();materials.clear();textures.clear();models.clear();
  renderer?.dispose();try{context.getExtension('WEBGL_lose_context')?.loseContext();}catch{/* A revoked context is already released. */}canvas.remove();scene=camera=light=renderer=null;
 }
 listen(signal||canvas,'abort',dispose,{once:true});
 let T;
 try{T=await loadThree();if(!isCurrent()||signal?.aborted||disposed){dispose();return null;}visible=!document.hidden;motion=isMotion();}
 catch{dispose();return null;}
 const geometry=value=>{geometries.add(value);return value;},material=value=>{materials.add(value);return value;};
 function texture(paint,size=128){
  const surface=document.createElement('canvas');surface.width=surface.height=size;const drawing=surface.getContext('2d');if(!drawing)return null;paint(drawing,size);
  const value=new T.CanvasTexture(surface);value.colorSpace=T.SRGBColorSpace;textures.add(value);return value;
 }
 function mesh(shape,finish,parent){const result=new T.Mesh(shape,finish);parent.add(result);return result;}
 function headTexture(){return texture((ctx,size)=>{
  ctx.fillStyle='#9ea9a8';ctx.fillRect(0,0,size,size);
  // Deterministic, very fine coated-head grain. No fetched images or noise loop.
  let seed=721;for(let i=0;i<1150;i++){seed=(seed*1664525+1013904223)>>>0;const x=seed%size;seed=(seed*1664525+1013904223)>>>0;ctx.fillStyle=i%2?'#fff3':'#09151c12';ctx.fillRect(x,seed%size,1,1);}
  for(const r of [.37,.435]){ctx.beginPath();ctx.arc(size/2,size/2,size*r,0,Math.PI*2);ctx.strokeStyle='#dce6df30';ctx.lineWidth=.6;ctx.stroke();}
 });}
 function metalTexture(){return texture((ctx,size)=>{
  ctx.fillStyle='#c8b991';ctx.fillRect(0,0,size,size);
  for(let y=0;y<size;y+=3){ctx.fillStyle=y%2?'#3b302514':'#fff1c717';ctx.fillRect(0,y,size,1);}
 });}
 function shadowTexture(){return texture((ctx,size)=>{
  const gradient=ctx.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);gradient.addColorStop(0,'#0009');gradient.addColorStop(.5,'#0005');gradient.addColorStop(1,'#0000');ctx.fillStyle=gradient;ctx.fillRect(0,0,size,size);
 });}
 try{
  renderer=new T.WebGLRenderer({canvas,context,alpha:true,antialias:true,powerPreference:'low-power'});renderer.setClearColor(0x07121d,0);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  if(renderer.debug)renderer.debug.onShaderError=()=>{throw Error('Optional stage shader unavailable');};
  scene=new T.Scene();camera=new T.OrthographicCamera(0,1,0,-1,.1,2000);camera.position.z=1000;
  scene.add(new T.HemisphereLight(0xdceaf1,0x172934,2));scene.add(new T.AmbientLight(0xb4c9ca,.7));
  light=new T.DirectionalLight(0xffdfa5,3.1);light.position.set(-250,400,700);scene.add(light);
  const rim=new T.DirectionalLight(0x91c5e9,1.8);rim.position.set(400,-100,400);scene.add(rim);
  const coated=headTexture(),brushed=metalTexture(),shadow=shadowTexture();
  const chrome=material(new T.MeshStandardMaterial({color:0x819493,metalness:.76,roughness:.3}));
  const darkMetal=material(new T.MeshStandardMaterial({color:0x283e48,metalness:.55,roughness:.4}));
  const brass=material(new T.MeshStandardMaterial({color:0xbd9852,map:brushed,metalness:.68,roughness:.35,side:T.DoubleSide}));
  const shadowMaterial=material(new T.MeshBasicMaterial({map:shadow,color:0x000000,transparent:true,opacity:shadow?.65:.12,depthWrite:false}));
  const hoop=geometry(new T.TorusGeometry(.969,.032,8,64)),baseHoop=geometry(new T.TorusGeometry(.92,.022,8,64)),head=geometry(new T.CircleGeometry(.926,64));
  const shell=geometry(new T.CylinderGeometry(.965,.92,.32,64,1,true)),lug=geometry(new T.CylinderGeometry(.022,.028,.245,8)),bolt=geometry(new T.SphereGeometry(.029,8,6)),shadowShape=geometry(new T.CircleGeometry(1,48));
  for(const [type,pad] of pads){
   const root=new T.Group(),body=new T.Group();root.name='live-'+type;root.add(body);scene.add(root);
   const shade=mesh(shadowShape,shadowMaterial,scene);shade.position.z=-50;
   let skin=null;
   if(type==='hat'){
    const profile=[[.025,.13],[.1,.13],[.15,.11],[.23,.034],[.5,.012],[.96,0],[1,-.008]].map(([x,y])=>new T.Vector2(x,y));
    const cymbal=geometry(new T.LatheGeometry(profile,96));skin=mesh(cymbal,brass,body);const lower=mesh(cymbal,darkMetal,body);lower.position.y=-.052;
    const pin=mesh(geometry(new T.CylinderGeometry(.015,.024,.19,10)),chrome,body);pin.position.y=.13;
   }else{
    const colors={kick:0x263e49,snare:0x355568,tom:0x3b4058};
    const shellMaterial=material(new T.MeshStandardMaterial({color:colors[type],metalness:.28,roughness:.37}));
    const skinMaterial=material(new T.MeshStandardMaterial({color:0x425665,map:coated,metalness:.08,roughness:.8}));
    mesh(shell,shellMaterial,body).position.y=-.16;
    const top=mesh(hoop,chrome,body);top.rotation.x=Math.PI/2;
    const bottom=mesh(baseHoop,darkMetal,body);bottom.rotation.x=Math.PI/2;bottom.position.y=-.32;
    skin=mesh(head,skinMaterial,body);skin.rotation.x=-Math.PI/2;skin.position.y=.007;
    const count=type==='kick'?8:6,lugs=new T.InstancedMesh(lug,chrome,count),bolts=new T.InstancedMesh(bolt,chrome,count),matrix=new T.Matrix4();
    for(let i=0;i<count;i++){const angle=i/count*Math.PI*2;matrix.makeTranslation(Math.sin(angle)*.967,-.16,Math.cos(angle)*.967);lugs.setMatrixAt(i,matrix);matrix.makeTranslation(Math.sin(angle)*.965,.033,Math.cos(angle)*.965);bolts.setMatrixAt(i,matrix);}
    body.add(lugs,bolts);releases.push(()=>{lugs.dispose();bolts.dispose();});
   }
   models.set(type,{pad,root,body,skin,shade,at:-Infinity,velocity:.7,tilt:0,radius:1});
  }
  function footprint(pad,rect,kitStyle){
   const fallback=()=>stagePadLayout(rect,pad.getBoundingClientRect());
   if(!window.DOMMatrixReadOnly||!pad.offsetWidth||!pad.offsetHeight)return fallback();
   try{
    const style=window.getComputedStyle(pad),matrix=new window.DOMMatrixReadOnly(style.transform==='none'?undefined:style.transform),w=pad.offsetWidth,h=pad.offsetHeight;
    const [ox,oy]=style.transformOrigin.split(' ').map(parseFloat),[px,py]=kitStyle.perspectiveOrigin.split(' ').map(parseFloat),perspective=parseFloat(kitStyle.perspective),inverse=Number.isFinite(perspective)&&perspective>0?1/perspective:0;
    const dx=w/2-ox,dy=h/2-oy,cols=[[matrix.m11*w/2,matrix.m12*w/2,matrix.m13*w/2,matrix.m14*w/2],[matrix.m21*h/2,matrix.m22*h/2,matrix.m23*h/2,matrix.m24*h/2],[matrix.m11*dx+matrix.m21*dy+matrix.m41,matrix.m12*dx+matrix.m22*dy+matrix.m42,matrix.m13*dx+matrix.m23*dy+matrix.m43,matrix.m14*dx+matrix.m24*dy+matrix.m44]];
    const projected=cols.map(([x,y,z,v])=>{const denominator=v-z*inverse;return [x+(pad.offsetLeft+ox)*v-px*z*inverse+STAGE_LIMITS.bleed*denominator,y+(pad.offsetTop+oy)*v-py*z*inverse+STAGE_LIMITS.bleed*denominator,denominator];});
    return stageEllipseLayout([projected[0][0],projected[1][0],projected[2][0],projected[0][1],projected[1][1],projected[2][1],projected[0][2],projected[1][2],projected[2][2]])||fallback();
   }catch{return fallback();}
  }
  function measure(){
   if(!active())return;const rect=kit.getBoundingClientRect();width=Math.max(1,rect.width+STAGE_LIMITS.bleed*2);height=Math.max(1,rect.height+STAGE_LIMITS.bleed*2+42);
   const pixels=stageResolution(width,height,window.devicePixelRatio||1,window.innerWidth<=760);if(pixels.width!==bufferWidth||pixels.height!==bufferHeight){renderer.setSize(pixels.width,pixels.height,false);bufferWidth=pixels.width;bufferHeight=pixels.height;}canvas.style.width=width+'px';canvas.style.height=height+'px';
   camera.right=width;camera.bottom=-height;camera.updateProjectionMatrix();
   const kitStyle=window.getComputedStyle(kit);
   for(const [type,item] of models){
    const layout=footprint(item.pad,rect,kitStyle);item.radius=layout.radius;item.tilt=layout.tilt;item.root.position.set(layout.x,-layout.y,type==='kick'?30:type==='hat'?20:type==='snare'?10:0);item.root.scale.set(layout.radius,layout.radius,layout.radius*layout.depthScale);item.root.rotation.set(layout.tilt,0,-layout.roll,'ZXY');
    item.shade.position.x=layout.x;item.shade.position.y=-layout.y-layout.radius*.28;item.shade.scale.set(layout.radius*1.16,layout.radius*Math.sin(layout.tilt)*layout.depthScale*.83,1);
   }
  }
  function draw(now=performance.now()){
   if(!active()||!renderer)return false;
   try{
    for(const [type,item] of models){const hit=motion?strikeEnvelope(now-item.at,item.velocity):{head:0,tilt:0};item.body.rotation.z=type==='hat'?hit.tilt:0;if(type!=='hat')item.skin.position.y=.007-hit.head*Math.min(.026,1.8/item.radius);}
    pointer+=(target-pointer)*.2;light.position.x=-250+(pointer-.5)*90;renderer.render(scene,camera);kit.classList.add('livehouse-3d-ready');return true;
   }catch{dispose();return false;}
  }
  function tick(now){
   frame=0;if(!animated())return;
   if(now-last>=1000/STAGE_LIMITS.fps){last=now;try{if(now<=layoutUntil)measure();}catch{dispose();return;}if(!draw(now))return;}
   if(now<until)frame=requestAnimationFrame(tick);else {models.forEach(item=>item.at=-Infinity);draw(now);}
  }
  function request(duration=STAGE_LIMITS.settleMs){
   if(!animated())return;until=Math.max(until,performance.now()+duration);if(!frame)frame=requestAnimationFrame(tick);
  }
  function resize(){if(!active())return;try{measure();draw();}catch{dispose();}}
  function reset(){models.forEach(item=>item.at=-Infinity);target=pointer=.5;}
  listen(canvas,'webglcontextlost',event=>{event.preventDefault();lost=true;cancelFrame();reset();fallback();});
  listen(canvas,'webglcontextrestored',()=>{if(disposed)return;lost=false;reset();if(active())resize();});
  // Follow the existing CSS hover transition without changing its hit target.
  for(const pad of pads.values())for(const event of ['pointerenter','pointerleave','focus','blur'])listen(pad,event,()=>{if(!active())return;layoutUntil=performance.now()+240;request(250);});
  for(const pad of pads.values())listen(pad,'transitionend',event=>{if(event.propertyName==='transform')resize();});
  listen(dialog.querySelector('[data-live-recorder]')||kit,'toggle',resize);
  if(typeof ResizeObserver==='function'){observer=new ResizeObserver(resize);observer.observe(kit);observer.observe(dialog.querySelector('.livehouse-room')||dialog);}
  kit.prepend(canvas);resize();if(disposed)return null;
  return {
   strike(type,velocity=.7){if(!animated())return;const item=models.get(type==='crash'?'hat':type);if(!item)return;item.at=performance.now();item.velocity=velocity;request();},
   pointer(value){if(!animated())return;target=Math.max(0,Math.min(1,Number(value)||0));request(250);},
   setMotion(value){motion=!!value;cancelFrame();reset();resize();},
   setVisible(value){visible=!!value;cancelFrame();reset();if(visible)resize();},
   resize,
   clear(){cancelFrame();reset();if(active())draw();},
   dispose,
  };
 }catch{dispose();return null;}
}
