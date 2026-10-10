const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module'),{pathToFileURL}=require('node:url'),{gzipSync}=require('node:zlib');
const {buildMainEntry}=require('../tools/build-main-entry.cjs');
const {analyzeModule}=require('../tools/browser-module-analysis.cjs');
const {graph,staticImports}=require('../tools/module-graph.cjs');
const root=path.resolve(__dirname,'..');
function fixture(t,files){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atelier-entry-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));for(const [name,source]of Object.entries(files)){fs.mkdirSync(path.dirname(path.join(dir,name)),{recursive:true});fs.writeFileSync(path.join(dir,name),source);}return dir;}
const sample={
 'main.js':"import {run} from './exclusive.js'; import {state} from './shared.js'; export const first=run();export {state};export const load=()=>import('./lazy.js');",
 'exclusive.js':"import {state} from './shared.js'; export function run(){state.calls++;return state}",
 'shared.js':'export const state={calls:0};',
 'lazy.js':"import {state} from './shared.js'; export {state};"
};
test('compiler audit handles compact output, re-exports, escapes and rejects unknown dynamic dependencies',()=>{
 assert.deepEqual(staticImports('import"./a.js";export{b}from"./b.js";import"./\\u0063.js";import("./lazy.js");'),['./a.js','./b.js','./c.js']);
 for(const source of ['const x=()=>import(window.moduleURL)','const x=()=>import(`./${name}.js`)','const x=()=>import(\"./\"+name+\".js\")'])assert.throws(()=>analyzeModule(source));
 assert.equal(analyzeModule('export const url=import /*comment*/ . /*comment*/ meta.url').hasImportMeta,true);
 assert.equal(analyzeModule('// import.meta.url\nexport const x=1').hasImportMeta,false);
 assert.throws(()=>analyzeModule('import x from'),/Expected/);
});
test('exclusive code is combined while shared mutable state retains one native module identity',async t=>{
 const dir=fixture(t,sample),before=fs.readFileSync(path.join(dir,'exclusive.js'),'utf8');
 const result=await buildMainEntry(dir);
 assert.ok(result.plan.bundled.has(path.join(dir,'exclusive.js')));
 assert.ok(!result.plan.bundled.has(path.join(dir,'shared.js')));
 assert.deepEqual([...new Set(analyzeModule(result.code).imports.map(x=>x.kind+':'+x.path))],['import-statement:./shared.js','dynamic-import:./lazy.js']);
 fs.writeFileSync(path.join(dir,'package.json'),'{"type":"module"}');fs.writeFileSync(path.join(dir,'main.js'),result.code);
 const main=await import(pathToFileURL(path.join(dir,'main.js'))),lazy=await main.load();
 assert.equal(main.first,lazy.state);assert.equal(main.state,lazy.state);assert.equal(main.state.calls,1);assert.equal(fs.readFileSync(path.join(dir,'exclusive.js'),'utf8'),before);
});
test('a newly added lazy or independent consumer automatically retains its complete shared closure',async t=>{
 const dir=fixture(t,{...sample,'extra.js':"import {run} from './exclusive.js';export {run}"});
 let result=await buildMainEntry(dir);assert.ok(!result.plan.bundled.has(path.join(dir,'exclusive.js')));
 fs.writeFileSync(path.join(dir,'lazy.js'),"export const load=()=>import('./exclusive.js')");fs.unlinkSync(path.join(dir,'extra.js'));
 result=await buildMainEntry(dir);assert.ok(!result.plan.bundled.has(path.join(dir,'exclusive.js')));assert.ok(!result.plan.bundled.has(path.join(dir,'shared.js')));
});
test('import.meta owners, nested modules and worker URLs remain at their original paths',async t=>{
 const dir=fixture(t,{'main.js':"import {url} from './url.js';import {x} from './nested/feature.js';console.log(url,x);",'url.js':"export const url=new URL('./worker.js',import.meta.url)",'worker.js':'self.onmessage=()=>{};','nested/feature.js':'export const x=1;'});
 const result=await buildMainEntry(dir);assert.deepEqual([...result.plan.bundled].map(file=>path.basename(file)),['main.js']);
 for(const prefix of ['/','/lab/'])for(const specifier of staticImports(result.code))assert.ok(fs.existsSync(path.join(dir,new URL(specifier,'https://example.test'+prefix+'atelier/js/main.js').pathname.split('/atelier/js/')[1])));
});
test('missing dependencies and main consumed by another entry fail without source writes',async t=>{
 const dir=fixture(t,sample);fs.writeFileSync(path.join(dir,'extra.js'),"import './main.js'");await assert.rejects(buildMainEntry(dir),/consumed by another/);
 fs.writeFileSync(path.join(dir,'extra.js'),"import './missing.js'");await assert.rejects(buildMainEntry(dir),/Missing browser dependency/);
 assert.equal(fs.readFileSync(path.join(dir,'main.js'),'utf8'),sample['main.js']);
});
test('real source yields a complete smaller initial graph with unchanged lazy URLs and source bytes',async t=>{
 const dir=fixture(t,{}),source=path.join(root,'source/atelier/js');fs.cpSync(source,path.join(dir,'atelier/js'),{recursive:true});fs.cpSync(path.join(root,'source/atelier/vendor'),path.join(dir,'atelier/vendor'),{recursive:true});
 const originals=new Map(fs.readdirSync(source).filter(name=>/\.m?js$/.test(name)).map(name=>[name,fs.readFileSync(path.join(source,name))]));
 const a=await buildMainEntry(source),b=await buildMainEntry(source);assert.equal(a.code,b.code);assert.deepEqual(a.metafile,b.metafile);
 fs.writeFileSync(path.join(dir,'atelier/js/main.js'),a.code);
 const before=graph(path.join(root,'source'),['atelier/js/main.js']),after=graph(dir,['atelier/js/main.js']);assert.equal(before.modules,22);assert.equal(after.modules,9);assert.ok(after.bytes<83000);
 const gzip=(base,files)=>files.reduce((sum,file)=>sum+gzipSync(fs.readFileSync(path.join(base,file.path)),{level:9}).length,0);assert.ok(gzip(dir,after.files)<gzip(path.join(root,'source'),before.files));
 const emitted=analyzeModule(a.code).imports;
 for(const file of a.plan.bundled)for(const edge of a.plan.edges.get(file))if(edge.kind==='dynamic-import'&&edge.target)assert.ok(emitted.some(item=>item.kind==='dynamic-import'&&path.resolve(source,item.path)===edge.target));
 for(const item of emitted)if(item.path.startsWith('.'))for(const prefix of ['/','/lab/']){const url=new URL(item.path,'https://test.invalid'+prefix+'atelier/js/main.js');assert.ok(fs.existsSync(path.join(dir,url.pathname.slice(prefix.length))));}
 for(const [name,bytes]of originals)assert.deepEqual(fs.readFileSync(path.join(source,name)),bytes,name);
});
test('real Hexo route lifecycle publishes only complete bundles, rebuilds dependencies, and preserves a good route on failure',async t=>{
 const dir=fixture(t,{'_config.yml':'theme: false\nroot: /lab/\n','source/atelier/js/main.js':sample['main.js'],'source/atelier/js/exclusive.js':sample['exclusive.js'],'source/atelier/js/shared.js':sample['shared.js'],'source/atelier/js/lazy.js':sample['lazy.js']});
 const Hexo=require('hexo'),hexo=new Hexo(dir,{silent:true});await hexo.init();t.after(()=>hexo.exit());
 const script=path.join(root,'scripts/main-entry.js');vm.runInNewContext(fs.readFileSync(script,'utf8'),{hexo,require:createRequire(script)});
 const published=[];async function read(){let data='';for await(const chunk of hexo.route.get('atelier/js/main.js'))data+=chunk;return data;}
 hexo.route.on('update',route=>{if(route==='atelier/js/main.js')published.push(read());});
 await hexo.load();const first=await read();assert.ok(!first.includes("from './exclusive.js'"));assert.equal((await Promise.all(published)).length,1);
 await hexo._generate({cache:true});assert.equal(await read(),first);assert.deepEqual(await Promise.all(published),[first,first]);
 fs.writeFileSync(path.join(dir,'source/atelier/js/exclusive.js'),sample['exclusive.js'].replace('calls++','calls+=2'));
 await hexo._generate({cache:true});const changed=await read();assert.notEqual(changed,first);
 fs.writeFileSync(path.join(dir,'source/atelier/js/exclusive.js'),'export function {');const count=published.length;
 await assert.rejects(hexo._generate({cache:true}),/Cannot safely analyze/);assert.equal(published.length,count);assert.equal(await read(),changed);
});

