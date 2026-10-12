const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const css = fs.readFileSync(path.join(__dirname, '../source/atelier/css/personal-home.css'), 'utf8');

// Walk the real cascade, including tablet and phone rules. These checks protect
// the layout contract; browser screenshots still own visual/overflow validation.
function atWidth(width, run) {
  const dom = new JSDOM(`<style>${css}</style>`);
  const declarations = selector => {
    const result = new Map();
    function visit(rules) {
      for (const rule of rules) {
        if (rule.type === 4) {
          if (/hover|prefers-/.test(rule.conditionText)) continue;
          const max = rule.conditionText.match(/max-width:\s*(\d+)px/);
          const min = rule.conditionText.match(/min-width:\s*(\d+)px/);
          if ((!max || width <= +max[1]) && (!min || width >= +min[1])) visit(rule.cssRules);
        } else if (rule.selectorText?.split(',').map(value => value.trim()).includes(selector)) {
          for (let index = 0; index < rule.style.length; index++) {
            const name = rule.style[index];
            result.set(name, rule.style.getPropertyValue(name));
          }
        }
      }
    }
    visit(dom.window.document.styleSheets[0].cssRules);
    return result;
  };
  try { run(declarations); } finally { dom.window.close(); }
}

test('desktop reading and experiments use editorial alignment rather than stretched cards', () => {
  for (const width of [1024, 1440, 1920]) atWidth(width, styles => {
    const writing = styles('.personal-home .home-writing-grid');
    assert.equal(writing.get('align-items'), 'start');
    assert.equal(writing.get('grid-template-rows'), 'auto auto 1fr');
    assert.equal(styles('.personal-home .home-series-link').get('align-self'), 'end');
    assert.equal(styles('.personal-home .home-making-grid').get('align-items'), 'center');
    const aside = styles('.personal-home .home-research-feature');
    assert.equal(aside.get('display'), 'flex');
    assert.equal(aside.has('background'), false, 'desktop SQL preview stays unboxed');
    assert.equal(aside.has('height'), false, 'opening the disclosure can expand naturally');
  });
});

test('phone writing is sequential and its research preview has its own quiet surface', () => {
  for (const width of [320, 390, 600, 760]) atWidth(width, styles => {
    assert.equal(styles('.personal-home .home-writing-grid').get('display'), 'block');
    assert.equal(styles('.personal-home .home-making-grid').get('display'), 'block');
    const aside = styles('.personal-home .home-research-feature');
    assert.equal(aside.get('display'), 'flex');
    assert.equal(aside.get('margin-top'), '40px');
    assert.match(aside.get('background'), /var\(--ink\) 3%/);
    assert.equal(aside.has('height'), false);
  });
});

test('section navigation and secondary writing avoid decorative ruled boxes', () => {
  for (const width of [320, 760, 768, 1024, 1440]) atWidth(width, styles => {
    const directory = styles('.personal-home .home-directory');
    assert.equal(directory.get('grid-template-columns'), 'repeat(3,minmax(0,1fr))');
    assert.equal(directory.has('border-bottom'), false);
    assert.equal(styles('.personal-home .home-directory>a').has('border-left'), false);
    assert.equal(styles('.personal-home.home-edition .home-note-secondary').get('border'), '0');
    assert.equal(styles('.personal-home .home-reading-topics').has('border-top'), false);
    assert.equal(styles('.personal-home .home-project-stack').has('border-top'), false);
  });
});
