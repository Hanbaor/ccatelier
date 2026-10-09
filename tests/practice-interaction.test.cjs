const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');

const settle = () => new Promise(resolve => setImmediate(resolve));
const originalScore = (overrides = {}) => ({
  id: 'original-interaction-test', title: '原创交互练习', description: 'An original test rhythm, not a song transcription.', bpm: 120,
  bars: [{hits: [{step: 0, type: 'kick', velocity: .8}, {step: 4, type: 'snare', velocity: .6}]}, {hits: []}],
  ...overrides,
});

// The production initializer reads browser globals. Every fixture restores their
// original descriptors and owns its fake clock, audio contexts and downloads.
async function practice(t, {deferredAudio = false, audioAvailable = true} = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../public/studio/practice/index.html'), 'utf8'), {
    url: 'https://ccatelier.test/studio/practice/',
  });
  const {window} = dom, {document} = window;
  const globals = new Map(), intervals = new Map(), timers = new Map();
  const contexts = [], errors = [], downloads = [], blobs = new Map(), revoked = [], network = [];
  let now = 1000, nextId = 0, hidden = false;
  const patch = (name, value) => {
    globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {configurable: true, writable: true, value});
  };
  class LocalURL extends URL {
    static createObjectURL(blob) { const url = `blob:practice-test/${blobs.size + 1}`; blobs.set(url, blob); return url; }
    static revokeObjectURL(url) { revoked.push(url); }
  }
  for (const [name, value] of Object.entries({
    window, document, location: window.location, localStorage: window.localStorage,
    CustomEvent: window.CustomEvent, URL: LocalURL,
    matchMedia: () => ({matches: false, addEventListener() {}}),
    performance: {now: () => now},
    setInterval: callback => { const id = ++nextId; intervals.set(id, callback); return id; },
    clearInterval: id => intervals.delete(id),
    setTimeout: (callback, delay = 0) => { const id = ++nextId; timers.set(id, {callback, at: now + Number(delay)}); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: (...args) => { network.push(args); throw Error('Practice fixtures must remain local'); },
  })) patch(name, value);
  t.after(() => {
    try {
      window.dispatchEvent(new window.Event('pagehide'));
      assert.equal(intervals.size, 0, 'page teardown must clear every playback interval');
      assert.equal(timers.size, 0, 'the fixture must not leave visual or download timers behind');
      assert.ok(contexts.every(context => context.state === 'closed'), 'page teardown must close every audio context');
      assert.deepEqual(errors, [], 'no uncaught UI errors');
      assert.deepEqual(network, [], 'practice never uploads imported scores or fetches audio');
    } finally {
      intervals.clear(); timers.clear(); window.close();
      for (const [name, descriptor] of globals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    }
  });
  window.addEventListener('error', event => { errors.push(event.error); event.preventDefault(); });
  Object.defineProperty(document, 'hidden', {configurable: true, get: () => hidden});
  window.HTMLAnchorElement.prototype.click = function () { downloads.push({href: this.href, name: this.download}); };

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
      return new Promise((resolve, reject) => {
        this.resolveResume = () => { if (this.state !== 'closed') this.state = 'running'; resolve(); };
        this.rejectResume = reject;
      });
    }
    close() { this.closeCalls++; this.state = 'closed'; return Promise.resolve(); }
    createGain() { const gain = node({gain: param()}); this.gains.push(gain); return gain; }
    createDynamicsCompressor() { return node(Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map(name => [name, param()]))); }
    createAnalyser() { return node({getByteTimeDomainData: buffer => buffer.fill(128)}); }
    createStereoPanner() { return node({pan: param()}); }
    createBiquadFilter() { return node({frequency: param(), Q: param()}); }
    createBuffer(_channels, length) { return {getChannelData: () => new Float32Array(length)}; }
    createOscillator() { return this.source('oscillator', {frequency: param(), detune: param()}); }
    createBufferSource() { return this.source('buffer'); }
    source(kind, properties) {
      const source = node({...properties, stop() {}});
      source.start = at => this.started.push({kind, at, scheduledAt: this.currentTime, frequency: source.frequency?.value});
      return source;
    }
  }
  if (audioAvailable) window.AudioContext = FakeAudioContext;
  const {initPractice} = await import('../source/atelier/js/practice.js');
  initPractice();
  const host = document.querySelector('[data-practice]');
  assert.ok(host, 'the generated practice page contains the application');
  const find = selector => host.querySelector(selector);
  const api = {
    window, document, host, contexts, errors, intervals, timers, downloads, blobs, revoked, find,
    play: find('[data-practice-play]'), status: find('[data-practice-status]'), position: find('[data-practice-position]'),
    demo: find('[data-practice-demo]'), from: find('[data-practice-start]'), to: find('[data-practice-end]'), bpm: find('[data-practice-bpm]'),
    bars: () => [...host.querySelectorAll('[data-practice-bar]')],
    change(control, value, type = 'change') {
      if (control.type === 'checkbox') control.checked = value;
      else control.value = String(value);
      control.dispatchEvent(new window.Event(type, {bubbles: true}));
    },
    tick(milliseconds = 25) {
      now += milliseconds;
      for (const [id, callback] of [...intervals]) if (intervals.has(id)) callback();
      let iterations = 0;
      while ([...timers.values()].some(timer => timer.at <= now)) {
        assert.ok(iterations++ < 1000, 'the scheduler must not spin indefinitely');
        for (const [id, timer] of [...timers]) if (timer.at <= now && timers.delete(id)) timer.callback();
      }
    },
    advance(milliseconds) {
      for (let left = milliseconds; left > 0; left -= 25) api.tick(Math.min(25, left));
      if (milliseconds === 0) api.tick(0);
    },
    visibility(value) { hidden = value; document.dispatchEvent(new window.Event('visibilitychange')); },
    hidePage() { window.dispatchEvent(new window.Event('pagehide')); },
    importFile(file) {
      const input = find('[data-practice-import]');
      Object.defineProperty(input, 'files', {configurable: true, value: file ? [file] : []});
      input.dispatchEvent(new window.Event('change', {bubbles: true}));
    },
    async importScore(score) { api.importFile({size: 1000, text: async () => JSON.stringify(score)}); await settle(); },
    async start() { api.play.click(); await settle(); },
    stop() { find('[data-practice-stop]').click(); },
    assertStopped() {
      assert.equal(api.play.getAttribute('aria-pressed'), 'false');
      assert.equal(intervals.size, 0);
      assert.equal(timers.size, 0);
      assert.equal(find('.practice-measure.is-current'), null);
      assert.equal(find('.practice-beats .active'), null);
      assert.ok(contexts.every(context => context.state === 'closed'));
    },
  };
  return api;
}

