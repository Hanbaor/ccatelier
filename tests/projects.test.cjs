const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const {JSDOM} = require('jsdom');
const repo = path.resolve(__dirname, '..');
const output = path.resolve(repo, process.env.PROJECTS_PUBLIC_DIR || 'public');
const prefix = process.env.PROJECTS_ROOT || '/';
const read = file => fs.readFileSync(path.join(repo, file), 'utf8');
const built = route => fs.readFileSync(path.join(output, route), 'utf8');
const sourceRevision = '0f0ca188521f991b726eb132b3b131921c63c253';
const sourcePrefix = `https://github.com/Hanbaor/ccatelier/blob/${sourceRevision}/`;
function projects() {return new JSDOM(built('projects/index.html'), {url:`https://ccatelier.test${prefix}projects/`});}

test('projects presents one illustrated work and keeps technical evidence behind a native disclosure', () => {
  const dom = projects();
  try {
    const doc = dom.window.document, room = doc.querySelector('.project-case');
    assert.ok(room);
    assert.equal(room.querySelectorAll('h1').length, 1);
    assert.equal(room.querySelector('h1').textContent, 'CC Atelier');
    assert.ok(room.querySelector('.project-summary .project-description'));
    assert.equal(room.querySelectorAll(':scope > section').length, 1);
    const implementation = room.querySelector(':scope > details.project-implementation');
    assert.ok(implementation);
    assert.equal(implementation.open, false);
    assert.ok(implementation.querySelector('summary'));
    assert.equal(implementation.querySelectorAll(':scope > section').length, 2);
    assert.equal(room.querySelectorAll('.project-layers > li').length, 3);
    assert.equal(room.querySelectorAll('.project-decision-list > li').length, 3);
    assert.equal(room.querySelectorAll('img').length, 1);
    assert.equal(room.querySelectorAll('svg.editorial-arrow').length, 9, 'link arrows use the existing font-independent SVG');
    assert.doesNotMatch(room.textContent, /↗/);
    assert.ok(room.querySelector('img[src$="/atelier/images/v3/projects.webp"]'));
    assert.match(room.querySelector('img').alt, /主题插画/);
    assert.equal(room.querySelectorAll('script, iframe, canvas, button, [hidden], [data-reveal]').length, 0);
    assert.doesNotMatch(room.textContent, /建设中|整理中|安全可靠|高并发|零延迟/);
    for (const section of room.querySelectorAll('section')) assert.ok(doc.getElementById(section.getAttribute('aria-labelledby')));
    assert.match(room.querySelector('.project-boundary').textContent, /当前浏览器.*存储受限.*主动保存.*独立部署后端/);
    assert.match(room.querySelector('.project-instruction').textContent, /Service Worker.*HTTPS.*localhost/);
  } finally {dom.window.close();}
});

test('each engineering decision links a real demo and immutable, locally present source files', () => {
  const dom = projects();
  try {
    const room = dom.window.document.querySelector('.project-case');
    for (const row of room.querySelectorAll('.project-decision-list > li')) {
      const demo = row.querySelector('.project-evidence > a');
      assert.ok(demo.getAttribute('href').startsWith(prefix));
      assert.ok(row.querySelector('.project-source-links a'));
    }
    const sources = [...room.querySelectorAll('a')].filter(a=>a.href.startsWith(sourcePrefix));
    assert.equal(sources.length, 6);
    for (const a of sources) {
      const relative = a.href.slice(sourcePrefix.length).split('#')[0];
      assert.ok(fs.existsSync(path.join(repo, relative)), relative);
      assert.match(a.rel, /noopener/);
      assert.match(a.rel, /noreferrer/);
    }
    for (const a of room.querySelectorAll('a[href^="/"]')) {
      const url = new URL(a.href);
      assert.ok(url.pathname.startsWith(prefix));
      assert.equal(url.hash, '', 'demos do not invent fragment targets');
      const relative = decodeURIComponent(url.pathname.slice(prefix.length));
      assert.ok(fs.existsSync(path.join(output, relative, 'index.html')), relative);
    }
    const notes = [...room.querySelectorAll('.project-reading a')].map(a=>new URL(a.href).pathname);
    assert.deepEqual(notes, ['154834561','124387071','124460411'].map(id=>`${prefix}writing/csdn-${id}/`));
  } finally {dom.window.close();}
});

