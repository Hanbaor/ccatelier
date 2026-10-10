const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {staticImports,graph,report}=require('../tools/module-graph.cjs');
const publicDir=path.resolve(__dirname,'../public');
test('module audit distinguishes static edges from dynamic imports',()=>{
 assert.deepEqual(staticImports("import {x} from './a.js';\nimport './b.js';\nexport {y} from './c.mjs';\nconst lazy=()=>import('./lazy.js');\n// import './comment.js';"),['./a.js','./b.js','./c.mjs']);
});
test('built global graph excludes route/audio/graph modules and retains essential UI',()=>{
 const result=graph(publicDir,['atelier/js/main.js']),names=result.files.map(file=>path.basename(file.path));
 for(const file of ['ui.js','theme.js','navigation-scenes.js','search.js','queue.js','offline.js','route-features.js','rhythm.js','stage-engine.js'])assert.ok(names.includes(file),file);
 for(const file of ['archive.js','constellation.js','reader.js','notebook.js','code-studio.js','studio.js','audio-engine.js','studio-core.mjs','practice.js','livehouse.js','search-context.mjs','community-moderation.js'])assert.ok(!names.includes(file),file);
 assert.ok(result.modules<25);assert.ok(result.bytes<100000);
 const routes=report(publicDir).routes,base=routes.find(row=>row.route==='/');assert.equal(base.bytes,result.bytes);
 const notes=routes.find(row=>row.route==='/notes/');assert.ok(notes.files.some(file=>file.path.endsWith('archive-worker.js')));assert.ok(!notes.files.some(file=>file.path.endsWith('constellation.js')));
 assert.ok(routes.find(row=>row.route.includes('view=graph')).bytes>notes.bytes);
});
test('offline snapshot manifest retains every dynamic module and their dependencies',()=>{
 const shell=JSON.parse(fs.readFileSync(path.join(publicDir,'atelier/data/offline-shell.json'),'utf8'));
 const all=fs.readdirSync(path.join(publicDir,'atelier/js')).filter(file=>/\.m?js$/.test(file));
 for(const file of all)assert.ok(shell.includes('/atelier/js/'+file),file+' missing from offline snapshot');
 for(const file of ['main.js','route-features.js','archive.js','search.js'])for(const match of fs.readFileSync(path.join(publicDir,'atelier/js',file),'utf8').matchAll(/import\(['"](\.\/[^'"]+)['"]\)/g))assert.ok(fs.existsSync(path.resolve(publicDir,'atelier/js',match[1])),file+': '+match[1]);
});

test('global dialog and rhythm arbitration boots before asynchronous route features',()=>{
 const main=fs.readFileSync(path.join(publicDir,'atelier/js/main.js'),'utf8'),route=main.indexOf('initRouteFeatures();');
 for(const fn of ['initSettings','initDialogs','initSearch','initRhythm','initQueue','initOffline','initStageEngine','initNavigationScenes'])assert.ok(main.indexOf(fn+'();')<route,fn);
 assert.match(main,/if \(document\.querySelector\('\[data-live-open\]'\)\)/);
 assert.match(main,/if \(document\.querySelector\('\[data-practice\]'\)\)/);
});


test('two-sum route audit counts the scoped demo and its core without global loading',()=>{
 const result=report(path.resolve(__dirname,'../source'));
 const demo=result.routes.find(row=>row.route==='/hot100/001/');
 for(const name of ['algorithm-demo.js','algorithm-demo-core.mjs']){
  assert.ok(demo.files.some(file=>path.basename(file.path)===name),name);
  assert.ok(!result.initial.files.some(file=>path.basename(file.path)===name),name+' must remain route-scoped');
 }
});

 test('search match context stays lazy within the source first-load budget',()=>{
 const result=graph(path.resolve(__dirname,'../source'),['atelier/js/main.js']);
 assert.ok(result.bytes<100000);
 assert.ok(!result.files.some(file=>file.path.endsWith('/search-context.mjs')));
 assert.match(fs.readFileSync(path.join(__dirname,'../source/atelier/js/search.js'),'utf8'),/import\('\.\/search-context\.mjs'\)/);
 });

