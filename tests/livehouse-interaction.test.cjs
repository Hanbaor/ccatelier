const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');

const settle = () => new Promise(resolve => setImmediate(resolve));

// Each fixture owns its clock and restores every global, even after a failed
// assertion. No real show scheduler or animation frame can outlive a test.
async function livehouse(t, {motionEnabled = true, canvasAvailable = true, deferredAudio = false, loadStage} = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8'), {
    url: 'https://ccatelier.test/',
  });
  const {window} = dom;
  const {document} = window;
  const globals = new Map();
  let now = 1000, nextId = 0, hidden = false;
  const intervals = new Map(), timers = new Map(), frames = new Map(), contexts = [], errors = [];
  const patch = (name, value) => {
    globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {configurable: true, writable: true, value});
  };
  for (const [name, value] of Object.entries({
    window, document, location: window.location, localStorage: window.localStorage,
    CustomEvent: window.CustomEvent, matchMedia: () => ({matches: !motionEnabled, addEventListener() {}}),
    performance: {now: () => now},
    setInterval: callback => { const id = ++nextId; intervals.set(id, callback); return id; },
    clearInterval: id => intervals.delete(id),
    setTimeout: (callback, delay = 0) => { const id = ++nextId; timers.set(id, {callback, at: now + delay}); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: callback => { const id = ++nextId; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
  })) patch(name, value);
  t.after(() => {
    try {
      window.dispatchEvent(new window.Event('pagehide'));
      window.close();
    } finally {
      for (const [name, descriptor] of globals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    }
  });
  window.addEventListener('error', event => { errors.push(event.error); event.preventDefault(); });
  Object.defineProperty(document, 'hidden', {configurable: true, get: () => hidden});
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new window.Event('close'));
  };
  const drawing = {draws: 0, clearRect() { this.draws++; }, createLinearGradient: () => ({addColorStop() {}})};
  for (const method of ['setTransform', 'save', 'restore', 'translate', 'rotate', 'beginPath', 'moveTo', 'lineTo', 'fill', 'stroke', 'ellipse']) drawing[method] = () => {};
  window.HTMLCanvasElement.prototype.getContext = () => canvasAvailable ? drawing : null;

  const param = () => ({
    value: 0, changes: [],
    setValueAtTime(value, at) { this.value = value; this.changes.push({value, at}); },
    exponentialRampToValueAtTime(value, at) { this.value = value; this.changes.push({value, at}); },
    setTargetAtTime(value, at, constant) { this.value = value; this.changes.push({value, at, constant}); },
  });
  const node = properties => ({connect() {}, disconnect() {}, ...properties});
  class FakeAudioContext {
    constructor() {
      this.state = 'suspended'; this.destination = node(); this.sampleRate = 1000;
      this.gains = []; this.started = []; this.closeCalls = 0;
      contexts.push(this);
    }
    get currentTime() { return now / 1000; }
    resume() {
      if (!deferredAudio) { this.state = 'running'; return Promise.resolve(); }
      return new Promise(resolve => {
        this.resolveResume = () => { if (this.state !== 'closed') this.state = 'running'; resolve(); };
      });
    }
    close() { this.closeCalls++; this.state = 'closed'; return Promise.resolve(); }
    createGain() { const gain = node({gain: param()}); this.gains.push(gain); return gain; }
    createDynamicsCompressor() { return node(Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map(name => [name, param()]))); }
    createAnalyser() { return node({getByteTimeDomainData: buffer => buffer.fill(128)}); }
    createStereoPanner() { return node({pan: param()}); }
    createBiquadFilter() { return node({frequency: param(), Q: param()}); }
    createBuffer(_channels, length) { return {getChannelData: () => new Float32Array(length)}; }
    createOscillator() { return this.source({frequency: param(), detune: param()}); }
    createBufferSource() { return this.source(); }
    source(properties) { return node({start: at => this.started.push(at), stop() {}, ...properties}); }
  }
  window.AudioContext = FakeAudioContext;
  const {motion} = await import('../source/atelier/js/ui.js');
  motion.enabled = motionEnabled;
  const {initLivehouse} = await import('../source/atelier/js/livehouse.js');
  const controller = initLivehouse({loadStage});
  const dialog = document.querySelector('#livehouse-dialog');
  assert.ok(dialog, 'the generated cover contains the livehouse dialog');
  dialog.getBoundingClientRect = () => ({width: 1200, height: 800});
  const opener = document.querySelector('[data-live-open]');
  opener.hidden = false;
  const find = selector => dialog.querySelector(selector);
  const api = {
    window, document, dialog, controller, opener, contexts, errors, intervals, timers, frames, drawing, find,
    show: find('[data-live-show]'), sound: find('[data-live-sound]'), status: find('[data-live-status]'),
    progress: find('[data-live-progress]'),
    open() { opener.focus(); controller.open(opener); },
    // Focus restoration queues a zero-delay jsdom selectionchange event.
    // Drain it before checking for leaked production timers.
    close() { find('[data-live-close]').click(); api.advance(0); },
    hidePage() { window.dispatchEvent(new window.Event('pagehide')); api.advance(0); },
    key(target, key, options = {}) {
      const event = new window.KeyboardEvent('keydown', {key, bubbles: true, cancelable: true, ...options});
      target.dispatchEvent(event);
      return event;
    },
    advance(milliseconds) {
      now += milliseconds;
      for (const callback of [...intervals.values()]) callback();
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now && timers.delete(id)) timer.callback();
      }
    },
    frame() {
      const batch = [...frames]; frames.clear();
      for (const [, callback] of batch) callback(now);
    },
    visibility(value) { hidden = value; document.dispatchEvent(new window.Event('visibilitychange')); },
  };
  return api;
}