const isClick = event => event.kind === 'oscillator' && [1000, 1400].includes(event.frequency);

test('practice loads three original exercises and generated accessible SVG measures without autoplay', async t => {
  const f = await practice(t);
  assert.equal(f.find('.practice-app').hidden, false);
  assert.equal(f.demo.options.length, 3);
  assert.equal(f.contexts.length, 0);
  assert.equal(f.intervals.size + f.timers.size, 0);
  for (const [index, count] of [4, 4, 8].entries()) {
    const option = f.demo.options[index];
    assert.match(option.value, /^original-/);
    assert.match(option.textContent, /原创/);
    f.change(f.demo, option.value);
    assert.equal(f.bars().length, count);
    assert.equal(f.from.options.length, count);
    assert.equal(f.to.options.length, count);
    assert.match(f.find('[data-practice-title]').textContent, /原创/);
    for (const [barIndex, bar] of f.bars().entries()) {
      assert.equal(bar.tagName, 'BUTTON');
      assert.match(bar.getAttribute('aria-label'), new RegExp(`第 ${barIndex + 1} 小节`));
      assert.equal(bar.getAttribute('aria-pressed'), String(barIndex === 0));
      assert.equal(bar.querySelector('svg').namespaceURI, 'http://www.w3.org/2000/svg');
      assert.equal(bar.querySelector('svg').getAttribute('role'), 'img');
      assert.ok(bar.querySelector('svg').getAttribute('aria-label'));
      assert.equal(bar.querySelectorAll('.practice-count').length, 16);
      assert.ok(bar.querySelectorAll('.practice-note').length > 0);
      assert.equal(bar.querySelector('img, image, use, script'), null);
    }
  }
  assert.equal(f.contexts.length, 0, 'selecting an exercise never requests audio');
});

