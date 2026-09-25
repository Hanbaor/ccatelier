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
