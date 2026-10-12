const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');

test('ui and route modules can be imported without browser globals or matchMedia',async()=>{
 assert.equal(typeof globalThis.matchMedia,'undefined');assert.equal(typeof globalThis.window,'undefined');
 const {withImportDeadline,motion}=await import('../source/atelier/js/ui.js'),{startFeature}=await import('../source/atelier/js/route-features.js');
 assert.equal(typeof withImportDeadline,'function');assert.equal(typeof startFeature,'function');assert.equal(motion.enabled,false);
 const callbacks=new Map(),win={setTimeout(fn,ms){assert.equal(ms,15000);callbacks.set(1,fn);return 1;},clearTimeout(id){callbacks.delete(id);}};
 assert.equal(await withImportDeadline(Promise.resolve('ready'),win),'ready');assert.equal(callbacks.size,0);
});

test('settings still respect initial reduced motion, later preference changes, and the saved off choice',async t=>{
 const dom=new JSDOM('<body data-root="/" data-section="notes"><button class="motion-toggle"></button><div id="toast"></div></body>',{url:'https://atelier.test/notes/'}),win=dom.window,doc=win.document;
 let reduced=true,reads=0,change;const events=[];
 const media={get matches(){return reduced;},addEventListener(type,fn){assert.equal(type,'change');change=fn;}};
 const globals={window:win,document:doc,localStorage:win.localStorage,CustomEvent:win.CustomEvent,matchMedia(query){reads++;assert.equal(query,'(prefers-reduced-motion: reduce)');return media;}},saved=new Map();
 for(const [name,value] of Object.entries(globals)){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true,writable:true});}
 const {initSettings,motion}=await import('../source/atelier/js/ui.js');const previousMotion=motion.enabled;
 t.after(()=>{motion.enabled=previousMotion;win.close();for(const [name,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}});
 doc.addEventListener('atelier:motion',event=>events.push(event.detail));initSettings();assert.equal(reads,1);assert.equal(motion.enabled,false);assert.equal(doc.querySelector('button').getAttribute('aria-pressed'),'false');
 reduced=false;change();assert.equal(motion.enabled,true);assert.equal(doc.body.classList.contains('motion-off'),false);
 reduced=true;change();assert.equal(motion.enabled,false);assert.equal(doc.body.classList.contains('motion-off'),true);
 win.localStorage.setItem('cc-motion','off');reduced=false;change();assert.equal(motion.enabled,false);assert.deepEqual(events,[false,true,false,false]);assert.equal(reads,1,'preference changes reuse the active MediaQueryList');
});
