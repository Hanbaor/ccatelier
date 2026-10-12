const test = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');

// Real director event handler and archive-store.download. Only browser boundary
// APIs are controlled: a click requests a download, never proves a saved file.
async function fixture(t) {
  const dom = new JSDOM('<dialog open><details open data-live-director><summary><span></span></summary><div data-director-body></div></details></dialog>', {url: 'https://ccatelier.test/'});
  const {window} = dom, {document} = window;
  const restore = [];
  function patch(target, name, value) {
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    Object.defineProperty(target, name, {configurable: true, writable: true, value});
    restore.push(() => descriptor ? Object.defineProperty(target, name, descriptor) : delete target[name]);
  }
  const errors = [], blobs = [], clicks = [], revoked = [], timers = [], storage = [], network = [];
  window.addEventListener('error', event => { errors.push(event.error); event.preventDefault(); });
  patch(globalThis, 'window', window);
  patch(globalThis, 'document', document);
  patch(globalThis, 'localStorage', window.localStorage);
  patch(globalThis, 'CustomEvent', window.CustomEvent);
  patch(globalThis, 'matchMedia', () => ({matches: true, addEventListener() {}}));
  patch(globalThis, 'fetch', (...args) => { network.push(args); throw Error('Unexpected network'); });
  patch(window, 'fetch', globalThis.fetch);
  patch(window.XMLHttpRequest.prototype, 'open', (...args) => { network.push(args); throw Error('Unexpected XHR'); });
  patch(window.navigator, 'sendBeacon', (...args) => { network.push(args); throw Error('Unexpected beacon'); });
  for (const method of ['getItem', 'setItem', 'removeItem', 'clear']) patch(window.Storage.prototype, method, (...args) => { storage.push([method, ...args]); throw Error('Unexpected storage'); });
  let failure = '';
  patch(URL, 'createObjectURL', blob => {
    if (failure === 'url') throw Error('Object URL unavailable');
    blobs.push(blob); return `blob:test-${blobs.length}`;
  });
  patch(URL, 'revokeObjectURL', url => revoked.push(url));
  patch(window.HTMLAnchorElement.prototype, 'click', function () {
    if (failure === 'click') throw Error('Anchor click blocked');
    clicks.push({name: this.download, href: this.href});
  });
  const realTimeout = globalThis.setTimeout;
  patch(globalThis, 'setTimeout', (fn, delay, ...args) => {
    if (delay === 30000) { timers.push(fn); return timers.length; }
    return realTimeout(fn, delay, ...args);
  });
  t.after(() => { window.close(); for (const undo of restore.reverse()) undo(); });
  const {originalPerformance, validatePerformance} = await import('../source/atelier/js/performance-core.mjs');
  const {initDirector} = await import('../source/atelier/js/livehouse-director.js');
  let project = originalPerformance(), changes = 0;
  const dialog = document.querySelector('dialog');
  initDirector({dialog, getProject: () => project, change: next => { project = next; changes++; }, seek() { throw Error('Export must not seek'); }});
  const button = label => [...dialog.querySelectorAll('button')].find(node => node.textContent === label);
  const status = dialog.querySelector('[role=status]');
  const drum = () => dialog.querySelector('[data-drum="kick"][data-step="1"]');
  drum().click(); const first = structuredClone(project);
  drum().click(); const second = structuredClone(project);
  button('撤销').click();
  assert.deepEqual(project, first);
  assert.equal(button('撤销').disabled, false);
  assert.equal(button('重做').disabled, false);
  const exportButton = button('下载工程'); exportButton.focus();
  const before = project, serialized = JSON.stringify(project), beforeChanges = changes;
  function assertPreserved() {
    assert.equal(project, before, 'export does not replace the project');
    assert.equal(JSON.stringify(project), serialized);
    assert.equal(changes, beforeChanges);
    assert.equal(document.activeElement, exportButton, 'focused export control stays usable');
    assert.equal(button('撤销').disabled, false);
    assert.equal(button('重做').disabled, false);
    assert.deepEqual(errors, [], 'no uncaught event-handler errors');
    assert.deepEqual(storage, [], 'no storage reads/writes');
    assert.deepEqual(network, [], 'no fetch/XHR/beacon');
    assert.equal(exportButton.disabled, false);
    assert.equal(dialog.open, true);
  }
  function assertHistory() {
    button('重做').click(); assert.deepEqual(project, second);
    button('撤销').click(); assert.deepEqual(project, first);
    button('撤销').click(); assert.deepEqual(project, originalPerformance());
    assert.equal(button('撤销').disabled, true);
    button('重做').click(); assert.deepEqual(project, first);
  }
  async function assertExport() {
    const blob = blobs.at(-1);
    assert.equal(blob.type, 'application/json');
    const data = JSON.parse(await blob.text());
    assert.deepEqual(data, JSON.parse(serialized), 'exports current edited complete project');
    assert.deepEqual(validatePerformance(data), data);
    assert.ok(data.notes.length && data.lights.length && data.shots.length);
    assert.deepEqual(clicks.at(-1), {name: 'cc-directed-performance.json', href: `blob:test-${blobs.length}`});
    assert.equal(status.textContent, '已请求下载完整演出工程；请确认浏览器中的下载结果。没有上传。');
    assert.doesNotMatch(status.textContent, /已下载|下载完成|已保存/);
  }
  return {exportButton, status, blobs, clicks, revoked, timers, assertPreserved, assertHistory, assertExport, fail: value => failure = value};
}

test('director export requests validated complete JSON without mutating editing state', async t => {
  const f = await fixture(t);
  f.exportButton.click(); f.assertPreserved(); await f.assertExport();
  assert.equal(f.clicks.length, 1); assert.equal(f.timers.length, 1);
  assert.deepEqual(f.revoked, []); f.timers[0](); assert.deepEqual(f.revoked, ['blob:test-1']);
  f.assertHistory();
});

for (const stage of ['url', 'click']) test(`director export catches ${stage} failure, preserves history/focus, and retries`, async t => {
  const f = await fixture(t);
  // A prior request's success status must not survive a later failed attempt.
  f.exportButton.click();
  f.fail(stage); f.exportButton.click(); f.assertPreserved();
  assert.equal(f.status.textContent, '下载失败；当前工程与撤销记录仍保留，可以重试。');
  assert.equal(f.clicks.length, 1); assert.equal(f.timers.length, 1);
  assert.deepEqual(f.revoked, stage === 'click' ? ['blob:test-2'] : []);
  f.fail(''); f.exportButton.click(); f.assertPreserved(); await f.assertExport();
  assert.equal(f.clicks.length, 2); assert.equal(f.timers.length, 2);
  f.assertHistory();
});