test('template independent entries retain their static closure and unknown template entries fail',async t=>{
 const dir=fixture(t,{...sample,'views/layout.ejs':`<script type="module" src="<%= url_for('atelier/js/exclusive.js') %>"></script>`});
 const result=await buildMainEntry(dir,{referenceDirectories:[path.join(dir,'views')]});assert.ok(!result.plan.bundled.has(path.join(dir,'exclusive.js')));assert.ok(!result.plan.bundled.has(path.join(dir,'shared.js')));
 fs.writeFileSync(path.join(dir,'views/layout.ejs'),'<script type="module" src="<%= moduleURL %>"></script>');await assert.rejects(buildMainEntry(dir,{referenceDirectories:[path.join(dir,'views')]}),/Unanalyzable module entry/);
});

test('unmanaged static closures and dynamic modules with hidden dependencies fail explicitly',async t=>{
 const dir=fixture(t,{'js/main.js':"import '../outside.js';",'outside.js':'export const x=1;'});
 await assert.rejects(buildMainEntry(path.join(dir,'js')),/Static dependency outside/);
 fs.writeFileSync(path.join(dir,'js/main.js'),"export const load=()=>import('../outside.js')");
 fs.writeFileSync(path.join(dir,'outside.js'),"import './js/state.js'");fs.writeFileSync(path.join(dir,'js/state.js'),'export const state={}');
 await assert.rejects(buildMainEntry(path.join(dir,'js')),/External dynamic module needs explicit/);
});
test('offline manifests retain original URLs and a saved snapshot stores the generated main bytes at both prefixes',async()=>{
 const {code}=await buildMainEntry(path.join(root,'source/atelier/js'));
 const {cacheableURL}=await import('../source/atelier/js/offline-core.mjs'),{articleResources}=await import('../source/atelier/js/offline-resources.mjs');
 const generators=new Map(),script=path.join(root,'scripts/live-archive.js');
 vm.runInNewContext(fs.readFileSync(script,'utf8'),{hexo:{extend:{generator:{register:(name,fn)=>generators.set(name,fn)},helper:{register(){}}}},require:createRequire(script)});
 for(const prefix of ['/','/lab/']){
  const routes=generators.get('live-archive').call({config:{root:prefix},base_dir:root},{posts:{sort:()=>({toArray:()=>[]})},data:{}}),manifest=JSON.parse(routes.find(route=>route.path==='atelier/data/offline-shell.json').data);
  assert.ok(manifest.includes(prefix+'atelier/js/main.js'));assert.ok(manifest.includes(prefix+'atelier/js/route-features.js'),'old exclusive URLs are intentionally retained');
  for(const url of manifest)assert.ok(fs.existsSync(path.join(root,'source',url.slice(prefix.length))),url);
  const stores=new Map(),origin='https://atelier.test',key=value=>typeof value==='string'?new URL(value,origin).href:value.url;
  const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const data=stores.get(name);return {async put(url,response){data.set(key(url),response.clone());},async match(url){return data.get(key(url))?.clone();},async keys(){return [...data.keys()].map(url=>({url}));},async delete(url){return data.delete(key(url));}};},async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);}};
  const fetch=async input=>{const url=new URL(key(input));if(url.pathname===prefix+'a/')return new Response('<script type="module" src="'+prefix+'atelier/js/main.js"></script>');if(url.pathname.endsWith('/archive.json'))return new Response(JSON.stringify({posts:[{path:prefix+'a/',title:'A'}]}));if(url.pathname.endsWith('/offline-shell.json'))return new Response(JSON.stringify(manifest));if(url.pathname===prefix+'atelier/js/main.js')return new Response(code);return new Response(fs.readFileSync(path.join(root,'source',url.pathname.slice(prefix.length))));};
  const self={location:{origin},addEventListener(){},clients:{claim:async()=>{}},skipWaiting:async()=>{}};
  const context=vm.createContext({self,caches,fetch,URL,Response,Request,crypto,cacheableURL,articleResources,console});vm.runInContext(routes.find(route=>route.path==='live-sw.js').data.replace(/^import[^\n]+\n/gm,''),context);
  const saved=await context.handle({type:'save',path:prefix+'a/'}),snapshot=await caches.open(saved.rows[0].snapshot);
  assert.equal(await (await snapshot.match(origin+prefix+'atelier/js/main.js')).text(),code);
  for(const url of manifest)assert.ok(await snapshot.match(origin+url),url);
 }
});