test('livehouse opens silently, lazily loads its scene, and never autoplays on pad or show actions', async t => {
  const f = await livehouse(t);
  assert.equal(f.contexts.length, 0);
  assert.equal(f.dialog.open, false);
  assert.ok(f.find('img[data-src]'), 'large scene art stays lazy until the room opens');
  f.open();
  assert.equal(f.dialog.open, true);
  assert.equal(f.document.activeElement, f.find('[data-live-close]'));
  assert.equal(f.document.body.classList.contains('livehouse-opened'), true);
  assert.equal(f.sound.getAttribute('aria-pressed'), 'false');
  assert.equal(f.show.getAttribute('aria-pressed'), 'false');
  assert.equal(f.status.textContent, '静音待场');
  assert.equal(f.find('[data-src], [data-srcset]'), null);
  assert.ok(f.find('.livehouse-art img').getAttribute('src'));
  f.find('[data-live-pad="kick"]').click();
  assert.match(f.status.textContent, /静音试奏.*1 拍/);
  f.show.click();
  f.advance(130);
  assert.equal(f.show.getAttribute('aria-pressed'), 'true');
  assert.equal(f.contexts.length, 0, 'even starting the arranged performance requires explicit sound opt-in');
  assert.deepEqual(f.errors, []);
});

test('optional 3D module waits for explicit open and import failure never blocks the room',async t=>{
 let loads=0;const f=await livehouse(t,{loadStage:()=>{loads++;return Promise.reject(Error('offline'));}});
 assert.equal(loads,0);f.open();assert.equal(loads,1);await settle();assert.equal(f.dialog.open,true);f.find('[data-live-pad="kick"]').click();assert.match(f.status.textContent,/1 拍/);assert.equal(f.contexts.length,0);assert.deepEqual(f.errors,[]);f.close();assert.equal(f.frames.size,0);
});

test('a 3D module resolving after close cannot create a renderer',async t=>{
 let resolve,created=0;const f=await livehouse(t,{loadStage:()=>new Promise(yes=>resolve=yes)});f.open();f.close();resolve({createLiveStage(){created++;}});await settle();assert.equal(created,0);assert.equal(f.frames.size,0);assert.equal(f.dialog.open,false);
});

