const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),crypto=require('node:crypto').webcrypto;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const settle=async()=>{for(let i=0;i<8;i++)await flush();};
const deferred=()=>{let resolve;return{promise:new Promise(yes=>resolve=yes),get resolve(){return resolve}}};
async function setup({duplicate=false,hash='',digest,initialReference=true}={}){
 const block='<div class="code-container" data-rel="Cpp"><table><tr><td class="gutter"><pre><span class="line">1</span><br><span class="line">2</span><br><span class="line">3</span></pre></td><td class="code"><pre><span class="line">  <b>中</b></span><br><span class="line"></span><br><span class="line">\treturn 1;</span></pre></td></tr></table></div>';
 const dom=new JSDOM(`<article class="article-body"><h2 id="other">Other</h2>${block}${duplicate?block:''}</article><div id="toast"></div>`,{url:'https://test.example/prefix/post/?private=secret'+hash,pretendToBeVisual:true}),{window}=dom,doc=window.document,scrolled=[],copies=[];
 Object.assign(globalThis,{document:doc,window,location:window.location,CustomEvent:window.CustomEvent,matchMedia:()=>({matches:false,addEventListener(){}})});
 window.HTMLElement.prototype.scrollIntoView=function(){scrolled.push(this);};window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new window.Event('close'));};
 Object.defineProperty(window.navigator,'clipboard',{value:{writeText:async value=>copies.push(value)}});
 const core=await import('../source/atelier/js/code-reference-core.mjs'),module=await import('../source/atelier/js/code-studio.js');
 const controller=module.initCodeStudio({digest:digest||((code)=>core.digestCode(code,crypto)),initialReference});
 return{dom,window,doc,scrolled,copies,controller,core,module,open:()=>doc.querySelector('.code-workbench-open').click(),row:n=>doc.querySelectorAll('.code-lines>div>button')[n-1],copy:()=>doc.querySelector('[data-code-reference-copy]'),status:()=>doc.querySelector('.code-studio .live-status')};
}
test('selection works with Shift, touch-friendly endpoint and keyboard click; copy strips query and no default new entry',async()=>{
 const s=await setup();try{
 assert.equal(s.doc.querySelectorAll('.code-workbench-open').length,1);s.open();assert.ok(s.copy().hidden);
 s.row(3).click();s.row(1).dispatchEvent(new s.window.MouseEvent('click',{bubbles:true,shiftKey:true}));assert.equal(s.doc.querySelectorAll('.line-focused').length,3);
 s.copy().click();await settle();assert.equal(s.copies.length,1);assert.ok(!s.copies[0].includes('private'));assert.match(s.copies[0],/#cc-code=v1\.[a-f0-9]{64}\.1-3$/);
 s.row(3).dispatchEvent(new s.window.KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(s.doc.querySelectorAll('.line-focused').length,1);
 s.row(1).click();s.doc.querySelector('[data-code-reference-extend]').click();s.row(2).click();assert.equal(s.doc.querySelectorAll('.line-focused').length,2);
 s.row(2).click();s.row(2).click();assert.ok(s.copy().hidden);assert.equal(s.doc.querySelectorAll('.line-focused').length,0);
 const all=[...s.doc.querySelectorAll('.live-dialog-tools button')].find(button=>button.textContent==='复制全部');const realTimer=globalThis.setTimeout;try{globalThis.setTimeout=(fn,ms,...args)=>ms===2200?0:realTimer(fn,ms,...args);all.click();await settle();}finally{globalThis.setTimeout=realTimer;}assert.equal(s.copies.at(-1),'  中\n\n\treturn 1;');
 const jump=s.doc.querySelector('.code-line-jump');jump.value='2';[...s.doc.querySelectorAll('.live-dialog-tools button')].find(button=>button.textContent==='跳转').click();assert.equal(s.doc.querySelectorAll('.line-focused').length,1);assert.equal(s.row(2).getAttribute('aria-pressed'),'true');
 s.module.initCodeStudio();assert.equal(s.doc.querySelectorAll('#code-studio-dialog').length,1);
 }finally{s.dom.window.close();}
});
test('explicit line jumps move keyboard focus without a second scroll; invalid input keeps focus and selection',async()=>{
 const s=await setup();try{
 s.open();const input=s.doc.querySelector('.code-line-jump'),jump=[...s.doc.querySelectorAll('.live-dialog-tools button')].find(button=>button.textContent==='跳转');
 const target=s.row(3),focus=target.focus.bind(target),calls=[];target.focus=options=>{calls.push(options);focus(options);};
 input.value='3';jump.focus();jump.click();
 assert.equal(s.doc.activeElement,target,'the next keyboard action starts at the requested line');
 assert.deepEqual(calls,[{preventScroll:true}]);assert.deepEqual(s.scrolled,[target.parentElement]);
 assert.equal(target.getAttribute('aria-pressed'),'true');assert.equal(s.doc.querySelectorAll('.line-focused').length,1);
 for(const value of ['0','-1','4','1.5','','invalid']){
  input.value=value;jump.focus();jump.click();
  assert.equal(s.doc.activeElement,jump,'invalid line '+value+' must not steal focus');
  assert.equal(s.scrolled.length,1);assert.equal(calls.length,1);assert.equal(target.getAttribute('aria-pressed'),'true');
 }
 }finally{s.dom.window.close();}
});
test('valid links highlight source only; ordinary hash clears them and later code hashes still work',async()=>{
 const s=await setup();try{const opener=s.doc.querySelector('.code-workbench-open');opener.focus();const hash=await s.core.digestCode('  中\n\n\treturn 1;',crypto);s.window.history.replaceState(null,'',`#cc-code=v1.${hash}.2-3`);await s.controller.locate();assert.equal(s.scrolled.length,1);assert.equal(s.doc.querySelectorAll('.code-reference-line').length,2);assert.equal(s.doc.querySelectorAll('dialog[open]').length,0);assert.equal(s.doc.activeElement,opener,'automatic references do not move keyboard focus');
 s.window.history.replaceState(null,'','#other');await s.controller.locate();assert.equal(s.doc.querySelectorAll('.code-reference-line').length,0);assert.equal(s.scrolled.length,1);
 s.window.location.hash=`cc-code=v1.${hash}.1-1`;await new Promise(resolve=>setTimeout(resolve,20));await settle();assert.equal(s.doc.querySelectorAll('.code-reference-line').length,1);
 }finally{s.dom.window.close();}
});
test('duplicates, changed code, invalid hashes and missing Web Crypto never guess a location',async()=>{
 for(const type of ['duplicate','changed','invalid','crypto']){const s=await setup({duplicate:type==='duplicate',digest:type==='crypto'?async()=>{throw Error('当前浏览器不支持代码引用校验。');}:undefined});try{
 const hash=await s.core.digestCode(type==='changed'?'old':'  中\n\n\treturn 1;',crypto);s.window.history.replaceState(null,'',type==='invalid'?'#cc-code=%E0%A4%A':`#cc-code=v1.${hash}.1-2`);await s.controller.locate();assert.equal(s.scrolled.length,0);assert.equal(s.doc.querySelector('.code-reference-status').hidden,false);
 if(type==='duplicate'||type==='crypto'){s.open();s.row(1).click();s.copy().click();await settle();assert.equal(s.copies.length,0);assert.match(s.status().textContent,/无法唯一定位|不支持/);}
 }finally{s.dom.window.close();}}
});
test('late digest cannot scroll after newer hash, gesture, dialog, hidden document or pagehide',async()=>{
 for(const event of ['hash','popstate','scroll','wheel','keydown','pointerdown','dialog','hidden','pagehide']){const pending=deferred(),s=await setup({digest:()=>pending.promise});try{
 const hash='a'.repeat(64);s.window.history.replaceState(null,'',`#cc-code=v1.${hash}.1-2`);const task=s.controller.locate();await flush();
 if(event==='hash')s.window.history.replaceState(null,'','#other');else if(event==='dialog')s.doc.dispatchEvent(new s.window.Event('atelier:dialog-open'));else if(event==='hidden'){Object.defineProperty(s.doc,'hidden',{value:true});s.doc.dispatchEvent(new s.window.Event('visibilitychange'));}else(['pagehide','scroll','popstate'].includes(event)?s.window:s.doc).dispatchEvent(new s.window.Event(event));
 pending.resolve(hash);await task;assert.equal(s.scrolled.length,0,event);
 }finally{s.dom.window.close();}}
});
test('delayed route import remembers cancellation, accepts later explicit hash and cleans guards',async()=>{
 const {startFeature,routeFeatures}=await import('../source/atelier/js/route-features.js');
 for(const scenario of ['cancel','scroll','later','failure','pagehide']){const s=await setup({initialReference:false}),pending=deferred(),calls=[];try{
 const guards=new Set();for(const target of [s.doc,s.window]){const add=target.addEventListener.bind(target),remove=target.removeEventListener.bind(target);target.addEventListener=(type,fn,options)=>{if(['wheel','touchstart','pointerdown','hashchange','scroll','popstate'].includes(type))guards.add(fn);return add(type,fn,options);};target.removeEventListener=(type,fn,options)=>{guards.delete(fn);return remove(type,fn,options);};}
 const feature=routeFeatures.find(item=>item.id==='code'),record=startFeature(feature,{root:s.doc,load:()=>pending.promise});s.doc.dispatchEvent(new s.window.Event('wheel'));
 if(scenario==='scroll')s.window.dispatchEvent(new s.window.Event('scroll'));
 if(scenario==='later')s.window.dispatchEvent(new s.window.Event('hashchange'));
 if(scenario==='pagehide')s.window.dispatchEvent(new s.window.Event('pagehide'));
 pending.resolve(scenario==='failure'?{}:{initCodeStudio:options=>calls.push(options)});await record.ready;
 assert.equal(guards.size,0,'temporary navigation guards must be removed');
 if(scenario==='failure')assert.equal(calls.length,0);else assert.equal(calls[0].initialReference,scenario==='later');
 }finally{s.dom.window.close();}}
});

test('scroll cancels pending navigation but a later explicit hash works; blank lines mark gutters without changing source',async()=>{
 const pending=deferred(),s=await setup({digest:()=>pending.promise});try{
 const before=s.core.extractCode(s.doc.querySelector('.code-container')),hash=await s.core.digestCode(before,crypto);
 s.window.history.replaceState(null,'',`#cc-code=v1.${hash}.1-1`);const task=s.controller.locate();await flush();s.window.dispatchEvent(new s.window.Event('scroll'));pending.resolve(hash);await task;assert.equal(s.scrolled.length,0);
 s.window.location.hash=`cc-code=v1.${hash}.2-2`;await new Promise(resolve=>setTimeout(resolve,20));await settle();assert.equal(s.scrolled.length,1);
 assert.equal(s.doc.querySelector('.code-reference-line').textContent,'');assert.equal(s.doc.querySelector('.code-reference-gutter').textContent,'2');assert.equal(s.core.extractCode(s.doc.querySelector('.code-container')),before);
 s.window.dispatchEvent(new s.window.Event('scroll'));assert.equal(s.doc.querySelectorAll('.code-reference-gutter').length,1,'completed scroll must retain highlight');
 s.window.history.replaceState(null,'','#other');await s.controller.locate();assert.equal(s.doc.querySelectorAll('.code-reference-gutter').length,0);
 }finally{s.dom.window.close();}
});

test('blank references without usable gutters are rejected rather than invisibly highlighted',async()=>{
 for(const kind of ['missing','unstructured']){const s=await setup();try{
 const gutter=s.doc.querySelector('.gutter');if(kind==='missing')gutter.remove();else gutter.textContent='1\n2\n3';
 const hash=await s.core.digestCode(s.core.extractCode(s.doc.querySelector('.code-container')),crypto);s.window.history.replaceState(null,'',`#cc-code=v1.${hash}.2-2`);await s.controller.locate();
 assert.equal(s.scrolled.length,0);assert.match(s.doc.querySelector('.code-reference-status').textContent,/空白行暂不支持/);
 s.open();s.row(2).click();s.copy().click();await settle();assert.equal(s.copies.length,0);assert.match(s.status().textContent,/空白行暂不支持/);
 }finally{s.dom.window.close();}}
});
test('a DOM change during digest cannot highlight different code using an old checksum',async()=>{
 const pending=deferred(),s=await setup({digest:()=>pending.promise});try{
 const hash='b'.repeat(64);s.window.history.replaceState(null,'',`#cc-code=v1.${hash}.1-1`);const task=s.controller.locate();await flush();
 s.doc.querySelector('.code .line').textContent='changed';pending.resolve(hash);await task;assert.equal(s.scrolled.length,0);assert.match(s.doc.querySelector('.code-reference-status').textContent,/代码已变化/);
 }finally{s.dom.window.close();}
});
