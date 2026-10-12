const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', 'source/atelier/js', file), 'utf8');

function setup(t, {hidden = false, saved = null, denied = false} = {}) {
  const dom = new JSDOM(`<div class="focus-amp"><output data-focus-time></output>
    <button data-focus-start></button><button data-focus-reset></button>
    <button data-focus-minutes="25"></button><button data-focus-minutes="5"></button>
    <p data-focus-status></p></div>`);
  t.after(() => dom.window.close());
  const {window} = dom, {document} = window;
  Object.defineProperty(document, 'hidden', {get: () => hidden});
  const intervals = new Map(), durable = new Map(saved ? [['cc-focus-timer', JSON.stringify(saved)]] : []);
  let now = 1000000, nextId = 0;
  const context = vm.createContext({window, document, Date: {now: () => now},
    localStorage: {
      getItem(key) {if (denied) throw Error('denied'); return durable.get(key) ?? null;},
      setItem(key, value) {if (denied) throw Error('denied'); durable.set(key, value);}
    },
    setInterval(callback, ms) {assert.equal(ms, 500); const id = ++nextId; intervals.set(id, callback); return id;},
    clearInterval(id) {intervals.delete(id);}
  });
  // Exercise the production timer and its actual deadline/storage helpers,
  // independently of unrelated discovery, passport and article enhancements.
  const ui = read('ui.js').split('let toastTimer;')[0].replace(/^import[^\n]*\n/gm, '').replaceAll('export ', '');
  const state = read('reading-state.mjs').replaceAll('export ', '');
  const timer = read('after-hours.js').split('function focusTimer() {')[1].split('\nfunction atmosphere()')[0];
  vm.runInContext(`${ui}\n${state}\nfunction focusTimer() {${timer}\nfocusTimer();`, context);
  return {intervals, document,
    display: () => document.querySelector('[data-focus-time]').textContent,
    click: selector => document.querySelector(selector).click(),
    advance: milliseconds => {now += milliseconds; for (const callback of [...intervals.values()]) callback();},
    visibility(value) {hidden = value; document.dispatchEvent(new window.Event('visibilitychange'));},
    hide() {window.dispatchEvent(new window.Event('pagehide'));},
    restore() {window.dispatchEvent(new window.PageTransitionEvent('pageshow', {persisted: true}));},
    stored: () => JSON.parse(vm.runInContext("storage.get('cc-focus-timer')", context))
  };
}

test('idle, paused, reset and completed timers have no polling interval', t => {
  const timer = setup(t);
  assert.equal(timer.display(), '25:00');
  assert.equal(timer.intervals.size, 0);
  timer.click('[data-focus-start]');
  assert.equal(timer.intervals.size, 1);
  timer.advance(2000);
  assert.equal(timer.display(), '24:58');
  timer.click('[data-focus-start]');
  assert.equal(timer.intervals.size, 0);
  timer.advance(3000);
  assert.equal(timer.display(), '24:58');
  timer.click('[data-focus-start]');
  timer.click('[data-focus-reset]');
  assert.equal(timer.intervals.size, 0);
  assert.equal(timer.display(), '25:00');
  timer.click('[data-focus-minutes="5"]');
  assert.equal(timer.intervals.size, 0);
  timer.click('[data-focus-start]');
  timer.advance(300000);
  assert.equal(timer.display(), '00:00');
  assert.equal(timer.intervals.size, 0);
  assert.equal(timer.stored().endsAt, 0);
  assert.match(timer.document.querySelector('[data-focus-status]').textContent, /完成/);
  timer.click('[data-focus-start]');
  assert.equal(timer.display(), '05:00');
  assert.equal(timer.intervals.size, 1);
});

test('hidden tabs stop polling while the deadline continues and completion appears on return', t => {
  const timer = setup(t);
  timer.click('[data-focus-minutes="5"]');
  timer.click('[data-focus-start]');
  const deadline = timer.stored().endsAt;
  timer.visibility(true);
  assert.equal(timer.intervals.size, 0);
  timer.advance(10000);
  assert.equal(timer.display(), '05:00', 'hidden timer does not rewrite its display');
  assert.equal(timer.stored().endsAt, deadline);
  timer.visibility(false);
  assert.equal(timer.display(), '04:50');
  assert.equal(timer.intervals.size, 1);
  timer.visibility(false);
  assert.equal(timer.intervals.size, 1);
  timer.visibility(true);
  timer.advance(300000);
  timer.visibility(false);
  assert.equal(timer.display(), '00:00');
  assert.equal(timer.intervals.size, 0);
  assert.equal(timer.stored().endsAt, 0);
});

test('a restored running timer does not start polling in an initially hidden document', t => {
  const timer = setup(t, {hidden: true, saved: {duration: 300000, remaining: 300000, endsAt: 1300000}});
  assert.equal(timer.intervals.size, 0);
  timer.advance(2000);
  timer.visibility(false);
  assert.equal(timer.display(), '04:58');
  assert.equal(timer.intervals.size, 1);
});

for (const denied of [false, true]) test(`BFCache restoration preserves deadline with ${denied ? 'blocked' : 'working'} storage and never duplicates polling`, t => {
  const timer = setup(t, {denied});
  timer.click('[data-focus-start]');
  const deadline = timer.stored().endsAt;
  timer.hide();
  assert.equal(timer.intervals.size, 0);
  timer.visibility(false);
  assert.equal(timer.intervals.size, 0, 'visibility alone cannot revive a page that has left');
  timer.advance(10000);
  timer.restore();
  assert.equal(timer.display(), '24:50');
  assert.equal(timer.stored().endsAt, deadline);
  assert.equal(timer.intervals.size, 1);
  timer.restore();
  assert.equal(timer.intervals.size, 1);
  timer.hide();
  timer.visibility(true);
  timer.restore();
  assert.equal(timer.intervals.size, 0);
  timer.visibility(false);
  assert.equal(timer.intervals.size, 1);
  timer.click('[data-focus-start]');
  timer.hide();
  timer.restore();
  assert.equal(timer.intervals.size, 0, 'paused timers stay idle after restoration');
});
