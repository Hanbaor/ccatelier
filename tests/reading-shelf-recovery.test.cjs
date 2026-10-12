const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test'),path=require('node:path');
const repo=path.resolve(__dirname,'..');
const {JSDOM}=require('jsdom');
const read=f=>fs.readFileSync(repo+'/source/atelier/js/'+f,'utf8');
const storageCode=read('ui.js').split("import {initTheme} from './theme.js';")[1].split('let toastTimer;')[0].replaceAll('export ','');
const shelfCode=read('reading-state.mjs').replaceAll('export ','');
const toolsCode=read('after-hours.js').replace(/^import .*;\n/gm,'').replaceAll('export ','').split('\nfunction passport()')[0];
const continuityCode=read('article-reading.js').replace(/^import .*;\n/gm,'').replaceAll('export ','');
const original=JSON.stringify([{path:'/old-a/',title:'Old A'},{path:'/old-b/',title:'Old B'}]);
function fixture(initial,kind='article',root='/'){
 const dom=new JSDOM(kind==='article'?'<body data-root="/"><div data-article-tools data-title="Current"></div><article class="article-body"></article><button data-bookmark></button><button data-copy-link></button><button data-focus-reading></button><button data-reading-resume hidden></button></body>':'<body data-root="/"><div data-reading-list></div><span data-saved-count></span></body>',{url:'https://synthetic.invalid/current/'});
 const intervals=[];const disk=new Map(Object.entries(initial)),writes=[],notices=[];let failRead=false,failWrite=false;
 dom.window.document.body.dataset.root=root;
 const context=vm.createContext({window:dom.window,document:dom.window.document,location:dom.window.location,innerHeight:900,motion:{enabled:false},toast:s=>notices.push(s),readNotesContext:()=>null,setInterval:fn=>{intervals.push(fn);return 1;},clearInterval:()=>{},localStorage:{getItem:k=>{if(failRead)throw Error('synthetic read denied');return disk.get(k)??null},setItem:(k,v)=>{if(failWrite)throw Error('synthetic quota exceeded');writes.push(k);disk.set(k,v)}}});
 dom.window.setInterval=context.setInterval;dom.window.clearInterval=context.clearInterval;
 vm.runInContext(storageCode+'\n'+shelfCode+'\nconst shelves=createShelfStore(storage);\n'+toolsCode+'\n'+continuityCode,context);
 return {tick:()=>intervals.forEach(fn=>fn()),disk,writes,notices,dom,run:code=>vm.runInContext(code,context),readFails:v=>failRead=v,writeFails:v=>failWrite=v,close:()=>dom.window.close()};
}
const broken=['[{"path":"/old-a/","title":"Old A"}',JSON.stringify({version:2,items:JSON.parse(original)})];
for(const raw of broken){
 test('invalid recent survives article initialization and progress writes: '+raw.slice(0,20),t=>{
  const x=fixture({'cc-recent':raw});t.after(x.close);x.run('readingTools();initArticleReading()');
  x.dom.window.dispatchEvent(new x.dom.window.Event('scroll'));x.tick();x.dom.window.dispatchEvent(new x.dom.window.Event('pagehide'));
  assert.equal(x.disk.get('cc-recent'),raw);assert.deepEqual(x.writes,[]);assert.deepEqual(x.notices,[]);
 });
 test('invalid saved rejects bookmark without false success and works after repair: '+raw.slice(0,20),t=>{
  const x=fixture({'cc-saved':raw});t.after(x.close);x.run('readingTools();initArticleReading()');const b=x.dom.window.document.querySelector('[data-bookmark]');
  b.click();assert.equal(x.disk.get('cc-saved'),raw);assert.equal(b.getAttribute('aria-pressed'),'false');assert.match(x.notices.at(-1),/原文已保留.*未作更改/);
  x.disk.set('cc-saved',original);b.click();assert.deepEqual(JSON.parse(x.disk.get('cc-saved')).map(p=>p.path),['/current/','/old-a/','/old-b/']);assert.equal(b.getAttribute('aria-pressed'),'true');
 });
 test('stale lounge delete cannot overwrite invalid saved: '+raw.slice(0,20),t=>{
  const x=fixture({'cc-saved':original},'lounge');t.after(x.close);x.run('discovery()');const b=x.dom.window.document.querySelector('.reading-shelf-row button');
  x.disk.set('cc-saved',raw);b.click();assert.equal(x.disk.get('cc-saved'),raw);assert.equal(x.dom.window.document.querySelectorAll('.reading-shelf-row').length,2);assert.match(x.notices.at(-1),/未作更改/);
  x.disk.set('cc-saved',original);b.click();assert.deepEqual(JSON.parse(x.disk.get('cc-saved')).map(p=>p.path),['/old-b/']);
 });
}
test('read denial with writable storage never creates incomplete recent or saved; recovery uses real data',t=>{
 const x=fixture({'cc-recent':original,'cc-saved':original});t.after(x.close);x.readFails(true);x.run('readingTools();initArticleReading()');const b=x.dom.window.document.querySelector('[data-bookmark]');b.click();
 x.dom.window.dispatchEvent(new x.dom.window.Event('scroll'));x.tick();assert.deepEqual(x.writes,[]);assert.equal(x.disk.get('cc-recent'),original);assert.equal(x.disk.get('cc-saved'),original);assert.match(x.notices.at(-1),/暂时无法读取.*未作更改/);assert.equal(b.getAttribute('aria-pressed'),'false');
 x.readFails(false);b.click();x.dom.window.dispatchEvent(new x.dom.window.Event('scroll'));x.tick();
 for(const key of ['cc-saved','cc-recent'])assert.deepEqual(JSON.parse(x.disk.get(key)).map(p=>p.path),['/current/','/old-a/','/old-b/']);
});
test('lounge read denial leaves its rows and unrelated records intact, then permits normal deletion',t=>{
 const x=fixture({'cc-saved':original},'lounge');t.after(x.close);x.run('discovery()');const b=x.dom.window.document.querySelector('.reading-shelf-row button');x.readFails(true);b.click();
 assert.equal(x.disk.get('cc-saved'),original);assert.equal(x.writes.length,0);assert.equal(x.dom.window.document.querySelectorAll('.reading-shelf-row').length,2);assert.match(x.notices.at(-1),/未作更改/);
 x.readFails(false);b.click();assert.deepEqual(JSON.parse(x.disk.get('cc-saved')).map(p=>p.path),['/old-b/']);assert.equal(x.dom.window.document.querySelectorAll('.reading-shelf-row').length,1);
});
test('quota preserves durable lists and supports temporary add, progress and removal with honest notices',t=>{
 const x=fixture({'cc-saved':original,'cc-recent':original});t.after(x.close);x.writeFails(true);x.run('readingTools();initArticleReading()');const b=x.dom.window.document.querySelector('[data-bookmark]');b.click();
 assert.equal(b.getAttribute('aria-pressed'),'true');assert.match(x.notices.at(-1),/仅在当前页面有效/);assert.equal(x.disk.get('cc-saved'),original);assert.equal(x.disk.get('cc-recent'),original);assert.equal(x.run("loadList('recent').length"),3);
 b.click();assert.equal(b.getAttribute('aria-pressed'),'false');assert.match(x.notices.at(-1),/仅在当前页面有效/);assert.equal(x.run("loadList('saved').length"),2);
 x.readFails(true);x.writeFails(false);b.click();assert.deepEqual(x.writes,[]);assert.equal(x.disk.get('cc-saved'),original);
 x.readFails(false);b.click();assert.equal(JSON.parse(x.disk.get('cc-saved')).length,3);
});
test('quota lounge deletion stays temporary and announces its persistence limit',t=>{
 const x=fixture({'cc-saved':original},'lounge');t.after(x.close);x.run('discovery()');x.writeFails(true);x.dom.window.document.querySelector('.reading-shelf-row button').click();
 assert.equal(x.disk.get('cc-saved'),original);assert.equal(x.dom.window.document.querySelectorAll('.reading-shelf-row').length,1);assert.match(x.notices.at(-1),/移除仅在当前页面有效/);
});
for(const changed of [...broken,JSON.stringify([{path:'/new-other-root/',title:'New'}])])test('quota fallback never conceals a changed durable source: '+changed.slice(0,20),t=>{
 const x=fixture({'cc-saved':original});t.after(x.close);x.run('readingTools();initArticleReading()');x.writeFails(true);const b=x.dom.window.document.querySelector('[data-bookmark]');b.click();
 x.disk.set('cc-saved',changed);x.writeFails(false);b.click();
 if(broken.includes(changed)){assert.equal(x.disk.get('cc-saved'),changed);assert.match(x.notices.at(-1),/未作更改/);}else assert.deepEqual(JSON.parse(x.disk.get('cc-saved')).map(p=>p.path),['/current/','/new-other-root/']);
});
test('normal legacy writes retain other roots and historical paths while filtering unsafe values',t=>{
 const raw=JSON.stringify([{path:'javascript:alert(1)',title:'bad'},{path:'/elsewhere/old/',title:'Other root'},{path:'/missing-from-index/',title:'Old valid'}]);
 const x=fixture({'cc-recent':raw,'cc-saved':raw},'article','/nested/');t.after(x.close);x.run('readingTools();initArticleReading()');x.dom.window.document.querySelector('[data-bookmark]').click();
 for(const key of ['cc-saved','cc-recent'])assert.deepEqual(JSON.parse(x.disk.get(key)).map(p=>p.path),['/current/','/elsewhere/old/','/missing-from-index/']);
});
test('read state distinguishes missing, valid legacy, malformed and unsupported while preserving array API bounds',async()=>{
 const {readShelfState,readShelf}=await import('../source/atelier/js/reading-state.mjs');
 for(const [raw,status] of [[null,'missing'],['[]','legacy'],['','malformed'],['null','unsupported'],['{}','unsupported'],...broken.map((raw,i)=>[raw,i?'unsupported':'malformed'])])assert.equal(readShelfState(raw).status,status);
 const raw=JSON.stringify(Array.from({length:110},(_,i)=>({path:'/valid/'+i,title:'a'.repeat(200),progress:2})));
 const items=readShelf(raw);assert.equal(items.length,100);assert.equal(items[0].title.length,180);assert.equal(items[0].progress,1);assert.deepEqual(readShelf('{'),[]);
});