test('shared STL demo query resolves to substantive writing using the real query core', async () => {
  const {readQuery, queryArchive} = await import('../source/atelier/js/archive-core.mjs');
  const dom = projects();
  try {
    const link = dom.window.document.querySelector('.project-evidence a[href*="?q="]');
    const query = readQuery(new URL(link.href).search);
    assert.equal(query.q, 'STL');assert.equal(query.group, 'writing');assert.equal(query.sort, 'oldest');
    const {posts} = JSON.parse(built('atelier/data/archive.json'));
    const matches = queryArchive(posts, query);
    assert.ok(matches.some(p=>p.path === `${prefix}writing/csdn-124387071/`));
    assert.ok(matches.some(p=>p.path === `${prefix}writing/csdn-124460411/`));
    assert.ok(matches.every(p=>p.group === 'writing'));
  } finally {dom.window.close();}
});

test('projects alone loads its stylesheet and has route-specific descriptive metadata', () => {
  const dom = projects();
  try {
    const doc = dom.window.document;
    assert.equal(doc.querySelectorAll(`link[href="${prefix}atelier/css/projects.css"]`).length, 1);
    assert.match(doc.querySelector('meta[name="description"]').content, /Hexo 静态路由.*全文检索.*离线快照/);
    assert.equal(doc.querySelector('meta[property="og:description"]').content, doc.querySelector('meta[name="description"]').content);
    for (const route of ['notes','research','about','studio/practice']) {
      assert.doesNotMatch(built(route+'/index.html'), /atelier\/css\/projects\.css/);
    }
    assert.ok(JSON.parse(built('atelier/data/offline-shell.json')).includes(prefix+'atelier/css/projects.css'));
  } finally {dom.window.close();}
});

test('the standalone case-study template preserves root prefixes for every internal asset and demo', () => {
  for (const base of ['/', '/lab/']) {
    const html = ejs.render(read('custom/redefine/nijika/projects.ejs'), {
      url_for: route=>base+route.replace(/^\//,''),
      partial: name=>read('custom/redefine/'+name+'.ejs')
    });
    const dom = new JSDOM(html, {url:'https://ccatelier.test'+base+'projects/'});
    try {
      const doc = dom.window.document;
      for (const element of doc.querySelectorAll('a[href^="/"],img[src]')) {
        assert.ok((element.getAttribute('href') || element.getAttribute('src')).startsWith(base));
      }
      for (const candidate of doc.querySelector('img').getAttribute('srcset').split(',')) assert.ok(candidate.trim().startsWith(base));
      assert.equal(doc.querySelectorAll('script').length, 0);
    } finally {dom.window.close();}
  }
});

test('projects CSS is isolated, uses theme tokens and keyboard focus, and has small-screen and print rules', () => {
  const css = read('source/atelier/css/projects.css');
  const dom = new JSDOM('<style>'+css+'</style>');
  try {
    const rules = dom.window.document.styleSheets[0].cssRules;
    assert.ok(rules.length > 40);
    function check(rules) {for (const rule of rules) {
      if (rule.cssRules) check(rule.cssRules);
      else assert.ok(rule.selectorText.split(',').every(selector=>selector.trim().startsWith('.project-')), rule.selectorText);
    }}
    check(rules);
    assert.match(css, /:focus-visible/);
    assert.match(css, /var\(--bg\)/);assert.match(css, /var\(--text\)/);
    assert.match(css, /@media\(max-width:760px\)/);
    assert.match(css, /@media\(max-width:380px\)/);
    assert.match(css, /@media print/);
    assert.doesNotMatch(css, /animation:|opacity:0|visibility:hidden/);
  } finally {dom.window.close();}
});

test('project action hover uses paired accent tokens with AA contrast in both themes', () => {
  const css=read('source/atelier/css/projects.css');
  const hover=[...css.matchAll(/\.project-actions \.room-action:hover\s*\{([^}]+)\}/g)].map(match=>match[1]).join(';');
  assert.match(hover,/background:var\(--accent\)/);
  assert.match(hover,/border-color:var\(--accent\)/);
  assert.match(hover,/color:var\(--accent-ink\)/);
  assert.doesNotMatch(hover, /var\(--yellow\)|color:\s*#/);
  const foundation=read('source/atelier/css/immersive.css');
  const pairs=[...foundation.matchAll(/--accent:(#[\da-f]{6});--accent-ink:(#[\da-f]{6})/gi)];
  assert.equal(pairs.length,2,'light and dark each declare the paired accent colors');
  function luminance(hex) {
    const rgb=hex.slice(1).match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);
    return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722;
  }
  for(const [,background,foreground] of pairs) {
    const values=[luminance(background),luminance(foreground)].sort((a,b)=>b-a);
    assert.ok((values[0]+0.05)/(values[1]+0.05)>=4.5,`${foreground} on ${background}`);
  }
});