test('explicit start counts four beats before playing and stop clears scheduled work', async t => {
  const f = await practice(t);
  f.change(f.bpm, 120, 'input');
  await f.start();
  assert.equal(f.contexts.length, 1);
  const context = f.contexts[0];
  assert.equal(context.state, 'running');
  assert.equal(f.play.getAttribute('aria-pressed'), 'true');
  assert.equal(f.intervals.size, 1);
  f.advance(100);
  assert.match(f.position.textContent, /预备 1/);
  f.advance(1800);
  assert.equal(context.started.length, 4);
  assert.ok(context.started.every(isClick), 'only the four count-in clicks sound before the first measure');
  assert.deepEqual(context.started.map(event => event.frequency), [1400, 1000, 1000, 1000]);
  assert.deepEqual(context.started.map(event => Math.round((event.at - context.started[0].at) * 1000)), [0, 500, 1000, 1500]);
  f.advance(225);
  assert.ok(context.started.some(event => !isClick(event)));
  assert.equal(f.find('.practice-measure.is-current').dataset.practiceBar, '0');
  assert.match(f.position.textContent, /^1 \/ 4 · 1$/);
  f.stop();
  f.assertStopped();
  const sounds = context.started.length;
  f.advance(5000);
  assert.equal(context.started.length, sounds);
});

test('bar selection and crossing range endpoints stay inclusive and never autoplay', async t => {
  const f = await practice(t);
  f.change(f.to, 1);
  f.change(f.from, 3);
  assert.equal(f.from.value, '3');
  assert.equal(f.to.value, '3', 'a later start moves the end forward');
  assert.deepEqual(f.bars().map(bar => bar.classList.contains('is-outside')), [true, true, true, false]);
  f.change(f.to, 0);
  assert.equal(f.from.value, '0', 'an earlier end moves the start backward');
  assert.equal(f.to.value, '0');
  f.bars()[2].click();
  assert.equal(f.from.value, '2');
  assert.equal(f.to.value, '2');
  assert.deepEqual(f.bars().map(bar => bar.getAttribute('aria-pressed')), ['false', 'false', 'true', 'false']);
  assert.equal(f.contexts.length, 0);
  await f.start();
  f.bars()[1].click();
  f.assertStopped();
  assert.equal(f.from.value, '1');
  assert.equal(f.to.value, '2');
  f.advance(1000);
  assert.equal(f.contexts.length, 1, 'choosing a new measure does not restart playback');
});

test('tempo clamps at the advertised bounds and reset restores the selected exercise speed', async t => {
  const f = await practice(t);
  assert.equal(f.bpm.min, '40');
  assert.equal(f.bpm.max, '220');
  f.change(f.bpm, -100, 'input');
  assert.equal(f.bpm.value, '40');
  assert.equal(f.find('[data-practice-bpm-label]').textContent, '40');
  f.change(f.bpm, 999, 'input');
  assert.equal(f.bpm.value, '220');
  assert.equal(f.find('[data-practice-bpm-label]').textContent, '220');
  await f.start();
  f.change(f.bpm, 100, 'input');
  f.assertStopped();
  f.find('[data-practice-reset]').click();
  assert.equal(f.bpm.value, '88');
  assert.equal(f.find('[data-practice-bpm-label]').textContent, '88');
  f.change(f.demo, f.demo.options[2].value);
  f.change(f.bpm, 200, 'input');
  f.find('[data-practice-reset]').click();
  assert.equal(f.bpm.value, '112');
  assert.equal(f.contexts.length, 1);
});

for (const [label, action] of [
  ['exercise', f => f.change(f.demo, f.demo.options[1].value)],
  ['start range', f => f.change(f.from, 1)],
  ['end range', f => f.change(f.to, 1)],
  ['loop', f => f.change(f.find('[data-practice-loop]'), false)],
  ['original tempo', f => f.find('[data-practice-reset]').click()],
]) {
  test(`changing ${label} pauses playback until another explicit start`, async t => {
    const f = await practice(t);
    await f.start();
    action(f);
    f.assertStopped();
    f.advance(500);
    assert.equal(f.contexts.length, 1);
  });
}

for (const [label, selector, matches] of [
  ['metronome', '[data-practice-metronome]', isClick],
  ['demo drums', '[data-practice-drums]', event => !isClick(event)],
]) {
  test(`${label} can be muted and restored live without interrupting playback`, async t => {
    const f = await practice(t);
    f.change(f.bpm, 120, 'input');
    await f.start();
    f.advance(2100);
    const context = f.contexts[0], control = f.find(selector);
    const count = () => context.started.filter(matches).length;
    const before = count();
    f.change(control, false);
    f.advance(1000);
    assert.equal(count(), before, 'the muted voice schedules no additional sounds');
    assert.equal(context.state, 'running');
    assert.equal(f.play.getAttribute('aria-pressed'), 'true');
    assert.equal(f.intervals.size, 1);
    assert.equal(f.contexts.length, 1);
    f.change(control, true);
    f.advance(1000);
    assert.ok(count() > before, 'the restored voice joins the existing transport');
    assert.equal(f.contexts.length, 1, 'live mute never creates a replacement audio context');
  });
}

