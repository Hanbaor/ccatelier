const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function setup({section='notes',article=false,enabled=true,webgl=true,magnet=false}={}) {
 const css=read('source/atelier/css/immersive.css').split('\n').find(x=>x.includes('stage-field'))+'\n'+read('source/atelier/css/stage-engine.css')+'\n'+read('source/atelier/css/effects.css');
 const dom=new JSDOM(`<style>${css}</style><body class="nijika ${section==='cover'?'on-cover':''}" data-section="${section}" data-cursor="true"><main class="${article?'reading-page':'content-view'}"><a href="#">文章</a>${magnet?'<button data-magnetic>互动</button>':''}</main><div class="utility-controls"></div><div class="cursor-ring"></div><div class="click-effects"></div></body>`);
 const w=dom.window,d=w.document,raf=new Map(),motion={enabled},counts={contexts:0,draws:0,timers:0,uniforms:{}};let hidden=false,id=0,now=0;
 Object.defineProperty(d,'hidden',{get:()=>hidden});
 const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,getUniformLocation:(_,key)=>key,uniform1f:(key,value)=>counts.uniforms[key]=value,drawArrays:()=>counts.draws++},{get:(o,k)=>k in o?o[k]:()=>({})});
 w.HTMLCanvasElement.prototype.getContext=()=>{counts.contexts++;return webgl?gl:null;};
 const element=(tag,cls,text)=>{const el=d.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
 const action=(s,fn,c)=>{const b=element('button',c,s);b.addEventListener('click',fn);return b;};
 const ctx={document:d,window:w,innerWidth:1200,innerHeight:800,performance:{now:()=>now},$:s=>d.querySelector(s),$$:s=>[...d.querySelectorAll(s)],motion,storage:{get:()=>null,set:()=>true},root:'/',element,action,makeDialog:(id)=>{const dialog=element('dialog');dialog.id=id;d.body.append(dialog);return{dialog,open:()=>dialog.setAttribute('open','')};},MutationObserver:class{observe(){}},requestAnimationFrame:fn=>{raf.set(++id,fn);return id;},cancelAnimationFrame:id=>raf.delete(id),matchMedia:()=>({matches:true,addEventListener(){}}),setTimeout:()=>++counts.timers};
 for(const [file,fn] of [['effects','initEffects'],['stage-engine','initStageEngine']])vm.runInNewContext(read('source/atelier/js/'+file+'.js').replace(/^import .*;\s*$/gm,'').replace('export function '+fn,'function '+fn)+'\n'+fn+'();',ctx);
 return {w,d,raf,counts,close:()=>w.close(),tick(n=1){for(let i=0;i<n;i++){now+=16;const tasks=[...raf.values()];raf.clear();tasks.forEach(fn=>fn(now));}},visibility(value){hidden=value;d.dispatchEvent(new w.Event('visibilitychange'));},motion(value){motion.enabled=value;d.dispatchEvent(new w.Event('atelier:motion'));},click(){d.querySelector('a').dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,button:0}));}};
}
test('personal homepage and reading destinations never allocate a hidden stage, focusable lighting controls, pointer particles or timers',()=>{
 for(const options of [{section:'cover'},{section:'notes'},{section:'notes',article:true},{section:'series'},{section:'categories'},{section:'tags'},{section:'lounge'},{section:'practice'},{section:'research'}]){
  const s=setup(options);try{s.tick(60);s.click();assert.equal(s.counts.contexts,0,JSON.stringify(options));assert.equal(s.raf.size,0);assert.equal(s.counts.timers,0);assert.equal(s.d.querySelector('.stage-field,.lighting-open,#lighting-dialog'),null);assert.equal(s.d.querySelector('.click-effects').childElementCount,0);assert.equal(s.w.getComputedStyle(s.d.querySelector('.cursor-ring')).display,'none');}finally{s.close();}
 }
});
test('studio retains visible GPU animation, audio uniforms and lighting controls without duplicate click particles',()=>{
 for(const section of ['studio']){
  const s=setup({section});try{s.tick(60);assert.equal(s.counts.contexts,1);assert.equal(s.counts.draws,60);assert.equal(s.raf.size,1);assert.notEqual(s.w.getComputedStyle(s.d.querySelector('canvas')).display,'none');const light=s.d.querySelector('.lighting-open');light.focus();assert.equal(s.d.activeElement,light);light.click();assert.equal(s.d.querySelector('#lighting-dialog').hasAttribute('open'),true);
   for(const type of ['beat','spectrum'])s.d.dispatchEvent(new s.w.CustomEvent('atelier:'+type,{detail:{energy:.8}}));s.tick();assert.ok(s.counts.uniforms.beat>0);assert.ok(s.counts.uniforms.spectrum>0);s.click();assert.equal(s.counts.timers,0);assert.equal(s.d.querySelector('.click-effects').childElementCount,0);
  }finally{s.close();}
 }
});
test('background and pagehide cancel stage RAF; return restores animation; reduced motion performs only a static pass',()=>{
 const s=setup({section:'studio'});try{s.tick(60);s.visibility(true);assert.equal(s.raf.size,0);s.tick(60);assert.equal(s.counts.draws,60);s.visibility(false);s.tick();assert.equal(s.counts.draws,61);assert.equal(s.raf.size,1);s.w.dispatchEvent(new s.w.Event('pagehide'));assert.equal(s.raf.size,0);s.w.dispatchEvent(new s.w.Event('pageshow'));s.tick();assert.equal(s.raf.size,1);s.motion(false);s.tick(60);assert.equal(s.raf.size,0);s.motion(true);s.tick();assert.equal(s.raf.size,1);}finally{s.close();}
 const reduced=setup({section:'studio',enabled:false});try{reduced.tick(60);assert.equal(reduced.counts.draws,1);assert.equal(reduced.raf.size,0);reduced.click();assert.equal(reduced.counts.timers,0);}finally{reduced.close();}
});
test('explicit studio clicks still use the fallback particles when WebGL is unavailable',()=>{
 const s=setup({section:'studio',webgl:false});try{s.click();assert.equal(s.counts.timers,1);assert.equal(s.d.querySelector('.click-effects').childElementCount,1);assert.equal(s.d.querySelector('.stage-field-fallback').hidden,false);}finally{s.close();}
});

