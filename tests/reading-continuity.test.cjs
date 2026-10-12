const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const read=name=>fs.readFileSync('source/atelier/js/'+name,'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ','');
function fixture(progress,hash='',readContext=()=>null,paused=false){
 const dom=new JSDOM('<body data-root="/"><nav><a data-notes-back href="/notes/">返回笔记</a><button data-reading-resume hidden></button></nav><h1 id="article-title">Title</h1><article class="article-body"><h2 id="part">Part</h2><p>Text</p></article><details class="reader-options"><summary>阅读工具</summary><div data-article-tools data-title="Title"><button data-reading-restart hidden></button></div></details></body>',{url:'https://example.test/writing/test/'+hash});
 const {window}=dom,doc=window.document,body=doc.querySelector('article'),intervals=new Map(),disk=new Map();let top=100,next=0,scrolls=[],failRead=progress==='unavailable';
 if(progress!==undefined)disk.set('cc-recent',typeof progress==='string'?progress:JSON.stringify([{path:'/writing/test/',title:'Title',progress}]));
 Object.defineProperty(body,'scrollHeight',{value:4540});body.getBoundingClientRect=()=>({top});window.scrollTo=args=>{scrolls.push(args);top=-(args.top-(window.scrollY+top));};
 const context=vm.createContext({window,document:doc,location:window.location,innerHeight:900,$:s=>doc.querySelector(s),$$:(s,root=doc)=>[...root.querySelectorAll(s)],Date,readNotesContext:readContext,localStorage:{getItem:k=>{if(failRead)throw Error('denied');return disk.get(k)??null;}},setInterval:fn=>{intervals.set(++next,fn);return next;},clearInterval:id=>intervals.delete(id)});
 vm.runInContext(read('reading-state.mjs')+'\nconst shelves=createShelfStore({set:(key,value)=>{disk.set(key,value);return true;}});\n'+read('article-reading.js'),vm.createContext(Object.assign(context,{disk})));if(paused)doc.querySelector('[data-article-tools]').dataset.readingPaused='true';window.setInterval=context.setInterval;window.clearInterval=context.clearInterval;context.initArticleReading();
 return {dom,window,doc,body,disk,intervals,scrolls,readFails:value=>failRead=value,init:()=>context.initArticleReading(),set:v=>top=-v*4000,tick:()=>[...intervals.values()].forEach(f=>f()),scroll:()=>window.dispatchEvent(new window.Event('scroll')),intent:()=>window.dispatchEvent(new window.Event('wheel')),value:()=>JSON.parse(disk.get('cc-recent')||'[]')[0]?.progress,close:()=>{window.dispatchEvent(new window.Event('pagehide'));dom.window.close();}};
}
test('fresh, partial and completed sessions reveal only the needed continuation',()=>{
 for(const [progress,visible] of [[undefined,false],[0,false],[.5,true],[1,false]]){const x=fixture(progress);try{assert.equal(x.doc.querySelector('[data-reading-resume]').hidden,!visible);assert.equal(x.doc.querySelector('details').open,false);assert.equal(x.scrolls.length,0);}finally{x.close();}}
});
test('incidental scroll, reload and hash jumps preserve the earlier position',()=>{
 for(const hash of ['', '#part']){let x=fixture(.5,hash);x.set(.0289);x.scroll();x.tick();assert.equal(x.value(),.5);x.window.dispatchEvent(new x.window.Event('pagehide'));assert.equal(x.value(),.5);x.close();x=fixture(x.disk.get('cc-recent'),hash);assert.match(x.doc.querySelector('[data-reading-resume]').textContent,/50%/);assert.equal(x.scrolls.length,0);x.set(.8);x.scroll();x.tick();assert.equal(x.value(),.5,'non-deliberate deep-link movement stays protected');x.close();}
});
test('deliberate reading past saved position releases protection, allowing backward reading',()=>{
 const x=fixture(.5);try{x.intent();x.set(.3);x.scroll();x.tick();assert.equal(x.value(),.5);x.intent();x.set(.6);x.scroll();x.tick();assert.equal(x.value(),.6);x.set(.4);x.scroll();x.tick();assert.equal(x.value(),.4);assert.equal(x.doc.querySelector('[data-reading-resume]').hidden,true);}finally{x.close();}
});
test('explicit resume and restart transfer focus and permit a real reread',()=>{
 const x=fixture(.5,'#part');try{x.doc.querySelector('[data-reading-resume]').click();assert.equal(x.scrolls.length,1);assert.equal(x.value(),.5);assert.equal(x.doc.activeElement.id,'part');assert.equal(x.doc.querySelector('details').open,false);assert.equal(x.doc.querySelector('[data-reading-resume]').hidden,true);x.doc.querySelector('[data-reading-restart]').click();assert.equal(x.value(),0);assert.equal(x.doc.activeElement.id,'article-title');x.set(.02);x.scroll();x.tick();assert.equal(x.value(),.02);}finally{x.close();}
});
test('BFCache pauses timers, does not duplicate initialization and refreshes durable progress',()=>{
 const x=fixture(.5);try{x.init();assert.equal(x.intervals.size,1);x.window.dispatchEvent(new x.window.Event('pagehide'));assert.equal(x.intervals.size,0);x.disk.set('cc-recent',JSON.stringify([{path:'/writing/test/',title:'Title',progress:.7}]));x.window.dispatchEvent(new x.window.PageTransitionEvent('pageshow',{persisted:true}));assert.equal(x.intervals.size,1);assert.match(x.doc.querySelector('[data-reading-resume]').textContent,/70%/);x.set(.1);x.scroll();x.tick();assert.equal(x.value(),.7);}finally{x.close();}
});
test('corrupt storage is never replaced by resume, scroll or restart',()=>{
 const x=fixture('{bad');try{x.set(.5);x.intent();x.scroll();x.tick();x.doc.querySelector('[data-reading-restart]').click();assert.equal(x.disk.get('cc-recent'),'{bad');}finally{x.close();}
});
test('keyboard reading intent ignores form entry and accepts page navigation',()=>{
 const x=fixture(.5);try{const button=x.doc.querySelector('[data-reading-resume]');button.dispatchEvent(new x.window.KeyboardEvent('keydown',{key:'End',bubbles:true}));x.set(.7);x.scroll();x.tick();assert.equal(x.value(),.5);x.doc.body.dispatchEvent(new x.window.KeyboardEvent('keydown',{key:'PageDown',bubbles:true}));x.scroll();x.tick();assert.equal(x.value(),.7);}finally{x.close();}
});

