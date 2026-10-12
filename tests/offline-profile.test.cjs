const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {buildOfflineProfile}=require('../tools/offline-profile.cjs');
const {buildMainEntry}=require('../tools/build-main-entry.cjs');
const {analyzeModule}=require('../tools/browser-module-analysis.cjs');
const {snapshotHarness}=require('../tools/offline-snapshot-audit.cjs');
const article='/2026/09/22/Hello-CC-Atelier/';
test('profile represents delivered shared identities, bundled code, lazy imports and worker/style URLs at both roots',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'offline-profile-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const files={'atelier/js/main.js':"import {run} from './exclusive.js';run();export const load=()=>import('./lazy.js');",'atelier/js/exclusive.js':"import {state} from './shared.js';export const run=()=>state;",'atelier/js/shared.js':'export const state={};','atelier/js/lazy.js':"import './shared.js';export const worker=new URL('./worker.js',import.meta.url);export const style=new URL('../css/demo.css',import.meta.url);",'atelier/js/worker.js':"import './worker-core.mjs';",'atelier/js/worker-core.mjs':'export const x=1;','atelier/css/demo.css':'body{}'};
 for(const [file,data] of Object.entries(files)){fs.mkdirSync(path.dirname(path.join(dir,file)),{recursive:true});fs.writeFileSync(path.join(dir,file),data);}
 const {code}=await buildMainEntry(path.join(dir,'atelier/js'));
 for(const root of ['/','/lab/']){
  const profile=buildOfflineProfile(dir,root),main=profile.dependencies[root+'atelier/js/main.js'];
  for(const item of analyzeModule(code).imports)assert.ok(main.includes(root+'atelier/js/'+item.path.slice(2)));
  assert.ok(!main.includes(root+'atelier/js/exclusive.js'));
  assert.deepEqual(profile.dependencies[root+'atelier/js/lazy.js'],[root+'atelier/js/shared.js',root+'atelier/js/worker.js',root+'atelier/css/demo.css']);
  assert.deepEqual(profile.dependencies[root+'atelier/js/worker.js'],[root+'atelier/js/worker-core.mjs']);
 }
});
test('ordinary article survives unrelated route failure and contains global/lazy article tools and all font fallbacks',async()=>{
 for(const root of ['/','/lab/']){
  const h=await snapshotHarness({root});h.fail(root+'atelier/js/practice.js');const {rows}=await h.handle({type:'save',path:root+article.slice(1)}),store=h.stores.get(rows[0].snapshot),names=[...store.keys()].map(url=>new URL(url).pathname.slice(root.length));
  for(const file of ['main.js','ui.js','search-context.mjs','queue-list.js','queue-history.js','queue-backup.js','queue-legacy.js','reader.js','notebook.js','code-studio.js','algorithm-demo.js','algorithm-comparison.js'])assert.ok(names.includes('atelier/js/'+file),file);
  for(const file of h.plan.bundled)if(path.basename(file)!=='main.js')assert.ok(!names.includes('atelier/js/'+path.basename(file)),file);
  for(const file of ['practice.js','livehouse.js','studio.js','stage-engine.js','research-sql.js'])assert.ok(!names.includes('atelier/js/'+file));
  for(const name of fs.readdirSync('source/atelier/fonts').filter(name=>/\.(?:woff2?|ttf)$/.test(name)))assert.ok(names.includes('atelier/fonts/'+name),name);
  assert.ok(names.includes('atelier/data/archive.json'));assert.ok(!h.fetched.some(url=>url.endsWith('/offline-shell.json')));
  h.resetReads();const listed=await h.handle({type:'list'});assert.equal(listed.bytes,rows[0].bytes);assert.equal(h.bodyReads,0);
 }
});
test('required lazy code, responsive image and fallback font failures leave old immutable snapshot intact',async()=>{
 // Use a real fixture image rather than inventing a new network asset.
 const image=fs.readdirSync('source/atelier/images').find(name=>/\.(?:webp|png)$/.test(name));
 const actual=await snapshotHarness({html:`<script type="module" src="/atelier/js/main.js"></script><link rel="stylesheet" href="/atelier/css/fonts.css"><img src="/atelier/images/${image}" srcset="/atelier/images/${image} 960w">`});
 await actual.handle({type:'save',path:article});const before=JSON.stringify((await actual.handle({type:'list'})).rows),names=[...actual.stores.keys()];
 for(const dependency of ['/atelier/js/code-studio.js','/atelier/fonts/dm-sans-400.ttf','/atelier/images/'+image]){actual.fail(dependency);await assert.rejects(actual.handle({type:'save',path:article}));assert.equal(JSON.stringify((await actual.handle({type:'list'})).rows),before);assert.deepEqual([...actual.stores.keys()],names);}
});
test('two snapshots remain independently owned through update/remove and quota or metadata failures',async()=>{
 const h=await snapshotHarness();await h.handle({type:'save',path:article});await h.handle({type:'save',path:'/hot100/001/'});const before=(await h.handle({type:'list'})).rows,first=before.find(row=>row.path===article),other=before.find(row=>row.path!==article);
 h.revise();h.failWrites((name,url)=>url.endsWith('/offline-records.json'));await assert.rejects(h.handle({type:'save',path:article}));assert.equal((await h.handle({type:'list'})).rows.find(row=>row.path===article).snapshot,first.snapshot);
 h.failWrites(name=>name.includes('-snapshot-'));await assert.rejects(h.handle({type:'save',path:article}));h.failWrites(null);
 await h.handle({type:'save',path:article});assert.ok(!h.stores.has(first.snapshot));assert.ok(h.stores.has(other.snapshot));
 await h.handle({type:'remove',path:article});assert.ok(h.stores.has(other.snapshot));assert.equal((await h.handle({type:'search-index'})).entries.length,1);
 await h.handle({type:'clear'});assert.equal((await h.handle({type:'list'})).bytes,0);
});