function moveMagnet(s,x=100,y=40) {
 const event=new s.w.MouseEvent('pointermove',{clientX:x,clientY:y});
 Object.defineProperty(event,'pointerType',{value:'mouse'});s.d.querySelector('[data-magnetic]').dispatchEvent(event);
}
test('WebGL fallback is idle and magnetic interaction wakes, converges, leaves and wakes again',()=>{
 for(const section of ['studio'])for(const magnet of [false,true]){
  const s=setup({section,webgl:false,magnet});try{
   s.tick(60);assert.equal(s.counts.draws,0);assert.equal(s.raf.size,0);
   if(magnet){const button=s.d.querySelector('[data-magnetic]');moveMagnet(s);assert.equal(s.raf.size,1);s.tick(60);assert.equal(s.raf.size,0);assert.equal(button.style.translate,'6.00px 3.60px');button.dispatchEvent(new s.w.Event('pointerleave'));assert.equal(s.raf.size,1);s.tick(60);assert.equal(s.raf.size,0);assert.equal(button.style.translate,'0.00px 0.00px');moveMagnet(s,50,20);assert.equal(s.raf.size,1);s.tick(60);assert.equal(s.raf.size,0);assert.equal(button.style.translate,'3.00px 1.80px');}
  }finally{s.close();}
 }
});
test('context loss switches to idle fallback and preserves active and future magnetic interaction',()=>{
 const s=setup({section:'studio',magnet:true});try{
  s.tick();moveMagnet(s);s.tick();const before=s.counts.draws;
  s.d.querySelector('canvas').dispatchEvent(new s.w.Event('webglcontextlost',{cancelable:true}));
  s.tick(60);assert.equal(s.counts.draws,before);assert.equal(s.raf.size,0);assert.equal(s.d.body.classList.contains('has-stage-engine'),false);assert.equal(s.d.querySelector('[data-magnetic]').style.translate,'6.00px 3.60px');
  s.w.dispatchEvent(new s.w.Event('resize'));s.tick(60);assert.equal(s.raf.size,0);s.visibility(true);s.visibility(false);s.tick(60);assert.equal(s.raf.size,0);
  moveMagnet(s,50,20);assert.equal(s.raf.size,1);s.tick(60);assert.equal(s.raf.size,0);assert.equal(s.d.querySelector('[data-magnetic]').style.translate,'3.00px 1.80px');s.click();assert.equal(s.counts.timers,1);
 }finally{s.close();}
});

test('personal homepage stays idle across motion preferences, input and lifecycle changes',()=>{
 for(const webgl of [true,false])for(const enabled of [true,false]){
  const s=setup({section:'cover',webgl,enabled,magnet:true});try{
   moveMagnet(s);s.click();s.tick(60);s.visibility(true);s.visibility(false);s.motion(false);s.motion(true);
   s.w.dispatchEvent(new s.w.Event('pageshow'));s.w.dispatchEvent(new s.w.Event('resize'));s.tick(60);
   assert.equal(s.counts.contexts,0);assert.equal(s.counts.draws,0);assert.equal(s.counts.timers,0);assert.equal(s.raf.size,0);
   assert.equal(s.d.querySelector('canvas,.stage-field-fallback,.lighting-open,#lighting-dialog'),null);
   assert.equal(s.d.querySelector('.click-effects').childElementCount,0);
   assert.equal(s.d.querySelector('[data-magnetic]').style.translate,'');
  }finally{s.close();}
 }
});
