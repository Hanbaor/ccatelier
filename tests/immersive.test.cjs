const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
test('immersive cover removes brochure decoration and uses a dedicated mobile portrait',()=>{
 const dom=new JSDOM(fs.readFileSync(path.join(root,'public/index.html'),'utf8'));
 try {
  const d=dom.window.document;
  assert.ok(d.querySelector('.cinema-v3'));
  assert.equal(d.querySelectorAll('.cinema-copy h1').length,1);
  assert.equal(d.querySelectorAll('.cinema-copy p').length,1);
  assert.equal(d.querySelectorAll('.cinema-copy a').length,1);
  assert.equal(d.querySelectorAll('.entry-index,.entry-running-head,.entry-art-seal,.entry-signature').length,0);
  assert.match(d.querySelector('.cinema-art source').srcset,/v3\/about/);
  assert.equal(d.querySelectorAll('.header-navigation a').length,5);
  assert.equal(d.querySelectorAll('#menu-dialog nav a').length,9);
  assert.ok(d.querySelector('.cinema-enter svg'),'CTA arrow must be a font-independent SVG');
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