test('pending 3D creation is aborted on close and cannot replace a newer open',async t=>{
 const pending=[],calls=[];
 const f=await livehouse(t,{loadStage:async()=>({createLiveStage:options=>new Promise(resolve=>pending.push({options,resolve}))})});
 const make=id=>Object.fromEntries(['setVisible','setMotion','strike','clear','resize','pointer','dispose'].map(method=>[method,(...args)=>calls.push([id,method,...args])]));
 f.open();await settle();f.close();assert.equal(pending[0].options.signal.aborted,true);f.open();await settle();pending[1].resolve(make('new'));await settle();pending[0].resolve(make('old'));await settle();assert.deepEqual(calls.filter(call=>call[0]==='old'),[['old','dispose']]);
 f.find('[data-live-pad="snare"]').click();assert.ok(calls.some(call=>call[0]==='new'&&call[1]==='strike'&&call[2]==='snare'));f.visibility(true);assert.ok(calls.some(call=>call[0]==='new'&&call[1]==='setVisible'&&call[2]===false));f.visibility(false);f.find('[data-live-motion]').click();assert.ok(calls.some(call=>call[0]==='new'&&call[1]==='setMotion'&&call[2]===false));f.close();assert.ok(calls.some(call=>call[0]==='new'&&call[1]==='dispose'));assert.equal(f.frames.size,0);
});

test('closing and reopening resets transport, clears work, and returns focus to the latest opener', async t => {
  const f = await livehouse(t);
  f.open();
  f.show.click();
  f.advance(130);
  f.find('[data-live-pad="snare"]').click();
  assert.equal(f.intervals.size, 1);
  assert.ok(f.timers.size > 0);
  f.close();
  assert.equal(f.dialog.open, false);
  assert.equal(f.document.body.classList.contains('livehouse-opened'), false);
  assert.equal(f.document.activeElement, f.opener);
  assert.equal(f.intervals.size, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.frames.size, 0);
  assert.equal(f.find('.is-hit'), null);
  const alternate = f.document.createElement('button');
  f.document.body.append(alternate);
  f.controller.open(alternate);
  assert.equal(f.show.getAttribute('aria-pressed'), 'false');
  assert.equal(f.show.querySelector('span').textContent, '开始演出');
  assert.equal(f.progress.style.getPropertyValue('--show-progress'), '0%');
  assert.equal(f.progress.parentElement.getAttribute('aria-valuenow'), '0');
  f.find('[data-live-pad="kick"]').click();
  assert.match(f.status.textContent, /1 拍/);
  f.controller.open(f.opener);
  f.close();
  assert.equal(f.document.activeElement, alternate, 'opening an already-open room must not replace its original focus target');
  assert.equal(f.contexts.length, 0);
});

test('drum shortcuts are dialog-scoped and ignore modifiers, typing, composition, and held keys', async t => {
  const f = await livehouse(t);
  f.open();
  const target = f.find('[data-live-close]');
  for (const key of ['a', 'S', 'd', 'F']) {
    assert.equal(f.key(target, key).defaultPrevented, true);
  }
  assert.match(f.status.textContent, /4 拍/);
  const before = f.status.textContent;
  assert.equal(f.key(f.document.body, 'a').defaultPrevented, false);
  for (const flag of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'repeat', 'isComposing']) {
    assert.equal(f.key(target, 'a', {[flag]: true}).defaultPrevented, false, flag);
  }
  for (const tag of ['input', 'textarea', 'select']) {
    const field = f.document.createElement(tag);
    f.dialog.append(field);
    assert.equal(f.key(field, 'a').defaultPrevented, false, tag);
  }
  const editable = f.document.createElement('div');
  editable.setAttribute('contenteditable', 'true');
  editable.innerHTML = '<span>Draft</span>';
  f.dialog.append(editable);
  assert.equal(f.key(editable.firstChild, 'a').defaultPrevented, false, 'nested editable target');
  assert.equal(f.key(target, 'Enter').defaultPrevented, false);
  assert.equal(f.status.textContent, before);
  f.close();
  const closedStatus = f.status.textContent;
  f.key(target, 'a');
  f.find('[data-live-pad="kick"]').click();
  assert.equal(f.status.textContent, closedStatus, 'hidden drum controls cannot create hits');
});

