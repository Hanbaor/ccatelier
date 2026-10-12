const test=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const stageModule=import('../source/atelier/js/livehouse-stage.js'),threeModule=import('../source/atelier/vendor/three/0.186.0/livehouse-three.js');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
async function fixture(t,{available=true,motion=true,load,hidden=false}={}){
 const dom=new JSDOM('<dialog open><div class="livehouse-room"><div class="livehouse-kit"><button data-live-pad="kick">A</button><button data-live-pad="snare">S</button><button data-live-pad="hat">D</button><button data-live-pad="tom">F</button></div><details data-live-recorder></details></div></dialog>');
 const {window}=dom,document=window.document,dialog=document.querySelector('dialog'),kit=document.querySelector('.livehouse-kit'),pads=new Map([...document.querySelectorAll('[data-live-pad]')].map(p=>[p.dataset.livePad,p]));
 let now=1000,next=0,loads=0;const frames=new Map(),globals=new Map(),renderers=[],observers=[],context={losses:0,getExtension(){return {loseContext:()=>context.losses++};}};
 const patch=(key,value)=>{globals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});};
 class Observer{constructor(callback){this.callback=callback;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}
 for(const [key,value] of Object.entries({window,document,performance:{now:()=>now},requestAnimationFrame:callback=>{const id=++next;frames.set(id,callback);return id;},cancelAnimationFrame:id=>frames.delete(id),ResizeObserver:Observer}))patch(key,value);
 t.after(()=>{api?.dispose();window.close();for(const [key,value] of globals){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}});
 window.WebGL2RenderingContext=function(){};Object.defineProperty(document,'hidden',{get:()=>hidden});
 const drawing={fillRect(){},beginPath(){},arc(){},stroke(){},createRadialGradient(){return {addColorStop(){}};}};
 window.HTMLCanvasElement.prototype.getContext=function(type){if(type==='webgl2')return available?context:null;return drawing;};
 kit.getBoundingClientRect=()=>({left:100,top:200,width:710,height:250});
 const positions={kick:[320,280,222,166],snare:[121,247,180,130],hat:[619,238,191,119],tom:[363,172,150,108]};
 for(const [type,pad] of pads)pad.getBoundingClientRect=()=>{const [left,top,width,height]=positions[type];return {left,top,width,height};};
 class Renderer{
  constructor(options){this.options=options;this.renders=0;this.disposals=0;this.resizes=0;renderers.push(this);}
  setClearColor(){}setSize(width,height){this.resizes++;this.size=[width,height];}
  render(scene,camera){if(this.fail)throw Error('GPU failure');this.scene=scene;this.camera=camera;this.renders++;}
  dispose(){this.disposals++;}
 }
 const three={...await threeModule,WebGLRenderer:Renderer},abort=new AbortController();let api;
 const options={dialog,kit,pads,signal:abort.signal,isCurrent:()=>dialog.open,isMotion:()=>motion,loadThree:()=>{loads++;return load?load(three):Promise.resolve(three);}};
 const result={window,document,dialog,kit,pads,frames,renderers,observers,context,abort,three,options,get loads(){return loads;},get api(){return api;},async create(){api=await (await stageModule).createLiveStage(options);return api;},frame(ms=35){now+=ms;const batch=[...frames.values()];frames.clear();batch.forEach(callback=>callback(now));},setHidden(value){hidden=value;api?.setVisible(!value);},setMotion(value){motion=value;api?.setMotion(value);}};
 return result;
}
test('3D layer is inert, aligns to all native targets and renders only on demand',async t=>{
 const f=await fixture(t),stage=await f.create(),canvas=f.kit.querySelector('canvas');assert.ok(stage);assert.equal(f.dialog.dataset.liveStageState,'ready');assert.equal(canvas.getAttribute('aria-hidden'),'true');assert.equal(canvas.hasAttribute('tabindex'),false);assert.equal(f.pads.size,4);assert.equal(f.kit.classList.contains('livehouse-3d-ready'),true);assert.equal(f.frames.size,0);assert.equal(f.renderers[0].renders,1);
 const root=f.renderers[0].scene.getObjectByName('live-kick');assert.equal(root.position.x,369);assert.equal(root.position.y,-201);assert.equal(root.scale.x,111);
 stage.strike('kick');assert.equal(f.frames.size,1);f.frame(40);assert.equal(f.renderers[0].renders,2);for(let i=0;i<25;i++)f.frame();assert.equal(f.frames.size,0);
 const geometries=new Set();f.renderers[0].scene.traverse(object=>{if(object.geometry)geometries.add(object.geometry);});let disposed=0;geometries.forEach(object=>object.addEventListener('dispose',()=>disposed++));stage.dispose();assert.equal(f.frames.size,0);assert.equal(f.renderers[0].disposals,1);assert.equal(disposed,geometries.size);assert.equal(canvas.isConnected,false);assert.equal(f.kit.classList.contains('livehouse-3d-ready'),false);assert.ok(f.observers.every(observer=>observer.disconnected));stage.dispose();assert.equal(f.renderers[0].disposals,1);
});
test('no WebGL, rejected imports and a renderer failure preserve the HTML fallback',async t=>{
 const f=await fixture(t,{available:false});assert.equal(await f.create(),null);assert.equal(f.loads,0);assert.equal(f.dialog.dataset.liveStageState,'context-unavailable');assert.equal(f.kit.querySelector('canvas'),null);assert.equal(f.pads.get('kick').textContent,'A');
});
test('renderer import rejection releases its probed context without hiding skins',async t=>{
 const f=await fixture(t,{load:()=>Promise.reject(Error('offline'))});assert.equal(await f.create(),null);assert.equal(f.context.losses,1);assert.equal(f.dialog.dataset.liveStageState,'module-load-failed');assert.equal(f.kit.classList.contains('livehouse-3d-ready'),false);assert.equal(f.frames.size,0);
});
test('close while the renderer is loading cannot mount a late canvas',async t=>{
 const pending=deferred(),f=await fixture(t,{load:()=>pending.promise}),ready=f.create();await new Promise(resolve=>setImmediate(resolve));f.dialog.open=false;f.abort.abort();assert.equal(f.context.losses,1);pending.resolve(f.three);assert.equal(await ready,null);assert.equal(f.renderers.length,0);assert.equal(f.frames.size,0);assert.equal(f.kit.querySelector('canvas'),null);
});
test('reduced motion and backgrounding produce no ongoing GPU frame loop',async t=>{
 const f=await fixture(t,{motion:false}),stage=await f.create();assert.equal(f.renderers[0].renders,1);stage.strike('snare');stage.pointer(.8);assert.equal(f.frames.size,0);f.setMotion(true);stage.strike('hat');assert.equal(f.frames.size,1);f.setHidden(true);assert.equal(f.frames.size,0);const count=f.renderers[0].renders;stage.strike('kick');stage.resize();assert.equal(f.renderers[0].renders,count);f.setHidden(false);assert.equal(f.frames.size,0);assert.equal(f.renderers[0].renders,count+1);f.setMotion(false);assert.equal(f.frames.size,0);
});
test('a renderer that arrives after backgrounding waits for visibility before its first draw',async t=>{
 const pending=deferred(),f=await fixture(t,{load:()=>pending.promise}),ready=f.create();await new Promise(resolve=>setImmediate(resolve));f.setHidden(true);pending.resolve(f.three);const stage=await ready;assert.ok(stage);assert.equal(f.renderers[0].renders,0);assert.equal(f.dialog.dataset.liveStageState,'waiting-visible');assert.equal(f.kit.classList.contains('livehouse-3d-ready'),false);assert.equal(f.frames.size,0);f.setHidden(false);assert.equal(f.renderers[0].renders,1);
});
test('context loss immediately returns skins; restore redraws only an active stage',async t=>{
 const f=await fixture(t),stage=await f.create(),canvas=f.kit.querySelector('canvas');stage.strike('tom');const lost=new f.window.Event('webglcontextlost',{cancelable:true});canvas.dispatchEvent(lost);assert.equal(lost.defaultPrevented,true);assert.equal(f.dialog.dataset.liveStageState,'fallback');assert.equal(f.frames.size,0);assert.equal(f.kit.classList.contains('livehouse-3d-ready'),false);stage.strike('tom');assert.equal(f.frames.size,0);canvas.dispatchEvent(new f.window.Event('webglcontextrestored'));assert.equal(f.dialog.dataset.liveStageState,'ready');assert.equal(f.kit.classList.contains('livehouse-3d-ready'),true);assert.equal(f.frames.size,0);f.setHidden(true);canvas.dispatchEvent(new f.window.Event('webglcontextlost',{cancelable:true}));canvas.dispatchEvent(new f.window.Event('webglcontextrestored'));assert.equal(f.kit.classList.contains('livehouse-3d-ready'),false);f.setHidden(false);assert.equal(f.kit.classList.contains('livehouse-3d-ready'),true);
});
test('a render failure disposes GPU work and leaves native pads operative',async t=>{
 const f=await fixture(t),stage=await f.create();f.renderers[0].fail=true;stage.strike('snare');f.frame();assert.equal(f.kit.classList.contains('livehouse-3d-ready'),false);assert.equal(f.frames.size,0);assert.equal(f.renderers[0].disposals,1);assert.equal(f.kit.querySelector('canvas'),null);let clicks=0;f.pads.get('snare').addEventListener('click',()=>clicks++);f.pads.get('snare').click();assert.equal(clicks,1);
});
test('finishing a native transform transition remeasures after mount or motion enable',async t=>{
 const f=await fixture(t,{motion:false}),stage=await f.create(),root=f.renderers[0].scene.getObjectByName('live-kick');f.setMotion(true);assert.equal(f.frames.size,0);f.pads.get('kick').getBoundingClientRect=()=>({left:330,top:290,width:200,height:130});const event=new f.window.Event('transitionend');Object.defineProperty(event,'propertyName',{value:'transform'});f.pads.get('kick').dispatchEvent(event);assert.equal(root.scale.x,100);assert.equal(root.position.x,368);assert.equal(root.position.y,-193);assert.equal(f.frames.size,0);stage.dispose();
});
test('following native hover transforms does not repeatedly reallocate an unchanged buffer',async t=>{
 const f=await fixture(t),stage=await f.create();assert.equal(f.renderers[0].resizes,1);f.pads.get('hat').dispatchEvent(new f.window.Event('pointerenter'));for(let i=0;i<10;i++)f.frame();assert.equal(f.renderers[0].resizes,1);assert.equal(f.frames.size,0);stage.dispose();
});
test('native CSS transform and parent perspective are used instead of the hi-hat rectangle bounds',async t=>{
 const f=await fixture(t),pad=f.pads.get('hat'),angle=-8*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 f.window.DOMMatrixReadOnly=class{constructor(){Object.assign(this,{m11:c,m12:s,m13:0,m14:0,m21:-s,m22:c,m23:0,m24:0,m41:0,m42:0,m43:0,m44:1});}};
 for(const [key,value] of Object.entries({offsetWidth:190,offsetHeight:122,offsetLeft:519,offsetTop:38}))Object.defineProperty(pad,key,{value});
 pad.style.transformOrigin='95px 61px';f.kit.style.perspective='750px';f.kit.style.perspectiveOrigin='355px 125px';
 const stage=await f.create(),root=f.renderers[0].scene.getObjectByName('live-hat');assert.ok(Math.abs(root.scale.x-95)<1e-8);assert.ok(Math.abs(root.position.x-652)<1e-8);assert.ok(Math.abs(root.position.y+137)<1e-8);assert.ok(Math.abs(root.rotation.z+angle)<1e-8);stage.dispose();
});

