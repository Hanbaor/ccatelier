const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const { JSDOM } = require('jsdom');
const { parse } = require('rrweb-cssom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const rules = parse(read('source/atelier/css/personal-home.css')).cssRules;
const cover = ejs.render(read('custom/redefine/nijika/cover.ejs'), {
  nijika_writing: () => [],
  nijika_art_srcset: url => url,
  url_for: url => '/' + url.replace(/^\//, ''),
  theme: { nijika: { github: 'https://github.com/Hanbaor' } },
  partial: name => read('custom/redefine/' + name + '.ejs')
});
// JSDOM does not lay out text or evaluate media queries. Flatten the real
// width-dependent cascade, then verify DOM and layout contracts, not pixels.
function screenRules(rules, width) {
  return Array.from(rules).flatMap(rule => {
    if (!rule.cssRules) return [rule.cssText];
    if (!rule.media || /print|hover|prefers-/.test(rule.media.mediaText)) return [];
    if ([...rule.media.mediaText.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)]
      .some(([, bound, value]) => bound === 'max' ? width > +value : width < +value)) return [];
    return screenRules(rule.cssRules, width);
  }).join('\n');
}
for (const width of [320, 360, 390, 430, 480, 481, 760, 768, 1440]) {
  test(`home wayfinding keeps its responsive layout contract at ${width}px`, () => {
    const dom = new JSDOM(`<style>${screenRules(rules, width)}</style>${cover}`);
    const document = dom.window.document;
    const style = element => dom.window.getComputedStyle(element);
    try {
      const headers = [...document.querySelectorAll('.personal-section-head')];
      assert.equal(headers.length, 2);
      for (const header of headers) {
        const link = header.querySelector(':scope > a');
        assert.equal(style(header).flexDirection, width <= 480 ? 'column' : '');
        assert.equal(style(header).alignItems, width <= 480 ? 'flex-start' : 'end');
        assert.equal(style(header).gap, width <= 480 ? '6px' : width <= 760 ? '16px' : '24px');
        assert.equal(style(link).minHeight, '44px');
        if (width <= 480) assert.equal(style(link).whiteSpace, 'nowrap');
        assert.ok(header.querySelector('h2').textContent.trim());
        assert.ok(link.getAttribute('href').startsWith('/'));
      }
      const directory = document.querySelector('.home-directory');
      assert.equal(style(directory).gridTemplateColumns, 'repeat(3,minmax(0,1fr))');
      assert.equal(directory.querySelectorAll('a').length, 3);
      for (const link of directory.querySelectorAll('a')) {
        assert.equal(style(link).gridTemplateColumns, width <= 760 ? 'minmax(0,1fr)' : 'minmax(0,1fr) auto');
        assert.ok(parseFloat(style(link).minHeight) >= 44);
        assert.ok(document.querySelector(link.getAttribute('href')), 'native section destination survives');
        const label = link.querySelector('span:not([aria-hidden])');
        if (width <= 760) {
          assert.equal(style(label).getPropertyValue('text-wrap'), 'balance');
          assert.equal(style(link.querySelector('[aria-hidden]')).display, 'none');
        }
      }
      assert.equal(document.querySelectorAll('.personal-section-head h2 br').length, 1, 'authored title break stays intact');
    } finally { dom.window.close(); }
  });
}
