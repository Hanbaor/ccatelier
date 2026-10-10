const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = route => fs.readFileSync(path.join(root, 'public', route), 'utf8');

test('editorial styles load after refinements and quick navigation identifies the active section', () => {
  for (const route of ['index.html', 'atelier/index.html', 'notes/index.html', 'lounge/index.html', 'studio/index.html', 'about/index.html']) {
    const dom = new JSDOM(read(route));
    try {
      const styles = [...dom.window.document.querySelectorAll('link[rel="stylesheet"]')].filter(style => !['/livehouse.css','/navigation-scenes.css','/practice.css','/content-catalog.css'].some(name => style.href.endsWith(name)));
      assert.match(styles.at(-1).getAttribute('href'), /atelier\/css\/immersive\.css$/);
      assert.match(styles.at(-2).getAttribute('href'), /atelier\/css\/rooms-v2\.css$/);
      assert.ok(styles.some(style=>style.href.endsWith('/refinement.css')));
      assert.ok(JSON.parse(read('atelier/data/offline-shell.json')).includes('/atelier/css/refinement.css'));
      const nav = dom.window.document.querySelector('nav.header-navigation');
      assert.equal(nav.getAttribute('aria-label'), '快捷导航');
      assert.deepEqual([...nav.querySelectorAll('a')].map(link => ({label:link.textContent.trim(),href:link.getAttribute('href')})), [
        {label:'创作室',href:'/atelier/'}, {label:'笔记',href:'/notes/'},
        {label:'音乐',href:'/studio/'}, {label:'项目',href:'/projects/'}, {label:'研究',href:'/research/'}
      ]);
      const active = [...nav.querySelectorAll('[aria-current="page"]')];
      if (['atelier/index.html','notes/index.html','studio/index.html'].includes(route)) {
        assert.equal(active.length, 1);
        assert.equal(active[0].getAttribute('href'), '/' + route.replace('index.html',''));
      } else {
        assert.equal(active.length, 0, 'cover and secondary rooms do not highlight an unrelated primary section');
      }
    } finally {dom.window.close();}
  }
});

test('article title and tools precede optional panels and retain an accessible article name', () => {
  for (const route of ['2026/09/22/Hello-CC-Atelier/index.html', 'hot100/036/index.html']) {
    const dom = new JSDOM(read(route));
    try {
      const doc = dom.window.document;
      const columns = doc.querySelector('.reader-columns');
      assert.ok(columns.firstElementChild.classList.contains('reader-frontmatter'));
      assert.ok(columns.firstElementChild.querySelector('[data-article-tools]'));
      assert.equal(doc.querySelector('.reader-paper').getAttribute('aria-labelledby'), 'article-title');
      assert.equal(doc.querySelectorAll('#article-title').length, 1);
      assert.ok(doc.querySelector('.reader-paper .article-body'));
      assert.ok(doc.querySelector('.reader-paper .reader-options [data-reader-size]'));
    } finally {dom.window.close();}
  }
});

test('refinement stylesheet parses and preserves reduced-motion and focus-mode safeguards', () => {
  const css = fs.readFileSync(path.join(root, 'source/atelier/css/refinement.css'), 'utf8');
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
  try {
    const style = dom.window.document.createElement('style');
    style.textContent = css;
    dom.window.document.head.append(style);
    assert.ok(style.sheet.cssRules.length > 100, 'stylesheet should parse into rules');
    assert.match(css, /\.reading-focused \.reader-frontmatter\s*\{display:contents\}/);
    assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
    assert.match(css, /@media print/);
    assert.match(css, /\.archive-results\s*\{grid-template-columns:1fr;gap:16px\}/);
  } finally {dom.window.close();}
});

test('small-screen readers start with optional panels collapsed and controls still work', async () => {
  const dom = new JSDOM(read('hot100/036/index.html'), {url:'https://ccatelier.test/hot100/036/'});
  const {window} = dom;
  Object.assign(globalThis, {window,document:window.document,location:window.location,localStorage:window.localStorage,innerHeight:844,
    matchMedia:query=>({matches:query === '(max-width:1000px)',addEventListener(){}}),requestAnimationFrame:()=>0,cancelAnimationFrame(){}});
  try {
    const {initReader} = await import('../source/atelier/js/reader.js');
    initReader();
    assert.equal(document.querySelector('.chapter-rail details').open, false);
    assert.equal(document.querySelector('.reader-options').open, false);
    const shortcut = document.querySelector('[data-reader-size-cycle]');
    shortcut.click();
    assert.equal(document.querySelector('[data-reader-size]').value,'19');
    assert.equal(document.querySelector('.reading-studio').style.getPropertyValue('--reader-size'),'19px');
  } finally {window.dispatchEvent(new window.Event('pagehide'));window.close();}
});
