const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const root=process.env.CC_REPO_ROOT||path.resolve(__dirname,'..');
const requireRepo=require('node:module').createRequire(path.join(root,'package.json'));
const ejs=requireRepo('ejs'),{JSDOM}=requireRepo('jsdom');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(t,{enabled=true}={}){
 const html=ejs.render(fs.readFileSync(path.join(root,'custom/redefine/nijika/studio.ejs'),'utf8'),{theme:{nijika:{studio_art:'/atelier/images/studio.webp'}},url_for:p=>p,nijika_art_srcset:()=>'',partial:()=>''});
 const dom=new JSDOM(html,{pretendToBeVisual:true,url:'https://atelier.test/studio/'}),{window}=dom,{document}=window;
 const old=new Map(),frames=new Map(),stats={draws:0,analyses:0,starts:0,auditions:0,stops:0,spectra:0};let next=0,now=0,hidden=false,engine;
 Object.defineProperty(document,'hidden',{get:()=>hidden,configurable:true});
 for(const [key,value] of Object.entries({window,document,CustomEvent:window.CustomEvent,localStorage:window.localStorage,matchMedia:()=>({matches:!enabled,addEventListener(){}}),devicePixelRatio:1,ResizeObserver:class{observe(){}},performance:{now:()=>now},requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id)})){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
 window.HTMLCanvasElement.prototype.getContext=()=>new Proxy({clearRect(){stats.draws++;}},{get:(o,k)=>o[k]||(()=>{})});
 document.addEventListener('atelier:spectrum',()=>stats.spectra++);
 const moduleURL=name=>pathToFileURL(path.join(root,'source/atelier/js',name)).href;
 const {AudioEngine}=await import(moduleURL('audio-engine.js'));
 const originals={start:AudioEngine.prototype.start,audition:AudioEngine.prototype.audition,stop:AudioEngine.prototype.stop};
 const analyser={fftSize:1024,frequencyBinCount:512,getByteTimeDomainData(a){stats.analyses++;a.fill(148);},getByteFrequencyData(a){a.fill(32);}};
 AudioEngine.prototype.start=async function(){engine=this;stats.starts++;this.playing=true;this.cycle=0;this.master={analyser};return true;};
 AudioEngine.prototype.audition=async function(){engine=this;stats.auditions++;this.master={analyser};return true;};
 AudioEngine.prototype.stop=function(){stats.stops++;return originals.stop.call(this);};
 const {motion}=await import(moduleURL('ui.js'));const previousMotion=motion.enabled;motion.enabled=enabled;document.body.classList.toggle('motion-off',!enabled);
 const sourcePath=process.env.STUDIO_REVIEW_SOURCE||path.join(root,'source/atelier/js/studio.js');
 const source=fs.readFileSync(sourcePath,'utf8').replace(/from '(\.\/[^']+)'/g,(_,relative)=>"from '"+moduleURL(relative)+"'");
 const {initStudio}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));initStudio();
 t.after(()=>{window.dispatchEvent(new window.Event('pagehide'));assert.equal(frames.size,0);Object.assign(AudioEngine.prototype,originals);motion.enabled=previousMotion;window.close();for(const [key,descriptor] of old){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
 const q=s=>document.querySelector(s);
 return {q,window,document,frames,stats,get engine(){return engine;},async play(){q('[data-studio-play]').click();await flush();},async pad(){q('.track-name>button').click();await flush();},motion(value){motion.enabled=value;document.body.classList.toggle('motion-off',!value);document.dispatchEvent(new window.CustomEvent('atelier:motion',{detail:value}));},tick(count=1,delta=40){for(let i=0;i<count;i++){now+=delta;const jobs=[...frames.values()];frames.clear();jobs.forEach(fn=>fn(now));}},elapse(ms){now+=ms;},hidden(value){hidden=value;document.dispatchEvent(new window.Event('visibilitychange'));},hide(){window.dispatchEvent(new window.PageTransitionEvent('pagehide',{persisted:true}));},show(){window.dispatchEvent(new window.PageTransitionEvent('pageshow',{persisted:true}));}};
}
test('motion off before Play preserves transport and musical position without analyser or frame work',async t=>{
 const h=await setup(t,{enabled:false});assert.match(h.q('canvas').getAttribute('aria-label'),/静态/);await h.play();
 assert.equal(h.engine.playing,true);assert.equal(h.stats.starts,1);assert.equal(h.frames.size,0);assert.equal(h.stats.analyses,0);assert.equal(h.stats.spectra,0);
 h.engine.cycle=2;h.engine.onStep(5);assert.equal(h.q('[data-step-display]').textContent,'06/16');assert.match(h.q('[data-studio-time]').textContent,/LOOP 03.*112 BPM/);
 assert.equal(h.q('[data-master-level]').style.height,'0%');assert.equal(h.q('[data-studio-play]').getAttribute('aria-pressed'),'true');
});
test('turning motion off cancels scope work; re-enabling creates one loop without changing transport',async t=>{
 const h=await setup(t);await h.play();h.tick(3);assert.equal(h.frames.size,1);assert.ok(h.stats.analyses>0);
 const starts=h.stats.starts,stops=h.stats.stops;h.motion(false);assert.equal(h.frames.size,0);assert.match(h.q('canvas').getAttribute('aria-label'),/静态/);assert.equal(h.q('[data-master-level]').style.height,'0%');
 const reads=h.stats.analyses,draws=h.stats.draws;h.tick(10);assert.equal(h.stats.analyses,reads);assert.equal(h.stats.draws,draws);assert.equal(h.engine.playing,true);
 h.motion(true);assert.equal(h.stats.analyses,reads+1,'enabling takes one immediate sample');h.motion(true);assert.equal(h.frames.size,1);assert.match(h.q('canvas').getAttribute('aria-label'),/实时/);h.tick(2);assert.ok(h.stats.analyses>reads);assert.equal(h.frames.size,1);assert.equal(h.stats.starts,starts);assert.equal(h.stats.stops,stops);
});
test('motion changes while idle never autoplay or start a frame loop',async t=>{
 const h=await setup(t,{enabled:false});h.motion(true);h.motion(false);h.motion(true);assert.equal(h.frames.size,0);assert.equal(h.stats.starts,0);assert.equal(h.stats.auditions,0);
});
test('audition tails honor motion gating and only unexpired tails resume',async t=>{
 const h=await setup(t,{enabled:false});await h.pad();assert.equal(h.stats.auditions,1);assert.equal(h.frames.size,0);assert.equal(h.stats.analyses,0);
 h.elapse(100);h.motion(true);assert.equal(h.frames.size,1);h.tick();h.motion(false);assert.equal(h.frames.size,0);h.elapse(1500);h.motion(true);assert.equal(h.frames.size,0);assert.equal(h.stats.starts,0);assert.equal(h.stats.auditions,1);
});
for(const lifecycle of ['hidden','pagehide'])test(`${lifecycle} prevents motion changes from restarting playback or scope`,async t=>{
 const h=await setup(t);await h.play();assert.equal(h.frames.size,1);if(lifecycle==='hidden')h.hidden(true);else h.hide();
 assert.equal(h.frames.size,0);assert.equal(h.engine.playing,false);const starts=h.stats.starts;h.motion(false);h.motion(true);assert.equal(h.frames.size,0);
 if(lifecycle==='hidden')h.hidden(false);else h.show();h.motion(true);assert.equal(h.frames.size,0);assert.equal(h.stats.starts,starts);assert.equal(h.engine.playing,false);
 await h.play();assert.equal(h.frames.size,1);assert.equal(h.stats.starts,starts+1);
});

test('Stop clears the level, shows a static scope and cannot be restarted by motion changes',async t=>{
 const h=await setup(t);await h.play();h.tick();assert.notEqual(h.q('[data-master-level]').style.height,'0%');h.q('[data-studio-stop]').click();assert.equal(h.q('[data-master-level]').style.height,'0%');assert.match(h.q('canvas').getAttribute('aria-label'),/静态/);assert.equal(h.frames.size,0);const starts=h.stats.starts,reads=h.stats.analyses;h.motion(false);h.motion(true);assert.equal(h.frames.size,0);assert.equal(h.stats.starts,starts);assert.equal(h.stats.analyses,reads);
});

test('natural audition expiry paints a quiet final frame even inside the redraw throttle',async t=>{
 const h=await setup(t);await h.pad();h.tick(1,1390);assert.equal(h.frames.size,1);assert.match(h.q('canvas').getAttribute('aria-label'),/实时/);assert.notEqual(h.q('[data-master-level]').style.height,'0%');
 const draws=h.stats.draws,reads=h.stats.analyses;h.tick(1,20);assert.equal(h.frames.size,0);assert.equal(h.stats.draws,draws+1,'expiry draws once despite only 20 ms since the last live paint');assert.equal(h.stats.analyses,reads);assert.match(h.q('canvas').getAttribute('aria-label'),/静态/);assert.equal(h.q('[data-master-level]').style.height,'0%');h.tick(3);assert.equal(h.stats.draws,draws+1);assert.equal(h.stats.auditions,1);assert.equal(h.stats.starts,0);
});
