const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const {JSDOM} = require('jsdom');

const template = fs.readFileSync(path.join(__dirname, '../custom/redefine/nijika/dialogs.ejs'), 'utf8').split('</dialog>')[0] + '</dialog>';
const settle = () => new Promise(resolve => setImmediate(resolve));
const routes = ['atelier', 'notes', 'projects', 'research', 'life', 'about', 'lounge', 'studio', 'guestbook'];

async function fixture(t, {enabled = true, reduced = false, fine = true} = {}) {
  const markup = ejs.render(template, {
    url_for: value => '/lab/' + value,
    nijika_art_srcset: value => '/lab' + value.replace('.webp', '-960.webp') + ' 960w, /lab' + value + ' 1916w',
    partial: () => '<svg aria-hidden="true"></svg>',
  });
  const dom = new JSDOM('<!doctype html><body>' + markup, {url:'https://example.test/lab/', pretendToBeVisual:true});
  const {window} = dom;
  const {document} = window;
  const globals = new Map();
  const pending = [], timers = new Map();
  let nextTimer = 0;
  const media = query => ({
    matches: query.includes('reduced-motion') ? reduced : fine,
    listeners: new Set(),
    addEventListener(_name, callback) { this.listeners.add(callback); },
    removeEventListener(_name, callback) { this.listeners.delete(callback); },
    change(value) { this.matches = value; this.listeners.forEach(callback => callback()); },
  });
  const reducedQuery = media('(prefers-reduced-motion: reduce)');
  const hoverQuery = media('(hover: hover) and (pointer: fine)');
  window.matchMedia = query => query.includes('reduced-motion') ? reducedQuery : hoverQuery;
  for (const [name, value] of Object.entries({document, window, matchMedia:window.matchMedia})) {
    globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {configurable:true, writable:true, value});
  }
  window.setTimeout = callback => { const id = ++nextTimer; timers.set(id, callback); return id; };
  window.clearTimeout = id => timers.delete(id);
  window.requestAnimationFrame = () => { throw new Error('scene preview must not start an animation-frame loop'); };
  window.HTMLImageElement.prototype.decode = function () {
    return new Promise((resolve, reject) => pending.push({image:this, resolve, reject}));
  };
  const {motion} = await import('../source/atelier/js/ui.js');
  motion.enabled = enabled;
  const {initNavigationScenes} = await import('../source/atelier/js/navigation-scenes.js');
  const controller = initNavigationScenes(document);
  const dialog = document.querySelector('#menu-dialog');
  const frame = dialog.querySelector('[data-menu-scene-frame]');
  const nav = dialog.querySelector('nav');
  t.after(() => {
    controller.destroy();
    dom.window.close();
    for (const [name, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  const link = key => nav.querySelector(`[data-menu-scene="${key}"]`);
  const pointer = (target, type = 'pointerover', pointerType = 'mouse', relatedTarget = null) => {
    const event = new window.Event(type, {bubbles:true, cancelable:true});
    Object.defineProperties(event, {pointerType:{value:pointerType}, relatedTarget:{value:relatedTarget}});
    target.dispatchEvent(event);
    return event;
  };
  return {
    window, document, dialog, frame, nav, link, pointer, pending, timers, controller, initNavigationScenes,
    motion, reducedQuery,
    open() { dialog.open = true; },
    close() { dialog.open = false; dialog.dispatchEvent(new window.Event('close')); },
    hover(key) { return pointer(link(key)); },
    async resolve(index) { pending[index].resolve(); await settle(); },
    async fail(index) { pending[index].reject(new Error('Image unavailable')); await settle(); },
    finish() { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } },
  };
}

test('menu keeps nine direct semantic links and inert, root-safe scene metadata', async t => {
  const f = await fixture(t);
  assert.deepEqual([...f.nav.querySelectorAll('a')].map(link => link.getAttribute('href')), routes.map(route => `/lab/${route}/`));
  assert.equal(f.frame.querySelectorAll('img').length, 1);
  assert.equal(f.frame.querySelector('img').getAttribute('loading'), 'lazy');
  assert.equal(f.pending.length, 0, 'initialization does not request alternate art');
  assert.equal(f.initNavigationScenes(f.document), f.controller, 'initialization is idempotent');
  f.hover('notes');
  assert.equal(f.pending.length, 0, 'the closed menu cannot load preview scenes');
  f.open();
  f.hover('notes');
  assert.equal(f.pending.length, 1);
  assert.equal(f.pending[0].image.getAttribute('src'), '/lab/atelier/images/v2/notes.webp');
  f.pointer(f.link('notes').querySelector('span'), 'pointerover', 'mouse', f.link('notes'));
  assert.equal(f.pending.length, 1, 'moving inside a link does not repeat its request');
});

test('out-of-order image decodes cannot replace a newer selection', async t => {
  const f = await fixture(t);
  f.open();
  f.hover('notes');
  f.hover('research');
  await f.resolve(1);
  assert.equal(f.frame.dataset.scene, 'research');
  assert.equal(f.frame.querySelectorAll('img').length, 2);
  assert.equal(f.frame.querySelectorAll('img:not([aria-hidden])').length, 1);
  await f.resolve(0);
  assert.equal(f.frame.dataset.scene, 'research');
  assert.equal(f.timers.size, 1);
  f.finish();
  assert.equal(f.frame.querySelectorAll('img').length, 1);
  assert.match(f.frame.querySelector('img').alt, /研究室/);
});

test('returning to the displayed scene cancels pending art without another load', async t => {
  const f = await fixture(t);
  f.open();
  f.hover('notes');
  f.hover('about');
  await f.resolve(0);
  assert.equal(f.frame.dataset.scene, 'about');
  assert.equal(f.pending.length, 1);
  assert.equal(f.frame.querySelectorAll('img').length, 1);
});

test('frame follows the current decoded scene proportions and ignores stale image ratios', async t => {
  const f = await fixture(t);
  const ratio = () => Number(f.frame.style.getPropertyValue('--menu-scene-ratio'));
  assert.equal(ratio(), 2 / 3, 'the initial portrait preserves its native proportions');
  f.open();
  f.hover('notes');
  f.hover('guestbook');
  // Natural dimensions win over markup hints once the selected image is decoded.
  Object.defineProperties(f.pending[1].image, {naturalWidth:{value:1916}, naturalHeight:{value:821}});
  await f.resolve(1);
  assert.equal(ratio(), 1916 / 821);
  await f.resolve(0);
  assert.equal(ratio(), 1916 / 821, 'an older decode cannot resize the selected scene');
  f.hover('about');
  await f.resolve(2);
  assert.equal(ratio(), 2 / 3);
});

test('image errors preserve the last usable illustration and allow a retry', async t => {
  const f = await fixture(t);
  f.open();
  const original = f.frame.querySelector('img');
  f.hover('projects');
  await f.fail(0);
  assert.equal(f.frame.querySelector('img'), original);
  assert.equal(f.frame.dataset.scene, 'about');
  f.hover('projects');
  assert.equal(f.pending.length, 2);
  await f.resolve(1);
  assert.equal(f.frame.dataset.scene, 'projects');
});

test('keyboard focus changes scenes while anchor activation stays native', async t => {
  const f = await fixture(t);
  f.open();
  f.link('life').focus();
  await f.resolve(0);
  assert.equal(f.frame.dataset.scene, 'life');
  const key = new f.window.KeyboardEvent('keydown', {key:'Enter', bubbles:true, cancelable:true});
  f.link('life').dispatchEvent(key);
  assert.equal(key.defaultPrevented, false);
  const click = new f.window.Event('click', {bubbles:true, cancelable:true});
  assert.equal(f.link('life').dispatchEvent(click), true);
  assert.equal(click.defaultPrevented, false);
  assert.equal(f.dialog.open, true, 'the preview itself does not close or redirect navigation');
});

test('touch does not load hover scenes or consume the first tap', async t => {
  const f = await fixture(t, {fine:false});
  f.open();
  const link = f.link('studio');
  assert.equal(f.pointer(link, 'pointerover', 'touch').defaultPrevented, false);
  assert.equal(f.pointer(link, 'pointerdown', 'touch').defaultPrevented, false);
  link.focus();
  assert.equal(f.pending.length, 0);
  const click = new f.window.Event('click', {bubbles:true, cancelable:true});
  assert.equal(link.dispatchEvent(click), true);
  link.dispatchEvent(new f.window.KeyboardEvent('keydown', {key:'Tab', bubbles:true}));
  f.link('notes').focus();
  assert.equal(f.pending.length, 1, 'an attached keyboard still gets previews on a touch device');
});

test('reduced motion and global motion-off swap immediately without animation timers', async t => {
  const f = await fixture(t, {reduced:true});
  f.open();
  f.hover('notes');
  await f.resolve(0);
  assert.equal(f.frame.querySelectorAll('img').length, 1);
  assert.equal(f.frame.querySelector('.is-entering'), null);
  assert.equal(f.timers.size, 0);
  f.reducedQuery.change(false);
  f.motion.enabled = false;
  f.hover('projects');
  await f.resolve(1);
  assert.equal(f.frame.querySelector('.is-entering'), null);
  assert.equal(f.timers.size, 0);
  f.motion.enabled = true;
  f.document.body.classList.add('motion-off');
  f.hover('research');
  await f.resolve(2);
  assert.equal(f.frame.querySelector('.is-entering'), null);
  assert.equal(f.timers.size, 0);
});

test('motion changes finish an active transition and rapid swaps keep at most two images', async t => {
  const f = await fixture(t);
  f.open();
  f.hover('notes');
  await f.resolve(0);
  f.hover('research');
  await f.resolve(1);
  assert.equal(f.frame.querySelectorAll('img').length, 2);
  assert.equal(f.timers.size, 1);
  f.reducedQuery.change(true);
  assert.equal(f.frame.querySelectorAll('img').length, 1);
  assert.equal(f.frame.querySelector('.is-entering'), null);
  assert.equal(f.timers.size, 0);
});

test('close, page hide, and destroy discard late work and release timers', async t => {
  const f = await fixture(t);
  f.open();
  f.hover('notes');
  f.close();
  f.open();
  await f.resolve(0);
  assert.equal(f.frame.dataset.scene, 'about', 'a request from a previous menu session stays stale');
  f.hover('research');
  await f.resolve(1);
  f.hover('life');
  f.window.dispatchEvent(new f.window.Event('pagehide'));
  await f.resolve(2);
  assert.equal(f.frame.dataset.scene, 'research');
  assert.equal(f.frame.querySelectorAll('img').length, 1);
  assert.equal(f.timers.size, 0);
  f.controller.destroy();
  f.hover('notes');
  assert.equal(f.pending.length, 3);
});

test('preview styling contains art rather than cropping and honors both motion preferences', () => {
  const css = fs.readFileSync(path.join(__dirname, '../source/atelier/css/navigation-scenes.css'), 'utf8');
  assert.match(css, /object-fit:contain/);
  assert.match(css, /\.nijika #menu-dialog \{min-height:0\}/);
  assert.match(css, /align-self:center/);
  assert.match(css, /aspect-ratio:var\(--menu-scene-ratio, 2 \/ 3\)/);
  assert.match(css, /height:auto/);
  assert.match(css, /\.motion-off \.menu-scene-image/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});
