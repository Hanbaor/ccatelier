const test = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');

test('theme controls agree, restore saved daylight and preserve theme when storage fails', async () => {
  const dom = new JSDOM('<html><head><meta name="theme-color"></head><body><button data-theme-toggle></button><button data-theme-toggle data-theme-footer></button></body></html>', {url:'https://ccatelier.test/'});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,CustomEvent:dom.window.CustomEvent});
  const {initTheme} = await import('../source/atelier/js/theme.js');
  let saved='light', eventCount=0;
  document.addEventListener('atelier:theme',()=>eventCount++);
  const storage={get:()=>saved,set:(key,value)=>{saved=value;return true;}};
  try {
    initTheme({storage});
    const [header,footer]=document.querySelectorAll('[data-theme-toggle]');
    assert.ok(document.body.classList.contains('light'));
    assert.equal(header.getAttribute('aria-checked'),'true');
    header.click();
    assert.equal(saved,'dark');
    assert.ok(document.body.classList.contains('dark-mode'));
    assert.equal(footer.getAttribute('aria-checked'),'false');
    footer.click();
    assert.equal(header.getAttribute('aria-checked'),'true');
    saved='dark';
    window.dispatchEvent(new window.StorageEvent('storage',{key:'cc-theme',newValue:'dark'}));
    assert.equal(header.getAttribute('aria-checked'),'false');
    storage.set=()=>false;
    header.click();
    assert.ok(document.body.classList.contains('light'));
    assert.equal(eventCount,5);
    assert.equal(document.documentElement.style.colorScheme,'light');
  } finally { dom.window.close(); }
});
