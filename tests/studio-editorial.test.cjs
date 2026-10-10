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
 assert.match(css,/\.music-studio\.studio-editorial\{width:min\(var\(--layout-width\),calc\(100% - 2 \* var\(--page-gutter\)\)\)/);
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
 assert.equal(document.querySelector('[data-studio-track="0"][data-studio-step="1"]').getAttribute('aria-pressed'),'true');
 document.querySelector('[data-studio-redo]').click();assert.equal(document.querySelector('[data-bpm]').value,'86');
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
