const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM, VirtualConsole} = require('jsdom');
const ejs = require('ejs');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}

// Exercise the current authored page without rewriting the generated site.
async function fixture(t, {prefix = '/', hidden = false} = {}) {
  const {PRACTICE_DEMOS} = await import('../source/atelier/js/practice-core.mjs');
  const html = ejs.render(read('custom/redefine/nijika/practice.ejs'), {
    page: {practiceScores: PRACTICE_DEMOS.map(demo => ({
      ...demo, bars: demo.bars.length, width: 800, height: 800,
      path: 'atelier/scores/' + demo.id + '.svg',
    }))},
    url_for: value => prefix + value, partial: () => '',
  });
  const errors = [], console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(html + '<button id="outside">Outside</button><dialog></dialog>', {
    url: 'https://atelier.test' + prefix + 'studio/practice/',
    pretendToBeVisual: true, virtualConsole: console,
  });
  const win = dom.window, doc = win.document, timers = new Map();
  let now = 0, serial = 0;
  Object.defineProperty(doc, 'hidden', {configurable: true, get: () => hidden});
  win.setTimeout = (fn, ms) => { const id = ++serial; timers.set(id, {fn, at: now + ms}); return id; };
  win.clearTimeout = id => timers.delete(id);
  const route = await import('../source/atelier/js/route-features.js');
  const feature = route.routeFeatures.find(feature => feature.id === 'practice');
  assert.ok(feature, 'the authored practice page has a route descriptor');
  t.after(() => win.close());
  await flush(); // Let JSDOM's initial pageshow finish before simulating departure.
  const f = {
    win, doc, timers, errors, feature, route,
    host: doc.querySelector('[data-practice]'), app: doc.querySelector('.practice-app'),
    play: doc.querySelector('[data-practice-play]'), challenge: doc.querySelector('[data-challenge-start]'),
    notice: () => doc.querySelector('[data-feature-status="practice"]'),
    retry: () => f.notice()?.querySelector('button'),
    start: load => route.startFeature(feature, {root: doc, load}),
    visibility(value) { hidden = value; doc.dispatchEvent(new win.Event('visibilitychange')); },
    page(type) { win.dispatchEvent(new win.Event(type)); },
    async tick(ms) {
      const end = now + ms;
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
      }
      now = end; await flush();
    },
  };
  return f;
}

function fallback(f, prefix = '/') {
  assert.equal(f.app.hidden, true);
  assert.equal(f.play.closest('[hidden]'), f.app);
  assert.equal(f.challenge.closest('[hidden]'), f.app);
  const scores = f.doc.querySelector('.practice-static-scores');
  if (!scores.open) scores.querySelector('summary').click();
  assert.equal(scores.open, true);
  assert.equal(scores.closest('[hidden]'), null);
  assert.equal(scores.querySelectorAll('.practice-static-score').length, 3);
  assert.equal(scores.querySelectorAll('a').length, 6);
  for (const link of scores.querySelectorAll('a')) assert.ok(link.getAttribute('href').startsWith(prefix + 'atelier/scores/original-'));
}

function recovery(f, label = '重新加载') {
  assert.equal(f.notice().getAttribute('role'), 'status');
  assert.equal(f.notice().className, 'live-status');
  assert.equal(f.notice().parentElement, f.host, 'recovery stays outside the hidden app');
  assert.equal(f.notice().closest('[hidden],details:not([open])'), null);
  assert.equal(f.notice().hasAttribute('aria-busy'), false);
  assert.match(f.notice().textContent, /互动跟练暂未载入/);
  assert.equal(f.retry().textContent, label);
  assert.equal(f.timers.size, 0);
}

