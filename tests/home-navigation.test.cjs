const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ejs = require('ejs');
const yaml = require('js-yaml');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const helpers = {};
vm.runInNewContext(read('scripts/nijika.js'), {require, hexo: {extend: {
  helper: {register: (name, fn) => { helpers[name] = fn; }},
  filter: {register() {}}, generator: {register() {}}
}}});
function render(name, prefix = '/', writing = []) {
  const context = {
    theme: yaml.load(read('_config.redefine.yml')),
    url_for: value => prefix + String(value).replace(/^\//, ''),
    nijika_writing: () => writing, live_metadata: post=>({excerpt:post.excerpt||''}),
    date: () => '2026.10.10', date_xml: () => '2026-10-10',
    partial: name => read(`custom/redefine/${name}.ejs`)
  };
  context.nijika_art_srcset = helpers.nijika_art_srcset.bind(context);
  return new JSDOM(ejs.render(read(`custom/redefine/nijika/${name}.ejs`), context));
}
const writing = [{title:'真实笔记 <example>',path:'writing/example/',date:'2026-10-10',excerpt:'真实摘要 <script>不执行</script>'},{title:'第二篇',path:'writing/second/',date:'2026-09-10'}];
for (const prefix of ['/', '/lab/']) {
 for (const name of ['cover','stage']) {
  test(`${name} exposes personal writing and existing destinations without JavaScript (${prefix})`,()=>{
   const dom=render(name,prefix,writing);
   try {
    const doc=dom.window.document;
    assert.equal(doc.querySelectorAll('h1').length,1);
    assert.match(doc.querySelector('h1').textContent,/CC/);
    assert.ok(doc.querySelector(`a[href="${prefix}writing/example/"]`));
    assert.ok(doc.querySelector(`a[href="${prefix}writing/second/"]`));
    for(const route of ['notes/','projects/','research/','studio/','about/']) assert.ok(doc.querySelector(`a[href="${prefix}${route}"]`),route);
    assert.equal(doc.querySelectorAll('a a,script,example').length,0);
    assert.match(doc.textContent||doc.body.textContent,/真实摘要 <script>不执行<\/script>/);
    for(const img of doc.querySelectorAll('img')) {
     assert.ok(img.alt.trim());assert.ok(img.width>0&&img.height>0);
     assert.ok(fs.existsSync(path.join(root,'source',img.getAttribute('src').slice(prefix.length))));
    }
    if(name==='cover') {
     assert.equal(doc.querySelector('[data-enter]').getAttribute('href'),prefix+'notes/');
     assert.equal(doc.querySelectorAll('.cinema-v3').length,0);
     assert.ok(doc.querySelector('#cover-photograph #cover-image'));
    } else {
     assert.ok(doc.querySelector(`a[href="${prefix}studio/practice/"]`));
     assert.ok(doc.querySelector(`a[href="${prefix}life/"]`));
     assert.equal(doc.querySelectorAll('.hub-grid').length,0);
    }
   }finally{dom.window.close();}
  });
 }
 test(`life retains an honest empty state and native exits (${prefix})`,()=>{
  const dom=render('life',prefix);
  try {const doc=dom.window.document;assert.equal(doc.querySelector('.scene-state').textContent,'相册尚未发布');assert.deepEqual([...doc.querySelectorAll('.life-paths a')].map(a=>a.getAttribute('href')),[prefix+'notes/',prefix+'studio/practice/']);}finally{dom.window.close();}
 });
}
for(const name of ['cover','stage'])test(`${name} handles an empty writing catalogue`,()=>{
 const dom=render(name);try{assert.match(dom.window.document.body.textContent,/笔记正在整理中/);assert.equal(dom.window.document.querySelectorAll('a[href*="undefined"]').length,0);}finally{dom.window.close();}
});
test('personal page stylesheet parses, remains route-scoped and respects reduced motion',()=>{
 const css=read('source/atelier/css/personal-home.css');const dom=new JSDOM(`<style>${css}</style>`);
 try {assert.ok(dom.window.document.styleSheets[0].cssRules.length>70);assert.match(css,/@media\(max-width:760px\)/);assert.match(css,/@media\(max-width:360px\)/);assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);assert.match(css,/:focus-visible/);assert.doesNotMatch(css,/!important|\.reading-content|\.article-body/);}finally{dom.window.close();}
});
test('cover keeps native navigation and tolerates absent optional artwork',()=>{
 const source=read('source/atelier/js/cover.js').replace(/^import[^\n]+\n/,'').replace('export function','function');
 for(const html of ['<main></main>','<section class="personal-home"></section>','<section class="personal-home"><figure id="cover-photograph"></figure><a data-enter href="/notes/">笔记</a></section>']) {
  const dom=new JSDOM(html,{url:'https://ccatelier.test/'});
  try {vm.runInNewContext(source+'\ninitCover();',{$:selector=>dom.window.document.querySelector(selector),motion:{enabled:false},document:dom.window.document,window:dom.window,cancelAnimationFrame(){}});const link=dom.window.document.querySelector('a');if(link){const event=new dom.window.MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true});link.dispatchEvent(event);assert.equal(event.defaultPrevented,false);}}finally{dom.window.close();}
 }
 assert.doesNotMatch(source,/preventDefault|location.assign|setTimeout/);
});

test('long unbroken article excerpts wrap on both personal page compositions',()=>{
 const css=read('source/atelier/css/personal-home.css');
 assert.match(css,/\.personal-note p \{[^}]*overflow-wrap:anywhere/);
 assert.match(css,/\.atelier-writing-summary \{[^}]*overflow-wrap:anywhere/);
 const excerpt='https://example.test/'+ 'unbroken'.repeat(100);
 for(const name of ['cover','stage']) {
  const dom=render(name,'/',[{...writing[0],excerpt}]);
  try {const summary=dom.window.document.querySelector(name==='cover'?'.personal-note p':'.atelier-writing-summary');assert.equal(summary.textContent,excerpt);}finally{dom.window.close();}
 }
});

test('hero framing preserves both hands across desktop and tablet crops',()=>{
 const css=read('source/atelier/css/personal-home.css');
 assert.match(css,/\.personal-portrait img \{[^}]*object-position:90% center/);
 for(const ratio of [1.25,1.05]){
  const crop=821*ratio,extra=crop*(1-1/1.012)/2;
  const left=(1916-crop)*.9+extra,right=left+crop/1.012;
  assert.ok(left<1020&&right>1690,`both hands have breathing room at ratio ${ratio}`);
 }
});
