const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = process.env.NIJIKA_OUTPUT || path.join(root, 'public');
const read = name => fs.readFileSync(path.join(output, name), 'utf8');

test('Redefine remains the active, pinned theme', () => {
  assert.match(fs.readFileSync(path.join(root, '_config.yml'), 'utf8'), /theme: redefine/);
  assert.equal(require('../package.json').dependencies['hexo-theme-redefine'], '2.9.0');
});

test('the entrance is separate from the real notes and article routes', () => {
  const cover = read('index.html');
  assert.match(cover, /class="[^"]*on-cover/);
  assert.match(cover, /href="[^"]*\/atelier\/"[^>]*data-enter/);
  assert.doesNotMatch(cover, /这是我的第一篇博客文章/);
  const notes = read('notes/index.html');
  assert.match(read('atelier/index.html'), /aria-label="栏目"/);
  assert.match(notes, /aria-label="笔记目录"/);
  const article = read('2026/09/22/Hello-CC-Atelier/index.html');
  assert.match(article, /这是我的第一篇博客文章/);
  assert.match(article, /class="[^"]*markdown-body/);
  assert.match(article, /<body class="[^"]*dark-mode/, 'Redefine code highlighting must match the default dark page, even before JS');
  assert.match(article, /rel="canonical"/);
  assert.match(article, /<noscript>[\s\S]*aria-label="主导航"/);
});

test('all intended sections, taxonomy and a useful 404 are generated', () => {
  for (const route of ['projects','research','life','about','archives','categories','tags']) {
    const html = read(`${route}/index.html`);
    assert.match(html, /class="[^"]*site-header/);
    assert.match(html, /<h1/);
  }
  assert.match(read('404.html'), /404/);
  assert.match(read('categories/随笔/index.html'), /Hello CC Atelier/);
  assert.match(read('tags/CC-Atelier/index.html'), /Hello CC Atelier/);
});

test('search is generated from published writing and images are existing official art', () => {
  const index = JSON.parse(read('search.json'));
  assert.ok(index.some(item => item.title === 'Hello CC Atelier'));
  assert.ok(!index.some(item => item.title === 'Hello World'));
  const cover = read('index.html');
  assert.match(cover, /atelier\/images\/ep05-3.jpg/);
  assert.doesNotMatch(cover, /stage-v4\.png|cover-v4\.png|#article/);
});

test('generated local asset references resolve', () => {
  const pages = ['index.html','notes/index.html','2026/09/22/Hello-CC-Atelier/index.html','about/index.html'];
  for (const route of pages) {
    const html = read(route);
    for (const match of html.matchAll(/<(?:script|img|link)\b[^>]*(?:src|href)="([^"#]+)"/g)) {
      const url = match[1];
      if (/^(?:https?:|data:|mailto:)/.test(url)) continue;
      const local = decodeURIComponent(url.split(/[?#]/)[0]).replace(/^\//, '');
      assert.ok(fs.existsSync(path.join(output, local)), `${route}: missing ${url}`);
    }
  }
});
