const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), {pathToFileURL} = require('node:url');
const {JSDOM} = require('jsdom'), ejs = require('ejs');
const partial = fs.readFileSync(path.resolve(__dirname, '../custom/redefine/nijika/permutation-demo.ejs'), 'utf8');
const loader = () => import(pathToFileURL(process.env.PERMUTATION_LOADER_PATH || path.resolve(__dirname, '../source/atelier/js/permutation-demo.js')).href);
const view = () => import('../source/atelier/js/permutation-demo-view.js');
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; };
function fixture(count = 1) {
  const dom = new JSDOM(ejs.render(partial, {url_for: p => '/lab/' + p}).repeat(count), {pretendToBeVisual: true});
  const doc = dom.window.document, hosts = [...doc.querySelectorAll('[data-permutation-demo]')];
  let now = 0, id = 0; const timers = new Map();
  dom.window.setTimeout = (fn, delay) => { const next = ++id; timers.set(next, {fn, at: now + delay}); return next; };
  dom.window.clearTimeout = key => timers.delete(key);
  const tick = async ms => {
    const end = now + ms;
    while (true) {
      const first = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!first) break;
      now = first[1].at; timers.delete(first[0]); first[1].fn(); await flush();
    }
    now = end; await flush();
  };
  const emit = (node, type) => node.dispatchEvent(new dom.window.Event(type));
  const open = (host = hosts[0]) => { host.open = true; emit(host, 'toggle'); };
  const find = (name, host = hosts[0]) => host.querySelector(`[data-permutation-${name}]`);
  const retry = (host = hosts[0]) => find('load-status', host).querySelector('button');
  return {dom, doc, hosts, timers, tick, emit, open, find, retry};
}
function failed(p, host = p.hosts[0]) {
  assert.equal(p.find('fallback', host).hidden, false);
  assert.equal(p.find('app', host).hidden, true);
  assert.match(p.find('load-status', host).textContent, /静态示例/);
  assert.equal(p.retry(host).textContent, '重试');
  assert.equal(p.retry(host).hasAttribute('aria-disabled'), false);
}
for (const resource of ['module', 'style']) test(`never-settling ${resource} reaches fallback at 15 seconds and late completion cannot mount`, async () => {
  const {initPermutationDemo} = await loader(), module = await view(), p = fixture(), old = deferred(), next = deferred();
  let loads = 0, styles = 0, mounts = 0;
  const counted = {mountPermutationDemo(host) { mounts++; return module.mountPermutationDemo(host); }};
  try {
    initPermutationDemo({root: p.doc,
      load: () => ++loads === 1 && resource === 'module' ? old.promise : next.promise,
      style: () => ++styles === 1 && resource === 'style' ? old.promise : Promise.resolve()});
    p.open(); if (resource === 'style') next.resolve(counted);
    await p.tick(14999); assert.match(p.find('load-status').textContent, /正在准备/); assert.equal(p.retry(), null);
    await p.tick(1); failed(p); assert.equal(p.timers.size, 0);
    p.retry().focus(); p.retry().click(); p.retry().click(); p.emit(p.hosts[0], 'toggle');
    assert.equal(loads, 2); assert.equal(styles, 2);
    old.resolve(counted); await flush();
    if (resource === 'module') { assert.equal(mounts, 0); next.resolve(counted); }
    await flush(); assert.equal(mounts, 1); assert.equal(p.find('app').hidden, false);
    assert.equal(p.doc.activeElement, p.find('size')); assert.equal(module.mountPermutationDemo(p.hosts[0]).playing, false);
    assert.equal(p.timers.size, 0);
  } finally { p.dom.window.close(); }
});
test('late rejection after timeout is handled and cannot disturb the successful retry', async () => {
  const {initPermutationDemo} = await loader(), module = await view(), p = fixture(), old = deferred(); let loads = 0;
  try {
    initPermutationDemo({root: p.doc, load: () => ++loads === 1 ? old.promise : Promise.resolve(module), style: async () => {}});
    p.open(); await p.tick(15000); failed(p); p.retry().click(); await flush();
    old.reject(Error('late offline')); await flush();
    assert.equal(p.find('load-status').hidden, true); assert.equal(p.find('fallback').hidden, true); assert.equal(p.timers.size, 0);
  } finally { p.dom.window.close(); }
});
test('default stylesheet timeout removes stale link, clears cached pending promise and ignores stale events', async () => {
  const {initPermutationDemo} = await loader(), module = await view(), p = fixture(); let loads = 0;
  try {
    initPermutationDemo({root: p.doc, load: () => { loads++; return Promise.resolve(module); }});
    p.open(); const old = p.doc.head.querySelector('link'); assert.ok(old);
    await p.tick(15000); failed(p); assert.equal(old.isConnected, false); assert.equal(p.timers.size, 0);
    p.retry().click(); const fresh = p.doc.head.querySelector('link'); assert.ok(fresh); assert.notEqual(old, fresh);
    p.emit(old, 'load'); p.emit(old, 'error'); await flush();
    assert.equal(p.find('app').hidden, true); assert.equal(fresh.isConnected, true);
    p.emit(fresh, 'load'); await flush(); assert.equal(p.find('app').hidden, false); assert.equal(loads, 2); assert.equal(p.timers.size, 0);
    // A late event on the old link must not evict the successful cache entry.
    p.emit(old, 'error'); const extra = p.hosts[0].cloneNode(true); extra.open = false; p.doc.body.append(extra);
    initPermutationDemo({root: p.doc, load: async () => module}); p.open(extra); await flush();
    assert.equal(p.doc.head.querySelectorAll('link').length, 1); assert.equal(p.timers.size, 0);
  } finally { p.dom.window.close(); }
});
test('stylesheet deadline cleans an orphaned pending link after module fails first', async () => {
  const {initPermutationDemo} = await loader(), module = await view(), p = fixture(); let loads = 0;
  try {
    initPermutationDemo({root: p.doc, load: () => ++loads === 1 ? Promise.reject(Error('offline')) : Promise.resolve(module)});
    p.open(); await flush(); failed(p); assert.equal(p.timers.size, 1);
    await p.tick(15000); assert.equal(p.doc.head.querySelector('link'), null); assert.equal(p.timers.size, 0);
    p.retry().click(); p.emit(p.doc.head.querySelector('link'), 'load'); await flush(); assert.equal(p.find('app').hidden, false); assert.equal(p.timers.size, 0);
  } finally { p.dom.window.close(); }
});
test('multiple hosts share one stylesheet attempt and one replacement with idempotent initialization', async () => {
  const {initPermutationDemo} = await loader(), module = await view(), p = fixture(2); let loads = 0;
  const options = {root: p.doc, load: () => { loads++; return Promise.resolve(module); }};
  try {
    initPermutationDemo(options); initPermutationDemo(options); assert.equal(p.timers.size, 0); assert.equal(loads, 0);
    p.open(p.hosts[0]); await p.tick(5000); p.open(p.hosts[1]);
    assert.equal(p.doc.head.querySelectorAll('link').length, 1); assert.equal(loads, 2);
    await p.tick(10000); for (const host of p.hosts) failed(p, host); assert.equal(p.timers.size, 0);
    for (const host of p.hosts) { p.retry(host).click(); p.retry(host).click(); }
    assert.equal(loads, 4); assert.equal(p.doc.head.querySelectorAll('link').length, 1);
    p.emit(p.doc.head.querySelector('link'), 'load'); await flush();
    for (const host of p.hosts) { assert.equal(p.find('app', host).hidden, false); assert.equal(module.mountPermutationDemo(host).playing, false); }
    assert.equal(p.timers.size, 0);
  } finally { p.dom.window.close(); }
});
test('ready stylesheet survives a module timeout; retry does not steal focus after close or focus movement', async () => {
  const {initPermutationDemo} = await loader(), module = await view();
  for (const close of [false, true]) {
    const p = fixture(), old = deferred(), next = deferred(); let loads = 0;
    try {
      initPermutationDemo({root: p.doc, load: () => ++loads === 1 ? old.promise : next.promise}); p.open();
      const link = p.doc.head.querySelector('link'); p.emit(link, 'load'); await p.tick(15000); failed(p);
      const button = p.retry(); button.focus(); button.click(); assert.equal(p.doc.activeElement, button);
      p.hosts[0].open = !close; const summary = p.hosts[0].querySelector('summary'); summary.focus();
      next.resolve(module); await flush(); assert.equal(p.doc.activeElement, summary);
      assert.equal(p.doc.head.querySelector('link'), link); assert.equal(p.doc.head.querySelectorAll('link').length, 1);
      assert.equal(module.mountPermutationDemo(p.hosts[0]).playing, false); assert.equal(p.timers.size, 0);
      old.resolve(module); await flush(); assert.equal(p.doc.activeElement, summary);
    } finally { p.dom.window.close(); }
  }
});
for (const resource of ['module', 'style', 'both']) test(`synchronous ${resource} failure uses the same retry path without leaking an attempt timer`, async () => {
  const {initPermutationDemo} = await loader(), module = await view(), p = fixture(); let fail = true;
  try {
    initPermutationDemo({root: p.doc,
      load: () => { if (fail && resource !== 'style') throw Error('module failure'); return Promise.resolve(module); },
      style: () => { if (fail && resource !== 'module') throw Error('style failure'); return Promise.resolve(); }});
    p.open(); await flush(); failed(p); assert.equal(p.timers.size, 0);
    fail = false; p.retry().click(); await flush(); assert.equal(p.find('app').hidden, false); assert.equal(p.timers.size, 0);
  } finally { p.dom.window.close(); }
});
test('mixed rejected module and throwing stylesheet are both consumed', async () => {
  const {initPermutationDemo} = await loader(), p = fixture();
  try { initPermutationDemo({root: p.doc, load: () => Promise.reject(Error('module')), style: () => { throw Error('style'); }}); p.open(); await flush(); failed(p); assert.equal(p.timers.size, 0); }
  finally { p.dom.window.close(); }
});
test('stylesheet succeeding after module failure remains reusable and clears its deadline', async () => {
  const {initPermutationDemo} = await loader(), module = await view(), p = fixture(); let loads = 0;
  try {
    initPermutationDemo({root: p.doc, load: () => ++loads === 1 ? Promise.reject(Error('module offline')) : Promise.resolve(module)});
    p.open(); await flush(); failed(p); assert.equal(p.timers.size, 1);
    const link = p.doc.head.querySelector('link'); await p.tick(1000); p.emit(link, 'load'); await flush();
    assert.equal(p.timers.size, 0); failed(p);
    await p.tick(20000); p.retry().click(); await flush(); assert.equal(p.find('app').hidden, false);
    assert.equal(p.doc.head.querySelector('link'), link); assert.equal(p.doc.head.querySelectorAll('link').length, 1); assert.equal(p.timers.size, 0);
  } finally { p.dom.window.close(); }
});
test('repeated failures reuse the retry button and attach only one host toggle listener', async () => {
  const {initPermutationDemo} = await loader(), module = await view(), p = fixture(); let loads = 0, toggles = 0;
  const host = p.hosts[0], add = host.addEventListener.bind(host);
  host.addEventListener = (type, ...args) => { if (type === 'toggle') toggles++; return add(type, ...args); };
  const options = {root: p.doc, load: () => ++loads < 3 ? new Promise(() => {}) : Promise.resolve(module), style: async () => {}};
  try {
    initPermutationDemo(options); initPermutationDemo(options); assert.equal(toggles, 1);
    p.open(); await p.tick(15000); failed(p); const button = p.retry();
    button.focus(); button.click(); await p.tick(15000); failed(p);
    assert.equal(p.retry(), button); assert.equal(p.doc.activeElement, button); assert.equal(p.timers.size, 0);
    initPermutationDemo(options); assert.equal(toggles, 1); button.click(); await flush();
    assert.equal(loads, 3); assert.equal(p.find('app').hidden, false); assert.equal(p.timers.size, 0);
  } finally { p.dom.window.close(); }
});
test('default native module import still mounts only on explicit first open', async () => {
  const {initPermutationDemo} = await loader(), p = fixture(); let styles = 0;
  try {
    initPermutationDemo({root: p.doc, style: async () => { styles++; }});
    assert.equal(styles, 0); assert.equal(p.find('app').hidden, true); assert.equal(p.timers.size, 0);
    p.open(); await new Promise(resolve => setImmediate(resolve)); await flush();
    assert.equal(styles, 1); assert.equal(p.find('app').hidden, false); assert.equal(p.timers.size, 0);
    const module = await view(); assert.equal(module.mountPermutationDemo(p.hosts[0]).playing, false);
  } finally { p.dom.window.close(); }
});
for (const outcome of ['load', 'error', 'timeout']) test(`default stylesheet ${outcome} removes both listeners and all settled timers`, async () => {
  const {initPermutationDemo} = await loader(), module = await view(), p = fixture();
  try {
    initPermutationDemo({root: p.doc, load: async () => module}); p.open();
    const link = p.doc.head.querySelector('link'), removed = [], remove = link.removeEventListener.bind(link);
    link.removeEventListener = (type, ...args) => { removed.push(type); return remove(type, ...args); };
    if (outcome === 'timeout') await p.tick(15000); else { p.emit(link, outcome); await flush(); }
    assert.deepEqual(removed.sort(), ['error', 'load']); assert.equal(p.timers.size, 0);
    if (outcome === 'load') { assert.equal(link.isConnected, true); assert.equal(p.find('app').hidden, false); }
    else { assert.equal(link.isConnected, false); failed(p); }
  } finally { p.dom.window.close(); }
});
for (const stage of ['append', 'createElement', 'setTimeout']) test(`default stylesheet ${stage} throwing a falsy value clears its failed cache and can retry`, async () => {
  const {initPermutationDemo} = await loader(), module = await view(), p = fixture();
  const owner = stage === 'append' ? p.doc.head : stage === 'createElement' ? p.doc : p.dom.window;
  const original = owner[stage].bind(owner); let fail = true;
  owner[stage] = (...args) => {
    if (fail && (stage !== 'createElement' || args[0] === 'link')) { fail = false; throw stage === 'append' ? null : stage === 'createElement' ? undefined : 0; }
    return original(...args);
  };
  try {
    initPermutationDemo({root: p.doc, load: async () => module}); p.open(); await flush(); failed(p);
    assert.equal(p.doc.head.querySelector('link'), null); assert.equal(p.timers.size, 0);
    p.retry().click(); const fresh = p.doc.head.querySelector('link'); assert.ok(fresh);
    p.emit(fresh, 'load'); await flush(); assert.equal(p.find('app').hidden, false); assert.equal(p.timers.size, 0);
  } finally { p.dom.window.close(); }
});