test('classic inline scripts retain folded dynamic imports and reject opaque imports while ignoring data scripts',async t=>{
 const dir=fixture(t,{'main.js':"export {state} from './state.js'",'state.js':'export const state={};','views/layout.ejs':''});
 const view=path.join(dir,'views/layout.ejs'),options={referenceDirectories:[path.dirname(view)]};
 for(const type of ['', ' type="text/javascript"', ' type="application/javascript"', ' type=""', ' type=module']){
  fs.writeFileSync(view,`<script${type}>import('/atelier/js/' + 'state.js')</script>`);
  const result=await buildMainEntry(dir,options);assert.ok(!result.plan.bundled.has(path.join(dir,'state.js')),type);assert.ok(staticImports(result.code).includes('./state.js'));
 }
 for(const type of ['', ' type="text/javascript"']){fs.writeFileSync(view,`<script${type}>import(window.nextModule)</script>`);await assert.rejects(buildMainEntry(dir,options),/not a string literal/);}
 fs.writeFileSync(view,'<script type="application/ld+json">{"@type":"Thing","name":"inline data"}</script><script type="application/json">{"sample":"import(window.data)"}</script>');
 const result=await buildMainEntry(dir,options);assert.ok(result.plan.bundled.has(path.join(dir,'state.js')));
});

