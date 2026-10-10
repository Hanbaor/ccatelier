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
    assert.equal(size(), '20px', 'one deliberate click increases by exactly one step');
    const slider = document.querySelector('[data-reader-size]');
    assert.equal(slider.value, '20');
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

test('Escape preserves focused reading while a dialog, consumed event or IME owns the key', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/hot100/036/index.html'), 'utf8');
  const dom = new JSDOM(html, {url:'https://ccatelier.test/hot100/036/'});
  const {window} = dom;
  Object.assign(globalThis, {window, document:window.document, location:window.location,
    localStorage:window.localStorage, innerHeight:900,
    matchMedia:()=>({matches:false,addEventListener(){}})});
  const {initAfterHours} = await import('../source/atelier/js/after-hours.js');
  try {
    initAfterHours();
    const focus = document.querySelector('[data-focus-reading]');
    const input = document.querySelector('#reader-find');
    const dialog = document.querySelector('#search-dialog');
    const focused = () => document.body.classList.contains('reading-focused');
    focus.click();
    assert.equal(focused(), true);
    for (const scenario of ['dialog', 'consumed', 'composition', 'legacy-ime']) {
      dialog.open = scenario === 'dialog';
      const target = dialog.open ? document.querySelector('#search-input') : input;
      const consume = event => event.preventDefault();
      if (scenario === 'consumed') target.addEventListener('keydown', consume, {once:true});
      const event = new window.KeyboardEvent('keydown', {
        key:'Escape', bubbles:true, cancelable:true,
        isComposing:scenario === 'composition', keyCode:scenario === 'legacy-ime' ? 229 : 27,
      });
      target.dispatchEvent(event);
      assert.equal(focused(), true, scenario + ' must preserve focused reading');
      assert.equal(focus.getAttribute('aria-pressed'), 'true');
      assert.equal(event.defaultPrevented, scenario === 'consumed', 'leave native key handling untouched');
    }
    dialog.open = false;
    input.dispatchEvent(new window.KeyboardEvent('keydown', {key:'Escape', bubbles:true, cancelable:true}));
    assert.equal(focused(), false, 'ordinary Escape still exits focused reading after the dialog closes');
    assert.equal(focus.getAttribute('aria-pressed'), 'false');
    assert.equal(focus.textContent, '专注阅读');
    focus.click();
    input.dispatchEvent(new window.KeyboardEvent('keydown', {key:'Enter', bubbles:true, cancelable:true}));
    assert.equal(focused(), true, 'unrelated keys do not change focused reading');
  } finally {
    window.dispatchEvent(new window.Event('pagehide'));
    window.close();
  }
});

async function speechSetup(t) {
  const html = fs.readFileSync(path.join(__dirname, '../public/hot100/036/index.html'), 'utf8');
  const dom = new JSDOM(html, {url:'https://ccatelier.test/hot100/036/'}), {window} = dom;
  const calls = [], spoken = [], queue = [];
  const synthesis = {
    paused:false,
    cancel() { calls.push(['cancel']); queue.splice(0); }, // Per API, cancel does not reset paused.
    pause() { this.paused = true; calls.push(['pause']); },
    resume() { calls.push(['resume', queue.length]); this.paused = false; },
    speak(utterance) { calls.push(['speak', this.paused]); spoken.push(utterance); queue.push(utterance); },
  };
  class Utterance { constructor(text) { this.text = text; } }
  Object.assign(window, {speechSynthesis:synthesis, SpeechSynthesisUtterance:Utterance});
  const globals = new Map();
  for (const [name,value] of Object.entries({window,document:window.document,localStorage:window.localStorage,
    NodeFilter:window.NodeFilter, speechSynthesis:synthesis, SpeechSynthesisUtterance:Utterance,
    matchMedia:()=>({matches:false}),getSelection:()=>window.getSelection()})) {
    globals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));
    Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
  }
  window.HTMLElement.prototype.scrollIntoView = () => {};
  t.after(() => {
    window.dispatchEvent(new window.Event('pagehide')); window.close();
    for (const [name,descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis,name,descriptor); else delete globalThis[name];
    }
  });
  const {initReader} = await import('../source/atelier/js/reader.js'); initReader();
  const control = name => window.document.querySelector(`[data-speech-${name}]`);
  return {window,document:window.document,synthesis,calls,spoken,queue,control};
}