test('conditional gates match the actual route loaders; unknown lazy imports are conservative',()=>{
 const {routeMarkers}=require('../tools/offline-profile.cjs'),main=fs.readFileSync('source/atelier/js/main.js','utf8'),routes=fs.readFileSync('source/atelier/js/route-features.js','utf8');
 for(const [file,marker] of Object.entries(routeMarkers)){
  if(file==='livehouse.js'){
   assert.ok(main.includes("if (document.querySelector('["+marker+"]'))"),file+' guard changed');assert.ok(main.includes("import('./"+file+"')"));
  }else{const line=routes.split('\n').find(line=>line.includes("import('./"+file+"')"));assert.ok(line?.includes("selector:'["+marker+"]'"),file+' selector changed');}
 }
 const p=buildOfflineProfile(path.resolve('source'));
 assert.ok(p.dependencies['/atelier/js/main.js'].includes('/atelier/js/search-context.mjs'));
 assert.ok(p.dependencies['/atelier/js/reading-connections.js'].includes('/atelier/css/reading-connections.css'));
 assert.ok(!p.dependencies['/atelier/js/reading-connections.js'].some(edge=>typeof edge==='string'&&edge.endsWith('connections.json')));
});
test('HTML-discovered demo gets lazy view and dynamically installed CSS; exposed route keeps shared audio implementation',async()=>{
 const h=await snapshotHarness({html:'<script type="module" src="/atelier/js/permutation-demo.js"></script>'});
 const {rows}=await h.handle({type:'save',path:article}),urls=[...h.stores.get(rows[0].snapshot).keys()];
 for(const asset of ['js/permutation-demo.js','js/permutation-demo-view.js','css/permutation-demo.css'])assert.ok(urls.some(url=>url.endsWith('/atelier/'+asset)),asset);
 for(const root of ['/','/lab/']){
  const p=buildOfflineProfile(path.resolve('source'),root),js=file=>root+'atelier/js/'+file;
  assert.ok(p.dependencies[js('livehouse-audio.js')].includes(js('audio-engine.js')));
  assert.ok(p.dependencies[js('audio-engine.js')].includes(js('studio-core.mjs')));
 }
});

test('exposed vendor-backed SQL and Livehouse fail explicitly without broadening the cache boundary',async()=>{
 for(const html of ['<script type="module" src="/atelier/js/research-sql.js"></script>','<button data-live-open>Open</button>']){
  const h=await snapshotHarness({html});await assert.rejects(h.handle({type:'save',path:article}),/暂不支持离线保存/);assert.equal((await h.handle({type:'list'})).rows.length,0);assert.ok(!h.fetched.some(url=>url.includes('/atelier/vendor/')));
 }
});

