const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// REVIEW_SOURCE makes this same regression test runnable against the staged
// files, then unchanged after the patch is integrated into the checkout.
const root = process.env.REVIEW_SOURCE || path.resolve(__dirname, '..');
const deps = process.env.REVIEW_DEPENDENCIES || root;
const ejs = require(require.resolve('ejs', {paths:[deps]}));
const {JSDOM} = require(require.resolve('jsdom', {paths:[deps]}));
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const original = file => fs.readFileSync(path.join(deps,file),'utf8');
function fixture(prefix='/', scripting=true) {
 const context = {page:{nijika:'research'},theme:{nijika:{cursor:false,motion:false}},config:{search:{path:'search.json'}},nijika_section:()=> 'research',url_for:v=>prefix+v.replace(/^\//,''),body:'<h1 tabindex="-1">研究</h1>',partial:name=>name==='nijika/header'?ejs.render(read('custom/redefine/nijika/header.ejs'),context):name==='nijika/dialogs'?'<dialog id="menu-dialog"><button data-close="menu-dialog">关闭</button><a href="'+prefix+'projects/">项目</a></dialog>':''};
 const dom = new JSDOM(ejs.render(read('custom/redefine/layout.ejs'),context),{url:'https://example.test'+prefix+'research/',...(scripting?{runScripts:'outside-only'}:{})});
 const {document}=dom.window;
 const style=document.createElement('style');style.textContent=original('source/atelier/css/atelier.css')+'\n'+read('source/atelier/css/refinement.css');document.head.append(style);
 const dialog=document.querySelector('dialog');
 dialog.showModal=function(){this.open=true;this.querySelector('button').focus();};
 dialog.close=function(){this.open=false;document.querySelector('.menu-open').focus();};
 const code=read('source/atelier/js/ui.js').replace(/^import[^\n]+\n/gm,'').replace(/\bexport /g,'');
 const sandbox={document,window:dom.window,matchMedia:()=>({matches:false,addEventListener(){}}),CustomEvent:dom.window.CustomEvent,queueMicrotask,setTimeout,clearTimeout};
 vm.createContext(sandbox);vm.runInContext(code,sandbox);
 return {dom,document,dialog,sandbox,close:()=>dom.window.close()};
}
function fallbackUsable(f) {
 const {document:d,dom}=f;
 const native=d.querySelector('.menu-fallback'), nav=d.querySelector('#site-navigation');
 assert.equal(native.getAttribute('href'),'#site-navigation');
 assert.equal(native.hidden,false);assert.equal(nav.hidden,false);
 assert.equal(d.querySelector('.menu-open').hidden,true);
 assert.equal(nav.closest('noscript,dialog'),null);
 assert.equal(dom.window.getComputedStyle(native).display,'flex');
 assert.equal(dom.window.getComputedStyle(nav).display,'flex');
 assert.equal(nav.tabIndex,-1);nav.focus();assert.equal(d.activeElement,nav);native.focus();assert.equal(d.activeElement,native);
 const click=new dom.window.MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true});native.dispatchEvent(click);assert.equal(click.defaultPrevented,false);
}
function runMain(f, overrides={}) {
 // Execute the actual startup order. Only unrelated initializers are inert;
 // initDialogs is the real staged code, including all click bindings.
 for(const name of ['initSettings','initNavigationScenes','initCover','initSearch','initEffects','initRhythm','initReading','initCommunity','initModeration','initAfterHours','initQueue','initOffline','initImmersive','initRouteFeatures'])f.sandbox[name]=()=>{};
 Object.assign(f.sandbox,overrides);
 const source=original('source/atelier/js/main.js').replace(/^import[^\n]+\n/gm,'').split('// The concert bundle')[0];
 vm.runInContext(source,f.sandbox);
}
for(const prefix of ['/','/lab/']) {
 test(`missing module or disabled JavaScript retains native main navigation (${prefix})`,()=>{
  for(const scripting of [true,false]){const f=fixture(prefix,scripting);try{fallbackUsable(f);assert.deepEqual([...f.document.querySelectorAll('#site-navigation a')].map(a=>a.pathname),['','atelier/','notes/','projects/','research/','studio/','life/','about/'].map(route=>prefix+route));}finally{f.close();}}
 });
 test(`successful main startup removes fallback clutter and preserves dialog behavior (${prefix})`,()=>{
  const f=fixture(prefix);try{runMain(f);const trigger=f.document.querySelector('.menu-open');assert.equal(trigger.hidden,false);assert.equal(f.document.querySelector('.menu-fallback').hidden,true);assert.equal(f.document.querySelector('#site-navigation').hidden,true);assert.equal(f.dom.window.getComputedStyle(f.document.querySelector('#site-navigation')).display,'none');assert.equal(f.dom.window.getComputedStyle(f.document.querySelector('.menu-fallback')).display,'none');trigger.focus();trigger.click();assert.equal(f.dialog.open,true);assert.equal(f.document.activeElement,f.dialog.querySelector('button'));f.dialog.querySelector('button').click();assert.equal(f.dialog.open,false);assert.equal(f.document.activeElement,trigger);}finally{f.close();}
 });
 test(`startup failure before menu readiness preserves native navigation (${prefix})`,()=>{
  for(const where of ['settings','dialog']){const f=fixture(prefix);try{if(where==='dialog')f.dialog.addEventListener=()=>{throw Error('setup failed');};assert.throws(()=>runMain(f,where==='settings'?{initSettings:()=>{throw Error('setup failed');}}:{}),/setup failed/);fallbackUsable(f);}finally{f.close();}}
 });
 test(`unsupported dialogs retain fallback; later unrelated failures retain working menu (${prefix})`,()=>{
  const unsupported=fixture(prefix);try{unsupported.dialog.showModal=undefined;runMain(unsupported);fallbackUsable(unsupported);}finally{unsupported.close();}
  const f=fixture(prefix);try{assert.throws(()=>runMain(f,{initSearch:()=>{throw Error('search failed');}}),/search failed/);f.document.querySelector('.menu-open').click();assert.equal(f.dialog.open,true);}finally{f.close();}
 });
 test(`late enhancement does not hide focused fallback links or native target (${prefix})`,async()=>{
  for(const selector of ['.menu-fallback','#site-navigation','#site-navigation a']){const f=fixture(prefix);try{const active=f.document.querySelector(selector);active.focus();runMain(f);assert.equal(f.document.activeElement,active);assert.equal(f.document.querySelector('#site-navigation').hidden,false);assert.equal(f.document.querySelector('.menu-open').hidden,true);f.document.querySelector('h1').focus();await Promise.resolve();assert.equal(f.document.querySelector('#site-navigation').hidden,true);assert.equal(f.document.querySelector('.menu-open').hidden,false);assert.equal(f.document.activeElement,f.document.querySelector('h1'));}finally{f.close();}}
 });
}

