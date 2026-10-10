const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {staticImports,graph,report}=require('../tools/module-graph.cjs');
const publicDir=path.resolve(__dirname,'../public');
test('module audit distinguishes static edges from dynamic imports',()=>{
 assert.deepEqual(staticImports("import {x} from './a.js';\nimport './b.js';\nexport {y} from './c.mjs';\nconst lazy=()=>import('./lazy.js');\n// import './comment.js';"),['./a.js','./b.js','./c.mjs']);
});
test('built global graph excludes route/audio/graph modules and retains essential UI',()=>{
 const result=graph(publicDir,['atelier/js/main.js']),names=result.files.map(file=>path.basename(file.path));
 for(const file of ['ui.js','theme.js','navigation-scenes.js','search.js','queue.js','offline.js','route-features.js','rhythm.js','stage-engine.js'])assert.ok(names.includes(file),file);
 for(const file of ['archive.js','constellation.js','reader.js','notebook.js','code-studio.js','studio.js','audio-engine.js','studio-core.mjs','practice.js','livehouse.js'])assert.ok(!names.includes(file),file);
 assert.ok(result.modules<25);assert.ok(result.bytes<100000);
 const routes=report(publicDir).routes,base=routes.find(row=>row.route==='/');assert.equal(base.bytes,result.bytes);
 const notes=routes.find(row=>row.route==='/notes/');assert.ok(notes.files.some(file=>file.path.endsWith('archive-worker.js')));assert.ok(!notes.files.some(file=>file.path.endsWith('constellation.js')));
 assert.ok(routes.find(row=>row.route.includes('view=graph')).bytes>notes.bytes);
});
test('offline snapshot manifest retains every dynamic module and their dependencies',()=>{
 const shell=JSON.parse(fs.readFileSync(path.join(publicDir,'atelier/data/offline-shell.json'),'utf8'));
 const all=fs.readdirSync(path.join(publicDir,'atelier/js')).filter(file=>/\.m?js$/.test(file));
 for(const file of all)assert.ok(shell.includes('/atelier/js/'+file),file+' missing from offline snapshot');
 for(const file of ['main.js','route-features.js','archive.js'])for(const match of fs.readFileSync(path.join(publicDir,'atelier/js',file),'utf8').matchAll(/import\(['"](\.\/[^'"]+)['"]\)/g))assert.ok(fs.existsSync(path.resolve(publicDir,'atelier/js',match[1])),file+': '+match[1]);
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
