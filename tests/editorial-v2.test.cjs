const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname,'..');
const page = route => new JSDOM(fs.readFileSync(path.join(root,'public',route),'utf8'));

test('the entry, studio index and notes have distinct editorial compositions and illustrations',()=>{
 const cover=page('index.html'),stage=page('atelier/index.html'),notes=page('notes/index.html');
 try {
  assert.ok(cover.window.document.querySelector('.cinema-v3'));
  assert.equal(cover.window.document.querySelectorAll('.entry-index,.entry-running-head,.entry-art-seal').length,0);
  assert.ok(cover.window.document.querySelector('.cinema-enter[data-enter][href="/atelier/"]'));
  assert.ok(cover.window.document.querySelector('.header-navigation a[href="/notes/"]'));
  assert.equal(stage.window.document.querySelectorAll('.hub-grid>a').length,5);
  assert.equal(stage.window.document.querySelectorAll('.atelier-room').length,0,'tile names must not inherit secondary-room page styles');
  assert.ok(notes.window.document.querySelector('.catalog-heading-v3'));
  assert.equal(notes.window.document.querySelectorAll('.archive-editor-pick').length,0);
  assert.notEqual(cover.window.document.querySelector('#cover-image').getAttribute('src'),stage.window.document.querySelector('.hub-writing img').getAttribute('src'));
  assert.match(notes.window.document.querySelector('.catalog-heading-v3 img').src,/v2\/notes\.webp$/);
 }finally{cover.window.close();stage.window.close();notes.window.close();}
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
 try {for(const name of ['editorial.css','rooms-v2.css','immersive.css']) {
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
 assert.equal(readQuery().view,'list');assert.equal(readQuery().group,'all');
 const grid={...readQuery(),view:'grid',q:'二叉树'};assert.deepEqual(readQuery(writeQuery(grid)),grid);
});