test('direct fallback fragment is not hidden before native focus and bfcache keeps one set of handlers',async()=>{
 const f=fixture('/lab/');try{
  f.dom.window.history.replaceState(null,'','#site-navigation');
  let focusHandlers=0;const add=f.document.addEventListener.bind(f.document);
  f.document.addEventListener=(name,...args)=>{if(name==='focusout')focusHandlers++;return add(name,...args);};
  runMain(f);f.sandbox.initDialogs();
  f.dom.window.dispatchEvent(new f.dom.window.PageTransitionEvent('pagehide',{persisted:true}));
  f.dom.window.dispatchEvent(new f.dom.window.PageTransitionEvent('pageshow',{persisted:true}));
  f.sandbox.initDialogs();
  assert.equal(focusHandlers,1);
  assert.equal(f.document.querySelector('#site-navigation').hidden,false);
  assert.equal(f.document.querySelector('.menu-open').hidden,true);
  f.document.querySelector('#site-navigation').focus();
  f.document.querySelector('h1').focus();await Promise.resolve();
  assert.equal(f.document.querySelector('#site-navigation').hidden,false,'keep a directly addressed native region available');
  f.dom.window.history.replaceState(null,'','#main-content');
  f.dom.window.dispatchEvent(new f.dom.window.HashChangeEvent('hashchange'));
  assert.equal(f.document.querySelector('#site-navigation').hidden,true);
  let opens=0;f.document.addEventListener('atelier:dialog-open',()=>opens++);
  f.sandbox.initDialogs();f.document.querySelector('.menu-open').click();
  assert.equal(opens,1,'one click opens once after reinitialization and bfcache');
 }finally{f.close();}
});

