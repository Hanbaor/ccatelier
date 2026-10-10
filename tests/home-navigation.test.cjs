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
    date: value => String(value).slice(0,10).replaceAll('-','.'), date_xml: value => new Date(value).toISOString(),
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
    assert.ok(doc.querySelector('h1').textContent.trim());
    if(name==='cover')assert.match(doc.querySelector('h1').textContent,/CC/);
    assert.ok(doc.querySelector(`a[href="${prefix}writing/example/"]`));
    assert.ok(doc.querySelector(`a[href="${prefix}writing/second/"]`));
    for(const route of ['notes/','projects/','research/','studio/','about/']) assert.ok([...doc.querySelectorAll('a[href]')].some(a=>new URL(a.getAttribute('href'),'https://ccatelier.test').pathname===prefix+route),route);
    assert.equal(doc.querySelectorAll('a a,script,example').length,0);
    if(name==='cover')assert.equal(doc.querySelector('.personal-note p').textContent,writing[0].excerpt);
    const entries=[...doc.querySelectorAll(name==='cover'?'.personal-note':'.creation-traces li')];
    assert.equal(entries.length,writing.length);
    entries.forEach((entry,index)=>{
     const title=entry.querySelector(name==='cover'?'h3 a':'a').cloneNode(true);
     title.querySelectorAll('[aria-hidden],svg').forEach(node=>node.remove());
     assert.equal(title.textContent.trim(),writing[index].title);
     assert.equal(entry.querySelector('time').textContent,writing[index].date.replaceAll('-','.'));
     assert.equal(new Date(entry.querySelector('time').dateTime).toISOString(),new Date(writing[index].date).toISOString());
    });
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

test('long article content stays intact with wrapping in the relevant compositions',()=>{
 const css=read('source/atelier/css/personal-home.css');
 const indexCss=read('source/atelier/css/editorial-index.css');
 const excerpt='https://example.test/'+ 'unbroken'.repeat(100);
 const title='LongUnbrokenArticleTitle'.repeat(80);
 for(const name of ['cover','stage']) {
  const dom=render(name,'/',[{...writing[0],title,excerpt}]);
  try {
   const style=dom.window.document.createElement('style');
   style.textContent=name==='cover'?css:indexCss;
   dom.window.document.head.append(style);
   const renderedLink=dom.window.document.querySelector(name==='cover'?'.personal-note h3 a':'.creation-traces li>a');
   assert.equal(dom.window.getComputedStyle(renderedLink).overflowWrap,'anywhere');
   if(name==='cover')assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector('.personal-note p')).overflowWrap,'anywhere');
   const link=renderedLink.cloneNode(true);
   link.querySelectorAll('[aria-hidden],svg').forEach(node=>node.remove());
   assert.equal(link.textContent.trim(),title);
   if(name==='cover')assert.equal(dom.window.document.querySelector('.personal-note p').textContent,excerpt);
   else assert.equal(dom.window.document.querySelectorAll('.creation-traces li p,.atelier-writing-summary').length,0);
  }finally{dom.window.close();}
 }
});

test('cover selects three actual articles after excluding the introductory post',()=>{
 const posts=[{title:'Hello CC Atelier',path:'hello/',date:'2026-10-10'},...writing,{title:'第三篇',path:'third/',date:'2026-08-10'},{title:'第四篇',path:'fourth/',date:'2026-07-10'}];
 for(const prefix of ['/','/lab/']) {
  const dom=render('cover',prefix,posts);
  try {
   assert.deepEqual([...dom.window.document.querySelectorAll('.home-writing-grid .personal-note h3 a')].map(a=>a.getAttribute('href')),posts.slice(1,4).map(post=>prefix+post.path));
   assert.equal(dom.window.document.querySelectorAll(`a[href="${prefix}hello/"]`).length,0);
  }finally{dom.window.close();}
 }
});

test('hero has responsive source assets and switches from a wide backdrop to a separate mobile image',()=>{
 const css=read('source/atelier/css/personal-home.css');
 const dom=render('cover','/lab/');
 try {
  const picture=dom.window.document.querySelector('#cover-photograph picture');
  assert.ok(picture);
  const source=picture.querySelector('source[media="(max-width:600px)"]');
  assert.ok(source);
  const img=picture.querySelector('#cover-image');
  assert.equal(img.width,1916);assert.equal(img.height,821);
  assert.equal(img.getAttribute('fetchpriority'),'high');
  for(const node of [source,img]) {
   assert.ok(node.getAttribute('sizes'));
   const candidates=node.getAttribute('srcset').split(',').map(item=>item.trim().split(/\s+/));
   assert.equal(candidates.length,2);
   assert.deepEqual(candidates.map(item=>item[1]),['960w','1916w']);
   for(const [src] of candidates)assert.ok(fs.existsSync(path.join(root,'source',src.slice('/lab/'.length))));
  }
  const sheetDom=new JSDOM(`<style>${css}</style>`);
  try {
   const rules=[...sheetDom.window.document.styleSheets[0].cssRules];
   const selector='.personal-home.home-edition ';
   const rule=(list,suffix)=>list.filter(item=>item.selectorText===selector+suffix).at(-1)?.style;
   assert.equal(rule(rules,'.personal-hero').getPropertyValue('grid-template-columns'),'1fr');
   assert.equal(rule(rules,'.personal-portrait').getPropertyValue('position'),'absolute');
   const mobile=rules.filter(item=>item.conditionText==='(max-width:760px)').flatMap(item=>[...item.cssRules]);
   assert.equal(rule(mobile,'.personal-hero').getPropertyValue('flex-direction'),'column');
   assert.equal(rule(mobile,'.personal-portrait').getPropertyValue('position'),'relative');
   assert.equal(rule(mobile,'.personal-portrait').getPropertyValue('order'),'1');
   assert.equal(rule(mobile,'.personal-intro').getPropertyValue('order'),'0');
   assert.equal(rule(mobile,'.personal-portrait img').getPropertyValue('transform'),'none');
   assert.match(rule(mobile,'.personal-portrait img').getPropertyValue('object-position'),/center/);
  }finally{sheetDom.window.close();}
 }finally{dom.window.close();}
});