// Use the real practice initializer and real audio.enable; suspend its device
// handshake so these loading tests never create playback timers or make sound.
async function realPractice(t, f) {
  const saved = new Map(), contexts = [];
  for (const [name, value] of Object.entries({
    window: f.win, document: f.doc, CustomEvent: f.win.CustomEvent,
    location: f.win.location, localStorage: f.win.localStorage,
    matchMedia: () => ({matches: false, addEventListener() {}}),
  })) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {configurable: true, writable: true, value});
  }
  const node = extra => ({connect() {}, disconnect() {}, ...extra});
  class AudioContext {
    constructor() { this.state = 'suspended'; this.destination = node(); this.pending = deferred(); contexts.push(this); }
    createGain() { return node({gain: {value: 0, setTargetAtTime() {}}}); }
    createDynamicsCompressor() { return node(Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map(name => [name, {value: 0}]))); }
    createAnalyser() { return node(); }
    resume() { return this.pending.promise; }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  f.win.AudioContext = AudioContext;
  const {initPractice} = await import('../source/atelier/js/practice.js');
  const {LivehouseAudio} = await import('../source/atelier/js/livehouse-audio.js');
  const enable = LivehouseAudio.prototype.enable;
  let inits = 0, enables = 0, controller;
  LivehouseAudio.prototype.enable = function () { enables++; return enable.call(this); };
  t.after(async () => {
    try {
      f.page('pagehide');
      // A render failure may have registered its controller before throwing.
      (controller || (inits ? initPractice() : null))?.destroy();
      for (const context of contexts) context.pending.resolve();
      await flush();
      assert.ok(contexts.every(context => context.state === 'closed'));
    } finally {
      LivehouseAudio.prototype.enable = enable;
      for (const [name, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    }
  });
  return {
    module: {initPractice() { inits++; return controller = initPractice(); }},
    contexts, inits: () => inits, enables: () => enables,
  };
}

test('actual main entry routes practice exactly once at root and prefixed URLs with no independent import', async t => {
  const source = read('source/atelier/js/main.js');
  assert.doesNotMatch(source, /import\(['"]\.\/practice\.js['"]\)|initPractice/);
  for (const prefix of ['/', '/lab/']) {
    const f = await fixture(t, {prefix}), calls = [], loads = [], inits = [], context = {document: f.doc, window: f.win};
    assert.equal(f.feature.controls, undefined, 'audio controls must not enter generic delayed click replay');
    assert.equal(f.route.routeFeatures.filter(feature => feature.id === 'practice').length, 1);
    assert.match(String(f.feature.load), /import\(['"]\.\/practice\.js['"]\)/);
    const loaders = Object.fromEntries(f.route.routeFeatures.map(feature => [feature.id, async () => {
      loads.push(feature.id); return {[feature.init]() { inits.push(feature.id); }};
    }]));
    for (const match of source.matchAll(/import\s*\{([^}]+)\}/g)) {
      for (const name of match[1].split(',').map(name => name.trim())) context[name] = () => calls.push(name);
    }
    let ready;
    context.initRouteFeatures = () => { calls.push('initRouteFeatures'); return ready = f.route.initRouteFeatures({root: f.doc, loaders}); };
    vm.runInNewContext(source.replace(/^import .*;\s*$/gm, ''), context);
    await ready;
    assert.deepEqual(loads, ['practice']); assert.deepEqual(inits, ['practice']);
    for (const name of ['initSettings', 'initDialogs', 'initRhythm', 'initQueue', 'initOffline', 'initNavigationScenes']) assert.ok(calls.indexOf(name) < calls.indexOf('initRouteFeatures'), name);
    await f.route.initRouteFeatures({root: f.doc, loaders});
    assert.deepEqual(loads, ['practice']); assert.deepEqual(inits, ['practice']);
  }
});

for (const prefix of ['/', '/lab/']) test(`practice never-settling import has an exact 15-second recovery and native scores at ${prefix}`, async t => {
  const f = await fixture(t, {prefix}), record = f.start(() => new Promise(() => {}));
  await flush();
  assert.equal(f.notice().className, 'sr-only'); assert.equal(f.notice().getAttribute('aria-busy'), 'true');
  assert.equal(f.notice().parentElement, f.host); fallback(f, prefix);
  await f.tick(14999); assert.equal(f.retry(), null);
  await f.tick(1); assert.equal((await record.ready).status, 'failed'); recovery(f); fallback(f, prefix);
  await f.tick(60000); recovery(f);
});

for (const failure of ['reject', 'sync-throw']) test(`practice ${failure} exposes one reachable retry; real retry needs a fresh playback click`, async t => {
  const f = await fixture(t), actual = await realPractice(t, f), next = deferred(); let loads = 0;
  const record = f.start(() => {
    if (++loads > 1) return next.promise;
    if (failure === 'sync-throw') throw Error('offline');
    return Promise.reject(Error('offline'));
  });
  await record.ready; recovery(f); fallback(f);
  const retry = f.retry(); retry.focus(); retry.click(); retry.click(); await flush();
  assert.equal(loads, 2); assert.equal(f.doc.activeElement, f.host);
  f.play.click(); f.challenge.click();
  f.doc.querySelector('#outside').focus(); next.resolve(actual.module);
  assert.equal((await record.ready).status, 'ready');
  assert.equal(actual.inits(), 1); assert.equal(actual.enables(), 0); assert.equal(actual.contexts.length, 0);
  assert.equal(f.app.hidden, false); assert.equal(f.notice(), null); assert.equal(f.timers.size, 0);
  assert.equal(f.doc.activeElement.id, 'outside');
  f.play.click(); await flush(); assert.equal(actual.enables(), 1); assert.equal(actual.contexts.length, 1);
});

for (const late of ['resolve', 'reject']) test(`expired practice ${late} cannot initialize or disturb an active retry`, async t => {
  const f = await fixture(t), old = deferred(), next = deferred(); let loads = 0, inits = 0;
  const module = {initPractice() { inits++; }};
  const record = f.start(() => ++loads === 1 ? old.promise : next.promise);
  await flush(); await f.tick(15000); recovery(f);
  f.retry().focus(); f.retry().click(); await flush();
  f.doc.querySelector('#outside').focus();
  if (late === 'resolve') old.resolve(module); else old.reject(Error('late failure'));
  await flush(); assert.equal(inits, 0); assert.equal(f.notice().getAttribute('aria-busy'), 'true');
  assert.equal(f.doc.activeElement.id, 'outside');
  next.resolve(module); await record.ready;
  assert.equal(inits, 1); assert.equal(loads, 2); assert.equal(f.notice(), null); assert.equal(f.timers.size, 0);
});

for (const late of ['resolve', 'reject']) test(`expired practice ${late} cannot replace recovery or revive on pageshow`, async t => {
  const f = await fixture(t), pending = deferred(); let inits = 0;
  const record = f.start(() => pending.promise); f.page('pagehide');
  await flush(); await f.tick(15000); await record.ready;
  if (late === 'resolve') pending.resolve({initPractice() { inits++; }}); else pending.reject(Error('late failure'));
  await flush(); f.page('pageshow'); f.visibility(false); await flush();
  assert.equal(inits, 0); recovery(f); fallback(f);
});

test('repeated explicit practice timeouts stay bounded even when native import returns the same pending promise', async t => {
  const f = await fixture(t), shared = deferred(); let loads = 0, inits = 0;
  const record = f.start(() => { loads++; return shared.promise; });
  for (let attempt = 1; attempt <= 3; attempt++) {
    await flush(); await f.tick(15000); await record.ready; recovery(f);
    assert.equal(loads, attempt); assert.equal(f.host.querySelectorAll('[data-feature-status] button').length, 1);
    if (attempt < 3) f.retry().click();
  }
  shared.resolve({initPractice() { inits++; }}); await flush(); assert.equal(inits, 0);
  f.retry().click(); await record.ready; assert.equal(loads, 4); assert.equal(inits, 1); assert.equal(f.notice(), null);
});

for (const away of ['initial-hidden', 'hidden', 'pagehide', 'pagehide-then-hidden']) test(`real practice initialization while ${away} waits for both active and visible, then runs once silently`, async t => {
  const f = await fixture(t, {hidden: away === 'initial-hidden'}), actual = await realPractice(t, f), pending = deferred();
  const record = f.start(() => pending.promise);
  f.play.click(); f.challenge.click();
  if (away === 'hidden') f.visibility(true);
  if (away.startsWith('pagehide')) f.page('pagehide');
  if (away === 'pagehide-then-hidden') f.visibility(true);
  pending.resolve(actual.module); await flush();
  assert.equal(f.timers.size, 0); await f.tick(60000);
  assert.equal(actual.inits(), 0); assert.equal(actual.enables(), 0); fallback(f); assert.equal(f.retry(), null);
  if (away.startsWith('pagehide')) {
    f.visibility(false); await flush(); assert.equal(actual.inits(), 0, 'visibility alone cannot undo pagehide');
    if (away === 'pagehide-then-hidden') f.visibility(true);
    f.page('pageshow'); await flush();
    if (away === 'pagehide-then-hidden') { assert.equal(actual.inits(), 0, 'pageshow cannot initialize a hidden page'); f.visibility(false); }
  } else f.visibility(false);
  assert.equal((await record.ready).status, 'ready');
  assert.equal(actual.inits(), 1); assert.equal(actual.enables(), 0); assert.equal(actual.contexts.length, 0);
  assert.equal(f.app.hidden, false); assert.equal(f.notice(), null);
  f.page('pageshow'); f.page('pageshow'); f.visibility(false); await flush(); assert.equal(actual.inits(), 1);
  f.play.click(); await flush(); assert.equal(actual.enables(), 1);
});

for (const gesture of ['play', 'challenge']) test(`first successful practice load never replays an early ${gesture} gesture`, async t => {
  const f = await fixture(t), actual = await realPractice(t, f), pending = deferred();
  f.doc.querySelector('[data-challenge]').open = true;
  const record = f.start(() => pending.promise); f[gesture].click();
  pending.resolve(actual.module); await record.ready;
  assert.equal(actual.enables(), 0); assert.equal(actual.contexts.length, 0);
  assert.equal(f.app.hidden, false); assert.equal(f.timers.size, 0);
  f[gesture].click(); await flush(); assert.equal(actual.enables(), 1); assert.equal(actual.contexts.length, 1);
});

test('real practice partial render failure stays refresh-only without reusing a half-initialized controller', async t => {
  const f = await fixture(t), actual = await realPractice(t, f), sheet = f.doc.querySelector('[data-practice-sheet]');
  const replace = sheet.replaceChildren; sheet.replaceChildren = () => { throw Error('partial render'); };
  let loads = 0;
  const record = f.start(() => { loads++; return actual.module; });
  assert.equal((await record.ready).status, 'failed'); recovery(f, '刷新页面'); fallback(f);
  sheet.replaceChildren = replace;
  f.retry().click(); await flush();
  assert.equal(loads, 1); assert.equal(actual.inits(), 1); assert.equal(actual.enables(), 0);
  assert.equal(sheet.children.length, 0); assert.equal(f.app.hidden, true); recovery(f, '刷新页面');
  assert.equal(f.errors.length, 1); assert.match(f.errors[0].message, /Not implemented: navigation/, 'the only retry action requests a page refresh');
});
