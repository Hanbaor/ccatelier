'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ejs=require('ejs'),{JSDOM}=require('jsdom'),{parse}=require('rrweb-cssom');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const template=read('custom/redefine/nijika/dialogs.ejs');
const studioButton=read('custom/redefine/nijika/studio.ejs').match(/<button class="lighting-open">[^<]+<\/button>/)[0];
const stageHelp='#help-dialog [data-stage-help-action]';
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function renderDialogs(section,prefix){
 return ejs.render(template,{page:section&&section!=='ordinary'?{nijika:section}:{},url_for:value=>prefix+value.replace(/^\//,''),nijika_art_srcset:()=>'',partial:()=>''});
}
function setup({section='studio',prefix='/',webgl=true,motion=true,hidden=false,failure=null}={}){
 const dom=new JSDOM(`<body data-section="${section||'article'}" data-root="${prefix}"><div class="utility-controls"></div><button data-help-open>帮助</button><main ${section==='studio'?'data-studio':''}>${section==='studio'?studioButton:''}</main>${renderDialogs(section,prefix)}</body>`,{url:'https://atelier.test'+prefix+(section||'article')+'/',pretendToBeVisual:true});
 const w=dom.window,d=w.document,counts={contexts:0,draws:0,opens:[],phases:[]},raf=new Map(),timers=new Map();let serial=0,now=0,initializing=false;
 Object.defineProperty(d,'hidden',{get:()=>hidden});
 // Native dialog presentation/focus trapping and GPU output are browser boundaries.
 // Execute the real dialog coordinator and stage initializer against DOM models.
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.localStorage.setItem('cc-pass',JSON.stringify({id:'ABC123',date:'2026-10-11',stamps:[]}));
 d.addEventListener('atelier:dialog-open',event=>counts.opens.push(event.detail.id));
 function phase(name){
  if(!initializing)return;
  counts.phases.push(name);
  assert.equal(d.querySelector(stageHelp)?.hidden,true,'help stays hidden through '+name);
  if(failure===name)throw Error('stage '+name+' failed');
 }
 const gl=new Proxy({getShaderParameter:()=>webgl!=='shader-fail',getProgramParameter:()=>true,drawArrays:()=>counts.draws++},{get:(object,key)=>key in object?object[key]:()=>({})});
 w.HTMLCanvasElement.prototype.getContext=()=>{counts.contexts++;return webgl?gl:null;};
 w.setTimeout=(fn,ms)=>{const id=++serial;timers.set(id,{fn,at:now+ms});return id;};w.clearTimeout=id=>timers.delete(id);
 const context=vm.createContext({document:d,window:w,location:w.location,localStorage:w.localStorage,CustomEvent:w.CustomEvent,innerWidth:1200,innerHeight:800,
  performance:{now:()=>now},matchMedia:()=>({matches:false,addEventListener(){}}),queueMicrotask,setTimeout:w.setTimeout,clearTimeout:w.clearTimeout,
  MutationObserver:class{observe(){phase('observer');}},requestAnimationFrame:fn=>{phase('resize');const id=++serial;raf.set(id,fn);return id;},cancelAnimationFrame:id=>raf.delete(id)});
 const executable=file=>read('source/atelier/js/'+file).replace(/^import .*;\s*$/gm,'').replace(/\bexport /g,'');
 vm.runInContext(executable('ui.js'),context);
 vm.runInContext(read('source/atelier/js/archive-store.js').split('\n').filter(line=>/^export function (element|action)\(/.test(line)).join('\n').replace(/\bexport /g,''),context);
 vm.runInContext(executable('live-dialog.js'),context);
 vm.runInContext(`const root=${JSON.stringify(prefix)};\n`+executable('stage-engine.js'),context);
 // Real Help opening/shortcut and Close behavior, with unrelated optional widgets absent.
 vm.runInContext('(function(){'+executable('after-hours.js')+';initAfterHours();})()',context);
 vm.runInContext('initDialogs();motion.enabled='+motion+';',context);
 const add=d.addEventListener.bind(d);d.addEventListener=(type,...args)=>{if(type==='click')phase('binding');return add(type,...args);};
 const module={initStageEngine(){initializing=true;try{return context.initStageEngine();}finally{initializing=false;}}};
 return {w,d,counts,raf,timers,module,help:()=>d.querySelector(stageHelp),openHelp:()=>d.querySelector('[data-help-open]').click(),
  visibility(value){hidden=value;d.dispatchEvent(new w.Event('visibilitychange'));},
  async tick(ms){now+=ms;const due=[...timers].filter(([,task])=>task.at<=now);for(const [id,task] of due){timers.delete(id);task.fn();}await flush();},
  close(){w.dispatchEvent(new w.Event('pagehide'));w.close();}};
}
async function boot(s,load){
 const {initRouteFeatures,routeFeatures}=await import('../source/atelier/js/route-features.js');
 const loaders=Object.fromEntries(routeFeatures.map(feature=>[feature.id,feature.id==='stage-engine'?load:async()=>({[feature.init](){}})]));
 return {ready:initRouteFeatures({root:s.d,loaders}),again:()=>initRouteFeatures({root:s.d,loaders})};
}
function checkOtherHelp(s,prefix='/'){
 const help=s.d.querySelector('#help-dialog');
 assert.deepEqual([...help.querySelectorAll('.help-links a')].map(link=>link.getAttribute('href')),[prefix+'notes/?view=graph',prefix+'studio/',prefix+'lounge/',prefix+'guestbook/',prefix+'atom.xml']);
 assert.equal(help.querySelectorAll('.queue-open').length,1);assert.equal(help.querySelector('.queue-open').hidden,false);
 assert.equal(help.querySelectorAll('.help-shortcuts p').length,3);
 assert.match(help.querySelector('.credits-note').textContent,/留言审核后公开/);
 s.openHelp();assert.equal(help.open,true);help.querySelector('[data-close]').click();assert.equal(help.open,false);
 const shortcut=new s.w.KeyboardEvent('keydown',{key:'?',bubbles:true,cancelable:true});s.d.body.dispatchEvent(shortcut);assert.equal(shortcut.defaultPrevented,true);assert.equal(help.open,true);
 help.querySelector('[data-close]').click();assert.equal(help.open,false);
}
// This is the DOM/HTML sequential-focus contract, not a native Tab simulation.
// JSDOM has neither browser focus navigation nor the modal top layer.
function helpFocusCandidates(s){
 return [...s.d.querySelectorAll('#help-dialog a[href],#help-dialog button')].filter(node=>!node.disabled&&!node.closest('[hidden],[inert]')&&node.tabIndex>=0);
}
function assertUnavailable(s){
 assert.equal(s.help().hidden,true);assert.equal(s.help().hasAttribute('hidden'),true);
 assert.equal(helpFocusCandidates(s).includes(s.help()),false,'hidden action is excluded from the DOM focus-candidate model');
 assert.equal(s.d.querySelectorAll('#help-dialog [data-stage-help-action]').length,1);
}
for(const prefix of ['/','/lab/'])test(`real dialogs omit unavailable stage action on every non-studio route (${prefix})`,async()=>{
 for(const section of ['cover','atelier','notes','projects','research','life','about','lounge','guestbook','practice','series','categories','tags','ordinary',null]){
  const s=setup({section,prefix});try{
   assert.equal(s.help(),null,section||'article');assert.equal(s.d.querySelector('#help-dialog .lighting-open'),null);
   assert.equal(s.d.querySelectorAll('#help-dialog .help-links button').length,1);checkOtherHelp(s,prefix);
   let stageLoads=0;const run=await boot(s,async()=>{stageLoads++;return s.module;});await run.ready;s.module.initStageEngine();
   assert.equal(stageLoads,0);assert.equal(s.counts.contexts,0);assert.equal(s.d.querySelector('canvas,#lighting-dialog,.utility-controls .lighting-open'),null);assert.equal(s.raf.size,0);
  }finally{s.close();}
 }
});
test('studio markup stays hidden before stage initialization, with the existing important hidden style',()=>{
 const s=setup();try{
  assertUnavailable(s);assert.equal(s.d.querySelectorAll('#help-dialog .help-links button').length,2);checkOtherHelp(s);
  const hiddenRule=[...parse(read('source/atelier/css/atelier.css')).cssRules].find(rule=>rule.selectorText==='[hidden]');
  assert.equal(hiddenRule.style.getPropertyValue('display'),'none');assert.equal(hiddenRule.style.getPropertyPriority('display'),'important');
  assert.equal(s.counts.contexts,0);assert.equal(s.d.querySelector('#lighting-dialog'),null);
 }finally{s.close();}
});
for(const webgl of [true,false,'shader-fail'])for(const prefix of ['/','/lab/'])test(`real stage readiness exposes an immediately usable help action (${webgl}, ${prefix})`,async()=>{
 const s=setup({webgl,prefix}),pending=deferred();try{
  const run=await boot(s,()=>pending.promise);await flush();assertUnavailable(s);s.openHelp();
  const help=s.d.querySelector('#help-dialog'),queue=help.querySelector('.queue-open');queue.focus();
  pending.resolve(s.module);await run.ready;
  assert.deepEqual(s.counts.phases,['binding','observer','resize']);assert.equal(s.help().hidden,false);assert.equal(help.open,true);assert.equal(s.d.activeElement,queue,'readiness never steals current help focus');
  assert.equal(helpFocusCandidates(s).includes(s.help()),true);assert.equal(s.counts.contexts,1);assert.equal(s.raf.size,1);
  assert.equal(s.d.querySelector('.lighting-links span').textContent,webgl===true?'光场已就绪':'当前设备使用柔光背景');
  s.help().focus();s.help().click();assert.equal(help.open,false);assert.equal(s.d.querySelector('#lighting-dialog').open,true);assert.equal(s.counts.opens.filter(id=>id==='lighting-dialog').length,1,'first available click completes with the help modal already open');
  s.d.querySelector('#lighting-dialog').close();
  for(let i=0;i<3;i++){s.module.initStageEngine();await run.again();}
  assert.equal(s.d.querySelectorAll(stageHelp).length,1);assert.equal(s.d.querySelectorAll('.utility-controls .lighting-open').length,1);assert.equal(s.d.querySelectorAll('#lighting-dialog').length,1);assert.equal(s.d.querySelectorAll('canvas').length,1);assert.equal(s.counts.contexts,1);
  s.openHelp();s.help().click();assert.equal(s.counts.opens.filter(id=>id==='lighting-dialog').length,2,'reinitialization does not duplicate click handlers');
  s.d.querySelector('#lighting-dialog').close();s.d.querySelector('main .lighting-open').click();assert.equal(s.counts.opens.filter(id=>id==='lighting-dialog').length,3);
  s.d.querySelector('#lighting-dialog').close();s.d.querySelector('.utility-controls .lighting-open').click();assert.equal(s.counts.opens.filter(id=>id==='lighting-dialog').length,4);
  checkOtherHelp(s,prefix);
 }finally{s.close();}
});
for(const failure of ['reject','timeout'])test(`stage ${failure} leaves help action hidden through explicit retry and ignores stale work`,async()=>{
 const s=setup(),first=deferred(),next=deferred();let attempts=0;try{
  const run=await boot(s,()=>++attempts===1?first.promise:next.promise);await flush();s.openHelp();assertUnavailable(s);
  if(failure==='reject')first.reject(Error('offline'));else await s.tick(15000);
  const result=await run.ready;assert.equal(result.find(record=>record.id==='stage-engine').status,'failed');assertUnavailable(s);
  assert.equal(s.d.querySelector('#help-dialog').open,true);assert.equal(s.counts.contexts,0);
  const retry=s.d.querySelector('[data-feature-status="stage-engine"] button');assert.equal(retry.textContent,'重新加载');
  checkOtherHelp(s);retry.click();await flush();assert.equal(attempts,2);assertUnavailable(s);
  if(failure==='timeout'){first.resolve(s.module);await flush();assertUnavailable(s);assert.equal(s.counts.contexts,0);}
  s.openHelp();next.resolve(s.module);await flush();assert.equal(s.help().hidden,false);assert.equal(s.counts.contexts,1);assert.equal(s.d.querySelector('[data-feature-status="stage-engine"]'),null);
  assert.equal(s.counts.opens.filter(id=>id==='lighting-dialog').length,0,'a retry does not invent a help action');s.help().click();assert.equal(s.d.querySelector('#lighting-dialog').open,true);
 }finally{s.close();}
});
for(const failure of ['binding','observer','resize'])test(`partial stage ${failure} failure never exposes help even when a dialog already exists`,async()=>{
 const s=setup({failure});try{
  const run=await boot(s,async()=>s.module);const result=await run.ready;assert.equal(result.find(record=>record.id==='stage-engine').status,'failed');
  assert.ok(s.d.querySelector('#lighting-dialog'),'failure occurs after dialog creation');assertUnavailable(s);
  assert.equal(s.d.querySelector('[data-feature-status="stage-engine"] button').textContent,'刷新页面');
  s.module.initStageEngine();assertUnavailable(s);assert.equal(s.counts.contexts,1);assert.equal(s.d.querySelectorAll('#lighting-dialog').length,1);checkOtherHelp(s);
 }finally{s.close();}
});
for(const away of ['hidden','pagehide'])test(`resolved stage import stays unavailable while ${away} and becomes usable only after resume`,async()=>{
 const s=setup(),pending=deferred();try{
  const run=await boot(s,()=>pending.promise);await flush();
  if(away==='hidden')s.visibility(true);else s.w.dispatchEvent(new s.w.Event('pagehide'));
  pending.resolve(s.module);await flush();assertUnavailable(s);assert.equal(s.counts.contexts,0);assert.equal(s.raf.size,0);
  if(away==='hidden')s.visibility(false);else s.w.dispatchEvent(new s.w.Event('pageshow'));
  await run.ready;assert.equal(s.help().hidden,false);assert.equal(s.counts.contexts,1);s.openHelp();s.help().click();assert.equal(s.d.querySelector('#lighting-dialog').open,true);
 }finally{s.close();}
});
