const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = route => fs.readFileSync(path.join(root, 'public', route), 'utf8');

test('editorial styles load after refinements and quick navigation identifies the active section', () => {
  for (const route of ['index.html', 'atelier/index.html', 'notes/index.html', 'lounge/index.html', 'studio/index.html', 'about/index.html', 'research/index.html']) {
    const dom = new JSDOM(read(route));
    try {
      const styles = [...dom.window.document.querySelectorAll('link[rel="stylesheet"]')].filter(style => !['/livehouse.css','/navigation-scenes.css','/practice.css','/content-catalog.css','/research-sql.css'].some(name => style.href.endsWith(name)));
      const needsIndex=['atelier/index.html','notes/index.html'].includes(route);
      const indexStyles=styles.filter(style=>style.href.endsWith('/editorial-index.css'));
      assert.equal(indexStyles.length,needsIndex?1:0,'editorial index styling stays on the two index routes');
      if(needsIndex){
        assert.equal(styles.at(-1),indexStyles[0],'route index rules load after all shared and personal composition rules');
        assert.ok(JSON.parse(read('atelier/data/offline-shell.json')).includes('/atelier/css/editorial-index.css'));
        styles.pop();
      }
      const expectedPersonal = ['index.html','atelier/index.html'].includes(route) ? 'personal-home.css' : ['about/index.html','research/index.html'].includes(route) ? 'personal-pages.css' : null;
      const personalStyles = styles.filter(style => /\/personal-(home|pages)\.css$/.test(style.href));
      assert.equal(personalStyles.length, expectedPersonal ? 1 : 0, 'only the matching personal composition is loaded');
      if (expectedPersonal) {
        assert.ok(styles.at(-1).href.endsWith('/'+expectedPersonal));
        assert.ok(JSON.parse(read('atelier/data/offline-shell.json')).includes('/atelier/css/'+expectedPersonal));
        styles.pop();
      }
      assert.match(styles.at(-1).getAttribute('href'), /atelier\/css\/immersive\.css$/);
      const needsRooms = ['lounge/index.html','about/index.html','research/index.html'].includes(route);
      assert.equal(styles.some(style=>style.href.endsWith('/rooms-v2.css')), needsRooms);
      assert.ok(styles.at(-2).href.endsWith(needsRooms ? '/rooms-v2.css' : '/editorial.css'));
      assert.ok(styles.some(style=>style.href.endsWith('/refinement.css')));
      assert.ok(JSON.parse(read('atelier/data/offline-shell.json')).includes('/atelier/css/refinement.css'));
      const nav = dom.window.document.querySelector('nav.header-navigation');
      assert.equal(nav.getAttribute('aria-label'), '快捷导航');
      assert.deepEqual([...nav.querySelectorAll('a')].map(link => ({label:link.textContent.trim(),href:link.getAttribute('href')})), [
        {label:'创作室',href:'/atelier/'}, {label:'笔记',href:'/notes/'},
        {label:'音乐',href:'/studio/'}, {label:'项目',href:'/projects/'}, {label:'研究',href:'/research/'}
      ]);
      const active = [...nav.querySelectorAll('[aria-current="page"]')];
      if (['atelier/index.html','notes/index.html','studio/index.html','research/index.html'].includes(route)) {
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
      assert.equal(columns.firstElementChild.querySelector('[data-article-tools]'),null);
      assert.ok(doc.querySelector('.reader-options [data-article-tools]'));
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
    assert.equal(document.querySelector('[data-reader-size]').value,'20');
    assert.equal(document.querySelector('.reading-studio').style.getPropertyValue('--reader-size'),'20px');
  } finally {window.dispatchEvent(new window.Event('pagehide'));window.close();}
});