for (const [metronome, drums] of [[false, false], [true, false], [false, true]]) {
  test(`count-in stays audible with metronome=${metronome}, demo drums=${drums}`, async t => {
    const f = await practice(t);
    f.change(f.bpm, 120, 'input');
    f.change(f.find('[data-practice-metronome]'), metronome);
    f.change(f.find('[data-practice-drums]'), drums);
    await f.start();
    f.advance(3900);
    const events = f.contexts[0].started;
    assert.equal(events.filter(isClick).length, metronome ? 8 : 4);
    assert.equal(events.some(event => !isClick(event)), drums);
    assert.equal(f.play.getAttribute('aria-pressed'), 'true', 'muting both voices still leaves the visual exercise running');
    assert.match(f.position.textContent, /^1 \/ 4 · 4$/);
  });
}

test('volume updates the live master gain safely without restarting the count-in', async t => {
  const f = await practice(t);
  const volume = f.find('[data-practice-volume]');
  f.change(volume, 0, 'input');
  assert.equal(f.contexts.length, 0);
  await f.start();
  const context = f.contexts[0];
  assert.equal(context.gains[0].gain.value, 0);
  f.change(volume, 60, 'input');
  assert.equal(context.gains[0].gain.value, .6 * .7);
  assert.equal(context.state, 'running');
  assert.equal(f.intervals.size, 1);
  assert.equal(f.contexts.length, 1);
});

for (const [label, cancel] of [
  ['stop', f => f.stop()],
  ['the play/pause button', f => f.play.click()],
  ['pagehide', f => f.hidePage()],
  ['a hidden document', f => f.visibility(true)],
  ['opening the livehouse', f => f.document.dispatchEvent(new f.window.Event('atelier:livehouse-open'))],
]) {
  test(`${label} invalidates a pending audio enable without late playback`, async t => {
    const f = await practice(t, {deferredAudio: true});
    f.play.click();
    const stale = f.contexts[0];
    assert.equal(stale.state, 'suspended');
    cancel(f);
    const status = f.status.textContent;
    stale.resolveResume();
    await settle();
    f.assertStopped();
    assert.equal(stale.started.length, 0);
    assert.equal(f.status.textContent, status, 'a stale promise cannot replace the cancellation status');
    f.visibility(false);
    f.advance(500);
    assert.equal(f.contexts.length, 1, 'returning to the page never automatically resumes');
  });
}

test('an older enable cannot stop a newer explicit start, whether it resolves or rejects late', async t => {
  const f = await practice(t, {deferredAudio: true});
  for (const reject of [false, true]) {
    f.play.click();
    const old = f.contexts.at(-1);
    f.stop();
    f.play.click();
    const current = f.contexts.at(-1);
    current.resolveResume();
    await settle();
    const status = f.status.textContent;
    if (reject) old.rejectResume(Error('stale resume failure'));
    else old.resolveResume();
    await settle();
    assert.equal(old.state, 'closed');
    assert.equal(old.started.length, 0);
    assert.equal(current.state, 'running');
    assert.equal(f.play.getAttribute('aria-pressed'), 'true');
    assert.equal(f.status.textContent, status);
    assert.equal(f.intervals.size, 1);
    f.stop();
  }
});

test('backgrounding active playback cancels audio and visuals and visibility restoration stays silent', async t => {
  const f = await practice(t);
  await f.start();
  f.advance(3500);
  assert.ok(f.find('.practice-measure.is-current'));
  f.visibility(true);
  f.assertStopped();
  assert.match(f.status.textContent, /暂停/);
  f.visibility(false);
  f.advance(2000);
  assert.equal(f.contexts.length, 1);
  await f.start();
  assert.equal(f.contexts.length, 2);
  f.hidePage();
  f.assertStopped();
});

test('opening navigation, another rhythm control, or the file picker pauses practice', async t => {
  const f = await practice(t);
  for (const selector of ['.menu-open', '.search-open', '.rhythm-open', '[data-practice-import]']) {
    const control = f.document.querySelector(selector);
    assert.ok(control, `${selector} exists in the generated page`);
    await f.start();
    f.advance(100);
    control.click();
    f.assertStopped();
  }
});