test('sound requires its explicit control, volume updates safely, and show stop closes audio', async t => {
  const f = await livehouse(t);
  f.open();
  f.sound.click();
  await settle();
  assert.equal(f.contexts.length, 1);
  const context = f.contexts[0];
  assert.equal(context.state, 'running');
  assert.equal(f.sound.getAttribute('aria-pressed'), 'true');
  const volume = f.find('[data-live-volume]');
  volume.value = '60';
  volume.dispatchEvent(new f.window.Event('input', {bubbles: true}));
  assert.deepEqual(f.errors, [], 'the volume control must use the master gain AudioParam');
  assert.equal(context.gains[0].gain.value, .6 * .7);
  f.find('[data-live-pad="kick"]').click();
  assert.equal(context.started.length, 1);
  f.show.click();
  f.advance(130);
  assert.ok(context.started.length > 1, 'the score is scheduled after show start');
  assert.equal(f.intervals.size, 1);
  f.show.click();
  assert.equal(context.state, 'closed');
  assert.equal(f.sound.getAttribute('aria-pressed'), 'false');
  assert.equal(f.show.getAttribute('aria-pressed'), 'false');
  assert.equal(f.intervals.size, 0);
  assert.equal(f.timers.size, 0);
  f.show.click();
  assert.equal(f.intervals.size, 1);
  assert.equal(f.contexts.length, 1, 'restarting a stopped show is silent until sound is requested again');
});

test('a sound request may finish while the user starts the show', async t => {
  const f = await livehouse(t, {deferredAudio: true});
  f.open();
  f.sound.click();
  assert.equal(f.sound.disabled, true);
  f.show.click();
  f.contexts[0].resolveResume();
  await settle();
  assert.equal(f.sound.getAttribute('aria-pressed'), 'true');
  assert.equal(f.sound.disabled, false);
  assert.equal(f.contexts[0].state, 'running');
  assert.equal(f.show.getAttribute('aria-pressed'), 'true');
});

test('an old audio enable resolving after close and reopen cannot restart sound', async t => {
  const f = await livehouse(t, {deferredAudio: true});
  f.open();
  f.sound.click();
  const stale = f.contexts[0];
  f.close();
  assert.equal(stale.state, 'closed');
  f.open();
  stale.resolveResume();
  await settle();
  assert.equal(f.sound.getAttribute('aria-pressed'), 'false');
  assert.equal(f.sound.disabled, false);
  assert.equal(f.status.textContent, '静音待场');
  assert.equal(stale.started.length, 0);
  assert.equal(f.intervals.size, 0);
  f.sound.click();
  const fresh = f.contexts[1];
  fresh.resolveResume();
  await settle();
  assert.equal(f.sound.getAttribute('aria-pressed'), 'true', 'a new, deliberate enable works after cancellation');
  assert.equal(fresh.state, 'running');
  assert.equal(stale.state, 'closed');
});

test('stopping a show cancels an in-flight sound request without poisoning the next one', async t => {
  const f = await livehouse(t, {deferredAudio: true});
  f.open();
  f.show.click();
  f.sound.click();
  f.show.click();
  const stale = f.contexts[0];
  stale.resolveResume();
  await settle();
  assert.equal(stale.state, 'closed');
  assert.equal(f.sound.getAttribute('aria-pressed'), 'false');
  assert.equal(f.show.getAttribute('aria-pressed'), 'false');
  assert.equal(f.intervals.size, 0);
  f.sound.click();
  f.contexts[1].resolveResume();
  await settle();
  assert.equal(f.sound.getAttribute('aria-pressed'), 'true');
});

