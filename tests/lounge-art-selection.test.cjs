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

// Exercise the real template and helper without generating shared public/ files.
function render(prefix, source) {
  const theme = yaml.load(read('_config.redefine.yml'));
  if (source) theme.nijika.pixel_art = source;
  const context = {theme, url_for: value => prefix + String(value).replace(/^\//, '')};
  context.nijika_art_srcset = helpers.nijika_art_srcset.bind(context);
  return new JSDOM(ejs.render(read('custom/redefine/nijika/lounge.ejs'), context));
}

const sizes = '(max-width:380px) calc(100vw - 54px), (max-width:500px) calc(100vw - 58px), (max-width:760px) calc(92vw - 18px), (max-width:1100px) calc(46vw - 62px), min(531px, calc(46vw - 69px))';

for (const prefix of ['/', '/lab/']) {
  test(`lounge stage exposes both existing image candidates and preserves its controls (${prefix})`, () => {
    const dom = render(prefix);
    try {
      const doc = dom.window.document;
      const image = doc.querySelector('.pixel-stage-card img');
      assert.equal(image.getAttribute('src'), `${prefix}atelier/images/v2/stage.webp`);
      assert.equal(image.getAttribute('srcset'), `${prefix}atelier/images/v2/stage-960.webp 960w, ${prefix}atelier/images/v2/stage.webp 1672w`);
      assert.equal(image.getAttribute('sizes'), sizes);
      assert.equal(image.width, 1672);
      assert.equal(image.height, 941);
      assert.equal(image.alt, '虹夏在舞台上演奏鼓组的主题插画');
      assert.equal(image.getAttribute('loading'), 'lazy');
      assert.equal(image.hasAttribute('fetchpriority'), false);
      assert.equal(doc.querySelector('.pixel-stage-card').getAttribute('href'), `${prefix}studio/`);
      assert.ok(doc.querySelector('#sound-desk .rhythm-open'));
      for (const candidate of image.getAttribute('srcset').split(', ')) {
        const url = candidate.split(' ')[0];
        assert.ok(fs.existsSync(path.join(root, 'source', url.slice(prefix.length))));
      }
    } finally { dom.window.close(); }
  });

  test(`custom lounge art retains the helper's original-source fallback (${prefix})`, () => {
    const dom = render(prefix, '/atelier/images/custom.webp');
    try {
      const image = dom.window.document.querySelector('.pixel-stage-card img');
      assert.equal(image.getAttribute('src'), `${prefix}atelier/images/custom.webp`);
      assert.equal(image.getAttribute('srcset'), '');
    } finally { dom.window.close(); }
  });
}

test('sizes accounts for the actual shell, grid gaps, card padding and image-link border', () => {
  const shell = read('source/atelier/css/immersive.css');
  const rooms = read('source/atelier/css/rooms-v2.css');
  assert.match(shell, /--layout-width:1200px;/);
  assert.match(shell, /--page-gutter:clamp\(20px,4vw,56px\);/);
  assert.match(shell, /width:min\(var\(--layout-width\),calc\(100% - 2 \* var\(--page-gutter\)\)\)/);
  assert.match(rooms, /\.room-lounge \.lounge-grid \{[^}]*gap:22px/);
  assert.match(rooms, /\.room-lounge \.sound-card \{grid-column:span 6;[^}]*border:0;padding:24px 28px/);
  assert.match(rooms, /@media\(max-width:1100px\)[\s\S]*?\.room-lounge \.lounge-grid \{gap:20px\}[\s\S]*?\.room-lounge \.lounge-card \{padding:25px\}/);
  assert.match(rooms, /@media\(max-width:760px\)[\s\S]*?\.room-lounge \.lounge-grid \{grid-template-columns:1fr;[\s\S]*?\.room-lounge \.sound-card \{padding:7px 8px\}/);
  assert.match(rooms, /@media\(max-width:380px\)[\s\S]*?\.room-lounge \.collection-card,\.room-lounge \.sound-card,\.room-lounge \.audience-card \{padding-inline:6px\}/);
  assert.match(read('source/atelier/css/daylight.css'), /\.pixel-stage-card\{[^}]*border:1px solid/);

  // Evaluate this sizes expression, including both sides of every breakpoint.
  const clauses = [...sizes.matchAll(/\(max-width:(\d+)px\) calc\((\d+)vw - (\d+)px\)/g)];
  const [, cap, percent, inset] = sizes.match(/min\((\d+)px, calc\((\d+)vw - (\d+)px\)\)$/);
  function declaredWidth(viewport) {
    const clause = clauses.find(([, maximum]) => viewport <= Number(maximum));
    return clause ? viewport * Number(clause[2]) / 100 - Number(clause[3])
      : Math.min(Number(cap), viewport * Number(percent) / 100 - Number(inset));
  }
  for (const viewport of [320, 380, 381, 390, 500, 501, 760, 761, 1100, 1101, 1304, 1305, 1400, 1920]) {
    const gutter = Math.min(56, Math.max(20, viewport * 0.04));
    const shellWidth = Math.min(1200, viewport - 2 * gutter);
    const cardWidth = viewport <= 760 ? shellWidth : (shellWidth - (viewport <= 1100 ? 20 : 22)) / 2;
    const padding = viewport <= 380 ? 6 : viewport <= 760 ? 8 : viewport <= 1100 ? 25 : 28;
    const imageWidth = cardWidth - 2 * padding - 2;
    assert.ok(Math.abs(declaredWidth(viewport) - imageWidth) < 0.001, `accurate image slot at ${viewport}px`);
  }
  assert.ok(declaredWidth(390) * 2 <= 960, 'the existing 960w candidate covers the mobile DPR2 slot');
  assert.ok(declaredWidth(1920) * 2 > 960, 'the full-size candidate remains available for larger DPR2 slots');
});
