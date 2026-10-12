const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const {parse} = require('rrweb-cssom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
// Source-cascade contract only: actual native scrolling/geometry is browser QA.
// Match the relevant stylesheet order in head.ejs, including the cover-only sheet.
const names = ['atelier','content','daylight','refinement','editorial','immersive','personal-home'];
const sheets = names.map(name => parse(read(`source/atelier/css/${name}.css`)).cssRules);
function active(rules, width, reduced) {
  return [...rules].map(rule => {
    if (rule.type !== 4) return rule.cssText;
    const query = rule.conditionText;
    if (/print|hover|pointer|height/.test(query)) return '';
    if (/prefers-reduced-motion/.test(query) && !reduced) return '';
    const max = query.match(/max-width:\s*(\d+)px/), min = query.match(/min-width:\s*(\d+)px/);
    return (!max || width <= +max[1]) && (!min || width >= +min[1]) ? active(rule.cssRules, width, reduced) : '';
  }).join('\n');
}
function fixture(home, width, reduced, fallback = false) {
  let css = sheets.slice(0, home ? sheets.length : -1).map(rules => active(rules, width, reduced)).join('\n');
  if (fallback) css = css.replace(/html:has\(body\.on-cover\)\s*\{[^}]*\}/g, '');
  return new JSDOM(`<style>${css}</style><body class="nijika light${home ? ' on-cover' : ''}">
    <header class="site-header"></header>
    ${home ? '<main class="personal-home home-edition"><section class="personal-writing"></section><section class="home-making"></section><section class="home-afterhours"></section></main>' : '<main class="reading-studio"><article class="article-body markdown-body"><span class="reader-title-anchor"></span><h1>One</h1><h2>Two</h2><h3>Three</h3><h4>Four</h4><h5>Five</h5><h6>Six</h6></article></main>'}
  </body>`);
}
for (const width of [320,390,760,761,1170]) for (const reduced of [false,true]) {
  test(`native anchor clearance is applied once at ${width}px${reduced ? ' with reduced motion' : ''}`, () => {
    for (const home of [true,false]) {
      const dom = fixture(home,width,reduced), {document: doc} = dom.window;
      const style = node => dom.window.getComputedStyle(node);
      try {
        const padding = style(doc.documentElement).scrollPaddingTop;
        assert.equal(padding,home ? '24px' : '110px');
        assert.equal(style(doc.querySelector('.site-header')).position,home ? 'relative' : 'sticky');
        const height = parseFloat(style(doc.querySelector('.site-header')).height);
        assert.equal(height,width <= 760 ? 64 : 76);
        const targets = doc.querySelectorAll(home ? '.personal-writing,.home-making,.home-afterhours' : '.reader-title-anchor,h1,h2,h3,h4,h5,h6');
        for (const target of targets) assert.equal(style(target).scrollMarginTop,'0px',target.className || target.tagName);
        if (!home) assert.ok(parseFloat(padding) >= height + 24,'sticky header retains breathing room');
        if (reduced) assert.equal(style(doc.documentElement).scrollBehavior,'auto');
      } finally { dom.window.close(); }
    }
  });
}
test('cover :has fallback keeps safe shared clearance rather than dropping every route to zero', () => {
  const dom = fixture(true,390,false,true);
  try { assert.equal(dom.window.getComputedStyle(dom.window.document.documentElement).scrollPaddingTop,'110px'); }
  finally { dom.window.close(); }
});
test('cover policy is based on server-rendered state and follows the shared stylesheet', () => {
  assert.match(read('custom/redefine/layout.ejs'), /page\.nijika === 'cover' \? ' on-cover' : ''/);
  const head = read('custom/redefine/nijika/head.ejs');
  assert.ok(head.indexOf('refinement.css') < head.indexOf('personal-home.css'));
  assert.ok(head.indexOf('immersive.css') < head.indexOf('personal-home.css'));
});