test('backgrounding stops sound and transport; returning only resumes the visual room', async t => {
  const f = await livehouse(t);
  f.open();
  f.sound.click();
  await settle();
  f.show.click();
  f.advance(130);
  f.visibility(true);
  assert.equal(f.dialog.open, true);
  assert.equal(f.contexts[0].state, 'closed');
  assert.equal(f.show.getAttribute('aria-pressed'), 'false');
  assert.equal(f.sound.getAttribute('aria-pressed'), 'false');
  assert.equal(f.intervals.size, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.frames.size, 0);
  assert.match(f.status.textContent, /已暂停/);
  f.visibility(false);
  assert.equal(f.frames.size, 1);
  assert.equal(f.intervals.size, 0);
  assert.equal(f.contexts.length, 1);
  f.hidePage();
  assert.equal(f.dialog.open, false);
  assert.equal(f.frames.size, 0);
  assert.equal(f.document.activeElement, f.opener);
  assert.equal(f.document.body.classList.contains('livehouse-opened'), false);
});

test('pagehide also invalidates an unfinished sound resume', async t => {
  const f = await livehouse(t, {deferredAudio: true});
  f.open();
  f.sound.click();
  const context = f.contexts[0];
  f.hidePage();
  context.resolveResume();
  await settle();
  assert.equal(context.state, 'closed');
  assert.equal(f.sound.getAttribute('aria-pressed'), 'false');
  assert.equal(f.sound.disabled, false);
  assert.equal(f.dialog.open, false);
  assert.equal(f.intervals.size + f.frames.size + f.timers.size, 0);
});

test('the arranged show finishes at its duration and leaves a silent stage usable for another performance', async t => {
  const f = await livehouse(t);
  const {SCORE_DURATION, SCORE_BEATS} = await import('../source/atelier/js/livehouse-score.mjs');
  f.open();
  f.show.click();
  f.advance(SCORE_DURATION * 1000 + 121);
  assert.equal(f.show.getAttribute('aria-pressed'), 'false');
  assert.equal(f.intervals.size, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.progress.style.getPropertyValue('--show-progress'), '100%');
  assert.equal(f.progress.parentElement.getAttribute('aria-valuenow'), String(SCORE_BEATS));
  assert.match(f.status.textContent, /演出结束/);
  f.find('[data-live-pad="tom"]').click();
  assert.match(f.status.textContent, /静音试奏.*1 拍/);
  f.show.click();
  assert.equal(f.show.getAttribute('aria-pressed'), 'true');
  assert.equal(f.intervals.size, 1);
  assert.equal(f.contexts.length, 0);
});

test('reduced motion renders a static frame without a continuous canvas or pad animation loop', async t => {
  const f = await livehouse(t, {motionEnabled: false});
  f.open();
  const motion = f.find('[data-live-motion]');
  assert.equal(motion.disabled, true);
  assert.equal(motion.getAttribute('aria-pressed'), 'false');
  assert.equal(f.dialog.classList.contains('livehouse-still'), true);
  f.frame();
  assert.equal(f.drawing.draws, 1);
  assert.equal(f.frames.size, 0, 'a static drawing must not schedule a perpetual animation loop');
  f.find('[data-live-pad="kick"]').click();
  f.show.click();
  f.advance(130);
  f.frame();
  assert.equal(f.frames.size, 0);
  assert.equal(f.find('.is-hit'), null);
  assert.match(f.status.textContent, /静音演出/);
  f.close();
  assert.equal(f.intervals.size + f.frames.size + f.timers.size, 0);
});