test('actual route head stylesheet order honors hidden controls in all four principal pages',()=>{
 for(const route of ['cover','projects','research','about']) {
  const f=fixture();try{
   const head=new JSDOM(ejs.render(original('custom/redefine/nijika/head.ejs'),{page:{nijika:route},theme:{nijika:{cover:''}},nijika_art_srcset:()=>'',nijika_page_metadata:()=>({documentTitle:route,title:route,description:'',url:'https://example.test/'}),is_post:()=>false,is_home:()=>false,is_archive:()=>false,is_category:()=>false,is_tag:()=>false,is_page:()=>true,url_for:v=>'/'+v.replace(/^\//,''),open_graph:()=>'',export_config:()=>''}));
   const files=[...head.window.document.querySelectorAll('link[rel="stylesheet"]')].map(link=>link.getAttribute('href').slice(1));head.window.close();
   const css=files.map(file=>file==='atelier/css/refinement.css'?read('source/'+file):fs.existsSync(path.join(deps,'source',file))?original('source/'+file):original('public/'+file)).join('\n');
   f.document.querySelectorAll('style').forEach(node=>node.remove());
   const style=f.document.createElement('style');style.textContent=css;f.document.head.append(style);
   assert.equal(f.dom.window.getComputedStyle(f.document.querySelector('.menu-open')).display,'none',route+' keeps uninitialized menu hidden');
   assert.equal(f.dom.window.getComputedStyle(f.document.querySelector('.menu-fallback')).display,'flex');
   runMain(f);
   assert.notEqual(f.dom.window.getComputedStyle(f.document.querySelector('.menu-open')).display,'none');
   for(const selector of ['.menu-fallback','#site-navigation'])assert.equal(f.dom.window.getComputedStyle(f.document.querySelector(selector)).display,'none',route+' removes successful fallback');
  }finally{f.close();}
 }
});

test('native fallback remains usable on screen but stays out of printed pages',()=>{
 for(const scripting of [true,false]) {
  const f=fixture('/lab/',scripting);try {
   // A missing module and disabled scripting both leave the native route usable.
   fallbackUsable(f);
   const nav=f.document.querySelector('#site-navigation');
   const sheet=new JSDOM(`<style>${read('source/atelier/css/refinement.css')}</style>`);
   let printRules;
   try {
    printRules=[...sheet.window.document.styleSheets[0].cssRules]
     .filter(rule=>rule.type===4&&rule.conditionText==='print')
     .flatMap(rule=>[...rule.cssRules]);
    const hide=printRules.find(rule=>rule.selectorText?.split(',').some(selector=>selector.trim()==='.no-script-nav'));
    assert.ok(hide,'the native navigation belongs to the existing print-only chrome suppression');
    assert.equal(hide.style.getPropertyValue('display'),'none');
    assert.equal(hide.style.getPropertyPriority('display'),'important');
   }finally{sheet.window.close();}
   // jsdom cannot switch rendering media. Apply the real print rules explicitly
   // to verify their DOM/CSS contract without claiming a print-preview check.
   const print=f.document.createElement('style');print.textContent=printRules.map(rule=>rule.cssText).join('\n');f.document.head.append(print);
   assert.equal(f.dom.window.getComputedStyle(nav).display,'none');
   print.remove();
   assert.equal(f.dom.window.getComputedStyle(nav).display,'flex');
   assert.equal(nav.hidden,false,'printing does not mutate navigation readiness');
  }finally{f.close();}
 }
});

for(const prefix of ['/','/lab/']) test(`later fragment history restores native navigation without losing focus (${prefix})`,async()=>{
 const f=fixture(prefix);try{
  runMain(f);
  const nav=f.document.querySelector('#site-navigation'),fallback=f.document.querySelector('.menu-fallback'),trigger=f.document.querySelector('.menu-open');
  const visit=hash=>{f.dom.window.history.replaceState(null,'',hash);f.dom.window.dispatchEvent(new f.dom.window.HashChangeEvent('hashchange'));};
  for(let cycle=0;cycle<2;cycle++) {
   trigger.focus();
   visit('#site-navigation');
   assert.equal(nav.hidden,false,'a previously enhanced page restores the fragment destination');
   assert.equal(fallback.hidden,false);
   assert.equal(trigger.hidden,true);
   assert.equal(f.document.activeElement,nav,'focus never remains on the newly hidden trigger');
   nav.querySelector('a').focus();
   visit('#main-content');
   assert.equal(nav.hidden,false,'history changes do not remove a focused native link');
   f.document.querySelector('h1').focus();await Promise.resolve();
   assert.equal(nav.hidden,true,'the enhanced menu returns after focus leaves');
   assert.equal(fallback.hidden,true);
   assert.equal(trigger.hidden,false);
   assert.equal(f.document.activeElement,f.document.querySelector('h1'));
  }
  f.document.querySelector('h1').focus();visit('#site-navigation');
  assert.equal(nav.hidden,false);
  assert.equal(f.document.activeElement,f.document.querySelector('h1'),'unrelated focus is not stolen');
  visit('#main-content');
  assert.equal(nav.hidden,true);
  let opens=0;f.document.addEventListener('atelier:dialog-open',()=>opens++);
  f.sandbox.initDialogs();trigger.click();
  assert.equal(opens,1,'repeated history changes do not duplicate menu bindings');
  assert.equal(f.dialog.open,true);
  visit('#site-navigation');
  assert.equal(f.dialog.open,false,'addressing the native destination dismisses the menu');
  assert.equal(nav.hidden,false);
  assert.equal(f.document.activeElement,nav,'closing the menu cannot restore focus to its hidden trigger');
  f.document.querySelector('h1').focus();await Promise.resolve();
 }finally{f.close();}
});
