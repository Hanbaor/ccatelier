const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function webpDimensions(file) {
  const data = fs.readFileSync(path.join(root, file));
  assert.equal(data.toString('ascii', 0, 4), 'RIFF');
  assert.equal(data.toString('ascii', 8, 12), 'WEBP');
  for (let offset = 12; offset + 8 <= data.length;) {
    const type = data.toString('ascii', offset, offset + 4);
    const length = data.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (type === 'VP8X') return [1 + data.readUIntLE(start + 4, 3), 1 + data.readUIntLE(start + 7, 3)];
    if (type === 'VP8 ') return [data.readUInt16LE(start + 6) & 0x3fff, data.readUInt16LE(start + 8) & 0x3fff];
    offset = start + length + (length % 2);
  }
  assert.fail('Expected a dimension-bearing WebP chunk');
}

test('practice artwork ships real 3:2 WebP sources within the image budget', () => {
  for (const [name, dimensions, budget] of [
    ['practice-room.webp', [1536, 1024], 300000],
    ['practice-room-960.webp', [960, 640], 150000],
  ]) {
    const file = `source/atelier/images/v4/${name}`;
    assert.deepEqual(webpDimensions(file), dimensions);
    assert.ok(fs.statSync(path.join(root, file)).size < budget);
  }
});

for (const prefix of ['/', '/lab/']) {
  test(`practice header uses the new responsive art without changing controls (${prefix})`, () => {
    const html = ejs.render(read('custom/redefine/nijika/practice.ejs'), {
      url_for: value => prefix + value,
      partial: name => read(`custom/redefine/${name}.ejs`),
    });
    const dom = new JSDOM(html);
    try {
      const doc = dom.window.document;
      const art = doc.querySelector('.practice-heading > img');
      assert.equal(doc.querySelectorAll('img').length, 1);
      assert.equal(art.getAttribute('src'), `${prefix}atelier/images/v4/practice-room.webp`);
      assert.equal(art.getAttribute('srcset'), `${prefix}atelier/images/v4/practice-room-960.webp 960w, ${prefix}atelier/images/v4/practice-room.webp 1536w`);
      assert.equal(art.getAttribute('sizes'), '(max-width:600px) 90px, (max-width:850px) 190px, 240px');
      assert.equal(art.width, 1536);
      assert.equal(art.height, 1024);
      assert.match(art.alt, /排练室.*主题同人插画/);
      assert.equal(art.getAttribute('decoding'), 'async');
      assert.ok(doc.querySelector('[data-practice-play]'));
      assert.ok(doc.querySelector('[data-practice-sheet]'));
      assert.equal(doc.querySelectorAll('[data-challenge-pad]').length, 4);
    } finally { dom.window.close(); }
  });
}

test('art styling preserves the compact rehearsal header and centered face focus', () => {
  const practice = read('source/atelier/css/practice.css');
  const hub = read('source/atelier/css/immersive.css');
  assert.match(practice, /\.practice-heading>img \{[^}]*aspect-ratio:1\.5;object-fit:cover;object-position:52% 0%/);
  assert.match(practice, /@media\(max-width:600px\)[\s\S]*\.practice-heading>img \{position:static;[^}]*width:100%;aspect-ratio:\.85;object-position:52% 35%/);
  assert.match(hub, /\.hub-card>img \{[^}]*aspect-ratio:1\.75/);
  assert.match(hub, /\.hub-studio \.hub-card>img \{object-position:52% 35%\}/);
});