test('nested editor wheel and later hash navigation cannot authorize progress loss',()=>{
 const x=fixture(.5);try{const code=x.doc.createElement('pre');x.body.append(code);code.dispatchEvent(new x.window.Event('wheel',{bubbles:true}));x.set(.8);x.scroll();x.tick();assert.equal(x.value(),.5);x.intent();x.window.dispatchEvent(new x.window.Event('hashchange'));x.scroll();x.tick();assert.equal(x.value(),.5);const dialog=x.doc.createElement('dialog');dialog.open=true;x.doc.body.append(dialog);x.intent();x.scroll();x.tick();assert.equal(x.value(),.5);}finally{x.close();}
});
test('resume respects an existing focus target tabindex',()=>{const x=fixture(.5);try{x.doc.querySelector('#part').setAttribute('tabindex','0');x.doc.querySelector('[data-reading-resume]').click();assert.equal(x.doc.querySelector('#part').getAttribute('tabindex'),'0');}finally{x.close();}});

test('unavailable initialization and changed durable progress recover without incidental overwrite',()=>{
 for(const unavailable of [false,true]){const x=fixture(unavailable?'unavailable':.3);try{x.disk.set('cc-recent',JSON.stringify([{path:'/writing/test/',title:'Title',progress:.8}]));x.readFails(false);x.set(.1);x.scroll();x.tick();assert.equal(x.value(),.8);assert.match(x.doc.querySelector('[data-reading-resume]').textContent,/80%/);}finally{x.close();}}
});

test('article restores validated Notes context and leaves direct and malicious entry fallback intact',async()=>{
 const {readNotesContext}=await import('../source/atelier/js/reading-context.mjs');
 for(const [query,expected] of [['?notes='+encodeURIComponent('/notes/?q=map&view=grid#notes-catalog'),'/notes/?q=map&view=grid#notes-catalog'],['','/notes/'],['?notes='+encodeURIComponent('//evil.test/notes/'),'/notes/']]){const x=fixture(.5,query,readNotesContext);try{assert.equal(x.doc.querySelector('[data-notes-back]').getAttribute('href'),expected);assert.equal(x.scrolls.length,0);}finally{x.close();}}
});
test('reader arriving after pagehide waits for restored page before starting tracking',()=>{
 const x=fixture(.5,'',()=>null,true);try{assert.equal(x.intervals.size,0);assert.equal(x.doc.querySelector('[data-reading-resume]').hidden,true);delete x.doc.querySelector('[data-article-tools]').dataset.readingPaused;x.window.dispatchEvent(new x.window.PageTransitionEvent('pageshow',{persisted:true}));assert.equal(x.intervals.size,1);assert.equal(x.doc.querySelector('[data-reading-resume]').hidden,false);assert.equal(x.scrolls.length,0);}finally{x.close();}
});
