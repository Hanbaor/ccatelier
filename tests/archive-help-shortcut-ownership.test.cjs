const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {pathToFileURL} = require('node:url');
const repo = process.env.REPO_ROOT || path.resolve(__dirname, '..');
const {JSDOM} = createRequire(path.join(repo, 'package.json'))('jsdom');
async function fixture(t, feature) {
  const dom = new JSDOM('<body><button id="owner">Owner</button><section data-archive><div class="archive-fallback"><a href="/entry/">Static entry</a></div><div class="archive-app" hidden><form class="archive-search"><input id="archive-q"><button type="reset">Reset</button></form><p data-archive-count></p><select data-tag></select><select data-duration><option value="all">All</option></select><select id="archive-sort"><option value="newest">Newest</option></select><div class="archive-filter-tags"></div><div class="constellation"></div><div data-archive-results></div><button data-archive-more>More</button></div></section><input id="field"><textarea></textarea><select><option>x</option></select><div contenteditable="true" tabindex="0"><span tabindex="0">Editable child</span></div><div contenteditable="" tabindex="0"><span tabindex="0">Empty editable child</span></div><div contenteditable="plaintext-only" tabindex="0"><span tabindex="0">Plaintext editable child</span></div><dialog><button>Dialog control</button></dialog></body>', {url: 'https://ccatelier.test/notes/'});
  const {window} = dom, document = window.document, $ = (selector, root = document) => root.querySelector(selector);
  const sourcePath = process.env[feature === 'archive' ? 'ARCHIVE_SOURCE' : 'AFTER_HOURS_SOURCE'] || path.join(repo, 'source/atelier/js', feature === 'archive' ? 'archive.js' : 'after-hours.js');
  const source = fs.readFileSync(sourcePath, 'utf8');
  let opens = 0;
  const context = {document, window, location: window.location, history: window.history, URL, setTimeout, clearTimeout, queueMicrotask, $, $$: (selector, root = document) => [...root.querySelectorAll(selector)],
    input: $('#archive-q'), app: $('.archive-app'),
    storage: {persistent: true, get: key => key === 'cc-pass' ? JSON.stringify({id: 'ABC123', date: '2026-10-11', stamps: []}) : null, set() {}},
    openDialog(id) {
      assert.equal(id, 'help-dialog'); opens++; $('dialog').open = true; $('dialog button').focus();
    }};
  if (feature === 'archive') {
    // Run complete Archive initialization and first render with actual query,
    // reading-context and DOM helper code. Only the data/storage boundaries are
    // stubbed; the native Worker is absent, exercising the built-in fallback.
    Object.assign(context,
      await import(pathToFileURL(path.join(repo, 'source/atelier/js/archive-core.mjs'))),
      await import(pathToFileURL(path.join(repo, 'source/atelier/js/reading-context.mjs'))), {
        loadArchive: async () => [{path: '/entry/', title: 'Fixture entry', group: 'writing', tags: ['fixture'], date: '2026-10-11', minutes: 2, excerpt: 'Fixture text'}],
        shelves: {read: () => ({items: []})}, getQueue: () => [], toast() {}
      });
    const helpers = fs.readFileSync(path.join(repo, 'source/atelier/js/archive-store.js'), 'utf8').split('\n')
      .filter(line => /^export function (element|action)\(/.test(line)).join('\n').replaceAll('export ', '');
    const executable = source.replace(/^import .*\n/gm, '').replace('export async function initArchive', 'async function initArchive')
      .replaceAll('import.meta.url', JSON.stringify(pathToFileURL(sourcePath).href));
    const init = vm.runInNewContext(helpers + '\n' + executable + '\ninitArchive;', context);
    await init();
    assert.equal($('.archive-app').hidden, false, 'complete first render activates Archive');
    assert.equal($('.archive-fallback').hidden, true);
    assert.ok($('[data-archive-results] h2 a'), 'real renderer produced the fixture article');
  } else {
    // Run the real Help initialization, with absent optional page widgets and
    // a memory-only storage stub, after substituting imported dependencies.
    vm.runInNewContext(source.replace(/^import .*\n/gm, '').replace('export function initAfterHours', 'function initAfterHours') + ';initAfterHours();', context);
  }
  t.after(() => {window.dispatchEvent(new window.Event('pagehide')); dom.window.close();});
  const owner = $('#owner'); owner.focus();
  function key(target = owner, init = {}, handled = false) {
    const event = new window.KeyboardEvent('keydown', {key: feature === 'archive' ? '/' : '?', bubbles: true, cancelable: true, ...init});
    if (handled) target.addEventListener('keydown', e => e.preventDefault(), {once: true});
    target.dispatchEvent(event); return event;
  }
  return {$, document, owner, key, opens: () => opens};
}
for (const feature of ['archive', 'help']) {
  for (const reason of ['handled', 'repeat', 'isComposing', 'keyCode', 'altKey', 'ctrlKey', 'metaKey', 'modifierAltGraph']) {
    test(`${feature}: ${reason} keeps existing keyboard ownership`, async t => {
      const f = await fixture(t, feature);
      const init = reason === 'handled' ? {} : {[reason]: reason === 'keyCode' ? 229 : true};
      const event = f.key(f.owner, init, reason === 'handled');
      assert.equal(f.document.activeElement, f.owner);
      assert.equal(f.opens(), 0);
      assert.equal(event.defaultPrevented, reason === 'handled');
    });
  }
  for (const shiftKey of [false, true]) test(`${feature}: intentional shortcut with Shift=${shiftKey} still works`, async t => {
    const f = await fixture(t, feature), event = f.key(f.owner, {shiftKey});
    assert.equal(event.defaultPrevented, true);
    assert.equal(f.document.activeElement, f.$(feature === 'archive' ? '#archive-q' : 'dialog button'));
    assert.equal(f.opens(), feature === 'archive' ? 0 : 1);
  });
  for (const selector of ['#field', 'textarea', 'select', '[contenteditable]', '[contenteditable] span', '[contenteditable=""]', '[contenteditable=""] span', '[contenteditable="plaintext-only"]', '[contenteditable="plaintext-only"] span']) {
    test(`${feature}: existing editable guard retains ${selector} focus`, async t => {
      const f = await fixture(t, feature), owner = f.$(selector); owner.focus();
      const event = f.key(owner);
      assert.equal(f.document.activeElement, owner); assert.equal(event.defaultPrevented, false); assert.equal(f.opens(), 0);
    });
  }
  test(`${feature}: existing open-dialog guard retains dialog focus`, async t => {
    const f = await fixture(t, feature); f.$('dialog').open = true; const owner = f.$('dialog button'); owner.focus();
    const event = f.key(owner);
    assert.equal(f.document.activeElement, owner); assert.equal(event.defaultPrevented, false); assert.equal(f.opens(), 0);
  });
  test(`${feature}: unrelated key remains untouched`, async t => {
    const f = await fixture(t, feature), event = f.key(f.owner, {key: 'x'});
    assert.equal(f.document.activeElement, f.owner); assert.equal(event.defaultPrevented, false); assert.equal(f.opens(), 0);
  });
}
test('archive: existing hidden-app guard remains intact', async t => {
  const f = await fixture(t, 'archive'); f.$('.archive-app').hidden = true; const event = f.key();
  assert.equal(f.document.activeElement, f.owner); assert.equal(event.defaultPrevented, false);
});
