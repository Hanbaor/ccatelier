const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', 'source/atelier/js', file), 'utf8');

function setup(t, count = 3) {
  const dom = new JSDOM(`<body data-root="/">
    <button id="outside">Outside</button>
    <button data-reading-list-tab="saved">Saved</button>
    <button data-reading-list-tab="recent">Recent</button>
    <span data-saved-count></span><div data-reading-list></div></body>`, {url: 'https://synthetic.invalid/lounge/'});
  t.after(() => dom.window.close());
  const {document} = dom.window;
  const entries = Array.from({length: count}, (_, i) => ({path: `/post-${i}/`, title: `Post ${i}`}));
  const original = JSON.stringify(entries), disk = new Map([['cc-saved', original]]), notices = [];
  let readDenied = false, writeDenied = false;
  const context = vm.createContext({window: dom.window, document, location: dom.window.location,
    toast: message => notices.push(message),
    localStorage: {
      getItem(key) {if (readDenied) throw Error('Read denied'); return disk.get(key) ?? null;},
      setItem(key, value) {if (writeDenied) throw Error('Write denied'); disk.set(key, value);}
    }
  });
  const ui = read('ui.js').split('let toastTimer;')[0].replace(/^import[^\n]*\n/gm, '').replaceAll('export ', '');
  const state = read('reading-state.mjs').replaceAll('export ', '');
  const discovery = read('after-hours.js').replace(/^import .*;\n/gm, '').split('\nfunction passport()')[0];
  vm.runInContext(`${ui}\n${state}\nconst shelves=createShelfStore(storage);\n${discovery}\ndiscovery();`, context);
  return {document, disk, original, notices,
    buttons: () => [...document.querySelectorAll('.reading-shelf-row button')],
    denyRead: () => {readDenied = true;}, denyWrite: () => {writeDenied = true;}
  };
}

for (const [removed, expected] of [[0, 'Post 1'], [1, 'Post 2'], [2, 'Post 1']]) {
  test(`focused removal at index ${removed} moves to the next remove control or previous at the end`, t => {
    const x = setup(t), button = x.buttons()[removed];
    button.focus();button.click();
    assert.equal(x.document.activeElement.getAttribute('aria-label'), `移除收藏：${expected}`);
    assert.equal(button.isConnected, false);
    assert.equal(x.buttons().length, 2);
    assert.equal(x.document.querySelector('[data-saved-count]').textContent, '02');
  });
}

test('repeated focused removals end on the saved tab with an empty shelf', t => {
  const x = setup(t);
  x.buttons()[0].focus();
  for (let i = 0; i < 3; i++) x.document.activeElement.click();
  assert.equal(x.buttons().length, 0);
  assert.equal(x.document.activeElement, x.document.querySelector('[data-reading-list-tab="saved"]'));
  assert.equal(x.document.activeElement.getAttribute('aria-pressed'), 'true');
  assert.equal(x.document.querySelector('[data-saved-count]').textContent, '00');
  assert.ok(x.document.querySelector('.community-empty'));
});

for (const count of [1, 3]) test(`programmatic removal with ${count} entries preserves outside focus`, t => {
  const x = setup(t, count), outside = x.document.querySelector('#outside');
  outside.focus();x.buttons()[0].click();
  assert.equal(x.document.activeElement, outside);
  assert.equal(x.buttons().length, count - 1);
});

for (const failure of ['malformed', 'unsupported', 'unavailable']) test(`${failure} storage preserves the focused remove node and every row`, t => {
  const x = setup(t), buttons = x.buttons(), button = buttons[1];
  if (failure === 'unavailable') x.denyRead();
  else x.disk.set('cc-saved', failure === 'malformed' ? '{' : '{"version":2,"items":[]}');
  const raw = x.disk.get('cc-saved');
  button.focus();button.click();
  assert.equal(x.document.activeElement, button);
  assert.deepEqual(x.buttons(), buttons);
  assert.equal(x.disk.get('cc-saved'), raw);
  assert.match(x.notices.at(-1), /未作更改/);
});

test('temporary removal after write denial recovers focus and keeps the persistence warning', t => {
  const x = setup(t), button = x.buttons()[1];
  x.denyWrite();button.focus();button.click();
  assert.equal(x.document.activeElement.getAttribute('aria-label'), '移除收藏：Post 2');
  assert.equal(x.buttons().length, 2);
  assert.equal(x.disk.get('cc-saved'), x.original);
  assert.match(x.notices.at(-1), /移除仅在当前页面有效/);
});
