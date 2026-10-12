'use strict';
// Static declaration-cascade regression, not browser layout or pixel verification.
// Set NIJIKA_RESPONSIVE_ROOT only when running the isolated staged test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const repo = process.env.NIJIKA_RESPONSIVE_ROOT || path.resolve(__dirname, '..');
const {JSDOM} = require(path.join(repo, 'node_modules/jsdom'));
const {parse} = require(path.join(repo, 'node_modules/rrweb-cssom'));
const widths = [320, 375, 768, 1024];
const targets = [
  ['.home-note-art img', 'scale(1.025)'],
  ['.home-project-art img', 'scale(1.035)'],
  ['.home-afterhours-art img', 'scale(1.035)'],
  ['.personal-actions a svg', 'translate(2px,-2px)'],
];

function selectorParts(value) {
  let depth = 0;
  let start = 0;
  const result = [];
  for (let index = 0; index < value.length; index++) {
    if ('(['.includes(value[index])) depth++;
    if (')]'.includes(value[index])) depth--;
    if (value[index] === ',' && !depth) {
      result.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(value.slice(start).trim());
  return result;
}

function specificity(selector) {
  let score = 0;
  const remaining = selector
    .replace(/:(is|not|has)\(([^()]*)\)/g, (_, name, args) => {
      score += Math.max(...selectorParts(args).map(specificity));
      return '';
    })
    .replace(/:where\([^()]*\)/g, '');
  const ids = (remaining.match(/#[\w-]+/g) || []).length;
  const classes = (remaining.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g) || []).length;
  const elements = (remaining
    .replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|:[\w-]+/g, '')
    .match(/\b[a-z][\w-]*\b/gi) || []).length;
  return score + ids * 10000 + classes * 100 + elements;
}

function removeExactlyOnce(css, before, after) {
  assert.equal(css.split(before).length - 1, 1,
    `The negative control must remove exactly one known selector addition: ${before}`);
  return css.replace(before, after);
}

function negativeControl(css) {
  // Reconstruct the two old rules in memory; the checkout stays unchanged.
  css = removeExactlyOnce(css,
    'svg,.personal-home a:hover svg,.personal-atelier a:hover svg {transform:none;transition:none}',
    'svg {transform:none;transition:none}');
  return removeExactlyOnce(css,
    'img,.personal-home .home-note-art:hover img,.personal-home .home-project-art:hover img,.personal-home .home-afterhours-art:hover img{transition:none;transform:none}',
    'img{transition:none;transform:none}');
}

function linkedSheets(document, original) {
  return [...document.querySelectorAll('link[rel=stylesheet]')].map(link => {
    const relative = link.getAttribute('href').replace(/^\//, '');
    let file = path.join(repo, 'source', relative);
    if (!fs.existsSync(file)) file = path.join(repo, 'public', relative);
    if (relative === 'atelier/css/personal-home.css') {
      // Under repo/tests this is the ordinary repository source. In staging it
      // is the adjacent candidate source, while other files use the real repo.
      const adjacent = path.join(__dirname, '../source', relative);
      if (fs.existsSync(adjacent)) file = adjacent;
    }
    let css = fs.readFileSync(file, 'utf8');
    if (original && relative === 'atelier/css/personal-home.css') {
      css = negativeControl(css);
    }
    return parse(css).cssRules;
  });
}

function mediaActive(query, width, reduced) {
  if (/print/.test(query)) return false;
  if (query.includes('prefers-reduced-motion:reduce') && !reduced) return false;
  if (query.includes('prefers-reduced-motion:no-preference') && reduced) return false;
  // Model a hover-capable fine-pointer device at each requested CSS width.
  return ![...query.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)]
    .some(([, boundary, value]) => boundary === 'max' ? width > +value : width < +value);
}

function cascade(sheets, node, property, width, reduced) {
  let winner = {value: '', priority: -1, score: -1};
  function visit(rules) {
    for (const rule of rules) {
      if (rule.cssRules) {
        if (!rule.media || mediaActive(rule.media.mediaText, width, reduced)) {
          visit(rule.cssRules);
        }
        continue;
      }
      if (!rule.selectorText || !rule.style.getPropertyValue(property)) continue;
      for (const selector of selectorParts(rule.selectorText)) {
        let matches = false;
        try {
          matches = node.matches(selector.replace(/:hover/g, '[data-qa-hover]'));
        } catch {
          // Ignore selectors unsupported by JSDOM, e.g. vendor pseudo-elements.
        }
        if (!matches) continue;
        const priority = rule.style.getPropertyPriority(property) === 'important' ? 1 : 0;
        const score = specificity(selector);
        if (priority > winner.priority || priority === winner.priority && score >= winner.score) {
          winner = {value: rule.style.getPropertyValue(property), priority, score, selector};
        }
      }
    }
  }
  sheets.forEach(visit);
  return winner;
}

test('Home hover honors system reduced motion without changing normal hover or motion-off', async t => {
  let count = 0;
  for (const width of widths) {
    for (const mode of ['normal', 'reduce', 'motion-off']) {
      for (const original of [false, true]) {
        await t.test(`${width}px / ${mode} / ${original ? 'negative control' : 'current source'}`, () => {
          const dom = new JSDOM(fs.readFileSync(path.join(repo, 'public/index.html'), 'utf8'));
          try {
            const document = dom.window.document;
            if (mode === 'motion-off') document.body.classList.add('motion-off');
            const sheets = linkedSheets(document, original);
            for (const [target, normalTransform] of targets) {
              const node = document.querySelector(target);
              assert.ok(node, `Required target is missing: ${target}`);
              const link = node.closest('a');
              assert.ok(link, `Target must remain within an interactive link: ${target}`);
              link.setAttribute('data-qa-hover', '');
              const reduced = mode === 'reduce';
              const transform = cascade(sheets, node, 'transform', width, reduced);
              const expected = mode === 'normal' || reduced && original ? normalTransform : 'none';
              assert.equal(transform.value, expected, `${target}: ${JSON.stringify(transform)}`);
              if (mode !== 'normal') {
                const transition = cascade(sheets, node, 'transition', width, reduced);
                assert.equal(transition.value, 'none', `${target}: ${JSON.stringify(transition)}`);
              }
              count++;
            }
          } finally {
            dom.window.close();
          }
        });
      }
    }
  }
  assert.equal(count, 96, 'Every target, viewport, mode and source variant must be checked');
});
