const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ejs = require('ejs');
const yaml = require('js-yaml');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const helpers = {};
vm.runInNewContext(read('scripts/nijika.js'), {require, hexo: {extend: {
  helper: {register: (name, fn) => { helpers[name] = fn; }},
  filter: {register() {}}, generator: {register() {}}
}}});

// Render only these templates in memory: no shared public/ or Hexo state writes.
function render(name, prefix = '/', writing = []) {
  const context = {
    theme: yaml.load(read('_config.redefine.yml')),
    url_for: value => prefix + String(value).replace(/^\//, ''),
    nijika_writing: () => writing,
    date: () => '2026.10.10', date_xml: () => '2026-10-10',
    partial: name => read(`custom/redefine/${name}.ejs`)
  };
  context.nijika_art_srcset = helpers.nijika_art_srcset.bind(context);
  return new JSDOM(ejs.render(read(`custom/redefine/nijika/${name}.ejs`), context));
}

for (const prefix of ['/', '/lab/']) {
  test(`hub exposes four real destinations and direct rehearsal without JavaScript (${prefix})`, () => {
    const dom = render('stage', prefix);
    try {
      const doc = dom.window.document;
      const cards = [...doc.querySelectorAll('.hub-card')];
      assert.deepEqual(cards.map(a => a.getAttribute('href')), ['notes/', 'studio/', 'research/', 'projects/'].map(route => prefix + route));
      assert.equal(doc.querySelectorAll('h1').length, 1);
      const studio = doc.querySelector('.hub-studio');
      assert.equal(studio.querySelector('h2').textContent, '节奏实验室');
      assert.equal(studio.querySelector('.hub-practice').getAttribute('href'), prefix + 'studio/practice/');
      assert.deepEqual([...doc.querySelectorAll('.hub-secondary a')].map(a => a.getAttribute('href')), [prefix + 'life/', prefix + 'about/']);
      assert.equal(doc.querySelectorAll('a a,script,[hidden],a[tabindex="-1"]').length, 0);
      for (const card of cards) {
        const img = card.querySelector('img');
        assert.ok(img.alt.trim());
        assert.ok(fs.existsSync(path.join(root, 'source', img.getAttribute('src').slice(prefix.length))));
      }
      const art = studio.querySelector('img');
      assert.match(art.getAttribute('src'), /\/v3\/hero\.webp$/);
      assert.equal(art.width, 1916);
      assert.equal(art.height, 821);
      assert.equal(art.getAttribute('srcset'), `${prefix}atelier/images/v3/hero-960.webp 960w, ${prefix}atelier/images/v3/hero.webp 1916w`);
    } finally { dom.window.close(); }
  });

  test(`life keeps its honest empty state with two working native exits (${prefix})`, () => {
    const dom = render('life', prefix);
    try {
      const doc = dom.window.document;
      assert.equal(doc.querySelector('.scene-state').textContent, '相册尚未发布');
      assert.equal(doc.querySelectorAll('p').length, 1);
      assert.equal(doc.querySelectorAll('img').length, 1);
      assert.deepEqual([...doc.querySelectorAll('.life-paths a')].map(a => a.getAttribute('href')), [prefix + 'notes/', prefix + 'studio/practice/']);
      assert.equal(doc.querySelectorAll('script,[hidden],a[tabindex="-1"]').length, 0);
    } finally { dom.window.close(); }
  });
}

test('hub retains the real latest article instead of inventing content', () => {
  const dom = render('stage', '/', [{title:'真实笔记 <example>', path:'notes/example/', date:'2026-10-10'}]);
  try {
    const doc = dom.window.document;
    assert.equal(doc.querySelector('.hub-writing p').textContent, '真实笔记 <example>');
    assert.equal(doc.querySelector('.hub-recent a').getAttribute('href'), '/notes/example/');
    assert.equal(doc.querySelectorAll('example').length, 0);
  } finally { dom.window.close(); }
});

test('navigation styles parse and retain mobile, focus and theme-aware safeguards', () => {
  const hub = read('source/atelier/css/immersive.css');
  const rooms = read('source/atelier/css/rooms-v2.css');
  const dom = new JSDOM(`<style>${hub}\n${rooms}</style>`);
  try {
    assert.ok(dom.window.document.styleSheets[0].cssRules.length > 100);
    assert.match(hub, /\.hub-v3 a:focus-visible\s*\{outline:2px solid var\(--yellow\)/);
    assert.match(hub, /\.hub-v3 a\[data-reveal\]:focus-visible \{clip-path:none;opacity:1;transform:none\}/);
    assert.match(hub, /@media\(max-width:600px\)[\s\S]*\.hub-studio \{margin:0 0 32px\}/);
    assert.match(hub, /\.hub-studio \.hub-card>img \{aspect-ratio:1\.52;object-position:75% center\}/);
    assert.match(hub, /\.hub-secondary>a[^}]*min-height:44px[^}]*color:var\(--text\)/);
    assert.match(rooms, /\.life-paths \{display:flex;flex-wrap:wrap/);
    assert.match(rooms, /\.atelier-room a:focus-visible/);
  } finally { dom.window.close(); }
});
