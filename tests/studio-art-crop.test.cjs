const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const CSSOM = require('rrweb-cssom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('source/atelier/css/studio.css');

// Resolve just the route-local declarations under test. This is crop geometry,
// not browser layout: text wrapping, masks and overlays are deliberately excluded.
function declarations(selector, viewport) {
  const result = {};
  function visit(rules) {
    for (const rule of rules) {
      if (rule.media) {
        const query = rule.media.mediaText;
        const max = query.match(/^\(max-width:\s*(\d+)px\)$/);
        if (max && viewport <= Number(max[1])) visit(rule.cssRules);
      } else if (rule.selectorText === selector) {
        for (let i = 0; i < rule.style.length; i++) {
          const property = rule.style[i];
          result[property] = rule.style.getPropertyValue(property);
        }
      }
    }
  }
  visit(CSSOM.parse(css).cssRules);
  return result;
}

test('Studio mobile crop changes only the focal position; hero and wider layouts retain their geometry', () => {
  const selector = '.studio-editorial .studio-soundcheck';
  for (const viewport of [320, 390, 600]) {
    const art = declarations(selector, viewport);
    assert.equal(art['object-position'], '82% 25%');
    assert.equal(art.width, '100%');
    assert.equal(art.opacity, '.7');
    assert.equal(art['mask-image'], 'linear-gradient(0deg,transparent,#000 95%)');
    const hero = declarations('.studio-editorial .studio-mast.studio-illustrated', viewport);
    assert.equal(hero['min-height'], '410px');
    assert.equal(hero.padding, '95px 23px 28px');
  }
  for (const viewport of [601, 800, 1280]) {
    const art = declarations(selector, viewport);
    assert.equal(art['object-position'], '64% 30%');
    assert.equal(art.width, '84%');
  }
  assert.match(read('source/atelier/css/daylight.css'), /\.studio-soundcheck\{[^}]*height:100%;object-fit:cover/);
});

test('actual Studio sources retain the face and upper head at 320, 390, 600 and 601px crop boxes', async () => {
  assert.match(read('_config.redefine.yml'), /studio_art: \/atelier\/images\/v3\/hero\.webp/);
  assert.match(read('source/atelier/css/immersive.css'), /--page-gutter:clamp\(20px,4vw,56px\)/);
  assert.match(read('source/atelier/css/immersive.css'), /--layout-width:1200px/);
  // Region inspected on the full-size artwork: face, upper hair and ponytail root.
  // The long ponytail and both hands cannot all fit the narrowest portrait crop.
  const focal = {left: 1200 / 1916, right: 1515 / 1916, top: 40 / 821, bottom: 360 / 821};
  for (const [file, width, height] of [['hero.webp', 1916, 821], ['hero-960.webp', 960, 411]]) {
    const metadata = await sharp(path.join(root, 'source/atelier/images/v3', file)).metadata();
    assert.equal(metadata.width, width);
    assert.equal(metadata.height, height);
    for (const viewport of [320, 390, 600, 601]) {
      const art = declarations('.studio-editorial .studio-soundcheck', viewport);
      const hero = declarations('.studio-editorial .studio-mast.studio-illustrated', viewport);
      const gutter = Math.max(20, Math.min(viewport * .04, 56));
      const boxWidth = Math.min(1200, viewport - 2 * gutter) * parseFloat(art.width) / 100;
      const boxHeight = parseFloat(hero['min-height']);
      const [px, py] = art['object-position'].split(' ').map(value => parseFloat(value) / 100);
      const scale = Math.max(boxWidth / width, boxHeight / height);
      const visibleWidth = boxWidth / scale;
      const visibleHeight = boxHeight / scale;
      const left = (width - visibleWidth) * px;
      const top = (height - visibleHeight) * py;
      const label = `${file}, ${viewport}px viewport`;
      assert.ok(left <= width * focal.left && left + visibleWidth >= width * focal.right, `${label}: complete face and upper head stay in crop`);
      assert.ok(top <= height * focal.top && top + visibleHeight >= height * focal.bottom, `${label}: headroom stays in crop`);
    }
  }
});