test('HTML script attributes use real names and tokens, preserving classic dependencies despite misleading attribute text',async t=>{
 const dir=fixture(t,{'main.js':"export {state} from './state.js'",'state.js':'export const state={};','views/layout.ejs':''});
 const view=path.join(dir,'views/layout.ejs'),options={referenceDirectories:[path.dirname(view)]};
 for(const attrs of ['data-type="application/json"','aria-label="type=application/json"',"aria-label=\"type='application/json'\"",'data-src="unrelated"','TYPE="text/javascript"']){
  fs.writeFileSync(view,`<script ${attrs}>import('/atelier/js/' + 'state.js')</script>`);
  const result=await buildMainEntry(dir,options);assert.ok(!result.plan.bundled.has(path.join(dir,'state.js')),attrs);
 }
 fs.writeFileSync(view,'<script type="module" src="/atelier/js/st&#97;te.js"></script>');
 const escaped=await buildMainEntry(dir,options);assert.ok(!escaped.plan.bundled.has(path.join(dir,'state.js')),'HTML entity src must retain its decoded module');
 fs.writeFileSync(view,'<!-- <script>import(window.unknown)</script> --><script TYPE="application/json">{"message":"data"}</script>');
 const result=await buildMainEntry(dir,options);assert.ok(result.plan.bundled.has(path.join(dir,'state.js')));
});
