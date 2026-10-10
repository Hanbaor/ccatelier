const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');

function page(route) {
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, '../public', route, 'index.html'), 'utf8'), {
    url: 'https://ccatelier.test/' + route + '/',
  });
  const {window} = dom;
  Object.assign(globalThis, {
    window, document: window.document, location: window.location, history: window.history,
    CustomEvent: window.CustomEvent, localStorage: window.localStorage,
    innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
    matchMedia: () => ({matches: false, addEventListener() {}}),
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    ResizeObserver: class { observe() {} disconnect() {} },
  });
  window.HTMLCanvasElement.prototype.getContext = () => null;
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event('close')); };
  return dom;
}

test('queue edits retain logical focus and keep archive buttons synchronized without rebuilding cards', async () => {
  const dom = page('notes');
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/atelier/data/archive.json'), 'utf8'));
  globalThis.fetch = async () => ({ok: true, json: async () => data});
  const {initQueue} = await import('../source/atelier/js/queue.js');
  const {initArchive} = await import('../source/atelier/js/archive.js');
  const {queueAction} = await import('../source/atelier/js/archive-store.js');
  try {
    initQueue();
    await initArchive();
    const cards = [...document.querySelectorAll('.archive-record')];
    const buttons = cards.slice(0, 3).map(card => card.querySelector('.record-bottom button'));
    const items = buttons.map(button => data.posts.find(post => post.path === button.dataset.queuePath));
    for (const item of items) queueAction({type: 'add', item});
    for (const button of buttons) assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.equal(document.querySelector('.archive-record'), cards[0], 'state updates must not replace archive cards');

    document.querySelector('.queue-open').click();
    const rowFor = item => [...document.querySelectorAll('#queue-dialog .queue-row')].find(row => row.dataset.queuePath === item.path);
    const down = rowFor(items[0]).querySelector('[data-queue-action="down"]');
    down.focus();
    down.click();
    assert.equal(document.activeElement.closest('.queue-row').dataset.queuePath, items[0].path);
    assert.equal(document.activeElement.dataset.queueAction, 'down');
    document.activeElement.click();
    assert.equal(document.activeElement.closest('.queue-row').dataset.queuePath, items[0].path);
    assert.equal(document.activeElement.dataset.queueAction, 'up', 'the disabled boundary action falls back to an enabled control');

    const done = rowFor(items[0]).querySelector('[data-queue-action="done"]');
    done.focus();
    done.click();
    assert.equal(document.activeElement.dataset.queueAction, 'done');
    assert.equal(document.activeElement.textContent, '重读');

    const remove = rowFor(items[0]).querySelector('[data-queue-action="remove"]');
    remove.focus();
    remove.click();
    assert.equal(buttons[0].getAttribute('aria-pressed'), 'false');
    assert.equal(buttons[0].textContent, '+');
    assert.equal(document.activeElement.dataset.queueAction, 'remove');
    assert.equal(document.activeElement.closest('.queue-row').dataset.queuePath, items[2].path);
    document.activeElement.click();
    document.activeElement.click();
    assert.equal(document.querySelectorAll('#queue-dialog .queue-row').length, 0);
    assert.equal(document.activeElement, document.querySelector('#queue-dialog .live-dialog-head button'));

    localStorage.setItem('cc-queue', JSON.stringify({version: 1, queue: [items[0]]}));
    window.dispatchEvent(new window.StorageEvent('storage', {key: 'cc-queue'}));
    assert.equal(buttons[0].getAttribute('aria-pressed'), 'true', 'another tab can add a queued article');
    localStorage.clear();
    window.dispatchEvent(new window.StorageEvent('storage', {key: null}));
    assert.equal(buttons[0].getAttribute('aria-pressed'), 'false', 'clearing storage resets archive state');
    assert.equal(document.querySelectorAll('#queue-dialog .queue-row').length, 0);
    assert.equal(document.querySelector('[data-queue-count]').textContent, '0');
  } finally {
    window.dispatchEvent(new window.Event('pagehide'));
    dom.window.close();
  }
});

test('studio sequencer has one roving Tab stop with arrow, Home and End navigation', async () => {
  const dom = page('studio');
  const {initStudio} = await import('../source/atelier/js/studio.js');
  try {
    initStudio();
    const step = (track, index) => document.querySelector(`[data-studio-track="${track}"][data-studio-step="${index}"]`);
    const tabStops = () => [...document.querySelectorAll('[data-studio-step]')].filter(button => button.tabIndex === 0);
    const key = name => document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', {key: name, bubbles: true, cancelable: true}));
    assert.equal(document.querySelectorAll('[data-studio-step]').length, 96);
    assert.deepEqual(tabStops(), [step(0, 0)]);
    step(0, 0).focus();
    key('ArrowRight');
    assert.equal(document.activeElement, step(0, 1));
    assert.deepEqual(tabStops(), [step(0, 1)]);
    key('ArrowDown');
    assert.equal(document.activeElement, step(1, 1));
    key('End');
    assert.equal(document.activeElement, step(1, 15));
    key('ArrowRight');
    assert.equal(document.activeElement, step(1, 0));
    key('Home');
    assert.equal(document.activeElement, step(1, 0));
    step(4, 7).focus();
    assert.deepEqual(tabStops(), [step(4, 7)], 'direct pointer/programmatic focus also updates the entry point');
    const before = step(4, 7).getAttribute('aria-label');
    step(4, 7).click();
    assert.notEqual(step(4, 7).getAttribute('aria-label'), before, 'roving focus preserves step editing');

    const count = document.querySelector('[data-step-count]');
    count.value = '32';
    count.dispatchEvent(new window.Event('change', {bubbles: true}));
    assert.equal(document.querySelectorAll('[data-studio-step]').length, 192);
    assert.equal(document.activeElement, step(4, 7), 'grid rebuilds retain a focused step');
    assert.deepEqual(tabStops(), [step(4, 7)]);
    step(4, 31).focus();
    count.focus();
    count.value = '16';
    count.dispatchEvent(new window.Event('change', {bubbles: true}));
    assert.equal(document.activeElement, count, 'changing a setting must not steal its focus');
    assert.deepEqual(tabStops(), [step(4, 15)], 'shrinking clamps the remembered step to the new grid');
  } finally {
    window.dispatchEvent(new window.Event('pagehide'));
    dom.window.close();
  }
});
