const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
// Copy unchanged into tests/. The staging run can override the repository root.
const root = process.env.LIVEHOUSE_LAYOUT_ROOT || path.resolve(__dirname, '..');
const {JSDOM} = require('node:module').createRequire(path.join(root, 'package.json'))('jsdom');
const source = relative => path.join(root, relative);
const css = fs.readFileSync(process.env.LIVEHOUSE_LAYOUT_CSS || source('source/atelier/css/livehouse.css'), 'utf8');

test('Director title wraps unbroken imported text without changing its established presentation', () => {
  const rule = css.match(/\.live-director p\.director-project-title\s*\{([^}]+)\}/)?.[1];
  assert.ok(rule);
  assert.match(rule, /overflow-wrap\s*:\s*anywhere\b/);
  assert.match(rule, /color\s*:\s*#e8d3aa\b/);
  assert.match(rule, /font\s*:\s*500 13px var\(--chinese\)/);
  assert.match(rule, /margin\s*:\s*0 0 14px/);
  assert.match(rule, /letter-spacing\s*:\s*\.03em/);
  assert.doesNotMatch(rule, /text-overflow|white-space\s*:\s*nowrap|word-break\s*:\s*break-all/);
});

for (const [kind, title] of [['short', 'After the last light · 原创现场'], ['Chinese', '虹夏'.repeat(40)], ['Latin', 'W'.repeat(80)], ['emoji', '🥁'.repeat(40)]]) {
  test('real Director import preserves complete '+kind+' title and keyboard focus', async t => {
    const dom = new JSDOM('<dialog open><details class="live-director" open data-live-director><summary><span></span></summary><div data-director-body></div></details></dialog>', {url:'https://ccatelier.test/'});
    const {window} = dom, {document} = window;
    const previous = new Map(['window','document','matchMedia'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis,key)]));
    Object.defineProperty(globalThis,'matchMedia',{configurable:true,writable:true,value:()=>({matches:true,addEventListener(){}})});
    Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:window});
    Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:document});
    t.after(() => {window.close();for(const [key, descriptor] of previous) if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
    const errors=[];window.addEventListener('error',event=>{errors.push(event.error);event.preventDefault();});
    const {originalPerformance,validatePerformance} = await import(pathToFileURL(source('source/atelier/js/performance-core.mjs')));
    const {initDirector} = await import(pathToFileURL(source('source/atelier/js/livehouse-director.js')));
    let project=originalPerformance();const imported={...structuredClone(project),title};
    assert.equal(validatePerformance(imported).title,title);
    const dialog=document.querySelector('dialog');
    initDirector({dialog,getProject:()=>project,change:value=>{project=value;},seek(){}});
    const focused=dialog.querySelector('[data-drum="snare"][data-step="11"]');focused.focus();
    const input=dialog.querySelector('input[type=file]'),raw=JSON.stringify(imported);
    Object.defineProperty(input,'files',{configurable:true,value:[{size:Buffer.byteLength(raw),text:async()=>raw}]});
    input.dispatchEvent(new window.Event('change'));
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(project.title,title);
    const displayed=dialog.querySelector('.live-director p.director-project-title');
    assert.equal(displayed.textContent,title);
    assert.equal(displayed.childElementCount,0,'plain text, without truncation or injected markup');
    assert.equal(document.activeElement.dataset.drum,'snare');assert.equal(document.activeElement.dataset.step,'11');
    assert.equal(dialog.querySelectorAll('.director-drum-grid button[tabindex="0"]').length,1);
    assert.deepEqual(errors,[]);
  });
}
