const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {pathToFileURL} = require('node:url');
// This test is repository-local when copied into tests/. The external review
// copy accepts REPO_ROOT and SEARCH_SOURCE without touching the checkout.
const repo = process.env.REPO_ROOT || path.resolve(__dirname, '..');
const {JSDOM} = createRequire(path.join(repo, 'package.json'))('jsdom');
const searchPath = process.env.SEARCH_SOURCE || path.join(repo, 'source/atelier/js/search.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function fixture(t) {
  const dom = new JSDOM('<body data-root="/"><button class="search-open">Search</button><input id="editor"><textarea id="textarea"></textarea><div id="editable" contenteditable="true" tabindex="0"></div><dialog id="search-dialog"><button data-close="search-dialog">Close</button><select id="search-scope"><option value="site">Site</option><option value="offline">Offline</option></select><p id="search-status"></p><input id="search-input"><div id="search-results"></div></dialog></body>', {url: 'https://ccatelier.test/'});
  const {window} = dom, document = window.document;
  await tick();
  let opens = 0, reads = 0;
  // Model only the native dialog focus-return contract. This is not native
  // browser dialog, physical keyboard, CapsLock, or OS shortcut verification.
  window.HTMLDialogElement.prototype.showModal = function() {
    this.returnTo = document.activeElement; this.open = true; opens++;
  };
  window.HTMLDialogElement.prototype.close = function() {
    this.open = false; this.returnTo?.focus();
  };
  const core = await import(pathToFileURL(path.join(repo, 'source/atelier/js/search-core.mjs')));
  const context = vm.createContext({window, document, location: window.location, CustomEvent: window.CustomEvent,
    matchMedia: () => ({matches: false, addEventListener() {}}), AbortController, setTimeout, clearTimeout,
    ...core});
  const ui = fs.readFileSync(path.join(repo, 'source/atelier/js/ui.js'), 'utf8')
    .replace(/^import .*\n/gm, '').replace(/export (const|function) /g, '$1 ');
  vm.runInContext(ui, context);
  const source = fs.readFileSync(searchPath, 'utf8').replace(/^import .*\n/gm, '').replace('export function initSearch', 'function initSearch');
  vm.runInContext(source, context);
  context.initDialogs();
  context.initSearch({loadSite: async () => {reads++; return [{title: 'needle result', content: 'needle', url: '/result/'}];},
    loadContext: async () => ({searchResultText: item => ({title: [{text: item.title}], excerpt: []})})});
  const $ = selector => document.querySelector(selector), input = $('#search-input'), dialog = $('dialog');
  input.value = 'needle';
  t.after(() => dom.window.close());
  function key(target, init = {}, handled = false) {
    const event = new window.KeyboardEvent('keydown', {key: 'k', bubbles: true, cancelable: true, ...init});
    if (handled) target.addEventListener('keydown', e => e.preventDefault(), {once: true});
    target.dispatchEvent(event); return event;
  }
  return {$, document, input, dialog, key, opens: () => opens, reads: () => reads};
}
for (const modifier of ['ctrlKey', 'metaKey']) {
  for (const keyValue of ['k', 'K']) test(`${modifier} + ${keyValue} deliberately opens from an input and retains modeled close return`, async t => {
    const f = await fixture(t), editor = f.$('#editor'); editor.focus();
    const event = f.key(editor, {[modifier]: true, key: keyValue});
    await tick();
    assert.equal(event.defaultPrevented, true); assert.equal(f.dialog.open, true);
    assert.equal(f.document.activeElement, f.input); assert.equal(f.opens(), 1); assert.equal(f.reads(), 1);
    f.$('[data-close]').click(); assert.equal(f.dialog.open, false); assert.equal(f.document.activeElement, editor);
  });
  for (const reason of ['handled', 'repeat', 'shiftKey', 'altKey', 'isComposing', 'keyCode']) {
    for (const open of [false, true]) test(`${modifier} ${reason} leaves ${open ? 'open search result' : 'closed search and editor'} ownership alone`, async t => {
      const f = await fixture(t);
      if (open) {f.$('.search-open').click(); await tick();}
      const owner = f.$(open ? '.search-result' : '#editor'); owner.focus();
      const beforeOpens = f.opens(), beforeReads = f.reads();
      const event = f.key(owner, {[modifier]: true, ...(reason === 'handled' ? {} : {[reason]: reason === 'keyCode' ? 229 : true})}, reason === 'handled');
      await tick();
      assert.equal(f.dialog.open, open, 'dialog state must be unchanged');
      assert.equal(f.opens(), beforeOpens, 'no dialog reopen');
      assert.equal(f.reads(), beforeReads, 'no extra index read');
      assert.equal(f.document.activeElement, owner, 'focus owner must be unchanged');
      assert.equal(event.defaultPrevented, reason === 'handled', 'must not newly consume ignored events');
    });
  }
}
for (const selector of ['#textarea', '#editable']) test(`plain Ctrl+K remains deliberately global from ${selector}`, async t => {
  const f = await fixture(t), editor = f.$(selector); editor.focus(); f.key(editor, {ctrlKey: true}); await tick();
  assert.equal(f.dialog.open, true); assert.equal(f.document.activeElement, f.input);
});
test('unmodified K and other Ctrl keys do not open search', async t => {
  const f = await fixture(t), editor = f.$('#editor'); editor.focus();
  assert.equal(f.key(editor).defaultPrevented, false);
  assert.equal(f.key(editor, {ctrlKey: true, key: 'j'}).defaultPrevented, false);
  assert.equal(f.opens(), 0); assert.equal(f.document.activeElement, editor);
});
test('a fresh intentional shortcut can still refocus an open search input', async t => {
  const f = await fixture(t); f.$('.search-open').click(); await tick();
  const result = f.$('.search-result'); result.focus();
  assert.equal(f.key(result, {ctrlKey: true}).defaultPrevented, true); await tick();
  assert.equal(f.document.activeElement, f.input); assert.equal(f.dialog.open, true);
});

