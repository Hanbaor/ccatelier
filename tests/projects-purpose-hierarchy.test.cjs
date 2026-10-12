const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const { JSDOM } = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('coursework purpose and public source precede process details in native reading order', () => {
  for (const root of ['/', '/lab/']) {
    const dom = new JSDOM(ejs.render(read('custom/redefine/nijika/projects.ejs'), {
      url_for: value => root + value.replace(/^\//, ''),
      partial: value => read(`custom/redefine/${value}.ejs`)
    }));
    try {
      const doc = dom.window.document;
      const works = [...doc.querySelectorAll('.project-coursework-list > li')];
      assert.equal(works.length, 2);
      for (const work of works) {
        const heading = work.querySelector('.project-coursework-heading');
        const body = work.querySelector('.project-coursework-body');
        const process = work.querySelector('.project-process');
        assert.equal(heading.nextElementSibling, body);
        assert.equal(body.nextElementSibling, process);
        assert.ok(body.firstElementChild.matches('p'));
        assert.ok(body.querySelector('.project-coursework-source'));
        assert.equal(body.closest('details'), null);
        assert.equal(process.querySelectorAll('details').length, process.classList.contains('project-process-rag') ? 0 : 3);
        for (const detail of process.querySelectorAll('details')) {
          assert.equal(detail.open, false);
          assert.ok(detail.firstElementChild.matches('summary'));
          assert.ok(detail.querySelector('p').textContent.trim());
          detail.open = true;
          assert.equal(detail.open, true);
          detail.open = false;
        }
      }
      assert.equal(doc.querySelectorAll('script, [onclick], [data-reveal]').length, 0);
    } finally { dom.window.close(); }
  }
});

test('process rows are compact, wrapping and touch sized without a fixed-height panel', () => {
  const dom = new JSDOM(`<style>${read('source/atelier/css/projects.css')}</style>`);
  try {
    const rules = [...dom.window.document.styleSheets[0].cssRules];
    const rule = selector => rules.filter(item => item.selectorText === selector).at(-1).style;
    assert.equal(rule('.project-process summary').getPropertyValue('min-height'), '44px');
    assert.equal(rule('.project-process summary>div').getPropertyValue('flex-wrap'), 'wrap');
    assert.equal(rule('.project-process').getPropertyValue('height'), '');
    assert.equal(rule('.project-process').getPropertyValue('background'), '');
    assert.equal(rule('.project-process details p').getPropertyValue('overflow-wrap'), 'anywhere');
    assert.ok(rule('.project-process summary:focus-visible').getPropertyValue('outline'));
  } finally { dom.window.close(); }
});
