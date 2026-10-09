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
async function practice(t, {deferredAudio = false, audioAvailable = true, recordings = [], url = 'https://ccatelier.test/studio/practice/'} = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../public/studio/practice/index.html'), 'utf8'), {
    url,
  });
  const {window} = dom, {document} = window;
  for (const value of recordings) window.localStorage.setItem('cc-live-take-v1:' + value.id, JSON.stringify(value));
  const globals = new Map(), intervals = new Map(), timers = new Map();
  const contexts = [], errors = [], downloads = [], blobs = new Map(), revoked = [], network = [];
  let now = 1000, nextId = 0, hidden = false, searchAvailable = false;
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
    fetch: (...args) => { if (searchAvailable && args[0] === document.body.dataset.search) return Promise.resolve({ok:true, json:async () => []}); network.push(args); throw Error('Practice fixtures must remain local'); },
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
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
  const {initDialogs, openDialog} = await import('../source/atelier/js/ui.js');
  initDialogs();
  const {initPractice} = await import('../source/atelier/js/practice.js');
  const controller = initPractice();
  t.after(() => controller.destroy());
  const host = document.querySelector('[data-practice]');
  assert.ok(host, 'the generated practice page contains the application');
  const find = selector => host.querySelector(selector);
  const api = {
    window, document, host, contexts, errors, intervals, timers, downloads, blobs, revoked, find, controller, initPractice, openDialog,
    async enableSearch() { searchAvailable = true; const {initSearch} = await import('../source/atelier/js/search.js'); initSearch(); },
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
      Object.defineProperty(input, 'value', {configurable: true, writable: true, value: file ? 'C:\\fakepath\\original.json' : ''});
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
      const description = f.document.getElementById(bar.getAttribute('aria-describedby'));
      assert.ok(description, 'the labeled button also exposes its notation description');
      assert.equal(description.textContent, bar.querySelector('svg').getAttribute('aria-label'));
      assert.equal(f.document.querySelectorAll('#' + description.id).length, 1);
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
  await f.enableSearch();
  for (const selector of ['.menu-open', '.search-open', '.rhythm-open', '[data-practice-import]']) {
    const control = f.document.querySelector(selector);
    assert.ok(control, `${selector} exists in the generated page`);
    await f.start();
    f.advance(100);
    control.click();
    await settle();
    f.advance(0); // Flush jsdom's focus-selection notification.
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
    assert.equal(f.find('[data-practice-import]').value, '', 'the same file can be selected again even while this read is pending');
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


test('an imported exercise remains selectable after every built-in demo and exports the imported model', async t => {
  const f = await practice(t);
  const score = originalScore({title:'保留的原创练习', bpm:135});
  await f.importScore(score);
  for (const option of [...f.demo.options].filter(option => option.value !== 'local-import')) {
    f.change(f.demo, option.value);
    assert.notEqual(f.find('[data-practice-title]').textContent, score.title);
    f.change(f.demo, 'local-import');
    assert.equal(f.find('[data-practice-title]').textContent, score.title);
    assert.equal(f.find('[data-practice-description]').textContent, score.description);
    assert.equal(f.bpm.value, '135');
    assert.equal(f.bars().length, 2);
    assert.equal(f.from.value, '0');
    assert.equal(f.to.value, '1');
    f.find('[data-practice-export]').click();
    assert.deepEqual(JSON.parse(await f.blobs.get(f.downloads.at(-1).href).text()), score);
    f.advance(30000);
  }
  assert.equal(f.demo.options.length, 4);
  assert.equal(f.contexts.length, 0);
});

for (const modifier of ['ctrlKey', 'metaKey']) {
  test(`${modifier}+K stops practice through the shared dialog lifecycle and stays silent on close`, async t => {
    const f = await practice(t);
    await f.enableSearch();
    await f.start();
    f.advance(3500);
    assert.ok(f.find('.practice-measure.is-current'));
    f.document.dispatchEvent(new f.window.KeyboardEvent('keydown', {key:'k', [modifier]:true, bubbles:true, cancelable:true}));
    await settle();
    assert.equal(f.document.querySelector('#search-dialog').open, true);
    f.advance(0); // Flush jsdom's focus-selection notification.
    f.assertStopped();
    f.document.querySelector('#search-dialog').close();
    f.advance(3000);
    assert.equal(f.contexts.length, 1, 'closing search does not restart audio');
    await f.start();
    assert.equal(f.contexts.length, 2);
  });
}

test('opening a shared dialog invalidates a pending enable without late audio', async t => {
  const f = await practice(t, {deferredAudio:true});
  f.play.click();
  f.openDialog('search-dialog');
  f.contexts[0].resolveResume();
  await settle();
  f.assertStopped();
  assert.equal(f.contexts[0].started.length, 0);
});

test('a cancelled import can select the exact same file again while its earlier read settles late', async t => {
  const f = await practice(t);
  const reads = [];
  const file = {size:20, text:() => new Promise(resolve => reads.push(resolve))};
  f.importFile(file);
  assert.equal(f.find('[data-practice-import]').value, '');
  f.openDialog('search-dialog');
  f.document.querySelector('#search-dialog').close();
  f.importFile(file);
  reads[1](JSON.stringify(originalScore({title:'重新选择的原创练习'})));
  await settle();
  const title = f.find('[data-practice-title]').textContent;
  assert.equal(title, '重新选择的原创练习');
  reads[0](JSON.stringify(originalScore({title:'已取消的旧读取'})));
  await settle();
  assert.equal(f.find('[data-practice-title]').textContent, title);
  assert.equal(f.find('[data-practice-import]').value, '');
});

test('practice initialization is idempotent and teardown removes shared listeners before reinitializing', async t => {
  const f = await practice(t);
  assert.equal(f.initPractice(), f.controller);
  await f.start();
  f.controller.destroy();
  f.assertStopped();
  const message = f.status.textContent;
  f.openDialog('search-dialog');
  f.visibility(true);
  f.play.click();
  f.bars()[1].click();
  await settle();
  assert.equal(f.status.textContent, message, 'destroyed listeners cannot update the view');
  assert.equal(f.contexts.length, 1, 'destroyed controls cannot restart audio');
  f.visibility(false);
  const current = f.initPractice();
  assert.notEqual(current, f.controller);
  assert.equal(f.demo.options.length, 3, 'reinitializing does not duplicate options');
  await f.start();
  assert.equal(f.contexts.length, 2);
  f.openDialog('menu-dialog');
  f.assertStopped();
  current.destroy();
});

test('an explicit recording URL opens its dedicated slot with tempo/range and never autoplays',async t=>{
 const take=originalScore({id:'live-link-test',title:'My pad rhythm',bpm:137}),f=await practice(t,{recordings:[take],url:'https://ccatelier.test/studio/practice/?recording=live-link-test'});
 assert.equal(f.demo.value,'recording:live-link-test');assert.equal(f.demo.options.length,4);assert.equal(f.bpm.value,'137');assert.equal(f.bars().length,2);assert.equal(f.from.value,'0');assert.equal(f.to.value,'1');assert.equal(f.find('[data-practice-remove-recording]').hidden,false);assert.equal(f.contexts.length,0);assert.match(f.status.textContent,/现场录音已载入/);
 f.change(f.demo,'original-eighth-foundation');assert.equal(f.find('[data-practice-remove-recording]').hidden,true);f.change(f.demo,'recording:live-link-test');assert.equal(f.find('[data-practice-title]').textContent,'My pad rhythm');
 await f.start();assert.equal(f.play.getAttribute('aria-pressed'),'true');f.stop();f.assertStopped();
});

test('same-page recording handoff preserves an imported project and invalidates stale imports',async t=>{
 const f=await practice(t),imported=originalScore({title:'Keep my import'});await f.importScore(imported);
 let resolve;f.importFile({size:1000,text:()=>new Promise(done=>{resolve=done;})});
 const take=originalScore({id:'live-handoff',title:'New live take'});f.window.localStorage.setItem('cc-live-take-v1:'+take.id,JSON.stringify(take));
 const event=new f.window.CustomEvent('atelier:recording-ready',{cancelable:true,detail:{id:take.id}});assert.equal(f.document.dispatchEvent(event),false);assert.equal(f.demo.value,'recording:live-handoff');resolve(JSON.stringify(originalScore({title:'Stale import'})));await settle();
 assert.equal(f.find('[data-practice-title]').textContent,'New live take');f.change(f.demo,'local-import');assert.equal(f.find('[data-practice-title]').textContent,'Keep my import');assert.equal(f.demo.options.length,5);assert.equal(f.contexts.length,0);f.tick(0);
});

test('missing or malformed recording links preserve normal exercises with an honest recovery message',async t=>{
 const f=await practice(t,{url:'https://ccatelier.test/studio/practice/?recording=live-missing'});assert.equal(f.demo.options.length,3);assert.match(f.status.textContent,/无法读取.*下载 JSON/);assert.equal(f.bars().length,4);
 const event=new f.window.CustomEvent('atelier:recording-ready',{cancelable:true,detail:{id:'../not-a-take'}});assert.equal(f.document.dispatchEvent(event),true);assert.equal(f.bars().length,4);assert.equal(f.contexts.length,0);
});

test('local recording removal needs an explicit confirmation and leaves other recordings and imports',async t=>{
 const take=originalScore({id:'live-remove'}),other=originalScore({id:'live-keep'}),f=await practice(t,{recordings:[take,other]});
 await f.importScore(originalScore({title:'Keep imported'}));f.change(f.demo,'recording:live-remove');f.window.confirm=()=>false;f.find('[data-practice-remove-recording]').click();assert.equal(f.demo.value,'recording:live-remove');assert.ok(f.window.localStorage.getItem('cc-live-take-v1:live-remove'));
 f.window.confirm=()=>true;f.find('[data-practice-remove-recording]').click();assert.equal(f.demo.value,'original-eighth-foundation');assert.equal(f.window.localStorage.getItem('cc-live-take-v1:live-remove'),null);assert.ok(f.window.localStorage.getItem('cc-live-take-v1:live-keep'));f.change(f.demo,'local-import');assert.equal(f.find('[data-practice-title]').textContent,'Keep imported');f.tick(0);
});

test('reinitialized practice audio uses the retained volume slider rather than a hidden default',async t=>{
 const f=await practice(t);f.change(f.find('[data-practice-volume]'),40,'input');f.controller.destroy();const replacement=f.initPractice();t.after(()=>replacement.destroy());await f.start();assert.ok(Math.abs(f.contexts[0].gains[0].gain.value-.28)<1e-8);f.stop();
});

// Challenge input and transport use this same deterministic browser clock.
async function startChallenge(f, {score = originalScore(), bpm = 120} = {}) {
 await f.importScore(score);f.change(f.bpm,bpm,'input');
 const panel=f.find('[data-challenge]');panel.open=true;panel.dispatchEvent(new f.window.Event('toggle'));
 f.find('[data-challenge-start]').click();await settle();f.advance(0);
}
function key(f, value, options={}) {f.document.activeElement.dispatchEvent(new f.window.KeyboardEvent('keydown',{key:value,bubbles:true,...options}));}
function release(f,value) {f.document.dispatchEvent(new f.window.KeyboardEvent('keyup',{key:value,bubbles:true}));}
function contact(f,type,id=1,options={}) {const pad=f.find('[data-challenge-pad="'+type+'"]'),event=new f.window.MouseEvent('pointerdown',{button:0,bubbles:true,cancelable:true,...options});Object.defineProperty(event,'pointerId',{value:id});pad.dispatchEvent(event);}
function lift(f,id=1) {const event=new f.window.Event('pointerup');Object.defineProperty(event,'pointerId',{value:id});f.window.dispatchEvent(event);}

test('challenge stays collapsed and silent until explicit start; count-in and clock match practice',async t=>{
 const f=await practice(t),panel=f.find('[data-challenge]');assert.equal(panel.open,false);panel.open=true;panel.dispatchEvent(new f.window.Event('toggle'));assert.equal(f.contexts.length,0);assert.ok([...panel.querySelectorAll('[data-challenge-pad]')].every(pad=>pad.disabled));
 await startChallenge(f);assert.equal(f.find('[data-challenge-start]').getAttribute('aria-pressed'),'true');
 f.advance(100);assert.match(f.find('[data-challenge-feedback]').textContent,/预备 1/);key(f,'a');release(f,'a');assert.ok(f.contexts[0].started.every(isClick));
 f.advance(2000);assert.match(f.position.textContent,/1 \/ 2/);key(f,'a');release(f,'a');assert.match(f.find('[data-challenge-feedback]').textContent,/底鼓 · 合拍/);
 f.advance(500);key(f,'s');release(f,'s');assert.match(f.find('[data-challenge-feedback]').textContent,/军鼓 · 合拍/);
 f.advance(3625);f.assertStopped();assert.match(f.find('[data-challenge-result]').textContent,/100%.*接住 2 \/ 2.*合拍 2.*额外敲击 0/);
 assert.match(f.find('[data-challenge-best]').textContent,/100%.*本机/);
 const sounds=f.contexts[0].started.filter(event=>!isClick(event));assert.equal(sounds.length,2,'only the two user strikes synthesize drum sources');
 const count=f.contexts.length;f.advance(10000);assert.equal(f.contexts.length,count,'challenge never loops even when normal loop is selected');
});

test('challenge completion and rest tail are kept without input; normal demonstration option is preserved',async t=>{
 const f=await practice(t);await startChallenge(f);f.advance(4100);assert.equal(f.find('[data-challenge-result]').hidden,true);assert.ok(f.contexts[0].started.every(isClick),'demonstration drums never overlap challenge');
 f.advance(2125);assert.match(f.find('[data-challenge-result]').textContent,/0%.*接住 0 \/ 2/);assert.equal(f.find('[data-practice-drums]').checked,true);
 await f.start();f.advance(2100);assert.ok(f.contexts.at(-1).started.some(event=>!isClick(event)),'normal follow-along drums return after challenge');
});

test('challenge supports same-step chords, contact-time input, and ignores duplicate contacts and pointer clicks',async t=>{
 const f=await practice(t);await startChallenge(f,{score:originalScore({bars:[{hits:[{step:0,type:'kick',velocity:1},{step:0,type:'hat',velocity:1}]}]})});f.advance(2100);
 contact(f,'kick',1);contact(f,'kick',1);contact(f,'kick',3);contact(f,'hat',2);
 f.find('[data-challenge-pad="kick"]').dispatchEvent(new f.window.MouseEvent('click',{bubbles:true,detail:1}));lift(f,1);lift(f,2);f.advance(2125);
 assert.match(f.find('[data-challenge-result]').textContent,/100%.*接住 2 \/ 2.*额外敲击 0/);
});

test('keyboard shortcuts ignore repeats, held duplicate keys, modifiers, editable fields and inactive mode',async t=>{
 const f=await practice(t);key(f,'a');assert.equal(f.contexts.length,0);await startChallenge(f);f.advance(2100);
 const feedback=f.find('[data-challenge-feedback]'),initial=feedback.textContent;
 for(const options of [{repeat:true},{ctrlKey:true},{metaKey:true},{altKey:true},{shiftKey:true},{isComposing:true}])key(f,'a',options);
 assert.equal(feedback.textContent,initial);f.bpm.focus();key(f,'a');assert.equal(feedback.textContent,initial);f.find('[data-challenge-start]').focus();
 key(f,'a');key(f,'a');key(f,'a',{repeat:true});release(f,'a');f.advance(500);
 f.find('[data-challenge-pad="snare"]').click();assert.match(feedback.textContent,/军鼓 · 合拍/);f.advance(3625);assert.match(f.find('[data-challenge-result]').textContent,/100%.*额外敲击 0/);
});

for(const [label,cancel] of [
 ['stop',f=>f.stop()],['collapse',f=>{const p=f.find('[data-challenge]');p.open=false;p.dispatchEvent(new f.window.Event('toggle'));}],
 ['hide',f=>f.visibility(true)],['page exit',f=>f.hidePage()],['blur',f=>f.window.dispatchEvent(new f.window.Event('blur'))],
 ['dialog',f=>f.openDialog('search-dialog')],['livehouse',f=>f.document.dispatchEvent(new f.window.Event('atelier:livehouse-open'))],
 ['sequencer',f=>f.document.dispatchEvent(new f.window.Event('atelier:studio-start'))],['tempo',f=>f.change(f.bpm,110,'input')],['selection',f=>f.change(f.to,0)],
])test('challenge '+label+' cancels scheduled audio and scoring without saving a partial result',async t=>{
 const f=await practice(t);await startChallenge(f);f.advance(2100);key(f,'a');cancel(f);f.advance(0);f.assertStopped();assert.equal(f.find('[data-challenge-start]').getAttribute('aria-pressed'),'false');assert.equal(f.find('[data-challenge-result]').hidden,true);
 assert.equal(f.window.localStorage.getItem('cc-practice-best-v1'),null);f.advance(10000);assert.equal(f.contexts.length,1);
});

test('cancelling challenge audio startup or an import leaves no stale run; retry starts a clean score',async t=>{
 const f=await practice(t,{deferredAudio:true});await startChallenge(f);const stale=f.contexts[0];f.stop();stale.resolveResume();await settle();f.assertStopped();assert.equal(stale.started.length,0);
 f.find('[data-challenge-start]').click();f.contexts[1].resolveResume();await settle();f.advance(2100);key(f,'a');release(f,'a');f.stop();
 f.find('[data-challenge-start]').click();f.contexts[2].resolveResume();await settle();f.advance(2100);key(f,'a');release(f,'a');f.advance(4125);assert.match(f.find('[data-challenge-result]').textContent,/50%.*接住 1 \/ 2/);
});

test('all-rest selection has no challenge start, while rest bars in an exercise remain playable',async t=>{
 const f=await practice(t);await f.importScore(originalScore({bars:[{hits:[]}]}));assert.equal(f.find('[data-challenge-start]').disabled,true);assert.match(f.find('[data-challenge-feedback]').textContent,/休止/);f.find('[data-challenge-start]').click();assert.equal(f.contexts.length,0);
});

test('blocked storage keeps the challenge usable and presents the unsaved result honestly',async t=>{
 const f=await practice(t);Object.defineProperty(f.window,'localStorage',{configurable:true,get(){throw Error('blocked');}});await startChallenge(f);assert.match(f.find('[data-challenge-best]').textContent,/不可用/);f.advance(6225);f.assertStopped();assert.match(f.find('[data-challenge-result]').textContent,/接住 0 \/ 2/);assert.match(f.find('[data-challenge-best]').textContent,/未存/);
});

test('starting challenge switches out of active follow-along, and a later normal start restores it',async t=>{
 const f=await practice(t);await f.start();const original=f.contexts[0];const panel=f.find('[data-challenge]');panel.open=true;panel.dispatchEvent(new f.window.Event('toggle'));f.find('[data-challenge-start]').click();await settle();f.advance(0);assert.equal(original.state,'closed');assert.equal(f.contexts.length,2);assert.equal(f.find('[data-challenge-start]').getAttribute('aria-pressed'),'true');f.play.click();f.assertStopped();await f.start();assert.equal(f.find('[data-challenge-start]').getAttribute('aria-pressed'),'false');assert.equal(f.contexts.length,3);
});


test('challenge grades the event occurrence time even when main-thread delivery is delayed',async t=>{
 const f=await practice(t);await startChallenge(f);f.advance(2250);
 // The shared clock began at 1000ms; the target is at 3100ms after count-in.
 const event=new f.window.KeyboardEvent('keydown',{key:'a',bubbles:true});Object.defineProperty(event,'timeStamp',{value:3100});f.document.body.dispatchEvent(event);
 assert.match(f.find('[data-challenge-feedback]').textContent,/底鼓 · 合拍/);release(f,'a');f.advance(3975);assert.match(f.find('[data-challenge-result]').textContent,/50%.*接住 1 \/ 2.*合拍 1/);
});
