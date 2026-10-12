const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ejs=require('ejs'),{JSDOM}=require('jsdom');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(t){
 const html=ejs.render(fs.readFileSync(path.join(__dirname,'../custom/redefine/nijika/studio.ejs'),'utf8'),{theme:{nijika:{studio_art:'/atelier/images/studio.webp'}},url_for:p=>p,nijika_art_srcset:()=>'',partial:()=>''});
 const dom=new JSDOM(html,{pretendToBeVisual:true,url:'https://atelier.test/studio/'}),{window}=dom,{document}=window,previous=new Map(),frames=new Map(),contexts=[],beats=[];let frame=0;
 for(const [name,value] of Object.entries({window,document,CustomEvent:window.CustomEvent,localStorage:window.localStorage,matchMedia:()=>({matches:true,addEventListener(){}}),devicePixelRatio:1,ResizeObserver:class{observe(){}},requestAnimationFrame:fn=>{frames.set(++frame,fn);return frame;},cancelAnimationFrame:id=>frames.delete(id)})){previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});}
 window.HTMLCanvasElement.prototype.getContext=()=>null;window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
 const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}}),node=props=>({connect(){},disconnect(){},...props});
 window.AudioContext=class{
  constructor(){this.state='suspended';this.currentTime=0;this.sampleRate=100;this.destination=node();this.starts=[];contexts.push(this);}
  resume(){return new Promise((resolve,reject)=>{this.resolve=()=>{if(this.state!=='closed')this.state='running';resolve();};this.reject=reject;});}
  close(){this.state='closed';return Promise.resolve();}
  createGain(){return node({gain:param()});}createDynamicsCompressor(){return node({threshold:param(),knee:param(),ratio:param()});}
  createAnalyser(){return node({});}createStereoPanner(){return node({pan:param()});}
  createOscillator(){return node({frequency:param(),start:at=>this.starts.push(at),stop(){}});}
  createBufferSource(){return this.createOscillator();}createBiquadFilter(){return node({frequency:param(),Q:param()});}
  createBuffer(_channels,length){return {getChannelData:()=>new Float32Array(length)};}
 };
 document.addEventListener('atelier:beat',e=>beats.push(e));
 t.after(()=>{window.dispatchEvent(new window.Event('pagehide'));assert.equal(frames.size,0);assert.ok(contexts.every(ctx=>ctx.state==='closed'));window.close();for(const [name,value] of previous){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}});
 const {motion}=await import('../source/atelier/js/ui.js');const previousMotion=motion.enabled;motion.enabled=true;t.after(()=>{motion.enabled=previousMotion;}); // These interruption checks exercise an active visual loop.
 const {initStudio}=await import('../source/atelier/js/studio.js');initStudio();initStudio();
 const q=s=>document.querySelector(s);
 return {q,window,document,frames,contexts,beats,pad:()=>q('.track-name>button').click(),stop:()=>q('[data-studio-stop]').click(),play:()=>q('[data-studio-play]').click(),status:()=>q('[data-studio-status]').textContent};
}

for(const outcome of ['resolve','reject'])for(const interruption of ['stop','hidden','pagehide','practice','livehouse'])test(`a ${outcome}d pad resume after ${interruption} cannot revive its scope or overwrite status`,async t=>{
 const h=await setup(t);h.pad();assert.equal(h.contexts.length,1,'repeated init must bind the pad once');
 if(interruption==='stop')h.stop();
 else if(interruption==='hidden'){Object.defineProperty(h.document,'hidden',{configurable:true,value:true});h.document.dispatchEvent(new h.window.Event('visibilitychange'));}
 else if(interruption==='pagehide')h.window.dispatchEvent(new h.window.Event('pagehide'));
 else h.document.dispatchEvent(new h.window.CustomEvent(interruption==='practice'?'atelier:practice-start':'atelier:livehouse-open'));
 const status=h.status();h.contexts[0][outcome](Error('old pad resume failure'));await flush();
 assert.equal(h.status(),status);assert.equal(h.frames.size,0);assert.equal(h.contexts[0].starts.length,0);assert.equal(h.beats.length,0);assert.equal(h.q('[data-studio-play]').getAttribute('aria-pressed'),'false');
});

for(const outcome of ['resolve','reject'])test(`a ${outcome}d older pad cannot interfere with newer Play`,async t=>{
 const h=await setup(t);h.pad();h.play();assert.equal(h.contexts.length,2);h.contexts[1].resolve();await flush();
 const status=h.status(),frames=h.frames.size;assert.equal(h.q('[data-studio-play]').getAttribute('aria-pressed'),'true');
 h.contexts[0][outcome](Error('old pad resume failure'));await flush();assert.equal(h.status(),status);assert.equal(h.frames.size,frames);assert.equal(h.contexts[1].state,'running');assert.equal(h.contexts[0].starts.length,0);
});

test('failed audition reports its error, releases audio, and permits a fresh pad attempt',async t=>{
 const h=await setup(t);h.pad();h.contexts[0].reject(Error('pad resume blocked'));await flush();assert.equal(h.status(),'pad resume blocked');assert.equal(h.contexts[0].state,'closed');assert.equal(h.frames.size,0);
 h.pad();assert.equal(h.contexts.length,2);h.contexts[1].resolve();await flush();assert.equal(h.contexts[1].starts.length,1);assert.equal(h.frames.size,1);assert.equal(h.beats.length,1);
});

test('rapid Play / Stop / Play ignores the first rejected resume and keeps the second playing',async t=>{
 const h=await setup(t);h.play();h.play();h.play();assert.equal(h.contexts.length,2);h.contexts[1].resolve();await flush();const status=h.status();
 h.contexts[0].reject(Error('old play resume failure'));await flush();assert.equal(h.status(),status);assert.equal(h.contexts[1].state,'running');assert.equal(h.q('[data-studio-play]').getAttribute('aria-pressed'),'true');assert.equal(h.frames.size,1);
});

test('a Stop dispatched during the pad beat also cancels the queued UI continuation',async t=>{
 const h=await setup(t);h.document.addEventListener('atelier:beat',h.stop,{once:true});h.pad();h.contexts[0].resolve();await flush();
 assert.equal(h.contexts[0].starts.length,1);assert.equal(h.contexts[0].state,'closed');assert.equal(h.frames.size,0);assert.match(h.status(),/已停止/);
});