test('a missing canvas context leaves controls usable and schedules no repeated frames', async t => {
  const f = await livehouse(t, {canvasAvailable: false});
  f.open();
  f.frame();
  assert.equal(f.frames.size, 0);
  f.find('[data-live-pad="kick"]').click();
  f.show.click();
  f.frame();
  assert.equal(f.frames.size, 0);
  assert.equal(f.show.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(f.errors, []);
  f.close();
  assert.equal(f.intervals.size + f.frames.size + f.timers.size, 0);
});

function recordingControls(f) {
 const panel=f.find('[data-live-recorder]');panel.open=true;
 const bpm=f.find('[data-live-record-bpm]');bpm.value='120';
 return {panel,bpm,record:f.find('[data-live-record]'),replay:f.find('[data-live-replay]'),send:f.find('[data-live-send]'),status:f.find('[data-live-record-status]'),position:f.find('[data-live-record-position]'),strip:f.find('[data-live-record-strip]')};
}
function finishSmallTake(f,r) {r.record.click();f.advance(2120);f.find('[data-live-pad="kick"]').click();f.advance(500);f.find('[data-live-pad="snare"]').click();f.advance(3500);}

test('recording is opt-in, counts four beats, quantizes only pad hits and sends an independent local slot',async t=>{
 const f=await livehouse(t);f.open();const r=recordingControls(f);
 f.find('[data-live-pad="tom"]').click();assert.equal(r.send.disabled,true);assert.equal(f.intervals.size,0);
 r.record.click();assert.equal(r.record.getAttribute('aria-pressed'),'true');assert.equal(r.bpm.disabled,true);assert.match(r.status.textContent,/四拍/);
 f.find('[data-live-pad="hat"]').click();f.advance(2119);assert.match(r.position.textContent,/预备 4/);
 f.advance(1);f.find('[data-live-pad="kick"]').click();f.advance(62.5);f.find('[data-live-pad="snare"]').click();f.advance(1);f.find('[data-live-pad="snare"]').click();
 f.advance(3936.5);assert.equal(r.record.getAttribute('aria-pressed'),'false');assert.equal(r.send.disabled,false);assert.equal(f.intervals.size,0);assert.equal(f.contexts.length,0);assert.equal(r.strip.querySelectorAll('.has-hit').length,2);
 let id;f.document.addEventListener('atelier:recording-ready',e=>{id=e.detail.id;e.preventDefault();});r.send.dataset.practiceUrl='/';f.window.localStorage.setItem('studio-project','unchanged');r.send.click();
 assert.match(id,/^live-/);assert.equal(f.dialog.open,false);const saved=JSON.parse(f.window.localStorage.getItem('cc-live-take-v1:'+id));assert.equal(saved.bpm,120);assert.equal(saved.bars.length,2);assert.deepEqual(saved.bars[0].hits.map(h=>[h.step,h.type]),[[0,'kick'],[1,'snare']]);assert.equal(f.window.localStorage.getItem('studio-project'),'unchanged');
 assert.equal(f.contexts.length,0);assert.deepEqual(f.errors,[]);
});

test('cancelled retakes and empty takes preserve the completed review and never persist automatically',async t=>{
 const f=await livehouse(t);f.open();const r=recordingControls(f);finishSmallTake(f,r);
 const cells=()=>[...r.strip.querySelectorAll('.has-hit')].map(cell=>cell.dataset.recordCell);assert.deepEqual(cells(),['0','4']);
 r.record.click();f.advance(2120);f.find('[data-live-pad="tom"]').click();r.record.click();assert.deepEqual(cells(),['0','4']);assert.equal(r.send.disabled,false);assert.equal(f.intervals.size,0);
 r.record.click();f.advance(6120);assert.match(r.status.textContent,/上一段保留/);assert.deepEqual(cells(),['0','4']);
 assert.equal(f.window.localStorage.length,0,'no completed or cancelled take is saved before explicit Send');
 r.replay.click();assert.equal(r.replay.getAttribute('aria-pressed'),'true');f.advance(4120);assert.equal(r.replay.getAttribute('aria-pressed'),'false');assert.equal(f.intervals.size,0);assert.equal(f.contexts.length,0);
});

test('recording cancellation on drawer close, background, concert start and exit leaves no scheduler',async t=>{
 const f=await livehouse(t);f.open();const r=recordingControls(f);
 for(const stop of [()=>{r.panel.open=false;r.panel.dispatchEvent(new f.window.Event('toggle'));},()=>f.visibility(true),()=>f.show.click(),()=>f.close()]){
  if(!f.dialog.open)f.open();f.visibility(false);r.panel.open=true;r.record.click();f.advance(2120);f.find('[data-live-pad="kick"]').click();stop();
  assert.equal(r.record.getAttribute('aria-pressed'),'false');assert.equal(r.send.disabled,true);
  if(f.show.getAttribute('aria-pressed')==='true')f.show.click();
  assert.equal(f.intervals.size,0);f.advance(1000);assert.equal(r.send.disabled,true,'cancelled recordings cannot reappear from late callbacks');
 }
 assert.deepEqual(f.errors,[]);
});

test('sound opt-in is retained for natural recording/replay completion, and explicit replay stop silences',async t=>{
 const f=await livehouse(t);f.open();const r=recordingControls(f);f.sound.click();await settle();const audio=f.contexts[0];
 finishSmallTake(f,r);assert.equal(f.sound.getAttribute('aria-pressed'),'true');assert.equal(audio.state,'running');assert.ok(audio.started.length>2);
 r.replay.click();f.advance(130);const count=audio.started.length;f.advance(500);assert.ok(audio.started.length>count);r.replay.click();assert.equal(audio.state,'closed');assert.equal(f.sound.getAttribute('aria-pressed'),'false');assert.equal(f.intervals.size,0);
});

test('storage failure keeps review and JSON fallback available instead of navigating or claiming success',async t=>{
 const f=await livehouse(t);f.open();const r=recordingControls(f);finishSmallTake(f,r);
 f.window.Storage.prototype.setItem=function(){throw Error('QuotaExceededError');};r.send.click();
 assert.equal(f.dialog.open,true);assert.match(r.status.textContent,/保存不可用.*下载 JSON/);assert.equal(f.find('[data-live-record-export]').disabled,false);assert.equal(r.replay.disabled,false);
 assert.equal(f.window.localStorage.length,0);assert.deepEqual(f.errors,[]);
});

test('repeated keyboard events cannot create extra recorded attacks and reduced motion remains static',async t=>{
 const f=await livehouse(t,{motionEnabled:false});f.open();const r=recordingControls(f);r.record.click();f.advance(2120);
 f.key(r.record,'a');f.advance(150);f.key(r.record,'a',{repeat:true});f.key(r.bpm,'s');f.advance(3850);
 assert.equal(r.strip.querySelectorAll('.has-hit').length,1);assert.equal(f.find('.live-pad.is-hit'),null);f.frame();assert.equal(f.frames.size,0);assert.equal(f.contexts.length,0);
});

test('pointer contact records immediately, synthesized release click is ignored, and keyboard clicks remain usable',async t=>{
 const f=await livehouse(t);f.open();const r=recordingControls(f);r.record.click();f.advance(2120);const pad=f.find('[data-live-pad="kick"]');
 const down=new f.window.MouseEvent('pointerdown',{button:0,bubbles:true,cancelable:true});pad.dispatchEvent(down);assert.equal(down.defaultPrevented,true);assert.equal(f.document.activeElement,pad);f.advance(180);pad.dispatchEvent(new f.window.MouseEvent('click',{detail:1,bubbles:true}));assert.equal(r.strip.querySelectorAll('.has-hit').length,1);
 f.find('[data-live-pad="snare"]').click();assert.equal(r.strip.querySelectorAll('.has-hit').length,2);assert.equal(f.key(pad,'Enter',{repeat:true}).defaultPrevented,true);f.advance(3820);
 let id;f.document.addEventListener('atelier:recording-ready',e=>{id=e.detail.id;e.preventDefault();});r.send.dataset.practiceUrl='/';r.send.click();assert.equal(new URL(f.window.location.href).searchParams.get('recording'),id);const saved=JSON.parse(f.window.localStorage.getItem('cc-live-take-v1:'+id));assert.deepEqual(saved.bars[0].hits.map(h=>[h.step,h.type]),[[0,'kick'],[1,'snare']]);
});
