const test = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const settle = () => new Promise(resolve => setImmediate(resolve));

async function rhythm(t) {
  const dom = new JSDOM(`<dialog id="rhythm-dialog" open><button id="rhythm-play" aria-pressed="false">播放</button>
    <button data-sequence-reset></button><button data-tap-tempo></button>
    <input id="tempo" value="100"><output id="tempo-output"></output>
    ${['kick','snare','hat'].map(track=>`<button data-drum="${track}"></button><button data-step="0" data-track="${track}"></button>`).join('')}
    <i class="beat-light"></i></dialog><div id="toast"></div>`, {url:'https://ccatelier.test/'});
  const {window} = dom, {document} = window;
  const globals = new Map(), timers = new Map(), contexts = [], pending = [];
  let hidden = false, started = 0, nextId = 0;
  for (const [name,value] of Object.entries({window, document, localStorage:window.localStorage,
    CustomEvent:window.CustomEvent, matchMedia:()=>({matches:false}),
    setTimeout:callback=>{const id=++nextId;timers.set(id,callback);return id;},
    clearTimeout:id=>timers.delete(id)})) {
    globals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));
    Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
  }
  t.after(()=>{
    window.dispatchEvent(new window.Event('pagehide'));
    window.close();
    for(const [name,descriptor] of globals) {
      if(descriptor)Object.defineProperty(globalThis,name,descriptor);
      else delete globalThis[name];
    }
  });
  Object.defineProperty(document,'hidden',{get:()=>hidden});
  const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}});
  const node=extra=>({connect(){},disconnect(){},addEventListener(){},...extra});
  window.AudioContext=class {
    constructor(){this.state='suspended';this.sampleRate=1000;this.currentTime=0;this.destination=node();contexts.push(this);}
    createGain(){return node({gain:param()});}
    createBuffer(){return {getChannelData:()=>new Float32Array(180)};}
    createOscillator(){return node({frequency:param(),start(){started++;},stop(){}});}
    createBufferSource(){return node({start(){started++;},stop(){}});}
    createBiquadFilter(){return node({frequency:param()});}
    resume(){return new Promise(resolve=>pending.push(()=>{if(this.state!=='closed')this.state='running';resolve();}));}
    close(){this.state='closed';return Promise.resolve();}
  };
  const {initRhythm}=await import('../source/atelier/js/rhythm.js');
  initRhythm();
  const dialog=document.querySelector('dialog'), play=document.querySelector('#rhythm-play');
  return {window,document,play,contexts,pending,timers,started:()=>started,
    pad:track=>document.querySelector(`[data-drum="${track}"]`),
    interrupt(kind){
      if(kind==='close'){dialog.open=false;dialog.dispatchEvent(new window.Event('close'));dialog.open=true;}
      if(kind==='hidden'){hidden=true;document.dispatchEvent(new window.Event('visibilitychange'));hidden=false;document.dispatchEvent(new window.Event('visibilitychange'));}
      if(kind==='pagehide')window.dispatchEvent(new window.Event('pagehide'));
      if(kind==='livehouse')document.dispatchEvent(new window.Event('atelier:livehouse-open'));
    }
  };
}

for(const kind of ['close','hidden','pagehide','livehouse']) {
  test(`rhythm ${kind} invalidates pending sequence and pads, but permits a fresh click`,async t=>{
    const r=await rhythm(t);
    r.play.click();r.pad('snare').click();
    assert.equal(r.started(),0);
    r.interrupt(kind);
    for(const resolve of r.pending.splice(0))resolve();
    await settle();
    assert.equal(r.started(),0,'interrupted audio intent cannot revive');
    assert.equal(r.play.getAttribute('aria-pressed'),'false');
    assert.equal(r.timers.size,0);
    r.play.click();
    for(const resolve of r.pending.splice(0))resolve();
    await settle();
    assert.equal(r.started(),2,'fresh explicit play starts the default kick and hat');
    assert.equal(r.play.getAttribute('aria-pressed'),'true');
    r.play.click();
    assert.equal(r.play.getAttribute('aria-pressed'),'false');
  });
}

test('a second play click cancels pending start and stale completion cannot overwrite newer play',async t=>{
  const r=await rhythm(t);
  r.play.click();r.play.click();r.play.click();
  assert.equal(r.pending.length,2);
  r.pending[1]();await settle();
  assert.equal(r.started(),2);
  r.pending[0]();await settle();
  assert.equal(r.started(),2);
  assert.equal(r.play.getAttribute('aria-pressed'),'true');
});

test('independent explicit pad clicks waiting for audio all remain valid',async t=>{
  const r=await rhythm(t);
  r.pad('kick').click();r.pad('snare').click();r.pad('hat').click();
  for(const resolve of r.pending)resolve();
  await settle();
  assert.equal(r.started(),3);
  assert.equal(r.play.getAttribute('aria-pressed'),'false');
});
