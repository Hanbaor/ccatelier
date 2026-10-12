const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const cssom = require('rrweb-cssom');
const repo = process.env.NIJIKA_LEGIBILITY_ROOT || path.resolve(__dirname, '..');
const overlay = process.env.NIJIKA_LEGIBILITY_CANDIDATE_DIR;
function source(file) {
  const proposed = overlay && path.join(overlay, file);
  return fs.readFileSync(proposed && fs.existsSync(proposed) ? proposed : path.join(repo, file), 'utf8');
}
// Source declarations are substituted for route-local CSS; generated delivery
// bundles supply the inherited layers in their actual linked order. No layout API.
function declarations(route, selector) {
  const dom = new JSDOM(fs.readFileSync(path.join(repo, 'public', route, 'index.html'), 'utf8'));
  try {
    const document = dom.window.document, element = document.querySelector(selector);
    assert.ok(element, selector);
    const records = [];
    for (const link of document.querySelectorAll('link[rel=stylesheet]')) {
      const url = link.getAttribute('href');
      const local = path.join('source', url);
      const text = fs.existsSync(path.join(repo, local)) ? source(local) : source(path.join('public', url));
      function walk(rules, media = []) {
        for (const rule of rules) {
          if (rule.cssRules) {walk(rule.cssRules, [...media, rule.conditionText || rule.media?.mediaText || '']); continue;}
          const selector = rule.selectorText;
          // These pseudo-elements cannot select the tested elements.
          if (!selector || selector.startsWith('@') || /:(?:marker|before|after|first-letter|first-line|selection|placeholder|-webkit|-moz)/.test(selector)) continue;
          if (!element.matches(selector.replace(/::[\w-]+(?:\([^)]*\))?/g, ':not(*)'))) continue;
          const font = rule.style.getPropertyValue('font'), size = rule.style.getPropertyValue('font-size');
          if (font || size) records.push({selector, media, font, size, lineHeight:rule.style.getPropertyValue('line-height'), color:rule.style.getPropertyValue('color'), overflowWrap:rule.style.getPropertyValue('overflow-wrap')});
        }
      }
      walk(cssom.parse(text).cssRules);
    }
    return records;
  } finally {dom.window.close();}
}
const widths = [320, 390, 760, 768, 1024, 1440];
const active = (record, width) => record.media.every(media => {
  assert.equal(media, '(max-width:760px)', 'Review unexpected media conditions affecting essential type');
  return width <= 760;
});
test('Home article excerpts retain the established summary token beyond the mobile override', () => {
  const rules = declarations('', '.personal-note p');
  assert.deepEqual(rules.map(r=>r.selector), ['.personal-note p','.personal-note p','.personal-home.home-edition .personal-note p','.personal-home.home-edition .personal-note p'], 'Review new matching font declarations and their specificity');
  assert.match(source('source/atelier/css/immersive.css'), /--summary-size:16px/);
  assert.equal(rules[2].lineHeight, '1.85');
  assert.equal(rules[2].color, 'var(--text)');
  // Last two rules have equal specificity (0,3,1), greater than the bases (0,1,1).
  for (const width of widths) assert.equal(rules.filter(r=>active(r,width)).at(-1).size, 'var(--summary-size)');
});
test('Projects primary action does not inherit compact mobile room-action text', () => {
  const rules = declarations('projects', '.project-actions .room-action');
  assert.deepEqual(rules.map(r=>r.selector), ['.room-action','.room-action','.project-actions .room-action'], 'Review new matching font declarations and their specificity');
  // The scoped final rule (0,2,0) overrides both inherited room-action rules (0,1,0).
  for (const width of widths) assert.equal(rules.filter(r=>active(r,width)).at(-1).size, '14px');
  const projects = source('source/atelier/css/projects.css');
  assert.match(projects, /\.project-actions \.room-action \{[^}]*background:var\(--ink\);color:var\(--bg\)/);
  assert.match(projects, /\.project-actions \.room-action:hover \{color:var\(--accent-ink\)/);
});

// Each selector below is the only directly matching font rule in the generated
// linked cascade. Lock that assumption so a future override needs explicit review.
for (const entry of [
  {selector:'.project-experiment-list p', font:'15px/1.8 var(--chinese)', color:'var(--text)'},
  {selector:'.project-process details p', font:'15px/1.85 var(--chinese)', color:'var(--text)', wrap:'anywhere'},
  {selector:'.project-process details code', font:'13px/1.8 var(--mono)', wrap:'anywhere'},
]) test(`Projects essential text keeps readable sizing across widths: ${entry.selector}`, () => {
  const rules = declarations('projects', entry.selector);
  assert.deepEqual(rules.map(rule=>rule.selector), [entry.selector], 'Review new matching font declarations and their specificity');
  for (const width of widths) {
    const applied = rules.filter(rule=>active(rule,width)).at(-1);
    assert.ok(applied, `${entry.selector} at ${width}px`);
    assert.equal(applied.font, entry.font, `${entry.selector} at ${width}px`);
    assert.equal(applied.size, '');
    if (entry.color) assert.equal(applied.color, entry.color);
    if (entry.wrap) assert.equal(applied.overflowWrap, entry.wrap);
  }
});
test('Projects compact metadata stays distinct from substantive explanations', () => {
  const rules = cssom.parse(source('source/atelier/css/projects.css')).cssRules;
  for (const [selector, font] of [
    ['.project-process summary span,.project-process-rag li>span', '9px/1.6 var(--sans)'],
    ['.project-process-caption', '10px/1.7 var(--sans)'],
    ['.project-coursework-kind', '12px/1.8 var(--chinese)'],
  ]) assert.equal([...rules].find(rule=>rule.selectorText===selector)?.style.getPropertyValue('font'), font, selector);
});
