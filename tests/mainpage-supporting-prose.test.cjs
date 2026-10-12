const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const root = process.env.NIJIKA_PROSE_ROOT || path.resolve(__dirname, '..');
const localRequire = createRequire(path.join(root, 'package.json'));
const {JSDOM} = localRequire('jsdom');
const {parse} = localRequire('rrweb-cssom');
const overlay = process.env.NIJIKA_PROSE_OVERLAY;
const widths = [320, 375, 768, 1024, 1440];
function read(file) {
  const proposed = overlay && path.join(overlay, file);
  return fs.readFileSync(proposed && fs.existsSync(proposed) ? proposed : path.join(root, file), 'utf8');
}
function parts(value) {
  let depth = 0, start = 0; const result = [];
  for (let i=0;i<value.length;i++) {
    if ('(['.includes(value[i])) depth++;
    if (')]'.includes(value[i])) depth--;
    if (value[i]===',' && !depth) {result.push(value.slice(start,i).trim());start=i+1;}
  }
  result.push(value.slice(start).trim()); return result;
}
// Bounded specificity evaluator for selectors actually matched by these samples.
function specificity(selector) {
  let score = 0;
  selector = selector.replace(/:(is|not|has)\(([^()]*)\)/g, (_,name,body)=>{score+=Math.max(...parts(body).map(specificity));return '';}).replace(/:where\([^()]*\)/g,'');
  assert.doesNotMatch(selector, /[()]/, 'Review new nested selector specificity');
  return score+(selector.match(/#[\w-]+/g)||[]).length*10000+(selector.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g)||[]).length*100+(selector.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|:[\w-]+/g,'').match(/\b[a-z][\w-]*\b/gi)||[]).length;
}
// This audit models screen media at 1000px height, a light system palette,
// no reduced-motion preference and a hover-capable fine pointer. Width varies.
// These exact non-width queries occur in the linked files. Height queries are
// false at 1000px; print is excluded because this is a screen typography audit.
const knownScreenMedia = new Map([
  ['print', false],
  ['(prefers-color-scheme: light)', true],
  ['(prefers-color-scheme: dark)', false],
  ['(prefers-reduced-motion:reduce)', false],
  ['(prefers-reduced-motion:no-preference)', true],
  ['(hover:hover)', true],
  ['(hover:hover) and (pointer:fine)', true],
  ['(hover:none), (pointer:coarse)', false],
  ['(hover:hover) and (prefers-reduced-motion:no-preference)', true],
  ['(max-height:700px) and (min-width:701px)', false],
  ['(max-height:700px) and (max-width:640px)', false],
  ['(max-height:520px) and (min-width:641px)', false],
  ['(min-width:1450px) and (max-height:920px)', false],
]);
function activeMedia(query, width) {
  if (knownScreenMedia.has(query)) return knownScreenMedia.get(query);
  assert.match(query, /^\((?:min|max)-width:\s*\d+px\)(?: and \((?:min|max)-width:\s*\d+px\))*$/, 'Review unknown media condition');
  return [...query.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)].every(([,bound,value])=>bound==='max'?width<=+value:width>=+value);
}
function activeGroup(rule, width) {
  if (rule.constructor.name==='CSSMediaRule') return activeMedia(rule.media.mediaText, width);
  // Keyframes define animations, not ordinary selector declarations. This test
  // checks the resting typography, not presentation values during an animation.
  if (rule.constructor.name==='CSSKeyframesRule') return false;
  assert.fail(`Review unknown conditional/group rule: ${rule.constructor.name}`);
}
function fontValues(value) {
  // Only explicit pixel/token sizes with explicit unitless/token leading and
  // an optional simple style/weight prefix are used by our matched elements.
  // Unknown shorthands may reset both properties: never silently discard them.
  const match=value.match(/^(?:(?:normal|italic|oblique|[1-9]00)\s+)?(\d+(?:\.\d+)?px|var\(--[\w-]+\))\/((?:\d*\.)?\d+|normal|var\(--[\w-]+\))\s+(.+)$/);
  assert.ok(match, `Review unsupported matching font shorthand: ${value}`);
  return {'font-size':match[1], 'line-height':match[2]};
}
function page(route) {
  const dom = new JSDOM(read(`public/${route ? route+'/' : ''}index.html`));
  const sheets = [...dom.window.document.querySelectorAll('link[rel=stylesheet]')].map(link=>{
    const relative=link.getAttribute('href').replace(/^\//,'');
    const file=fs.existsSync(path.join(root,'source',relative))?'source/'+relative:'public/'+relative;
    return {file,rules:parse(read(file)).cssRules};
  });
  function cascade(selector,width) {
    const node=dom.window.document.querySelector(selector);assert.ok(node,selector);
    const result={};
    function visit(rules) {for (const rule of rules) {
      if (rule.cssRules) {
        if (activeGroup(rule,width)) visit(rule.cssRules);
        continue;
      }
      if (!rule.selectorText || rule.selectorText.startsWith('@')) continue;
      for (const selector of parts(rule.selectorText)) {
        if (/::|:(before|after|first-letter|first-line|marker|selection|placeholder|-webkit|-moz)/.test(selector)) continue;
        let matches; try {matches=node.matches(selector);} catch (error) {throw new Error(selector+': '+error.message);}
        if (!matches) continue;
        const score=specificity(selector);
        for (let i=0;i<rule.style.length;i++) {
          const key=rule.style[i], value=rule.style.getPropertyValue(key);
          const priority=rule.style.getPropertyPriority(key)==='important'?1:0;
          const values=key==='font'?fontValues(value):{[key]:value};
          if (key==='margin') {
            const sides=value.split(/\s+/);
            Object.assign(values,{'margin-top':sides[0],'margin-right':sides[1]||sides[0],'margin-bottom':sides[2]||sides[0],'margin-left':sides[3]||sides[1]||sides[0]});
          }
          for (const [property,value] of Object.entries(values)) {
            if (!value) continue;
            const previous=result[property];
            if (!previous || priority>previous.priority || priority===previous.priority && score>=previous.score) result[property]={value,priority,score,selector};
          }
        }
      }
    }}
    for (const sheet of sheets) visit(sheet.rules);
    return Object.fromEntries(Object.entries(result).map(([key,entry])=>[key,entry.value]));
  }
  return {dom,cascade};
}
for (const [route,entries] of [
  ['',[
    ['.home-project-description>p','1.8'],
    ['.home-research-summary','1.8'],
    ['.home-afterhours-copy>p:not(.personal-kicker)','1.9'],
  ]],
  ['notes', [['.archive-fallback .archive-record p','1.8']]],
]) test(`${route || 'Home'} supporting prose keeps its reading size and leading at all breakpoints`,()=>{
  const {dom,cascade}=page(route);
  try {for (const width of widths) for (const [selector,leading] of entries) {
    const style=cascade(selector,width);
    assert.equal(style['font-size'],'15px',`${selector} at ${width}`);
    assert.equal(style['line-height'],leading,`${selector} leading at ${width}`);
    assert.equal(style.color,'var(--text)');
    if (route==='notes') {assert.equal(style['max-width'],'65em');assert.equal(style['-webkit-line-clamp'],'2');}
  }} finally {dom.window.close();}
});
test('Home metadata and navigation stay compact while existing responsive geometry survives',()=>{
  const {dom,cascade}=page('');
  try {for (const width of widths) {
    for (const selector of ['.home-project-description .personal-kicker','.home-project-stack','.home-project-stack>a','.home-research-feature .personal-kicker','.home-afterhours-copy nav>a']) assert.equal(cascade(selector,width)['font-size'],'13px',`${selector} at ${width}`);
    assert.equal(cascade('.home-making-grid',width).display,width<=760?'block':'grid');
    assert.equal(cascade('.home-afterhours',width)['grid-template-columns'],width<=760?'1fr':'minmax(0,.65fr) minmax(0,1fr)');
    assert.equal(cascade('.home-project-description>p',width)['margin-top'],width>760&&width<=1000?'15px':'0');
    assert.equal(cascade('.home-project-description>p',width).margin,'0');
    assert.equal(cascade('.home-afterhours-copy>p:not(.personal-kicker)',width).margin,width<=760?'16px 0 0':'22px 0');
  }} finally {dom.window.close();}
});
test('enhanced Notes list matches the native index while card mode keeps its existing size',()=>{
  const {dom,cascade}=page('notes');
  try {
    const doc=dom.window.document, results=doc.querySelector('[data-archive-results]');
    results.append(doc.querySelector('.archive-fallback .archive-record').cloneNode(true));
    for (const mode of ['list','grid']) {
      results.dataset.mode=mode;
      for (const width of widths) {
        const style=cascade('[data-archive-results] .archive-record p',width);
        assert.equal(style['font-size'],'15px',`${mode} at ${width}`);
        assert.equal(style['line-height'],'1.8');
        assert.equal(style['-webkit-line-clamp'],'2');
        assert.equal(cascade('.notes-path-grid',width)['grid-template-columns'],width<=700?'1fr':'repeat(3,minmax(0,1fr))');
      }
    }
  } finally {dom.window.close();}
});

test('bounded media and font evaluators reject unknown overriding syntax',()=>{
  assert.equal(activeMedia('(max-width:760px)',375),true);
  assert.equal(activeMedia('(max-width:760px)',768),false);
  assert.equal(activeMedia('(min-width:601px) and (max-width:900px)',768),true);
  assert.equal(activeMedia('(prefers-reduced-motion:no-preference)',375),true);
  assert.equal(activeMedia('(prefers-reduced-motion:reduce)',375),false);
  assert.equal(activeMedia('(hover:hover)',375),true);
  assert.equal(activeMedia('print',375),false);
  assert.equal(activeMedia('(min-width:1450px) and (max-height:920px)',1600),false);
  for (const query of ['(orientation:portrait)','(prefers-contrast:more)','(hover:hover) and (max-width:500px)','print, screen','(max-width:760px), (min-width:900px)']) assert.throws(()=>activeMedia(query,375),/Review unknown media condition/);
  assert.throws(()=>activeGroup(parse('@supports (display:grid) {.sample {font-size:20px}}').cssRules[0],375),/Review unknown conditional/);
  assert.equal(activeGroup(parse('@keyframes example {from {opacity:0} to {opacity:1}}').cssRules[0],375),false);
  assert.deepEqual(fontValues('15px/1.8 var(--chinese)'),{'font-size':'15px','line-height':'1.8'});
  assert.deepEqual(fontValues('500 var(--meta-size)/var(--meta-leading) var(--sans)'),{'font-size':'var(--meta-size)','line-height':'var(--meta-leading)'});
  for (const value of ['inherit','caption','15px var(--sans)','1rem/1.8 serif','clamp(13px,2vw,16px)/1.8 serif']) assert.throws(()=>fontValues(value),/Review unsupported matching font shorthand/);
});