test('search input retains text-selection chords and handled events while ordinary repeated Down still reaches results',async t=>{
 const f=await fixture(t);f.$('.search-open').click();await tick();await tick();const first=f.$('.search-result');assert.ok(first);
 for(const flag of ['handled','shiftKey','ctrlKey','metaKey','altKey','AltGraph','isComposing','keyCode']){
  f.input.focus();const event=new f.document.defaultView.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true,...(flag==='handled'||flag==='AltGraph'?{}:{[flag]:flag==='keyCode'?229:true})});
  if(flag==='handled')event.preventDefault();if(flag==='AltGraph')Object.defineProperty(event,'getModifierState',{value:name=>name==='AltGraph'});
  f.input.dispatchEvent(event);assert.equal(f.document.activeElement,f.input,flag);assert.equal(event.defaultPrevented,flag==='handled');
 }
 for(const repeat of [false,true]){f.input.focus();assert.equal(f.key(f.input,{key:'ArrowDown',repeat}).defaultPrevented,true);assert.equal(f.document.activeElement,first);}
});

test('search result navigation leaves owned events alone and retains Shift and repeated arrows',async t=>{
 const f=await fixture(t);f.$('.search-open').click();await tick();await tick();const first=f.$('.search-result');assert.ok(first);
 for(const key of ['ArrowUp','ArrowDown'])for(const flag of ['handled','isComposing','keyCode']){
  first.focus();const event=new f.document.defaultView.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...(flag==='handled'?{}:{[flag]:flag==='keyCode'?229:true})});if(flag==='handled')event.preventDefault();first.dispatchEvent(event);assert.equal(f.document.activeElement,first,key+' '+flag);assert.equal(event.defaultPrevented,flag==='handled');
 }
 for(const options of [{},{shiftKey:true},{repeat:true},{shiftKey:true,repeat:true}]){first.focus();assert.equal(f.key(first,{key:'ArrowUp',...options}).defaultPrevented,true);assert.equal(f.document.activeElement,f.input);f.key(f.input,{key:'ArrowDown'});assert.equal(f.document.activeElement,first);}
});
