const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ejs=require('ejs');
const {JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function fixture(base='/'){
 return new JSDOM(ejs.render(read('custom/redefine/nijika/studio.ejs'),{theme:{nijika:{studio_art:'/atelier/images/studio.webp'}},url_for:p=>base+p.replace(/^\//,''),nijika_art_srcset:p=>base+p.replace(/^\//,'')+' 1916w',partial:()=>'<svg aria-hidden="true"></svg>'}),{url:'https://atelier.test'+base+'studio/'});
}
test('music overview has a shared page grid, accessible real destinations and a quiet static fallback',()=>{
 for(const base of ['/','/lab/']){
  const dom=fixture(base),doc=dom.window.document;
  assert.equal(doc.querySelectorAll('h1').length,1);
  assert.equal(doc.querySelector('.studio-practice-link').getAttribute('href'),base+'studio/practice/');
  assert.equal(doc.querySelector('.studio-intro-copy>a').hash,'#rhythm-desk');
  assert.ok(doc.querySelector('#rhythm-desk'));
  assert.equal(doc.querySelectorAll('[data-studio-starter]:disabled').length,3);
  assert.equal(doc.querySelector('[data-live-open]').hidden,true);
  assert.equal(doc.querySelector('.studio-console').hidden,true);
  assert.match(doc.querySelector('noscript').textContent,/笔记档案/);
  dom.window.close();
 }
 const css=read('source/atelier/css/studio.css');
 assert.match(css,/\.music-studio\.studio-editorial\.content-view\{width:min\(var\(--layout-width\),calc\(100% - 2 \* var\(--page-gutter\)\)\)/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
test('starter notation matches real presets; load, undo, repeat and stop never implicitly play audio',async t=>{
 const dom=fixture(),{window}=dom,{document}=window,previous=new Map();let starts=0,stops=0;
 for(const [name,value] of Object.entries({window,document,CustomEvent:window.CustomEvent,localStorage:window.localStorage,matchMedia:()=>({matches:true,addEventListener(){}}),devicePixelRatio:1,ResizeObserver:class{observe(){}},requestAnimationFrame:()=>0,cancelAnimationFrame(){}})){
  previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});
 }
 window.HTMLCanvasElement.prototype.getContext=()=>null;
 const {AudioEngine}=await import('../source/atelier/js/audio-engine.js');
 const oldStart=AudioEngine.prototype.start,oldStop=AudioEngine.prototype.stop;
 AudioEngine.prototype.start=async function(){starts++;this.playing=true;return true;};
 AudioEngine.prototype.stop=function(){stops++;return oldStop.call(this);};
 t.after(()=>{window.dispatchEvent(new window.Event('pagehide'));AudioEngine.prototype.start=oldStart;AudioEngine.prototype.stop=oldStop;dom.window.close();for(const [name,value] of previous){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}});
 const {initStudio}=await import('../source/atelier/js/studio.js');const {preset}=await import('../source/atelier/js/studio-core.mjs');initStudio();
 const card=key=>document.querySelector('[data-studio-starter="'+key+'"]');
 for(const key of ['indie','halftime','blank']){
  assert.equal(card(key).disabled,false);
  assert.deepEqual([...card(key).querySelectorAll('.studio-starter-track')].map(row=>[...row.children].map(step=>step.classList.contains('is-note')?1:0)),preset(key).tracks.slice(0,3).map(track=>track.steps));
 }
 assert.equal(starts,0);
 const step=document.querySelector('[data-studio-track="0"][data-studio-step="1"]');step.click();
 assert.match(document.querySelector('[data-studio-overview]').textContent,/19 个音符/);
 card('halftime').focus();card('halftime').click();
 assert.equal(document.activeElement,card('halftime'),'loading preserves keyboard focus');
 assert.equal(document.querySelector('[data-bpm]').value,'86');
 assert.equal(document.querySelector('[data-project-name]').value,'慢半拍');
 assert.equal(starts,0);
 document.querySelector('[data-studio-undo]').click();
 assert.match(document.querySelector('[data-starter-status]').textContent,/已撤销。当前编排：「放学后的排练」/);
 assert.doesNotMatch(document.querySelector('[data-starter-status]').textContent,/慢半拍/);
 assert.equal(document.querySelector('[data-studio-track="0"][data-studio-step="1"]').getAttribute('aria-pressed'),'true');
 document.querySelector('[data-studio-redo]').click();assert.equal(document.querySelector('[data-bpm]').value,'86');assert.match(document.querySelector('[data-starter-status]').textContent,/已重做。当前编排：「慢半拍」/);
 document.querySelector('[data-studio-play]').click();await new Promise(resolve=>setImmediate(resolve));assert.equal(starts,1);
 const stopped=stops;card('blank').click();assert.ok(stops>stopped);assert.equal(document.querySelector('[data-studio-play]').getAttribute('aria-pressed'),'false');
 card('blank').click();assert.equal(starts,1);assert.equal(document.querySelectorAll('[data-studio-step][aria-pressed="true"]').length,0);
 assert.match(document.querySelector('[data-studio-overview]').textContent,/0 个音符/);
 assert.match(document.querySelector('[data-starter-status]').textContent,/按下播放试听/);
 // All representations must follow the committed project, never the old stop callback.
 const count=document.querySelector('[data-step-count]'),monitor=document.querySelector('[data-step-display]'),picker=document.querySelector('[data-studio-preset]');
 const verifySteps=n=>{assert.equal(count.value,String(n));assert.equal(monitor.textContent,'—/'+n);assert.match(document.querySelector('[data-studio-overview]').textContent,new RegExp(n+' 步进'));assert.equal(document.querySelectorAll('[data-studio-step]').length,6*n);assert.equal(picker.value,'','preset selector is an action, not a stale current-state label');};
 count.value='32';count.dispatchEvent(new window.Event('change'));verifySteps(32);
 card('halftime').click();verifySteps(16);assert.equal(document.querySelector('[data-bpm]').value,'86');
 document.querySelector('[data-studio-undo]').click();verifySteps(32);
 document.querySelector('[data-studio-redo]').click();verifySteps(16);
 picker.value='indie';picker.dispatchEvent(new window.Event('change'));verifySteps(16);assert.equal(document.querySelector('[data-project-name]').value,'放学后的排练');
 picker.value='indie';picker.dispatchEvent(new window.Event('change'));verifySteps(16);assert.equal(starts,1,'repeated explicit preset loading remains silent');
 window.dispatchEvent(new window.Event('pagehide'));assert.equal(starts,1);
});

// JSDOM does not implement viewport layout or selector specificity correctly.
// Resolve the affected width declaration from CSSOM in the actual rendered head
// order, then evaluate its inherited shared dimensions. This tests cascade, not pixels.
function selectorList(value){let depth=0,start=0,out=[];for(let i=0;i<value.length;i++){if(value[i]==='('||value[i]==='[')depth++;if(value[i]===')'||value[i]===']')depth--;if(value[i]===','&&!depth){out.push(value.slice(start,i).trim());start=i+1;}}out.push(value.slice(start).trim());return out;}
function weight(selector){
 let bonus=0;
 selector=selector.replace(/:(is|not|has)\(([^()]*)\)/g,(_,name,args)=>{bonus+=Math.max(...selectorList(args).map(weight));return '';}).replace(/:where\([^()]*\)/g,'');
 return bonus+(selector.match(/#[\w-]+/g)||[]).length*10000+(selector.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g)||[]).length*100+(selector.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|:[\w-]+/g,'').match(/\b[a-z][\w-]*\b/gi)||[]).length;
}
const {parse:parseCSS}=require('rrweb-cssom');
function studioSheets(){
 const html=ejs.render(read('custom/redefine/nijika/head.ejs'),{page:{nijika:'studio'},theme:{nijika:{cover:'/cover.webp'}},nijika_page_metadata:()=>({}),is_post:()=>false,is_home:()=>false,is_archive:()=>false,is_category:()=>false,is_tag:()=>false,is_page:()=>true,url_for:p=>'/'+p,open_graph:()=>'',export_config:()=>''});
 const head=new JSDOM(html),files=[...head.window.document.querySelectorAll('link[rel="stylesheet"]')].map(link=>link.getAttribute('href').slice(1));head.window.close();
 return files.map(file=>({file,rules:parseCSS(read((file==='atelier/css/redefine.css'?'public/':'source/')+file)).cssRules}));
}
function resolveCSS(sheets,node,property,width,{oldMusicSelector=false}={}){
 let result={value:'',weight:-1,priority:-1};
 function visit(rules,file){for(const rule of rules){
  if(rule.cssRules){if(rule.media){const condition=rule.media.mediaText;if(/print|prefers-reduced-motion/.test(condition))continue;if([...condition.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)].some(([,bound,n])=>bound==='max'?width>+n:width<+n))continue;}visit(rule.cssRules,file);continue;}
  if(!rule.selectorText||!rule.style.getPropertyValue(property))continue;
  for(let selector of selectorList(rule.selectorText)){
   if(oldMusicSelector&&file.endsWith('/studio.css'))selector=selector.replace('.music-studio.studio-editorial.content-view','.music-studio.studio-editorial');
   let matches=false;try{matches=node.matches(selector);}catch{continue;}if(!matches)continue;
   const score=weight(selector),priority=rule.style.getPropertyPriority(property)==='important'?1:0;
   if(priority>result.priority||priority===result.priority&&score>=result.weight)result={value:rule.style.getPropertyValue(property),weight:score,priority,file,selector};
  }
 }}
 for(const sheet of sheets)visit(sheet.rules,sheet.file);return result;
}
for(const width of [360,398,768,1170,1440])for(const theme of ['light','dark'])test(`actual studio stylesheet cascade preserves shared page gutters at ${width}px ${theme}`,()=>{
 const dom=fixture(),doc=dom.window.document;doc.body.className='nijika '+theme;doc.body.dataset.section='studio';const host=doc.querySelector('[data-studio]'),sheets=studioSheets();
 assert.ok(sheets.findIndex(s=>s.file.endsWith('/stage-engine.css'))>sheets.findIndex(s=>s.file.endsWith('/studio.css')),'legacy full-bleed rule really loads later');
 const legacy=resolveCSS(sheets,host,'width',width,{oldMusicSelector:true});assert.equal(legacy.value,'100%','test reproduces the reported full-width failure without the specificity fix');assert.equal(legacy.file,'atelier/css/stage-engine.css');
 const computed=resolveCSS(sheets,host,'width',width);assert.equal(computed.file,'atelier/css/studio.css');assert.equal(computed.selector,'.music-studio.studio-editorial.content-view');assert.equal(computed.value,'min(var(--layout-width),calc(100% - 2 * var(--page-gutter)))');
 const layout=resolveCSS(sheets,doc.body,'--layout-width',width),gutter=resolveCSS(sheets,doc.body,'--page-gutter',width);assert.equal(layout.value,'1200px');assert.equal(gutter.value,'clamp(20px,4vw,56px)');
 const gutterPixels=Math.max(20,Math.min(width*.04,56)),computedWidth=Math.min(parseFloat(layout.value),width-2*gutterPixels),inset=(width-computedWidth)/2;
 assert.ok(inset+1e-6>=gutterPixels);assert.ok(computedWidth<width);assert.equal(computedWidth,width===1440?1200:width-2*gutterPixels);
 dom.window.close();
});
