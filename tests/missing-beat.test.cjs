const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const {JSDOM} = require('jsdom');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'custom/redefine/404.ejs'), 'utf8');
const css = fs.readFileSync(path.join(root, 'source/atelier/css/missing-beat.css'), 'utf8');
const render = (prefix = '/') => new JSDOM(ejs.render(template, {url_for: value => prefix + value.replace(/^\//, '')}));

for (const prefix of ['/', '/lab/']) test(`404 has two native, prefixed recovery paths (${prefix})`, () => {
  const dom = render(prefix), d = dom.window.document;
  try {
    const section = d.querySelector('.missing-beat');
    assert.equal(d.querySelectorAll('h1').length, 1);
    assert.equal(d.getElementById(section.getAttribute('aria-labelledby')).textContent, '这一拍，走丢了。');
    assert.match(d.querySelector('.missing-beat-code').textContent, /404.*页面未找到/);
    assert.deepEqual([...section.querySelectorAll('nav a')].map(a => a.getAttribute('href')), [prefix, prefix + 'notes/']);
    assert.equal(d.querySelector('link').getAttribute('href'), prefix + 'atelier/css/missing-beat.css');
    assert.equal(d.querySelectorAll('script, input, button, [onclick], [autofocus], meta[http-equiv], a[target]').length, 0);
    assert.doesNotMatch(template, /(?:location|history|page\.(?:path|url)|setTimeout|window|document)\b/);
  } finally {dom.window.close();}
});

test('404 styles remain locally scoped, responsive, focus-visible and entirely static', () => {
  const dom = new JSDOM(`<style>${css}</style>`);
  try {
    function walk(rules) {
      for (const rule of rules) {
        if (rule.cssRules) {walk(rule.cssRules); continue;}
        assert.ok(rule.selectorText.split(',').every(selector => selector.trim().startsWith('.missing-beat ') || selector.trim().startsWith('.not-found.missing-beat')), rule.selectorText);
      }
    }
    walk(dom.window.document.styleSheets[0].cssRules);
    assert.match(css, /grid-template-columns:minmax\(0,1fr\) minmax\(0,\.85fr\)/);
    assert.match(css, /@media\(max-width:640px\)[\s\S]*grid-template-columns:minmax\(0,1fr\)/);
    assert.match(css, /width:min\(100%,260px\)/);
    assert.match(css, /width:100%;height:auto/);
    assert.match(css, /flex-wrap:wrap/);
    assert.match(css, /min-height:46px/);
    assert.match(css, /:focus-visible\s*\{outline:2px solid/);
    assert.doesNotMatch(css, /(?:animation|transition|transform|@keyframes)\s*[:{]/);
  } finally {dom.window.close();}
});

test('the original scene is passive, self-contained geometry with one missing beat', () => {
  const dom = render(), svg = dom.window.document.querySelector('svg');
  try {
    assert.equal(svg.getAttribute('viewBox'), '0 0 360 260');
    assert.equal(svg.getAttribute('aria-hidden'), 'true');
    assert.equal(svg.getAttribute('focusable'), 'false');
    assert.equal(svg.querySelectorAll('script,style,image,use,foreignObject,animate,animateTransform,a,[id],[tabindex]').length, 0);
    const beats = svg.querySelectorAll('.missing-beat-pulses circle');
    assert.equal(beats.length, 4);
    assert.equal([...beats].filter(beat => beat.getAttribute('fill') === 'none').length, 1);
    assert.equal(svg.querySelectorAll('.missing-beat-sticks path').length, 2);
  } finally {dom.window.close();}
});

// Sharp verifies actual SVG pixels. JSDOM assertions above check contracts, not browser layout.
// Final generated /404.html palette after its complete stylesheet cascade,
// including refinement/navigation-scene overrides; not the intermediate editorial.css palette.
for (const [name, bg, ink, accent, sage] of [
  ['day', '#ffffff', '#161616', '#805000', '#595959'],
  ['night', '#111114', '#f5f5f7', '#f5cf66', '#a1a1aa']
]) test(`actual ${name} SVG pixels remain inside desktop and narrow viewports`, async () => {
  const dom = render(), svg = dom.window.document.querySelector('svg');
  try {
    svg.setAttribute('color', ink);
    for (const node of svg.querySelectorAll('.missing-beat-pulses,.missing-beat-sticks')) node.setAttribute('color', accent);
    svg.querySelector('.missing-beat-wash').setAttribute('color', sage);
    svg.innerHTML = svg.innerHTML.replaceAll('var(--bg)', bg);
    const input = Buffer.from(svg.outerHTML);
    for (const width of [360, 260, 240]) {
      const {data, info} = await sharp(input).resize({width}).ensureAlpha().raw().toBuffer({resolveWithObject: true});
      let count = 0;
      for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * 4 + 3] > 32) {
          count++;
          assert.ok(x > 0 && x < info.width - 1 && y > 0 && y < info.height - 1, 'no edge clipping');
        }
      }
      assert.ok(count > width * width * .05, 'substantial nonempty artwork');
      if (width === 360) {
        const alpha = (x, y) => data[(y * info.width + x) * 4 + 3];
        assert.ok(alpha(123, 44) > 200, 'existing beat is solid');
        assert.ok(alpha(199, 44) < 40, 'missing beat is visibly hollow');
        assert.ok(alpha(203, 44) > 80, 'missing beat retains a visible ring');
      }
    }
  } finally {dom.window.close();}
});

test('generated 404 alone loads its stylesheet, which is available in the offline shell', () => {
  const publicDir = path.join(root, 'public');
  const routes = fs.readdirSync(publicDir, {recursive: true}).filter(file => file.endsWith('.html'));
  const consumers = routes.filter(route => fs.readFileSync(path.join(publicDir, route), 'utf8').includes('atelier/css/missing-beat.css'));
  assert.deepEqual(consumers, ['404.html']);
  const dom = new JSDOM(fs.readFileSync(path.join(publicDir, '404.html'), 'utf8'));
  try {
    assert.equal(dom.window.document.querySelectorAll('.missing-beat-nav a').length, 2);
    assert.equal(dom.window.document.querySelectorAll('.missing-beat-art').length, 1);
  } finally {dom.window.close();}
  const offline = JSON.parse(fs.readFileSync(path.join(publicDir, 'atelier/data/offline-shell.json'), 'utf8'));
  assert.ok(offline.some(url => url.endsWith('/atelier/css/missing-beat.css')));
  assert.equal(fs.readFileSync(path.join(publicDir, 'atelier/css/missing-beat.css'), 'utf8'), css);
});
