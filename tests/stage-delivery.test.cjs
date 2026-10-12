const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const authoredLightButton=read('custom/redefine/nijika/studio.ejs').match(/<button class="lighting-open">[^<]+<\/button>/)?.[0];
assert.ok(authoredLightButton,'studio template retains its first-click lighting button');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function setup({section='studio',reading=false,hidden=false,motion=true,webgl=true,prefix='/'}={}){
 const dom=new JSDOM(`<body data-section="${section}"><div class="utility-controls"></div><main ${section==='studio'?'data-studio':''} class="${reading?'reading-page':''}">${authoredLightButton}</main></body>`,{url:'https://stage.test'+prefix+'studio/',pretendToBeVisual:true});
 const w=dom.window,d=w.document,raf=new Map(),counts={contexts:0,draws:0,opens:0};let id=0,now=0;
 Object.defineProperty(d,'hidden',{get:()=>hidden});
 const gl=new Proxy({getShaderParameter:()=>true,getProgramParameter:()=>true,drawArrays:()=>counts.draws++},{get:(o,k)=>k in o?o[k]:()=>({})});
 w.HTMLCanvasElement.prototype.getContext=()=>{counts.contexts++;return webgl?gl:null;};
 const element=(tag,cls,text)=>{const el=d.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
 const context=vm.createContext({document:d,window:w,innerWidth:1200,innerHeight:800,performance:{now:()=>now},$:s=>d.querySelector(s),$$:s=>[...d.querySelectorAll(s)],motion:{enabled:motion},storage:{get:()=>null,set:()=>true},root:prefix,element,action:(text,fn,cls)=>{const b=element('button',cls,text);b.addEventListener('click',fn);return b;},makeDialog:id=>{const dialog=element('dialog');dialog.id=id;d.body.append(dialog);return {dialog,open(){counts.opens++;dialog.setAttribute('open','');}};},MutationObserver:class{observe(){}},requestAnimationFrame:fn=>{raf.set(++id,fn);return id;},cancelAnimationFrame:id=>raf.delete(id)});
 vm.runInContext(read('source/atelier/js/stage-engine.js').replace(/^import .*;\s*$/gm,'').replace('export function initStageEngine','function initStageEngine'),context);
 return {dom,w,d,counts,raf,module:{initStageEngine:()=>context.initStageEngine()},hidden(value){hidden=value;d.dispatchEvent(new w.Event('visibilitychange'));},tick(n=1){for(let i=0;i<n;i++){now+=16;const tasks=[...raf.values()];raf.clear();tasks.forEach(fn=>fn(now));}},close(){w.close();}};
}
async function boot(s,load){const {initRouteFeatures,routeFeatures}=await import('../source/atelier/js/route-features.js');const loaders=Object.fromEntries(routeFeatures.map(f=>[f.id,f.id==='stage-engine'?load:async()=>({[f.init](){}})]));return {ready:initRouteFeatures({root:s.d,loaders}),again:()=>initRouteFeatures({root:s.d,loaders})};}
test('actual main entry retains synchronous coordination and excludes stage outside studio at both roots',async()=>{
 const {initRouteFeatures,routeFeatures}=await import('../source/atelier/js/route-features.js');
 for(const prefix of ['/','/lab/'])for(const section of ['cover','notes','practice','studio']){
  const s=setup({section,prefix});try{
   const calls=[],loads=[],source=read('source/atelier/js/main.js'),context={document:s.d,window:s.w};let ready;
   for(const match of source.matchAll(/import\s*\{([^}]+)\}/g))for(const name of match[1].split(',').map(s=>s.trim()))context[name]=()=>calls.push(name);
   context.initRouteFeatures=()=>{calls.push('initRouteFeatures');return ready=initRouteFeatures({root:s.d,loaders:Object.fromEntries(routeFeatures.map(f=>[f.id,async()=>{loads.push(f.id);return {[f.init](){}};}]))});};
   vm.runInNewContext(source.replace(/^import .*;\s*$/gm,''),context);await ready;
   assert.deepEqual(loads,section==='studio'?['stage-engine','studio']:[]);
   for(const name of ['initDialogs','initSettings','initRhythm','initOffline','initQueue','initNavigationScenes'])assert.ok(calls.indexOf(name)<calls.indexOf('initRouteFeatures'),name);
  }finally{s.close();}
 }
});
test('delayed authored lighting click replays exactly once with real initializer; repeated boot never duplicates resources',async()=>{
 for(const prefix of ['/','/lab/']){
  const s=setup({prefix}),pending=deferred();try{
   const run=await boot(s,()=>pending.promise),button=s.d.querySelector('main .lighting-open');button.click();button.click();assert.equal(s.counts.opens,0);
   pending.resolve(s.module);await run.ready;assert.equal(s.counts.opens,1);assert.equal(s.counts.contexts,1);assert.equal(s.d.querySelectorAll('canvas').length,1);
   await run.again();s.module.initStageEngine();assert.equal(s.counts.contexts,1);assert.equal(s.d.querySelectorAll('.utility-controls .lighting-open').length,1);assert.equal(s.d.querySelectorAll('main .lighting-open').length,1);
   assert.equal(s.d.querySelector('.lighting-links a').getAttribute('href'),prefix+'studio/');
  }finally{s.close();}
 }
});
test('failed stage import preserves native button and retries without replaying abandoned intent',async()=>{
 const s=setup();let attempts=0;try{
  const run=await boot(s,async()=>{if(++attempts===1)throw Error('offline');return s.module;});s.d.querySelector('main button').click();await run.ready;
  assert.equal(s.counts.contexts,0);assert.equal(s.counts.opens,0);s.d.querySelector('[data-feature-status=stage-engine] button').click();await flush();assert.equal(attempts,2);assert.equal(s.counts.contexts,1);assert.equal(s.counts.opens,0);s.d.querySelector('main button').click();assert.equal(s.counts.opens,1);
 }finally{s.close();}
});
for(const event of ['dialog','hidden','pagehide'])test(`late import after ${event} cancels lighting intent and respects lifecycle`,async()=>{
 const s=setup(),pending=deferred();try{
  const run=await boot(s,()=>pending.promise);s.d.querySelector('main button').click();
  if(event==='dialog')s.d.dispatchEvent(new s.w.Event('atelier:dialog-open'));else if(event==='hidden')s.hidden(true);else s.w.dispatchEvent(new s.w.Event('pagehide'));
  pending.resolve(s.module);await flush();assert.equal(s.counts.opens,0);
  if(event!=='dialog'){assert.equal(s.counts.contexts,0);assert.equal(s.raf.size,0);if(event==='hidden')s.hidden(false);else s.w.dispatchEvent(new s.w.Event('pageshow'));}
  await run.ready;assert.equal(s.counts.contexts,1);assert.equal(s.counts.opens,0);s.tick();assert.equal(s.raf.size,1);
  s.w.dispatchEvent(new s.w.Event('pagehide'));for(const type of ['resize'])s.w.dispatchEvent(new s.w.Event(type));s.hidden(false);s.d.dispatchEvent(new s.w.Event('atelier:motion'));assert.equal(s.raf.size,0);
  s.w.dispatchEvent(new s.w.Event('pageshow'));s.w.dispatchEvent(new s.w.Event('pageshow'));assert.equal(s.raf.size,1);assert.equal(s.counts.contexts,1);
 }finally{s.close();}
});
test('initially hidden tab allocates nothing until visible; reduced motion and WebGL fallback settle without loops',async()=>{
 for(const motion of [false,true])for(const webgl of [false,true]){
  const s=setup({hidden:true,motion,webgl});try{
   const run=await boot(s,async()=>s.module);await flush();assert.equal(s.counts.contexts,0);s.hidden(false);await run.ready;s.tick(30);
   assert.equal(s.counts.contexts,1);assert.equal(s.raf.size,motion&&webgl?1:0);assert.equal(s.counts.draws,webgl?(motion?30:1):0);
   if(!webgl)assert.equal(s.d.querySelector('.stage-field-fallback').hidden,false);
  }finally{s.close();}
 }
});
test('actual stage module preserves defensive reading and non-studio guards',()=>{
 for(const options of [{section:'cover'},{section:'practice'},{section:'notes'},{section:'studio',reading:true}]){
  const s=setup(options);try{s.module.initStageEngine();assert.equal(s.counts.contexts,0);assert.equal(s.d.querySelector('canvas,#lighting-dialog'),null);assert.equal(s.raf.size,0);}finally{s.close();}
 }
});
