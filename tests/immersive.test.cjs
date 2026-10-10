const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
test('personal home presents actual writing and a responsive artwork without an entrance gate',()=>{
 const dom=new JSDOM(fs.readFileSync(path.join(root,'public/index.html'),'utf8'));
 try {
  const d=dom.window.document;
  assert.ok(d.querySelector('.personal-home'));
  assert.equal(d.querySelectorAll('main h1').length,1);
  assert.equal(d.querySelectorAll('.personal-note').length,3);
  assert.ok(d.querySelector('.personal-actions a[href="/notes/"]'));
  assert.ok(d.querySelector('.personal-actions a[href="/about/"]'));
  assert.equal(d.querySelectorAll('.cinema-v3,.entry-index,.entry-running-head,.entry-art-seal').length,0);
  const source=d.querySelector('.personal-portrait source');
  assert.equal(source.media,'(max-width:600px)');
  assert.equal(source.getAttribute('srcset'),'/atelier/images/v3/hero-960.webp 960w, /atelier/images/v3/hero.webp 1916w');
  assert.equal(source.getAttribute('sizes'),'(max-width:500px) calc(148vw - 59.2px), 136.16vw');
  assert.ok(d.querySelector('.personal-primary svg'));
  assert.equal(d.querySelectorAll('main a a').length,0);
  assert.ok(d.querySelector('link[href="/atelier/css/personal-home.css"]'));
  const preload=d.querySelector('link[rel="preload"][as="image"][media="(max-width:600px)"]');
  assert.equal(preload.getAttribute('href'),'/atelier/images/v3/hero-960.webp');
  assert.equal(preload.getAttribute('imagesrcset'),source.getAttribute('srcset'));
  assert.equal(preload.getAttribute('imagesizes'),source.getAttribute('sizes'));
 }finally{dom.window.close();}
});
test('reveals keep content available without motion and disconnect on pagehide',async()=>{
 const dom=new JSDOM('<body><a data-reveal href="/notes/">Notes</a><div id="toast"></div></body>',{url:'https://ccatelier.test/'});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,matchMedia:()=>({matches:false,addEventListener(){}})});
 try {
  const {motion}=await import('../source/atelier/js/ui.js');motion.enabled=false;
  const {initImmersive}=await import('../source/atelier/js/immersive.js');initImmersive();
  assert.ok(document.querySelector('[data-reveal]').classList.contains('is-visible'));
  assert.ok(!document.body.classList.contains('immersive-motion'));
  window.dispatchEvent(new window.Event('pagehide'));
 }finally{dom.window.close();}
});
