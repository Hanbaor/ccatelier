const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const {JSDOM} = require('jsdom');

function setup(t, failure) {
  const dom = new JSDOM(`<body data-section="lounge"><span data-pass-id></span><span data-pass-date></span>
    <span data-pass-stamp="notes">Notes</span><span data-pass-stamp="lounge">Lounge</span>
    <button data-download-ticket>Download</button></body>`);
  t.after(() => dom.window.close());
  const {window} = dom, {document} = window;
  const errors = [], messages = [], blobs = [], revoked = [], downloads = [], timers = [];
  const saved = new Map([['cc-pass', JSON.stringify({id:'ABC123', date:'2026-10-11', stamps:['notes','lounge']})], ['cc-light','moon']]);
  let fail = true;
  const reject = stage => {if (fail && failure === stage) throw Error(stage + ' unavailable');};
  window.addEventListener('error', event => {errors.push(event.error); event.preventDefault();});
  const create = document.createElement.bind(document), append = document.body.append.bind(document.body);
  document.createElement = tag => {if (tag === 'a') reject('anchor'); return create(tag);};
  document.body.append = element => {append(element); reject('append');};
  window.HTMLAnchorElement.prototype.click = function() {reject('click'); downloads.push({name:this.download, url:this.href});};
  const context = vm.createContext({document, Date,
    $: selector => document.querySelector(selector), $$: selector => [...document.querySelectorAll(selector)],
    storage: {get: key => saved.get(key), set: (key, value) => saved.set(key, value)},
    toast: message => messages.push(message),
    Blob: class extends Blob {constructor(parts, options) {reject('blob'); super(parts, options);}},
    URL: {
      createObjectURL(blob) {reject('url'); blobs.push(blob); return 'blob:ticket-' + blobs.length;},
      revokeObjectURL(url) {revoked.push(url);}
    },
    setTimeout(callback, delay) {timers.push({callback, delay});}
  });
  const source = fs.readFileSync(path.join(__dirname, '../source/atelier/js/after-hours.js'), 'utf8');
  const passport = source.split('function passport() {')[1].split('\nfunction focusTimer()')[0];
  vm.runInContext(`function passport() {${passport}\npassport();`, context);
  return {document, errors, messages, blobs, revoked, downloads, timers, saved,
    click: () => document.querySelector('[data-download-ticket]').click(), recover: () => {fail = false;}};
}

for (const failure of ['blob','url','anchor','append','click']) test(`ticket export recovers from ${failure} failure without leaking or changing settings`, async t => {
  const s = setup(t, failure), before = [...s.saved];
  s.click();
  assert.deepEqual(s.errors, [], 'export failures should not escape the click handler');
  assert.match(s.messages.at(-1), /未能.*重试/);
  assert.equal(s.messages.length, 1);
  assert.equal(s.document.querySelector('a'), null);
  assert.deepEqual(s.revoked, ['anchor','append','click'].includes(failure) ? ['blob:ticket-1'] : []);
  assert.equal(s.timers.length, 0, 'failed requests release resources immediately');
  assert.equal(s.downloads.length, 0);
  assert.deepEqual([...s.saved], before);
  s.recover();
  s.click();
  assert.equal(s.downloads.length, 1);
  assert.equal(s.downloads[0].name, 'CC-Atelier-Ticket-ABC123.svg');
  assert.match(s.messages.at(-1), /已请求下载/);
  assert.equal(s.document.querySelector('a'), null);
  assert.deepEqual([...s.saved], before);
  assert.equal(s.timers.length, 1);
  assert.equal(s.timers[0].delay, 30000);
  assert.ok(!s.revoked.includes(s.downloads[0].url), 'successful requests keep the existing download grace period');
  s.timers[0].callback();
  assert.equal(s.revoked.at(-1), s.downloads[0].url);
  assert.equal(s.blobs.at(-1).type, 'image/svg+xml');
  // Baseline SVG bytes for the fixed passport above, before the recovery fix.
  assert.equal(createHash('sha256').update(await s.blobs.at(-1).text()).digest('hex'), '5c935aa9576d3f12e81849c41fbca86dc32f08ab3d9429877d86ef7958bb0459');
  assert.deepEqual(s.errors, []);
});

test('repeated ticket download requests remove each anchor and release each URL independently', t => {
  const s = setup(t);
  s.click(); s.click();
  assert.equal(s.downloads.length, 2);
  assert.equal(s.messages.length, 2);
  assert.ok(s.messages.every(message => /已请求下载/.test(message)));
  assert.equal(s.document.querySelector('a'), null);
  assert.deepEqual(s.revoked, []);
  for (const timer of s.timers) timer.callback();
  assert.deepEqual(s.revoked, ['blob:ticket-1','blob:ticket-2']);
  assert.deepEqual(s.errors, []);
});