test('ambiguous markup and skewed scripts cannot hide a known explicit unsupported runtime or replace its old snapshot',async()=>{
 const h=await snapshotHarness();await h.handle({type:'save',path:article});const before=JSON.stringify((await h.handle({type:'list'})).rows);
 for(const extra of ['<svg><title>x</title></svg>','<script src="/atelier/js/skewed.js"></script>']){
  const html='<script type="module" src="/atelier/js/research-sql.js"></script>'+extra;
  h.setHTML(html);await assert.rejects(h.handle({type:'save',path:article}),/暂不支持离线保存/);
  assert.equal(JSON.stringify((await h.handle({type:'list'})).rows),before);
 }
});

test('selected and ambiguous unsupported route gates cannot hide behind legacy marker fallback',async()=>{
 const h=await snapshotHarness();await h.handle({type:'save',path:article});const before=JSON.stringify((await h.handle({type:'list'})).rows);
 for(const html of ['<button data-live-open>Open</button><svg><title>x</title></svg>','<svg><title><i data-live-open></title></svg>']){
  h.setHTML(html);await assert.rejects(h.handle({type:'save',path:article}),/暂不支持离线保存/);assert.equal(JSON.stringify((await h.handle({type:'list'})).rows),before);
 }
});

test('stage payload is fetched only for exposed studio markup in root and prefixed offline snapshots',async()=>{
 for(const root of ['/','/lab/']){
  const stage=root+'atelier/js/stage-engine.js',profile=buildOfflineProfile(path.resolve('source'),root);
  assert.ok(profile.dependencies[root+'atelier/js/main.js'].some(edge=>typeof edge==='object'&&edge.url===stage&&edge.when==='data-studio'));
  for(const studio of [false,true]){
   const h=await snapshotHarness({root,html:`<script type="module" src="${root}atelier/js/main.js"></script>${studio?'<main data-studio><button class="lighting-open">调光</button></main>':'<main class="reading-page"><article class="article-body">正文</article></main>'}`});
   if(!studio)h.fail(stage);
   const {rows}=await h.handle({type:'save',path:root+article.slice(1)}),urls=[...h.stores.get(rows[0].snapshot).keys()];
   assert.equal(h.fetched.some(url=>new URL(url).pathname===stage),studio);assert.equal(urls.some(url=>new URL(url).pathname===stage),studio);
  }
 }
});

test('practice route loader retains its conditional offline closure and failed updates preserve the snapshot at both roots',async()=>{
 for(const root of ['/','/lab/']){
  const js=file=>root+'atelier/js/'+file,profile=buildOfflineProfile(path.resolve('source'),root),practice=js('practice.js');
  // The authored route graph and bundled main must carry the same DOM condition,
  // with no unconditional or duplicate Practice edge introduced by relocation.
  for(const file of ['route-features.js','main.js'])assert.deepEqual(
   profile.dependencies[js(file)].filter(edge=>(typeof edge==='string'?edge:edge.url)===practice),
   [{url:practice,when:'data-practice'}],file
  );
  for(const exposed of [false,true]){
   const h=await snapshotHarness({root,html:`<script type="module" src="${js('main.js')}"></script>${exposed?'<main data-practice><div class="practice-app" hidden></div></main>':'<main class="reading-page"><article class="article-body">正文</article></main>'}`});
   if(!exposed)h.fail(practice);
   const {rows}=await h.handle({type:'save',path:root+article.slice(1)}),urls=[...h.stores.get(rows[0].snapshot).keys()].map(url=>new URL(url).pathname);
   for(const file of ['practice.js','practice-core.mjs','practice-challenge.js','practice-challenge-core.mjs','practice-score-export.mjs','practice-studio.mjs']){
    assert.equal(h.fetched.some(url=>new URL(url).pathname===js(file)),exposed,file+' fetched');
    assert.equal(urls.includes(js(file)),exposed,file+' cached');
   }
   assert.ok(!h.fetched.some(url=>url.endsWith('/offline-shell.json')),'the conditional profile must not broaden to the legacy shell');
   assert.ok(!urls.includes(js('stage-engine.js')),'practice alone must not acquire Studio lighting');
   if(exposed){
    const before=JSON.stringify((await h.handle({type:'list'})).rows),snapshots=[...h.stores.keys()];
    h.fail(practice);await assert.rejects(h.handle({type:'save',path:root+article.slice(1)}));
    assert.equal(JSON.stringify((await h.handle({type:'list'})).rows),before);assert.deepEqual([...h.stores.keys()],snapshots);
   }
  }
 }
});
