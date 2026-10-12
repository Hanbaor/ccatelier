const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ejs=require('ejs'),{JSDOM}=require('jsdom'),{parse}=require('rrweb-cssom');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('track controls have readable scoped dimensions without expanding the page grid',()=>{
 const css=read('source/atelier/css/studio.css'),rules=parse(css).cssRules;
 const rule=selector=>[...rules].findLast(r=>r.selectorText===selector).style;
 assert.match(rule('.studio-editorial .track-controls label').font,/13px/);
 assert.match(rule('.studio-editorial .track-name>div button').font,/13px/);
 assert.equal(rule('.studio-editorial .track-controls input').height,'36px');
 assert.equal(rule('.studio-editorial .track-name>div button')['min-width'],'36px');
 assert.equal(rule('.studio-editorial .studio-track')['grid-template-columns'],'148px minmax(0,1fr) 196px');
 assert.equal(rule('.studio-editorial .studio-sequencer')['min-width'],'920px');
 const desktop=1180-2*(1180*.04)-2-50;
 assert.ok(desktop>920,'16-step minimum fits the 1180px page after gutters, border and scroll padding');
 assert.ok((desktop-148-196-32-15*4)/16>30,'each of the 16 pads retains over 30px width');
 assert.match(css,/@media\(pointer:coarse\).*height:44px.*min-width:44px;min-height:44px/);
 assert.match(css,/\.track-controls input:focus-visible[^}]+outline:2px solid var\(--ink\)/);
});
test('rendered mixer labels and value descriptions stay correct through input, mute, solo, undo and step count',async t=>{
 const html=ejs.render(read('custom/redefine/nijika/studio.ejs'),{theme:{nijika:{studio_art:'/atelier/images/studio.webp'}},url_for:p=>p,nijika_art_srcset:p=>p+' 1916w',partial:()=>'<svg aria-hidden="true"></svg>'});
 const dom=new JSDOM(html,{url:'https://atelier.test/studio/'}),{window}=dom,{document}=window,previous=new Map();
 for(const [name,value] of Object.entries({window,document,CustomEvent:window.CustomEvent,localStorage:window.localStorage,matchMedia:()=>({matches:true,addEventListener(){}}),devicePixelRatio:1,ResizeObserver:class{observe(){}},requestAnimationFrame:()=>0,cancelAnimationFrame(){}})){
  previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});
 }
 window.HTMLCanvasElement.prototype.getContext=()=>null;
 t.after(()=>{window.dispatchEvent(new window.Event('pagehide'));dom.window.close();for(const [name,value] of previous){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}});
 const {initStudio}=await import('../source/atelier/js/studio.js');initStudio();
 assert.equal(document.querySelectorAll('.track-controls input').length,24);
 assert.deepEqual([...document.querySelectorAll('.studio-track:first-child .track-controls label')].map(l=>l.textContent),['音量','声像','音色','尾音']);
 const pan=document.querySelector('[aria-label="底鼓 声像"]');assert.ok(pan);
 for(const [value,text] of [[-40,'偏左 40%'],[0,'居中'],[60,'偏右 60%']]){pan.value=value;pan.dispatchEvent(new window.Event('input'));assert.equal(pan.getAttribute('aria-valuetext'),text);assert.equal(pan.title,'声像：'+text);}
 pan.dispatchEvent(new window.Event('change'));
 const volume=document.querySelector('[aria-label="底鼓 音量"]');volume.value=65;volume.dispatchEvent(new window.Event('input'));volume.dispatchEvent(new window.Event('change'));assert.equal(volume.getAttribute('aria-valuetext'),'65%');
 for(const label of ['静音底鼓','独奏底鼓']){const b=document.querySelector('[aria-label="'+label+'"]');assert.ok(b);b.click();assert.equal(b.getAttribute('aria-pressed'),'true');b.click();assert.equal(b.getAttribute('aria-pressed'),'false');}
 document.querySelector('[data-studio-undo]').click();assert.equal(document.querySelector('[aria-label="独奏底鼓"]').getAttribute('aria-pressed'),'true');assert.equal(document.querySelector('[aria-label="底鼓 声像"]').getAttribute('aria-valuetext'),'偏右 60%');
 // The existing click cycle and playback cursor coexist; no marker exists for empty steps.
 const step=document.querySelector('[data-studio-step]');step.classList.add('playing');
 const markerRules=[...parse(read('source/atelier/css/studio.css')).cssRules].filter(r=>r.selectorText?.includes('::before')&&r.style.content);
 const hasMarker=()=>markerRules.some(r=>r.selectorText.split(',').some(selector=>step.matches(selector.replace('::before',''))));
 for(let n=0;n<3;n++){
  step.click();const soft=step.classList.contains('soft'),strong=step.classList.contains('on');
  assert.equal(hasMarker(),soft||strong);assert.equal(step.getAttribute('aria-pressed'),String(soft||strong));assert.ok(step.classList.contains('playing'));
  assert.match(step.getAttribute('aria-label'),new RegExp(soft?'轻拍':strong?'强拍':'空拍'));
 }
 assert.equal(document.querySelectorAll('.studio-key i').length,2);assert.equal(document.querySelector('.studio-key i.soft').parentElement.textContent,'轻拍');
 const count=document.querySelector('[data-step-count]');count.value='32';count.dispatchEvent(new window.Event('change'));assert.equal(document.querySelectorAll('[data-studio-step]').length,192);assert.equal(document.querySelector('[data-sequencer]').style.minWidth,'var(--studio-long-sequence-width,1280px)');
 count.value='16';count.dispatchEvent(new window.Event('change'));assert.equal(document.querySelectorAll('[data-studio-step]').length,96);assert.equal(document.querySelector('[data-sequencer]').style.minWidth,'');
});

