const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function page(route) {
  return new JSDOM(read(`public/${route}/index.html`), {url:`https://ccatelier.test/${route}/`});
}

test('each secondary room has a distinct art-forward opening without decorative copy stacks', () => {
  for (const route of ['research','life','projects','about','lounge','guestbook']) {
    const dom = page(route);
    try {
      const doc = dom.window.document;
      const room = doc.querySelector(`main .room-${route}`);
      assert.ok(room, `${route} has its own room composition`);
      assert.equal(room.querySelectorAll('h1').length, 1);
      assert.ok(room.querySelector('img[src*="/atelier/images/v"]'));
      assert.ok(!room.querySelector('.room-topline,.room-kicker,.room-colophon,.room-zone-heading,.room-handwriting'), 'decorative copy is removed from the DOM');
      for (const img of room.querySelectorAll('img')) assert.ok(img.alt.trim(), `${route} artwork has alt text`);
      assert.ok(!room.querySelector('.quiet-composition'), 'old placeholder composition has been replaced');
    } finally {dom.window.close();}
  }
  assert.match(read('public/research/index.html'), /Database[\s\S]*Text-to-SQL[\s\S]*教学示例/);
  assert.match(read('public/life/index.html'), /相册尚未发布/);
  assert.match(read('public/life/index.html'), /主题插画/);
  assert.match(read('public/projects/index.html'), /Hexo[\s\S]*Redefine/);
});

test('guestbook retains the guarded form, moderation disclosure and privacy warning', () => {
  const dom = page('guestbook');
  try {
    const doc = dom.window.document;
    assert.equal(doc.querySelectorAll('[data-comments]').length, 1);
    assert.ok(doc.querySelector('form[method="post"][action="/api/comments"] fieldset[data-form-guard][disabled]'));
    assert.ok(doc.querySelector('textarea[name="message"]'));
    assert.equal(doc.querySelectorAll('input[name="stamp"]').length, 4);
    assert.match(doc.querySelector('.comment-form-bottom').textContent, /审核后公开/);
    assert.match(doc.querySelector('.guestbook-rules').textContent, /昵称与留言将公开显示。请别留下电话、住址等私人信息。/);
  } finally {dom.window.close();}
});

test('redesigned lounge preserves all interaction hooks and in-page destinations', () => {
  const dom = page('lounge');
  try {
    const doc = dom.window.document;
    for (const attr of ['data-lounge','data-random-post','data-reading-list','data-reading-list-tab','data-saved-count',
      'data-pass-id','data-pass-date','data-pass-stamp','data-download-ticket','data-daily-date','data-daily-note',
      'data-copy-note','data-focus-minutes','data-focus-time','data-focus-start','data-focus-reset','data-focus-status',
      'data-stage-light','data-charm','data-charm-note','data-stat','data-stats-context','data-help-open']) {
      assert.ok(doc.querySelector(`[${attr}]`), attr);
    }
    assert.equal(doc.querySelectorAll('.room-zone-heading').length, 0);
    assert.equal(doc.querySelectorAll('[data-random-post]').length, 2);
    assert.equal(doc.querySelectorAll('[data-pass-stamp]').length, 5);
    for (const id of ['reading-shelf','ticket-desk','sound-desk']) assert.ok(doc.getElementById(id));
    assert.ok(doc.querySelector('.rhythm-open'));
    assert.ok(doc.querySelector('.pixel-stage-card[href="/studio/"]'));
  } finally {dom.window.close();}
});

test('lounge shelf, timer and atmosphere still operate after art-forward restructuring', async () => {
  const dom = page('lounge');
  const {window} = dom;
  Object.assign(globalThis, {window,document:window.document,location:window.location,localStorage:window.localStorage,
    matchMedia:()=>({matches:true,addEventListener(){}})});
  localStorage.setItem('cc-saved', JSON.stringify([{path:'/notes/example/',title:'Saved entry'}]));
  localStorage.setItem('cc-recent', JSON.stringify([{path:'/notes/recent/',title:'Recent entry'}]));
  const {initAfterHours} = await import('../source/atelier/js/after-hours.js');
  try {
    initAfterHours();
    assert.match(document.querySelector('[data-reading-list]').textContent, /Saved entry/);
    document.querySelector('[data-reading-list-tab="recent"]').click();
    assert.match(document.querySelector('[data-reading-list]').textContent, /Recent entry/);
    document.querySelector('[data-reading-list-tab="saved"]').click();
    document.querySelector('.reading-shelf-row>button').click();
    assert.equal(document.querySelector('[data-saved-count]').textContent, '00');
    document.querySelector('[data-focus-minutes="5"]').click();
    assert.equal(document.querySelector('[data-focus-time]').textContent, '05:00');
    document.querySelector('[data-focus-start]').click();
    assert.ok(document.querySelector('.focus-amp').classList.contains('timer-running'));
    document.querySelector('[data-focus-start]').click();
    assert.ok(!document.querySelector('.focus-amp').classList.contains('timer-running'));
    document.querySelector('[data-focus-reset]').click();
    assert.equal(document.querySelector('[data-focus-time]').textContent, '05:00');
    document.querySelector('[data-stage-light="moon"]').click();
    assert.equal(document.body.dataset.stageLight, 'moon');
    assert.equal(localStorage.getItem('cc-light'), 'moon');
    document.querySelector('[data-charm]').click();
    assert.match(document.querySelector('[data-charm-note]').textContent, /下一拍/);
    assert.ok(document.querySelector('[data-daily-note]').textContent.trim());
    assert.match(document.querySelector('[data-pass-id]').textContent, /^NO\. [A-F0-9]{6}$/);
    assert.ok(document.querySelector('[data-pass-stamp="lounge"]').classList.contains('stamped'));
  } finally {
    window.dispatchEvent(new window.Event('pagehide'));
    window.close();
  }
});

test('rooms stylesheet parses with mobile, daylight and reduced-motion treatments', () => {
  const css = read('source/atelier/css/rooms-v2.css');
  const dom = new JSDOM('<!doctype html><style>'+css+'</style>');
  try {
    assert.ok(dom.window.document.styleSheets[0].cssRules.length > 120);
    assert.match(css, /body\.light \.atelier-room/);
    assert.match(css, /@media\(max-width:760px\)/);
    assert.match(css, /@media\(max-width:380px\)/);
    assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  } finally {dom.window.close();}
});
