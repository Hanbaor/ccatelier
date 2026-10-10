const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
function page(html='<main></main>'){return new JSDOM(html,{url:'https://ccatelier.test/lab/example/',pretendToBeVisual:true});}

test('built route DOM selects only relevant feature imports, independent of URL prefix',async()=>{
 const {initRouteFeatures,routeFeatures}=await import('../source/atelier/js/route-features.js');
 const cases=[['index.html',[]],['atelier/index.html',[]],['notes/index.html',['archive']],['studio/index.html',['studio']],['studio/practice/index.html',[]],['hot100/001/index.html',['reader','notebook','code']],['hot100/031/index.html',['reader','notebook','code']],['2026/09/22/Hello-CC-Atelier/index.html',['reader','notebook']],['projects/index.html',[]],['archives/index.html',[]],['tags/index.html',[]],['lounge/index.html',[]],['admin/index.html',[]],['guestbook/index.html',[]],['404.html',[]]];
 for(const [file,expected] of cases){
  const dom=page(fs.readFileSync(path.join(__dirname,'../public',file),'utf8')),calls=[],initializations=[];
  const loaders=Object.fromEntries(routeFeatures.map(feature=>[feature.id,async()=>{calls.push(feature.id);return {[feature.init](){initializations.push(feature.id);}};}]));
  try{const results=await initRouteFeatures({root:dom.window.document,loaders});assert.deepEqual(calls,expected,file);assert.deepEqual(initializations,expected,file);assert.ok(results.every(r=>r.status==='ready'));await initRouteFeatures({root:dom.window.document,loaders});assert.deepEqual(calls,expected,'repeated boot cannot duplicate feature listeners');}
  finally{dom.window.close();}
 }
});

test('a failed route import stays isolated, preserves archive fallback, and offers bounded retry',async()=>{
 const {initRouteFeatures,routeFeatures}=await import('../source/atelier/js/route-features.js');
 const dom=page('<main data-archive><div class="archive-app" hidden></div><div class="archive-fallback"><a href="/lab/notes/a/">Native article</a></div></main><section class="reading-studio"><div class="article-body"></div><aside class="reader-options"><div class="reader-options-body"></div></aside></section>');
 const doc=dom.window.document;let fail=true,archiveLoads=0;
 const loaders=Object.fromEntries(routeFeatures.map(feature=>[feature.id,async()=>{if(feature.id==='archive'){archiveLoads++;if(fail)throw Error('offline');}return {[feature.init](){}};}]));
 try{const results=await initRouteFeatures({root:doc,loaders});assert.deepEqual(results.map(r=>r.status),['failed','ready','ready']);assert.equal(doc.querySelector('.archive-fallback').hidden,false);assert.equal(doc.querySelector('.archive-app').hidden,true);assert.equal(doc.querySelector('.archive-fallback a').getAttribute('href'),'/lab/notes/a/');const status=doc.querySelector('[data-feature-status=archive]');assert.equal(status.getAttribute('role'),'status');assert.match(status.textContent,/重新加载/);fail=false;status.querySelector('button').click();await flush();assert.equal(archiveLoads,2);assert.equal(doc.querySelector('[data-feature-status=archive]'),null);}
 finally{dom.window.close();}
});

