const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname,'..');
const page = route => new JSDOM(fs.readFileSync(path.join(root,'public',route),'utf8'));

test('generated personal home and creative index lead with actual published writing',()=>{
 const cover=page('index.html'),stage=page('atelier/index.html');
 const archive=JSON.parse(fs.readFileSync(path.join(root,'public/atelier/data/archive.json'),'utf8'));
 const writing=archive.posts.filter(post=>post.group==='writing');
 const selected=writing.filter(post=>!/^Hello CC Atelier$/i.test(post.title)).slice(0,3);
 const label=node=>{const copy=node.cloneNode(true);copy.querySelectorAll('[aria-hidden],svg').forEach(child=>child.remove());return copy.textContent.trim();};
 try {
  const c=cover.window.document,d=stage.window.document;
  assert.ok(c.querySelector('.personal-home'));
  assert.ok(d.querySelector('.personal-atelier.creation-index'));
  assert.equal(selected.length,3,'the published catalogue supplies three real featured articles');
  assert.equal(c.querySelector('.personal-primary').getAttribute('href'),'/notes/');
  assert.deepEqual([...c.querySelectorAll('.personal-note h3 a')].map(a=>a.getAttribute('href')),selected.map(post=>post.path));
  const traces=[...d.querySelectorAll('.creation-traces li')];
  assert.deepEqual(traces.map(item=>item.querySelector('a').getAttribute('href')),writing.slice(0,5).map(post=>post.path));
  for(const [index,item] of traces.entries()){
   assert.equal(label(item.querySelector('a')),writing[index].title);
   assert.equal(item.querySelector('time').textContent,writing[index].date.replaceAll('-','.'));
   assert.equal(item.querySelector('time').dateTime.slice(0,10),writing[index].date);
  }
  assert.equal(d.querySelectorAll('.atelier-writing-summary,.atelier-writing-feature').length,0);
  for(const [index,article] of [...c.querySelectorAll('.personal-note')].entries()) {
   assert.equal(label(article.querySelector('h3')),selected[index].title);
   assert.equal(article.querySelector('time').textContent,selected[index].date.replaceAll('-','.'));
   assert.equal(article.querySelector('time').dateTime.slice(0,10),selected[index].date);
   if(selected[index].excerpt)assert.equal(article.querySelector('p').textContent,selected[index].excerpt);
  }
  assert.ok(d.querySelector('.creation-works a[href="/projects/"]'));
  assert.ok(d.querySelector('.creation-main-work a[href="/studio/practice/"]'));
  assert.equal(c.querySelectorAll('.cinema-v3').length,0);
  assert.equal(d.querySelectorAll('.hub-grid,a a').length,0);
  assert.ok(c.querySelector('link[href="/atelier/css/personal-home.css"]'));
 }finally{cover.window.close();stage.window.close();}
});

test('all curated art uses local optimized files and resolvable responsive renditions',()=>{
 for(const name of ['hero','stage','notes','research','life','lounge']) {
  for(const suffix of ['','-960'])assert.ok(fs.statSync(path.join(root,`source/atelier/images/v2/${name}${suffix}.webp`)).size>10000);
 }
 for(const route of ['index.html','atelier/index.html','notes/index.html','studio/index.html','research/index.html','life/index.html','projects/index.html','about/index.html','lounge/index.html','guestbook/index.html']) {
  const dom=page(route);
  try {for(const img of dom.window.document.querySelectorAll('main img[src*="/images/v2/"],main img[src*="/images/v3/"]')) {
   assert.ok(img.alt.trim(),route+' art needs alt text');
   assert.ok(img.getAttribute('width')&&img.getAttribute('height'),route+' art needs stable intrinsic dimensions');
   for(const src of [img.getAttribute('src'),...(img.getAttribute('srcset')||'').split(',').map(item=>item.trim().split(/\s+/)[0]).filter(Boolean)]) {
    assert.ok(fs.existsSync(path.join(root,'public',src.replace(/^\//,''))),route+': '+src);
   }
  }}finally{dom.window.close();}
 }
});

test('editorial stylesheets parse and are included in the offline shell',()=>{
 const dom=new JSDOM('<html><head></head><body></body></html>');
 try {for(const name of ['editorial.css','rooms-v2.css','immersive.css','personal-home.css']) {
  const style=dom.window.document.createElement('style');style.textContent=fs.readFileSync(path.join(root,'source/atelier/css',name),'utf8');dom.window.document.head.append(style);
  assert.ok(style.sheet.cssRules.length>40);
  assert.ok(JSON.parse(fs.readFileSync(path.join(root,'public/atelier/data/offline-shell.json'),'utf8')).includes('/atelier/css/'+name));
 }}finally{dom.window.close();}
});

test('daylight is the first-visit default while an explicit night preference is preserved',async()=>{
 const dom=new JSDOM('<html><head><meta name="theme-color"></head><body><button data-theme-toggle></button></body></html>',{url:'https://ccatelier.test/'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,CustomEvent:dom.window.CustomEvent});
 let saved=null;const storage={get:()=>saved,set:(key,value)=>{saved=value;return true}};
 try {
  const {initTheme}=await import('../source/atelier/js/theme.js');initTheme({storage});
  assert.ok(document.body.classList.contains('light'));
  document.querySelector('[data-theme-toggle]').click();assert.equal(saved,'dark');
  window.dispatchEvent(new window.StorageEvent('storage',{key:'cc-theme'}));assert.ok(document.body.classList.contains('dark-mode'));
  saved=null;window.dispatchEvent(new window.StorageEvent('storage',{key:null}));assert.ok(document.body.classList.contains('light'));
 }finally{dom.window.close();}
});

test('the catalogue defaults to a compact track list and grid links still round-trip',async()=>{
 const {readQuery,writeQuery}=await import('../source/atelier/js/archive-core.mjs');
 assert.equal(readQuery().view,'list');assert.equal(readQuery().group,'writing');
 const grid={...readQuery(),view:'grid',q:'二叉树'};assert.deepEqual(readQuery(writeQuery(grid)),grid);
});