test('unsupported or rejected audio fails silently and allows an explicit retry', async t => {
  await t.test('unsupported audio', async t => {
    const f = await practice(t, {audioAvailable: false});
    await f.start();
    f.assertStopped();
    assert.match(f.status.textContent, /不支持音频/);
  });
  await t.test('a rejected resume', async t => {
    const f = await practice(t, {deferredAudio: true});
    f.play.click();
    f.contexts[0].rejectResume(Error('Audio permission denied'));
    await settle();
    f.assertStopped();
    assert.match(f.status.textContent, /Audio permission denied/);
    f.play.click();
    f.contexts[1].resolveResume();
    await settle();
    assert.equal(f.play.getAttribute('aria-pressed'), 'true');
  });
});

test('local imports render untrusted text literally and preserve silent and zero-velocity measures', async t => {
  const f = await practice(t);
  const score = originalScore({
    title: '<img src=x onerror=alert(1)>', description: '<script>window.injected=true</script>',
    bars: [{hits: []}, {hits: [{step: 0, type: 'hat', velocity: 0}]}],
  });
  await f.importScore(score);
  assert.equal(f.find('[data-practice-title]').textContent, score.title);
  assert.equal(f.find('[data-practice-description]').textContent, score.description);
  assert.equal(f.find('[data-practice-title] img, [data-practice-description] script'), null);
  assert.equal(f.window.injected, undefined);
  assert.equal(f.demo.value, 'local-import');
  assert.equal(f.demo.options.length, 4);
  assert.equal(f.bars().length, 2);
  assert.equal(f.from.value, '0');
  assert.equal(f.to.value, '1');
  assert.equal(f.bpm.value, '120');
  for (const bar of f.bars()) {
    assert.equal(bar.querySelector('svg').getAttribute('aria-label'), '休止小节');
    assert.equal(bar.querySelectorAll('.practice-note').length, 0);
  }
  assert.match(f.status.textContent, /本机.*没有上传/);
  assert.equal(f.contexts.length, 0);
  assert.equal(f.find('[data-practice-import]').value, '');
  await f.importScore(originalScore({id: 'second-original', title: '第二份原创'}));
  assert.equal(f.demo.options.length, 4, 'new imports replace the single local option');
});

test('bad or oversized imports preserve the existing score and never read oversized files', async t => {
  const f = await practice(t);
  await f.start();
  const title = f.find('[data-practice-title]').textContent;
  const sheet = f.find('[data-practice-sheet]').innerHTML;
  let oversizedRead = false;
  for (const file of [
    {size: 20, text: async () => '{broken json'},
    {size: 20, text: async () => JSON.stringify(originalScore({bpm: 221}))},
    {size: 2 * 1024 * 1024, text: async () => { oversizedRead = true; return JSON.stringify(originalScore()); }},
  ]) {
    f.importFile(file);
    await settle();
    f.assertStopped();
    assert.equal(f.find('[data-practice-title]').textContent, title);
    assert.equal(f.find('[data-practice-sheet]').innerHTML, sheet);
    assert.match(f.status.textContent, /无效|解析|小于/);
  }
  assert.equal(oversizedRead, false, 'files exceeding the one-megabyte limit are rejected before reading');
  f.importFile(null);
  await settle();
  assert.equal(f.find('[data-practice-title]').textContent, title);
});

test('export uses a local JSON blob with the chosen tempo and releases its object URL', async t => {
  const f = await practice(t);
  const score = originalScore();
  await f.importScore(score);
  f.change(f.bpm, 144, 'input');
  f.find('[data-practice-export]').click();
  assert.equal(f.downloads.length, 1);
  const download = f.downloads[0];
  assert.match(download.name, /\.json$/);
  assert.match(download.href, /^blob:/);
  const blob = f.blobs.get(download.href);
  assert.equal(blob.type, 'application/json');
  assert.deepEqual(JSON.parse(await blob.text()), {...score, bpm: 144});
  assert.equal(f.contexts.length, 0);
  assert.equal(f.revoked.length, 0);
  f.advance(30000);
  assert.deepEqual(f.revoked, [download.href]);
  assert.equal(f.timers.size, 0);
});