test('a layout failure during hover releases the stage instead of leaving invisible native skins',async t=>{
 const f=await fixture(t),stage=await f.create();f.pads.get('hat').dispatchEvent(new f.window.Event('pointerenter'));
 f.kit.getBoundingClientRect=()=>{throw Error('detached layout');};
 assert.doesNotThrow(()=>f.frame());assert.equal(f.frames.size,0);assert.equal(f.kit.classList.contains('livehouse-3d-ready'),false);assert.equal(f.renderers[0].disposals,1);assert.equal(f.kit.querySelector('canvas'),null);
 let clicks=0;f.pads.get('hat').addEventListener('click',()=>clicks++);f.pads.get('hat').click();assert.equal(clicks,1);stage.dispose();
});

test('lifecycle states name only existing initialization branches and never expose error details',async t=>{
 const f=await fixture(t);delete f.window.WebGL2RenderingContext;assert.equal(await f.create(),null);assert.equal(f.dialog.dataset.liveStageState,'unsupported');assert.equal(f.loads,0);
 f.window.WebGL2RenderingContext=function(){};f.window.HTMLCanvasElement.prototype.getContext=()=>{throw Error('private driver detail');};assert.equal(await f.create(),null);assert.equal(f.dialog.dataset.liveStageState,'context-unavailable');assert.doesNotMatch(f.dialog.outerHTML,/private driver/);
});
test('a stale failed import cannot overwrite the state of a newer stage',async t=>{
 const pending=deferred(),f=await fixture(t,{load:()=>pending.promise}),ready=f.create();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.dialog.dataset.liveStageState,'loading');f.abort.abort();f.dialog.dataset.liveStageState='ready';pending.reject(Error('old import'));assert.equal(await ready,null);assert.equal(f.dialog.dataset.liveStageState,'ready');
});
test('renderer initialization failure is distinguishable from a module load failure',async t=>{
 const f=await fixture(t,{load:three=>({...three,WebGLRenderer:class{constructor(){throw Error('private init detail');}}})});assert.equal(await f.create(),null);assert.equal(f.dialog.dataset.liveStageState,'init-failed');assert.doesNotMatch(f.dialog.outerHTML,/private init/);
});
test('director snapshot seeks drum mechanics directly and outer framing does not double-scale native alignment',async t=>{
 const f=await fixture(t),stage=await f.create();const root=f.renderers[0].scene.getObjectByName('live-kick');stage.setTimeline({kick:{elapsed:50,velocity:1}});const skin=root.children[0].children.find(n=>n.geometry?.type==='CircleGeometry');assert.ok(skin.position.y<.007);stage.setTimeline({kick:{elapsed:900,velocity:1}});assert.equal(skin.position.y,.007);assert.equal(f.frames.size,0);
 Object.defineProperty(f.kit,'offsetWidth',{value:710});Object.defineProperty(f.kit,'offsetHeight',{value:250});f.kit.getBoundingClientRect=()=>({left:100,top:200,width:781,height:275});for(const pad of f.pads.values()){const original=pad.getBoundingClientRect();pad.getBoundingClientRect=()=>({left:100+(original.left-100)*1.1,top:200+(original.top-200)*1.1,width:original.width*1.1,height:original.height*1.1});}stage.resize();assert.ok(Math.abs(root.scale.x-111)<1e-8);assert.ok(Math.abs(root.position.x-369)<1e-8);
});
