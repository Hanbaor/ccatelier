const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');

test('ordinary article clicks never change font size; explicit controls stay synchronized', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/hot100/036/index.html'), 'utf8');
  const dom = new JSDOM(html, {url:'https://ccatelier.test/hot100/036/'});
  const {window} = dom;
  Object.assign(globalThis, {window, document:window.document, location:window.location,
    localStorage:window.localStorage, innerHeight:900,
    matchMedia:()=>({matches:false,addEventListener(){}}),
    requestAnimationFrame:()=>0, cancelAnimationFrame:()=>{}});
  const {initAfterHours} = await import('../source/atelier/js/after-hours.js');
  const {initReader} = await import('../source/atelier/js/reader.js');
  try {
    initAfterHours(); initReader();
    const studio = document.querySelector('.reading-studio');
    const size = () => studio.style.getPropertyValue('--reader-size');
    const initial = size();
    for (const selector of ['.article-body p', '.article-body table td', '[data-find-clear]']) {
      document.querySelector(selector).click();
      assert.equal(size(), initial, selector + ' must not resize the article');
    }
    const shortcut = document.querySelector('button[data-reader-size-cycle]');
    shortcut.click();
    assert.equal(size(), '19px', 'one deliberate click increases by exactly one step');
    const slider = document.querySelector('[data-reader-size]');
    assert.equal(slider.value, '19');
    slider.value = '20';
    slider.dispatchEvent(new window.Event('input', {bubbles:true}));
    assert.equal(size(), '20px');
    assert.match(shortcut.getAttribute('aria-label'), /20/);
    document.querySelector('.article-body p').click();
    assert.equal(size(), '20px');
  } finally {
    window.dispatchEvent(new window.Event('pagehide'));
    window.close();
  }
});

test('reader find leaves IME confirmation alone and preserves Enter navigation', async t => {
  const dom = new JSDOM('<div class="reading-studio"><article class="article-body"><p>中文 中文</p></article></div><input id="reader-find"><span data-find-status>输入关键词</span>', {url:'https://ccatelier.test/'});
  const {window} = dom;
  const globals = new Map();
  let scrolls = 0;
  for (const [name, value] of Object.entries({window, document:window.document,
    localStorage:window.localStorage, NodeFilter:window.NodeFilter, innerHeight:900,
    matchMedia:()=>({matches:false}), requestAnimationFrame:()=>0,
    getSelection:()=>window.getSelection()})) {
    globals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {configurable:true, writable:true, value});
  }
  t.after(() => {
    window.close();
    for (const [name, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  window.HTMLElement.prototype.scrollIntoView = () => scrolls++;
  const {initReader} = await import('../source/atelier/js/reader.js');
  initReader();
  const input = document.querySelector('#reader-find');
  const status = document.querySelector('[data-find-status]');
  input.value = '中文';
  for (const options of [{isComposing:true}, {keyCode:229}, {isComposing:true, shiftKey:true}]) {
    const event = new window.KeyboardEvent('keydown', {key:'Enter', bubbles:true, cancelable:true, ...options});
    input.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
    assert.equal(status.textContent, '输入关键词', 'IME confirmation does not search');
    assert.equal(scrolls, 0, 'IME confirmation does not navigate');
    assert.equal(window.getSelection().rangeCount, 0);
  }
  input.dispatchEvent(new window.CompositionEvent('compositionend'));
  assert.equal(status.textContent, '2 处匹配');
  assert.equal(scrolls, 0);
  for (const [shiftKey, expected] of [[false,'1 / 2'], [false,'2 / 2'], [true,'1 / 2']]) {
    const event = new window.KeyboardEvent('keydown', {key:'Enter', shiftKey, cancelable:true});
    input.dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.equal(status.textContent, expected);
  }
  assert.equal(scrolls, 3);
});