for (const [label, action] of [
  ['a newer demo selection', f => f.change(f.demo, f.demo.options[1].value)],
  ['a newer import', f => f.importScore(originalScore({id: 'newer-original', title: '较新的原创练习'}))],
  ['a new playback request', f => f.start()],
  ['a range change', f => f.change(f.from, 1)],
  ['page navigation', f => f.hidePage()],
]) {
  test(`a slow local import cannot overwrite ${label}`, async t => {
    const f = await practice(t);
    let resolveRead;
    f.importFile({size: 20, text: () => new Promise(resolve => { resolveRead = resolve; })});
    await action(f);
    const title = f.find('[data-practice-title]').textContent;
    const contextCount = f.contexts.length, status = f.status.textContent;
    resolveRead(JSON.stringify(originalScore({title: '过时的原创练习'})));
    await settle();
    assert.equal(f.find('[data-practice-title]').textContent, title);
    assert.equal(f.status.textContent, status, 'a stale success cannot replace the newer status');
    assert.equal(f.contexts.length, contextCount);
  });
}

test('a stale failed import cannot replace the status of a newer exercise', async t => {
  const f = await practice(t);
  let rejectRead;
  f.importFile({size: 20, text: () => new Promise((_resolve, reject) => { rejectRead = reject; })});
  f.change(f.demo, f.demo.options[1].value);
  const title = f.find('[data-practice-title]').textContent, status = f.status.textContent;
  rejectRead(Error('old read failed'));
  await settle();
  assert.equal(f.find('[data-practice-title]').textContent, title);
  assert.equal(f.status.textContent, status);
});

test('a non-looping selected range finishes after its full duration, including a silent final measure', async t => {
  const f = await practice(t);
  await f.importScore(originalScore());
  f.change(f.find('[data-practice-loop]'), false);
  await f.start();
  f.advance(6050);
  assert.equal(f.play.getAttribute('aria-pressed'), 'true', 'count-in plus two full bars has not quite elapsed');
  f.advance(100);
  f.assertStopped();
  assert.match(f.status.textContent, /练完/);
  const events = f.contexts[0].started.length;
  f.advance(5000);
  assert.equal(f.contexts[0].started.length, events);
  await f.start();
  assert.equal(f.contexts.length, 2);
  f.advance(100);
  assert.match(f.position.textContent, /预备 1/);
});

test('loop playback stays inside the inclusive selection and does not repeat its count-in', async t => {
  const f = await practice(t);
  await f.importScore(originalScore({bars: [{hits: []}, {hits: [{step: 0, type: 'kick', velocity: .8}]}, {hits: []}]}));
  f.change(f.from, 1);
  f.change(f.to, 1);
  f.change(f.find('[data-practice-metronome]'), false);
  await f.start();
  f.advance(8250);
  assert.equal(f.play.getAttribute('aria-pressed'), 'true');
  assert.equal(f.find('.practice-measure.is-current').dataset.practiceBar, '1');
  assert.match(f.position.textContent, /^2 \/ 3 · 1$/);
  const events = f.contexts[0].started;
  assert.equal(events.filter(isClick).length, 4, 'count-in belongs only to the beginning of the run');
  const kicks = events.filter(event => !isClick(event));
  assert.equal(kicks.length, 4);
  assert.deepEqual(kicks.map(event => Math.round((event.at - kicks[0].at) * 1000)), [0, 2000, 4000, 6000]);
  assert.equal(f.intervals.size, 1);
  assert.ok(f.timers.size <= 2, 'visual work remains bounded over several loops');
});

test('a delayed scheduling callback finishes a non-looping score without replaying a backlog', async t => {
  const f = await practice(t);
  await f.importScore(originalScore());
  f.change(f.find('[data-practice-loop]'), false);
  await f.start();
  const context = f.contexts[0], before = context.started.length;
  f.tick(60000);
  f.assertStopped();
  assert.equal(context.started.length, before, 'late notes must be skipped rather than burst-played');
  assert.match(f.status.textContent, /练完/);
});

test('a stalled looping scheduler skips obsolete notes and resumes with bounded work', async t => {
  const f = await practice(t);
  await f.importScore(originalScore());
  await f.start();
  const context = f.contexts[0], before = context.started.length;
  f.tick(60000);
  assert.equal(f.play.getAttribute('aria-pressed'), 'true');
  assert.equal(f.intervals.size, 1);
  assert.ok(context.started.length - before <= 3, 'a long stall must not burst-play an old score');
  assert.ok(f.timers.size <= 2, 'the callback queues only the current look-ahead window');
  f.advance(500);
  assert.ok(f.find('.practice-measure.is-current'), 'the score cursor catches up without replaying every missed step');
  assert.ok(f.timers.size <= 2);
});
