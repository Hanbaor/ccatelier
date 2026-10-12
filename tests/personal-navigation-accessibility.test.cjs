const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const {JSDOM} = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const posts = [{title:'SQL',path:'writing/example/',date:'2026-10-10'}, {title:'LongUnbrokenTitle'.repeat(20),path:'writing/long/',date:'2026-10-09'}];
function render(name, prefix='/') {
  return new JSDOM(ejs.render(read(`custom/redefine/nijika/${name}.ejs`), {
    nijika_writing:()=>posts,
    url_for:value=>prefix+value.replace(/^\//,''),
    nijika_art_srcset:value=>`${prefix}${value.replace(/^\//,'')} 1916w`,
    theme:{nijika:{github:'https://github.com/Hanbaor'}},
    partial:name=>read(`custom/redefine/${name}.ejs`),
    date_xml:value=>value,date:value=>value,live_metadata:()=>({})
  }), {url:`https://example.test${prefix}`});
}

for (const prefix of ['/', '/lab/']) test(`native home destinations accept focus without adding Tab stops (${prefix})`,()=>{
  const home=render('cover',prefix),projects=render('projects',prefix);
  try {
    const doc=home.window.document;
    for (const link of doc.querySelectorAll('.home-directory a')) {
      const target=doc.querySelector(link.getAttribute('href'));
      assert.equal(target.tabIndex,-1);
      assert.equal(target.getAttribute('tabindex'),'-1');
      assert.ok(doc.getElementById(target.getAttribute('aria-labelledby')));
      target.focus();
      assert.equal(doc.activeElement,target,'native fragment target can receive focus');
      assert.ok(target.querySelector('a[href]'),'sequential navigation can continue inside destination');
    }
    for (const link of doc.querySelectorAll(`a[href^="${prefix}projects/#"]`)) {
      const target=projects.window.document.getElementById(new URL(link.href).hash.slice(1));
      assert.equal(target.id,'project-edurag');
      assert.equal(target.tagName,'H3');
      assert.equal(target.textContent,'EduRAG');
      target.focus();
      assert.equal(projects.window.document.activeElement,target);
      assert.equal(target.tabIndex,-1);
    }
    for (const page of [doc,projects.window.document]) {
      assert.equal(page.querySelectorAll('[tabindex]:not([tabindex="-1"]),[onclick],script').length,0);
    }
  } finally {home.window.close();projects.window.close();}
});

// jsdom does not lay out pixels or follow fragment focus as a browser would.
// Flatten width rules to verify the actual CSS contract without claiming that QA.
function cssAtWidth(source,width) {
  const dom=new JSDOM(`<style>${source}</style>`);
  function flatten(rules) {
    return [...rules].map(rule=>{
      if(rule.type!==4)return rule.cssText;
      if(/hover|prefers-|print/.test(rule.conditionText))return '';
      const min=rule.conditionText.match(/min-width:\s*(\d+)px/),max=rule.conditionText.match(/max-width:\s*(\d+)px/);
      return (!min||width>=+min[1])&&(!max||width<=+max[1])?flatten(rule.cssRules):'';
    }).join('\n');
  }
  try {return flatten(dom.window.document.styleSheets[0].cssRules);} finally {dom.window.close();}
}

test('compact homepage links keep 44px targets in normal flow at narrow and wide widths',()=>{
  for(const width of [320,390,760,768,1170]) {
    const dom=render('cover');
    try {
      const doc=dom.window.document,style=doc.createElement('style');
      style.textContent=cssAtWidth(read('source/atelier/css/personal-home.css'),width);doc.head.append(style);
      for(const selector of ['.home-understage>a','.home-project-stack>a','.home-reading-topics>a','.home-colophon a','.personal-note h3>a']) {
        const links=doc.querySelectorAll(selector);assert.ok(links.length);
        for(const link of links) {
          const css=dom.window.getComputedStyle(link);
          assert.ok(parseFloat(css.minHeight)>=44,`${width}px ${selector}`);
          assert.equal(css.height,'','no fixed height truncates wrapped titles');
          assert.notEqual(css.position,'absolute','hit area participates in normal flow');
        }
      }
      for(const title of doc.querySelectorAll('.personal-note h3>a'))assert.equal(dom.window.getComputedStyle(title).overflowWrap,'anywhere');
    } finally {dom.window.close();}
  }
});

test('about keeps its already generous native links and introduces no extra focus stops',()=>{
  const dom=render('about');
  try {
    const doc=dom.window.document,style=doc.createElement('style');
    style.textContent=read('source/atelier/css/personal-pages.css');doc.head.append(style);
    for(const link of doc.querySelectorAll('.personal-links a,.personal-about-notes a')) {
      assert.ok(parseFloat(dom.window.getComputedStyle(link).minHeight)>=44);
      assert.equal(link.hasAttribute('tabindex'),false);
    }
  } finally {dom.window.close();}
});

function projectThemeCSS() {
  // Render the real route head instead of assuming that projects.css wins.
  // Delivery bundles preserve this exact member order; unbuilt source files
  // ensure this regression test also exercises the edits before a full build.
  const head=new JSDOM(ejs.render(read('custom/redefine/nijika/head.ejs'),{
    page:{nijika:'projects'},theme:{nijika:{cover:'/atelier/images/v3/projects.webp'}},
    nijika_page_metadata:()=>({documentTitle:'Projects',title:'Projects',description:'',url:'https://example.test/projects/'}),
    is_post:()=>false,is_home:()=>false,is_archive:()=>false,is_category:()=>false,is_tag:()=>false,is_page:()=>true,
    url_for:value=>'/'+value.replace(/^\//,''),open_graph:()=>'',export_config:()=>''
  }));
  try {
    const paths=[...head.window.document.querySelectorAll('link[rel="stylesheet"]')].map(link=>link.getAttribute('href').slice(1));
    assert.ok(paths.indexOf('atelier/css/projects.css')>paths.indexOf('atelier/css/refinement.css'));
    return paths.map(file=>read((fs.existsSync(path.join(__dirname,'..','source',file))?'source/':'public/')+file)).join('\n');
  } finally {head.window.close();}
}

test('project conditions and source links remain readable through the full route cascade and both themes',()=>{
  // jsdom cannot resolve custom properties inside font shorthands. Resolve
  // family-only tokens to their generic fallback; keep sizes and rule order.
  const source=projectThemeCSS().replace(/var\(--(?:chinese|sans|condensed)\)/g,'sans-serif').replace(/var\(--mono\)/g,'monospace');
  for(const width of [295,320,393,760,1180])for(const dark of [false,true]) {
    const dom=render('projects');
    try {
      const doc=dom.window.document;
      doc.documentElement.className=dark?'dark':'';
      doc.body.className=dark?'nijika dark-mode':'nijika light light-mode';
      doc.querySelector('.project-implementation').open=true;
      const style=doc.createElement('style');style.textContent=cssAtWidth(source,width);doc.head.append(style);
      const selectors=['.project-boundary','.project-instruction','.project-text-link','.project-coursework-source','.project-evidence','.project-implementation>summary>span'];
      for(const selector of selectors) {
        const nodes=doc.querySelectorAll(selector);assert.ok(nodes.length);
        for(const node of nodes) {
          const css=dom.window.getComputedStyle(node);
          assert.ok(parseFloat(css.fontSize)>=13,`${width}px ${dark?'dark':'light'} ${selector}: ${css.fontSize}`);
          assert.ok(['','auto'].includes(css.height),`${selector} stays content-sized`);
          assert.ok(['','none'].includes(css.maxHeight),`${selector} has no clipping height`);
          assert.notEqual(css.whiteSpace,'nowrap',`${selector} may wrap`);
          assert.ok(!['hidden','clip'].includes(css.overflow),`${selector} does not clip its text`);
        }
      }
      for(const node of doc.querySelectorAll('.project-text-link,.project-coursework-source,.project-source-links>a,.project-evidence>a')) {
        const css=dom.window.getComputedStyle(node);
        assert.ok(parseFloat(css.minHeight)>=44,'source and demonstration links retain touch targets');
        // jsdom leaves inherited font-size empty; walk the real ancestors.
        let ancestor=node,size=NaN;
        while(ancestor&&!Number.isFinite(size)){size=parseFloat(dom.window.getComputedStyle(ancestor).fontSize);ancestor=ancestor.parentElement;}
        assert.ok(size>=13,'link text inherits the readable floor');
      }
      for(const selector of ['.project-actions','.project-evidence','.project-source-links'])assert.equal(dom.window.getComputedStyle(doc.querySelector(selector)).flexWrap,'wrap');
      if(width<=760)assert.equal(dom.window.getComputedStyle(doc.querySelector('.project-implementation>summary>span')).display,'block','subtitle flows onto its own line');
      // Decorative indices are deliberately independent of the content floor.
      assert.equal(dom.window.getComputedStyle(doc.querySelector('.project-context')).fontSize,'11px');
    } finally {dom.window.close();}
  }
});