function contrast(a,b){
 const l=h=>{const c=h.match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
 const x=l(a),y=l(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
test('strong and soft shape markers contrast with dark and light pads and legends',()=>{
 // Test both gradient endpoints, not just a flattering midpoint.
 for(const [mark,fills] of [['302515',['e7bf72','aa8747','eac577','bd8e3a','decfa5','c7b17d','d6ad61','cdb786']],['fff1cf',['74684a','574d38','675a41']]])for(const fill of fills)assert.ok(contrast(mark,fill)>=3,`${mark} on ${fill}`);
 const css=read('source/atelier/css/studio.css'),forced=[...parse(css).cssRules].find(r=>r.media?.mediaText==='(forced-colors:active)');assert.ok(forced);
 const rules=[...forced.cssRules];assert.ok(rules.some(r=>r.style['border-color']==='ButtonText'&&r.style['forced-color-adjust']==='none'));
 assert.ok(rules.some(r=>r.selectorText.includes('.soft::before')&&r.style.background==='transparent'));
 assert.ok(rules.some(r=>r.selectorText.includes('.playing::after')&&r.style.background==='Highlight'));
 assert.match(css,/button\.on::before[^}]+width:6px;height:6px/);
 assert.match(css,/button\.playing:after\{[^}]+bottom:4px/);
});

test('32-step and coarse-pointer sizing keeps hit targets inside the local scroll container',()=>{
 const css=read('source/atelier/css/studio.css'),rules=[...parse(css).cssRules];
 const coarse=rules.find(r=>r.media?.mediaText==='(pointer:coarse)');assert.ok(coarse);
 const rule=selector=>[...coarse.cssRules].find(r=>r.selectorText===selector).style;
 const grid=rule('.studio-editorial .studio-sequencer');
 assert.equal(grid['min-width'],'1140px');assert.equal(grid['--studio-long-sequence-width'],'1908px');
 const step=rule('.studio-editorial .track-steps button');
 assert.equal(step['min-height'],'44px');assert.equal(step.width,'100%');assert.equal(step['aspect-ratio'],'auto');assert.equal(step.height,'48px');assert.equal(step['box-sizing'],'border-box');
 const padWidth=(total,steps)=>(total-148-196-2*16-(steps-1)*4)/steps;
 assert.ok(padWidth(1280,32)>=24);assert.equal(padWidth(1908,32),44);assert.equal(padWidth(1140,16),44);
 assert.equal(rules.find(r=>r.selectorText==='.studio-sequencer-scroll').style.overflow,'auto');
 const local=rules.findLast(r=>r.selectorText==='.studio-editorial .studio-sequencer-scroll').style;
 assert.equal(local['max-width'],'100%');assert.equal(local['min-width'],'0');assert.equal(local['box-sizing'],'border-box');
 assert.equal(rules.findLast(r=>r.selectorText==='.studio-editorial .studio-sequencer').style['min-width'],'920px');
});

test('functional legend and mobile sequence instructions remain readable at 13px',()=>{
 const rules=[...parse(read('source/atelier/css/studio.css')).cssRules];
 assert.equal(rules.findLast(r=>r.selectorText==='.studio-editorial .studio-key').style['font-size'],'13px');
 let mobileLegend=0,mobileInstruction=0;
 for(const media of rules.filter(r=>r.media?.mediaText==='(max-width:600px)'))for(const rule of media.cssRules){
  if(rule.selectorText==='.studio-editorial .studio-key'){assert.equal(rule.style['font-size'],'13px');mobileLegend++;}
  if(rule.selectorText==='.studio-editorial .studio-pattern-bar>span'){assert.equal(rule.style['font-size'],'13px');mobileInstruction++;}
 }
 assert.equal(mobileLegend,1);assert.equal(mobileInstruction,1);
});