for (const interruption of ['stop','restart','collapse','background','pagehide']) {
  test(`paused speech restarts after ${interruption} with only the new queue resumed (simulated)`, async t => {
    const s = await speechSetup(t), status = s.control('status');
    s.control('play').click(); const old = s.spoken[0], firstText = old.text;
    assert.ok(firstText.length); s.control('pause').click();
    assert.equal(s.synthesis.paused,true); assert.equal(s.control('pause').textContent,'继续');
    const resumes = () => s.calls.filter(c=>c[0]==='resume');
    if (interruption === 'stop') s.control('stop').click();
    if (interruption === 'collapse') {
      const details = s.document.querySelector('.reader-options');
      details.open = false; details.dispatchEvent(new s.window.Event('toggle'));
    }
    if (interruption === 'background') {
      Object.defineProperty(s.document,'hidden',{configurable:true,value:true});
      s.document.dispatchEvent(new s.window.Event('visibilitychange'));
    }
    if (interruption === 'pagehide') s.window.dispatchEvent(new s.window.Event('pagehide'));
    assert.equal(resumes().length,0,'stopping or hiding must never resume old audio');
    if (interruption !== 'restart') {
      assert.equal(s.queue.length,0); assert.equal(status.textContent,'朗读已停止。');
      old.onend(); old.onerror({error:'synthesis-failed'});
      assert.equal(s.spoken.length,1); assert.equal(status.textContent,'朗读已停止。');
    }
    if (interruption === 'background') {
      Object.defineProperty(s.document,'hidden',{configurable:true,value:false});
      s.document.dispatchEvent(new s.window.Event('visibilitychange'));
      assert.equal(resumes().length,0,'returning to the page does not autoplay');
    }
    if (interruption === 'collapse') {
      const details = s.document.querySelector('.reader-options');
      details.open = true; details.dispatchEvent(new s.window.Event('toggle'));
      assert.equal(resumes().length,0,'opening the panel does not autoplay');
    }
    s.control('play').click();
    assert.equal(s.synthesis.paused,false); assert.equal(s.spoken.length,2);
    assert.equal(s.spoken[1].text,firstText,'explicit restart begins at the start');
    assert.deepEqual(resumes(),[['resume',0]],'resume is called after the old queue is empty');
    assert.deepEqual(s.calls.slice(-3),[['cancel'],['resume',0],['speak',false]]);
    assert.equal(s.control('pause').textContent,'暂停');
    const currentStatus = status.textContent;
    old.onend(); for (const error of ['canceled','interrupted','synthesis-failed']) old.onerror({error});
    assert.equal(status.textContent,currentStatus); assert.equal(s.spoken.length,2,'stale callbacks cannot advance the new reading');
    s.spoken[1].onend(); assert.equal(s.spoken.length,3,'current callback still advances');
  });
}

test('ordinary pause/continue resumes the existing reading rather than replacing it (simulated)', async t => {
  const s = await speechSetup(t);
  s.control('play').click(); s.control('pause').click(); s.control('pause').click();
  assert.equal(s.spoken.length,1); assert.equal(s.synthesis.paused,false);
  assert.deepEqual(s.calls.slice(-2),[['pause'],['resume',1]]);
  assert.equal(s.control('pause').textContent,'暂停');
});

test('real Hexo article search and speech both omit decorative gutter numbers (simulated)', async t => {
  const s = await speechSetup(t), input = s.document.querySelector('#reader-find');
  input.value = '12'; input.dispatchEvent(new s.window.CompositionEvent('compositionend'));
  assert.equal(s.document.querySelector('[data-find-status]').textContent,'没有匹配');
  input.value = '输入：root'; input.dispatchEvent(new s.window.CompositionEvent('compositionend'));
  assert.equal(s.document.querySelector('[data-find-status]').textContent,'3 处匹配');
  s.control('play').click();
  for (let i=0; i<s.spoken.length; i++) {
    assert.ok(i<1000,'speech eventually finishes'); s.spoken[i].onend();
  }
  const {articleText} = await import('../source/atelier/js/text-anchors.js');
  const clean = articleText(s.document.querySelector('.article-body')).text;
  assert.equal(s.spoken.map(u=>u.text).join('').replace(/\s/g,''),clean.replace(/\s/g,''));
  assert.ok(!s.spoken.some(u=>u.text.includes('12输入')));
  assert.ok(s.spoken.some(u=>u.text.includes('[1,null,2,3]')),'actual numerical code is retained');
  assert.equal(s.control('status').textContent,'这一篇，读完了。');
});

test('synchronous cancel callbacks cannot advance the old speech before an explicit restart (simulated)',async t=>{
  const s=await speechSetup(t);s.control('play').click();const old=s.spoken[0];s.control('pause').click();
  const cancel=s.synthesis.cancel.bind(s.synthesis);
  s.synthesis.cancel=()=>{cancel();old.onend();old.onerror({error:'synthesis-failed'});};
  s.control('play').click();
  assert.equal(s.spoken.length,2);assert.equal(s.spoken[1].text,old.text);
  assert.equal(s.synthesis.paused,false);assert.match(s.control('status').textContent,/正在朗读 1 \/ /);
});