test('slow reader import preserves typed values and only the latest click, without synthetic speech',async()=>{
 const {startFeature}=await import('../source/atelier/js/route-features.js');
 const dom=page('<section><input id="reader-find"><input data-reader-size type="range" min="14" max="23" value="17"><button data-next>Next</button><button data-clear>Clear</button><button data-speech-play>Speak</button></section>');
 const {document:doc}=dom.window,pending=deferred(),events=[];
 const feature={id:'reader',selector:'section',label:'阅读工具',init:'init',controls:'#reader-find,[data-reader-size],[data-next],[data-clear],[data-speech-play]'};
 const record=startFeature(feature,{root:doc,load:()=>pending.promise});
 const input=doc.querySelector('#reader-find'),size=doc.querySelector('[data-reader-size]');
 input.value='快速输入的中文';input.dispatchEvent(new dom.window.CompositionEvent('compositionend',{bubbles:true}));size.value='21';size.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 doc.querySelector('[data-next]').click();doc.querySelector('[data-next]').click();doc.querySelector('[data-clear]').click();doc.querySelector('[data-speech-play]').click();
 pending.resolve({init(){size.value='17';for(const node of doc.querySelectorAll('input'))for(const type of ['input','compositionend'])node.addEventListener(type,()=>events.push([node.id||'size',node.value]));for(const node of doc.querySelectorAll('button'))node.addEventListener('click',()=>events.push(node.textContent));}});
 try{await record.ready;assert.equal(input.value,'快速输入的中文');assert.equal(size.value,'21');assert.deepEqual(events,[['reader-find','快速输入的中文'],['size','21']]);assert.match(doc.querySelector('[role=status]').textContent,/已就绪.*再次/);doc.querySelector('[data-speech-play]').click();assert.equal(events.at(-1),'Speak');}
 finally{dom.window.close();}
});

test('pending notebook intent and studio sound shortcut cannot survive a dialog or page exit',async()=>{
 const {startFeature}=await import('../source/atelier/js/route-features.js');
 for(const event of ['atelier:dialog-open','pagehide','visibilitychange']){
  const dom=page('<section class="article-body"><button data-notebook-open>Notebook</button></section>'),doc=dom.window.document,pending=deferred();let opens=0;
  const record=startFeature({id:'notebook',selector:'.article-body',label:'札记',init:'init',controls:'[data-notebook-open]'},{root:doc,load:()=>pending.promise});
  doc.querySelector('button').click();
  if(event==='visibilitychange')Object.defineProperty(doc,'hidden',{value:true,configurable:true});
  (event==='pagehide'?dom.window:doc).dispatchEvent(new dom.window.Event(event));
  pending.resolve({init(){doc.querySelector('button').addEventListener('click',()=>opens++);}});
  await record.ready;assert.equal(opens,0,event);dom.window.close();
 }
 const dom=page('<section data-studio></section>'),doc=dom.window.document,pending=deferred();let keys=0;
 const record=startFeature({id:'studio',selector:'[data-studio]',label:'节奏实验室',init:'init'},{root:doc,load:()=>pending.promise});
 doc.body.dispatchEvent(new dom.window.KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true,cancelable:true}));pending.resolve({init(){doc.addEventListener('keydown',()=>keys++);}});await record.ready;assert.equal(keys,0);assert.match(doc.querySelector('[role=status]').textContent,/再次/);dom.window.close();
});

test('retry never duplicates a partially initialized feature',async()=>{
 const {startFeature}=await import('../source/atelier/js/route-features.js');
 const dom=page('<main></main>');let calls=0;
 const result=await startFeature({id:'reader',selector:'main',label:'阅读工具',init:'init'},{root:dom.window.document,load:async()=>({init(){calls++;throw Error('partial initialization');}})}).ready;
 assert.equal(result.status,'failed');assert.equal(calls,1);assert.equal(dom.window.document.querySelector('button').textContent,'刷新页面');dom.window.close();
});

 test('failed reader interactions retain retry and typed values across the next import',async()=>{
 const {startFeature}=await import('../source/atelier/js/route-features.js');
 const dom=page('<section><input id="reader-find"><input data-reader-size type="range" min="14" max="23" value="17"><button data-find-next>Next</button></section>'),doc=dom.window.document;let fail=true,clicks=0;
 const record=startFeature({id:'reader',selector:'section',label:'阅读工具',init:'init',controls:'#reader-find,[data-reader-size],[data-find-next]'},{root:doc,load:async()=>{if(fail)throw Error('offline');return {init(){doc.querySelector('[data-reader-size]').value='17';doc.querySelector('[data-find-next]').addEventListener('click',()=>clicks++);}};}});
 const size=doc.querySelector('[data-reader-size]');size.value='22';size.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await record.ready;
 doc.querySelector('[data-find-next]').click();assert.ok(doc.querySelector('[role=status] button'),'a failed control must not replace its retry button');fail=false;doc.querySelector('[role=status] button').click();await record.ready;assert.equal(size.value,'22');assert.equal(clicks,1);dom.window.close();
 });