test('source admin interface is lazy while its route report includes shared dependencies once',()=>{
 const source=path.resolve(__dirname,'../source'),result=report(source),admin=result.routes.find(row=>row.route==='/admin/');
 assert.ok(result.initial.bytes<100000);
 assert.ok(!result.initial.files.some(file=>file.path.endsWith('/community-moderation.js')));
 assert.ok(admin.files.some(file=>file.path.endsWith('/community-moderation.js')));
 assert.equal(admin.files.filter(file=>file.path.endsWith('/community.js')).length,1);
 assert.equal(admin.bytes-result.initial.bytes,fs.statSync(path.join(source,'atelier/js/community-moderation.js')).size);
 assert.match(fs.readFileSync(path.join(source,'atelier/js/community.js'),'utf8'),/import\('\.\/community-moderation\.js'\)/);
});

test('offline manifest generator automatically covers lazy comment and admin modules without a site build',()=>{
 const generators=new Map(),previous=globalThis.hexo;
 try {
  globalThis.hexo={extend:{generator:{register:(name,fn)=>generators.set(name,fn)},helper:{register(){}}}};
  const script=require.resolve('../scripts/live-archive.js');delete require.cache[script];require(script);
  for(const root of ['/','/preview/']){
   const result=generators.get('live-archive').call({config:{root},base_dir:path.resolve(__dirname,'..')},{posts:{sort:()=>({toArray:()=>[]})},data:{}});
   const shell=JSON.parse(result.find(file=>file.path==='atelier/data/offline-shell.json').data);
   for(const file of ['community.js','community-moderation.js','community-comments.js','ui.js','theme.js'])assert.ok(shell.includes(root+'atelier/js/'+file),file);
  }
 }finally{if(previous===undefined)delete globalThis.hexo;else globalThis.hexo=previous;}
});

test('source comments stay lazy and appear in each actual comment route graph',()=>{
 const source=path.resolve(__dirname,'../source'),result=report(source);
 assert.ok(result.initial.bytes<100000);
 assert.ok(!result.initial.files.some(file=>file.path.endsWith('/community-comments.js')));
 for(const route of ['/guestbook/','/2026/09/22/Hello-CC-Atelier/','/hot100/001/']){
  const row=result.routes.find(row=>row.route===route);
  assert.equal(row.files.filter(file=>file.path.endsWith('/community-comments.js')).length,1);
  assert.equal(row.files.filter(file=>file.path.endsWith('/community.js')).length,1);
  const dom=new (require('jsdom').JSDOM)(fs.readFileSync(path.join(publicDir,route,'index.html'),'utf8'));
  try{assert.ok(dom.window.document.querySelector('[data-comments]'),route);}finally{dom.window.close();}
 }
 const guestbook=result.routes.find(row=>row.route==='/guestbook/');
 assert.equal(guestbook.bytes-result.initial.bytes,fs.statSync(path.join(source,'atelier/js/community-comments.js')).size);
 assert.match(fs.readFileSync(path.join(source,'atelier/js/community.js'),'utf8'),/import\('\.\/community-comments\.js'\)/);
});

test('Hot100 filter is counted once on its own route and never in the global entry graph',()=>{
 const source=path.resolve(__dirname,'../source'),result=report(source),series=result.routes.find(row=>row.route==='/series/hot100/');
 assert.ok(series);assert.ok(!result.initial.files.some(file=>file.path.endsWith('/series-filter.js')));assert.ok(result.initial.bytes<100000);
 assert.equal(series.files.filter(file=>file.path.endsWith('/series-filter.js')).length,1);
 const beforeFilter=graph(source,['atelier/js/main.js','atelier/js/notebook.js']);
 assert.equal(series.bytes-beforeFilter.bytes,fs.statSync(path.join(source,'atelier/js/series-filter.js')).size);
 assert.equal(series.files.filter(file=>file.path.endsWith('/notebook.js')).length,1,'the retained introduction already initializes notebook tools');
 for(const row of result.routes.filter(row=>row.route!=='/series/hot100/'))assert.ok(!row.files.some(file=>file.path.endsWith('/series-filter.js')),row.route);
 const template=fs.readFileSync(path.join(__dirname,'../custom/redefine/nijika/series.ejs'),'utf8'),ejs=require('ejs');
 const html=ejs.render(template,{page:{seriesPosts:[],introHtml:''},live_catalog_counts:()=>({withCode:0,analysisPending:0}),url_for:v=>'/lab/'+v,nijika_count:v=>v});
 const dom=new (require('jsdom').JSDOM)(html);try{assert.ok(dom.window.document.querySelector('[data-hot100-filter]'));assert.equal(dom.window.document.querySelector('[data-series-controls]').hidden,true);}finally{dom.window.close();}
});
