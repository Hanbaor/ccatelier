'use strict';
// Run AFTER the candidate fixed repository has generated its real public HTML.
// Node/jsdom/API models only; not browser rendering or clipboard verification.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module'),{pathToFileURL}=require('node:url');
const repo=process.env.CC_REPO||path.resolve(__dirname,'..'),req=createRequire(path.join(repo,'package.json'));
const {JSDOM,VirtualConsole}=req('jsdom');
const baseline=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/article-code-baseline.json')));
const sourceImport=name=>import(pathToFileURL(path.join(repo,'source/atelier/js',name)).href);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function snapshot(d){return [...d.querySelectorAll('.article-body figure.highlight')].map(f=>({language:[...f.classList].find(c=>!['highlight','iseeu'].includes(c)),lines:[...f.querySelectorAll('.code .line')].map(n=>n.textContent)}));}
test('eight real generated articles restore all 86 original copy/workbench entry points without altering authored code',async()=>{
 assert.equal(baseline.articles.length,8);assert.equal(baseline.articles.reduce((n,p)=>n+p.blocks.length,0),86);
 let total=0;
 for(const page of baseline.articles){
  assert.equal(hash(fs.readFileSync(path.join(repo,page.sourcePath))),page.sourceSHA256,'original Markdown unchanged: '+page.sourceId);
  const vc=new VirtualConsole();vc.on('jsdomError',error=>{if(!error.message.startsWith('Could not parse CSS stylesheet'))throw error;});
  const dom=new JSDOM(fs.readFileSync(path.join(repo,'public',page.path),'utf8'),{url:'https://ccatelier.test/'+page.path.replace(/index.html$/,''),pretendToBeVisual:true,virtualConsole:vc});
  const {window}=dom,doc=window.document,copies=[],scrolled=[];
  const globals={window,document:doc,location:window.location,navigator:window.navigator,CustomEvent:window.CustomEvent,innerHeight:900,innerWidth:1440,scrollY:0,matchMedia:()=>({matches:false,addEventListener(){}}),requestAnimationFrame:()=>0};
  const descriptors=new Map(Object.keys(globals).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  const oldTimer=globalThis.setTimeout;
  try{
   for(const [k,value] of Object.entries(globals))Object.defineProperty(globalThis,k,{value,writable:true,configurable:true});
   window.HTMLElement.prototype.scrollIntoView=function(){scrolled.push(this);};
   window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
   window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new window.Event('close'));};
   Object.defineProperty(window.navigator,'clipboard',{value:{writeText:async text=>{copies.push(text);}}});
   const figures=[...doc.querySelectorAll('.article-body figure.highlight')],containers=[...doc.querySelectorAll('.article-body .code-container')];
   assert.ok(containers.length>0,page.sourceId+': no vacuous zero == zero');assert.equal(containers.length,page.blocks.length);
   assert.equal(doc.querySelectorAll('.code-container .code-container').length,0);assert.deepEqual(snapshot(doc),page.blocks);
   const body=doc.querySelector('.article-body'),comparison=page.deliveredComparison;
   assert.equal(hash(body.textContent),comparison.bodyTextSHA256,'full article-body text unchanged from delivered discovery227');
   assert.deepEqual([...body.querySelectorAll('[id]')].map(n=>n.id),comparison.anchors,'every original content anchor unchanged');
   assert.deepEqual(figures.map(f=>({gutterLines:[...f.querySelectorAll('.gutter .line')].map(n=>n.textContent),codePreHTMLSHA256:hash(f.querySelector('.code pre').innerHTML),gutterPreHTMLSHA256:f.querySelector('.gutter pre')?hash(f.querySelector('.gutter pre').innerHTML):null})),comparison.blocks,'code and gutter markup, including trailing breaks, unchanged');
   if(page.sourceId==='124338541'){const demo=body.querySelector('[data-permutation-demo]');assert.ok(demo);assert.equal(demo.previousElementSibling,containers[0],'original permutation demo immediately follows its code block');assert.equal(demo.id,'permutation-trace');}
   assert.deepEqual([...doc.images].map(i=>Object.fromEntries([...i.attributes].map(a=>[a.name,a.value]))),page.images,'all generated image attributes unchanged');
   for(const [i,f] of figures.entries()){
    assert.equal(f.parentElement,containers[i]);assert.equal(f.getAttribute('tabindex'),'0');assert.equal(f.parentElement.hasAttribute('tabindex'),false);
    const language=page.blocks[i].language;assert.equal(f.parentElement.dataset.rel,language==='plain'?'Code':language[0].toUpperCase()+language.slice(1));
   }
   // The real full reading initializer requires its actual generated dialog/progress.
   assert.ok(doc.querySelector('#image-dialog'));assert.ok(doc.querySelector('#toast'));assert.ok(doc.querySelector('.reading-progress>span'));
   assert.equal(doc.querySelectorAll('.article-body .tabs').length,0,'fixture must not start unrelated dynamic tabs import');
   const {initReading}=await sourceImport('reading.js');initReading();
   const {routeFeatures,startFeature}=await sourceImport('route-features.js'),feature=routeFeatures.find(f=>f.id==='code');
   assert.ok(doc.querySelector(feature.selector),'production route discovery must reach code feature');
   const module=await sourceImport('code-studio.js'),record=startFeature(feature,{root:doc,load:async()=>module});
   assert.equal((await record.ready).status,'ready');
   const buttons=[...doc.querySelectorAll('.article-body .copy-code')],openers=[...doc.querySelectorAll('.article-body .code-workbench-open')];
   assert.equal(buttons.length,page.blocks.length);assert.equal(openers.length,page.blocks.length);assert.equal(doc.querySelectorAll('#code-studio-dialog').length,1);
   // Suppress only presentation reset timers. Clipboard remains a declared API model.
   globalThis.setTimeout=(fn,ms,...args)=>[1700,2200].includes(ms)?0:oldTimer(fn,ms,...args);
   for(const [i,button] of buttons.entries()){
    button.click();await tick();assert.equal(copies[i],page.blocks[i].lines.join('\n'));assert.equal(button.textContent,'已复制');
    openers[i].click();const dialog=doc.querySelector('#code-studio-dialog');assert.equal(dialog.open,true);
    assert.deepEqual([...dialog.querySelectorAll('.code-lines>div>code')].map(n=>n.textContent),page.blocks[i].lines.map(s=>s||' '));
    const line=dialog.querySelector('.code-lines>div>button');assert.ok(line);line.click();assert.equal(line.getAttribute('aria-pressed'),'true');dialog.close();
   }
   module.initCodeStudio();assert.equal(doc.querySelectorAll('.code-workbench-open').length,page.blocks.length,'code initialization remains idempotent');
   assert.equal(doc.querySelectorAll('#code-studio-dialog').length,1);assert.deepEqual(snapshot(doc),page.blocks,'original highlighted code untouched by interaction');
   total+=containers.length;
  }finally{
   globalThis.setTimeout=oldTimer;dom.window.close();for(const [k,d] of descriptors){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}
  }
 }
 assert.equal(total,86);
});
