'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module'),{createHash}=require('node:crypto'),{gzipSync}=require('node:zlib');
const {groups,prepareStylesheets,rewriteStylesheets,expandStylesheetURLs}=require('../tools/build-shared-stylesheets.cjs');
const root=path.resolve(__dirname,'..'),source=path.join(root,'source/atelier/css');
const links=html=>[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match=>match[1]);
const tag=url=>`<link rel="stylesheet" href="${url}">`;
const head=prefix=>'<head>'+groups.map(group=>group.members.map(file=>tag(prefix+'atelier/css/'+file)).join('\n')).join('\n')+'</head>';
function fixture(t,{cleanupAtExit=false}={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atelier-styles-'));const cleanup=()=>fs.rmSync(dir,{recursive:true,force:true});if(cleanupAtExit)process.once('exit',cleanup);else t.after(cleanup);fs.mkdirSync(path.join(dir,'source/atelier/css'),{recursive:true});for(const group of groups)for(const file of group.members)fs.copyFileSync(path.join(source,file),path.join(dir,'source/atelier/css',file));return dir;}
function install(hexo){const script=path.join(root,'scripts/shared-stylesheets.js');vm.runInNewContext(fs.readFileSync(script,'utf8'),{hexo,require:createRequire(script)});}
async function routeBytes(hexo,file){const chunks=[];for await(const chunk of hexo.route.get(file))chunks.push(Buffer.from(chunk));return Buffer.concat(chunks);}
test('fixed delivery groups preserve every ordered source byte and same-directory URL resolution',async()=>{
 const prepared=await prepareStylesheets(source);
 assert.equal(prepared.length,4);
 for(const [index,item] of prepared.entries()){
  const originals=groups[index].members.map(file=>fs.readFileSync(path.join(source,file)));
  assert.deepEqual(item.data,Buffer.concat(originals.flatMap((data,i)=>i?[Buffer.from('\n'),data]:[data])));
  for(const member of item.members)assert.equal(member.sha256,createHash('sha256').update(fs.readFileSync(path.join(source,member.file))).digest('hex'));
  assert.equal(item.sha256,createHash('sha256').update(item.data).digest('hex'));
  for(const prefix of ['/','/lab/'])for(const member of groups[index].members){
   for(const [,url]of fs.readFileSync(path.join(source,member),'utf8').matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g))assert.equal(new URL(url,'https://test.invalid'+prefix+item.path).href,new URL(url,'https://test.invalid'+prefix+'atelier/css/'+member).href);
  }
 }
 assert.deepEqual(await prepareStylesheets(source),prepared);
});
test('all existing documents retain their complete expanded cascade and body links at both roots',()=>{
 const files=fs.readdirSync(path.join(root,'public'),{recursive:true}).filter(file=>file.endsWith('.html'));assert.ok(files.length>200);
 for(const file of files)for(const prefix of ['/','/lab/']){
  const original=fs.readFileSync(path.join(root,'public',file),'utf8').replaceAll('="/','="'+prefix);
  const rewritten=rewriteStylesheets(original);
  assert.deepEqual(expandStylesheetURLs(links(rewritten)),expandStylesheetURLs(links(original)),file+' '+prefix);
  assert.equal(rewriteStylesheets(rewritten),rewritten);
  assert.equal(expandStylesheetURLs(links(rewritten)).length-links(rewritten).length,7,file+' seven fewer links');
  assert.equal(rewritten.slice(rewritten.indexOf('<body')),original.slice(original.indexOf('<body')),file+' body');
 }
 for(const prefix of ['/','/lab/'])assert.equal(links(rewriteStylesheets(head(prefix))).length,4);
});
test('unknown attributes, intervening nodes, reordered members and different directories are never rewritten',()=>{
 const a=tag('/atelier/css/after-hours.css'),b=tag('/atelier/css/archive.css');
 const examples=[a.replace('rel=', 'media="screen" rel=')+b,a.replace('rel=', 'disabled rel=')+b,a.replace('rel=', 'title="alternate" rel=')+b,a.replace('rel=', 'integrity="abc" rel=')+b,a.replace('rel=', 'onload="run()" rel=')+b,a.replace('rel=', 'data-x="x" rel=')+b,a.replace('rel=', 'rel="stylesheet" rel=')+b,a+'<!-- boundary -->'+b,a+'<meta name="x">'+b,a+'text'+b,a+'<script></script>'+b,b+a,a+b.replace('/atelier/','/lab/atelier/'),a+b.replace('.css','.css?v=1')];
 for(const inner of examples){const html='<head>'+inner+'</head>';assert.equal(rewriteStylesheets(html),html,inner);}
 for(const html of ['<body>'+a+b+'</body>','<head><script>'+a+b+'</script></head>','<head><!-- '+a+b+' --></head>','<head></head><head>'+a+b+'</head>','<body><template><head>'+a+b+'</head></template></body>','<head>'+a+b])assert.equal(rewriteStylesheets(html),html);
 const original='<head>'+a+'\n \t'+b+'</head><body>'+a+b+'</body>',rewritten=rewriteStylesheets(original);assert.equal(links(rewritten).length,3);assert.equal(expandStylesheetURLs(links(rewritten)).length,4);
});
test('missing, malformed, directives and reserved outputs fail without source writes',async t=>{
 const dir=fixture(t),css=path.join(dir,'source/atelier/css'),file=path.join(css,'archive.css'),original=fs.readFileSync(file);
 for(const bad of ['.broken {','@import "other.css";','@charset "UTF-8";','@namespace svg "http://example.test";','/*# sourceMappingURL=x */',String.raw`@\69mport "other.css";`,String.raw`@\6e amespace svg "http://example.test";`,String.raw`@\63harset "UTF-8";`]){fs.writeFileSync(file,bad);await assert.rejects(prepareStylesheets(css));}
 fs.unlinkSync(file);await assert.rejects(prepareStylesheets(css),/ENOENT/);fs.writeFileSync(file,original);
 fs.writeFileSync(path.join(css,groups[0].file),'collision');await assert.rejects(prepareStylesheets(css),/collision/);fs.unlinkSync(path.join(css,groups[0].file));assert.equal((await prepareStylesheets(css)).length,4);
});
test('actual Hexo writer updates stable CSS URLs with populated Cache and cached HTML, then recovers after failed preparation',async t=>{
 const dir=fixture(t);fs.writeFileSync(path.join(dir,'_config.yml'),'theme: false\nroot: /lab/\n');
 const Hexo=require('hexo'),hexo=new Hexo(dir,{silent:true});await hexo.init();t.after(()=>hexo.exit());install(hexo);
 const original=head('/lab/'),cached=rewriteStylesheets(original);let renderCalls=0;
 hexo.extend.generator.register('cached-page',()=>({path:'index.html',data:{data:cached,modified:false}}));
 hexo.extend.filter.register('after_render:html',html=>{renderCalls++;return html;});
 await hexo.call('generate',{bail:true});
 const target='atelier/css/'+groups[1].file,other='atelier/css/'+groups[0].file,output=path.join(dir,'public',target),page=fs.readFileSync(path.join(dir,'public/index.html'));
 const before=fs.readFileSync(output),otherBefore=fs.readFileSync(path.join(dir,'public',other));
 assert.ok(hexo.model('Cache').findById('public/'+target));assert.equal(renderCalls,0);
 const member=path.join(dir,'source/atelier/css/archive.css'),good=fs.readFileSync(member);fs.appendFileSync(member,'\n.test-css-only-edit{color:red}\n');
 await hexo.call('generate',{bail:true});assert.notDeepEqual(fs.readFileSync(output),before);assert.deepEqual(fs.readFileSync(path.join(dir,'public/index.html')),page);assert.deepEqual(fs.readFileSync(path.join(dir,'public',other)),otherBefore);
 const changed=fs.readFileSync(output),published=[];hexo.route.on('update',file=>{if(file.startsWith('atelier/css/delivery-'))published.push(file);});
 for(const mutation of [()=>fs.writeFileSync(member,'.broken {'),()=>fs.unlinkSync(member),()=>{fs.writeFileSync(member,good);fs.writeFileSync(path.join(dir,'source/atelier/css',groups[0].file),'collision');}]){
  mutation();await assert.rejects(hexo._generate({cache:true}));assert.equal(published.length,0);assert.deepEqual(await routeBytes(hexo,target),changed);assert.deepEqual(fs.readFileSync(output),changed);
 }
 fs.unlinkSync(path.join(dir,'source/atelier/css',groups[0].file));fs.writeFileSync(member,good);await hexo._generate({cache:true});assert.equal(published.length,5);assert.deepEqual(await routeBytes(hexo,target),before);
 const count=hexo.route.list().length;await hexo._generate({cache:true});assert.equal(hexo.route.list().length,count);
 const goodCount=published.length;hexo.extend.generator.register('collision',()=>({path:target,data:'bad'}));await assert.rejects(hexo._generate({cache:true}),/generated route collision/);assert.equal(published.length,goodCount);assert.deepEqual(await routeBytes(hexo,target),before);
 hexo.extend.generator.register('collision',()=>[]);await hexo._generate({cache:true});assert.deepEqual(await routeBytes(hexo,target),before);
 const lateCount=published.length;const registerLate=()=>hexo.extend.generator.register('late-collision',()=>({path:target,data:'late bad'}));hexo.extend.filter.register('before_generate',registerLate,100);
 await assert.rejects(hexo._generate({cache:true}),/generated route collision/);assert.equal(published.length,lateCount);assert.deepEqual(await routeBytes(hexo,target),before);
 hexo.extend.filter.unregister('before_generate',registerLate);hexo.extend.generator.register('late-collision',()=>[]);await hexo._generate({cache:true});assert.deepEqual(await routeBytes(hexo,target),before);
 for(const group of groups)for(const file of group.members)assert.ok(hexo.route.get('atelier/css/'+file));
});

test('watch writer refreshes CSS while the real Hexo rendered-page cache keeps stable HTML',async t=>{
 // Hexo's unwatch()/exit() do not drain the watch debounce or writer promises.
 // Keep this fixture until process exit, after Node drains those real tasks.
 const dir=fixture(t,{cleanupAtExit:true});fs.writeFileSync(path.join(dir,'_config.yml'),'theme: false\nroot: /lab/\nserver:\n  cache: true\n');
 const Hexo=require('hexo'),hexo=new Hexo(dir,{silent:true});await hexo.init();t.after(async()=>{hexo.unwatch();await hexo.exit();});install(hexo);
 let renders=0;hexo.extend.renderer.register('fixture','html',data=>{renders++;return data.text;},true);
 hexo.theme.setView('index.fixture',head('/lab/'));
 const pageRoute={path:'index.html',layout:'index',data:{}};
 hexo.extend.generator.register('fixture-page',()=>pageRoute);
 // Use actual watch-mode writer listeners. Seed Hexo's real route cache before
 // changing only a CSS file; the following _generate must reuse rendered HTML.
 await hexo.call('generate',{watch:true,bail:true});await hexo._generate({cache:true});
 const output=path.join(dir,'public/atelier/css',groups[1].file),old=fs.readFileSync(output),cachedPage=await routeBytes(hexo,'index.html'),renderCount=renders;
 assert.equal(links(cachedPage.toString()).length,4);assert.ok(hexo.model('Cache').findById('public/atelier/css/'+groups[1].file));
 fs.appendFileSync(path.join(dir,'source/atelier/css/archive.css'),'\n.watch-edit{color:blue}\n');
 await hexo._generate({cache:true});
 const deadline=Date.now()+5000;while(fs.readFileSync(output).equals(old)&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,20));
 assert.notDeepEqual(fs.readFileSync(output),old);assert.deepEqual(await routeBytes(hexo,'index.html'),cachedPage);assert.equal(renders,renderCount,'actual Hexo HTML cache avoided another render');
 assert.deepEqual(fs.readFileSync(output),await routeBytes(hexo,'atelier/css/'+groups[1].file));
 // Deterministically leave a real debounced generation queued at teardown.
 // unwatch() cannot cancel this callback; its source reads must still succeed.
 hexo._watchBox();
});

test('current and legacy offline selection discover all bundles and restore their exact snapshot bytes',async t=>{
 const dir=fixture(t),publicDir=path.join(dir,'public');fs.mkdirSync(path.join(publicDir,'atelier/data'),{recursive:true});fs.copyFileSync(path.join(root,'public/atelier/data/archive.json'),path.join(publicDir,'atelier/data/archive.json'));
 fs.mkdirSync(path.join(publicDir,'js/plugins'),{recursive:true});fs.copyFileSync(path.join(root,'public/js/plugins/tabs.js'),path.join(publicDir,'js/plugins/tabs.js'));
 const prepared=await prepareStylesheets(source);for(const item of prepared){fs.mkdirSync(path.dirname(path.join(publicDir,item.path)),{recursive:true});fs.writeFileSync(path.join(publicDir,item.path),item.data);}
 const {snapshotHarness}=require('../tools/offline-snapshot-audit.cjs');
 for(const prefix of ['/','/lab/'])for(const legacy of [false,true]){
  const html=rewriteStylesheets(head('/'))+'<body>'+tag('/atelier/css/fonts.css')+'</body>';
  const h=await snapshotHarness({root:prefix,legacy,html,publicDir}),article=prefix+'2026/09/22/Hello-CC-Atelier/';
  const {rows}=await h.handle({type:'save',path:article}),snapshot=await h.caches.open(rows[0].snapshot);
  for(const item of prepared){const saved=await snapshot.match('https://offline.test'+prefix+item.path);assert.ok(saved,item.path);assert.deepEqual(Buffer.from(await saved.arrayBuffer()),item.data);}
  for(const name of fs.readdirSync(path.join(root,'source/atelier/fonts')).filter(name=>/\.(woff2?|ttf)$/.test(name)))assert.ok(await snapshot.match('https://offline.test'+prefix+'atelier/fonts/'+name),name);
  // Re-register the existing worker fetch listener to invoke its real restore
  // path, without changing worker source or cache names.
  let fetchHandler;h.context.self.addEventListener=(type,fn)=>{if(type==='fetch')fetchHandler=fn;};
  const worker=fs.readFileSync(path.join(root,'custom/live-sw.template'),'utf8');vm.runInContext(worker.slice(worker.indexOf("self.addEventListener('fetch'")),h.context);
  h.context.self.clients.get=async()=>({url:'https://offline.test'+article});
  for(const item of prepared){h.fail(prefix+item.path);let response;fetchHandler({request:new Request('https://offline.test'+prefix+item.path),clientId:'saved-article',respondWith:value=>{response=value;}});assert.deepEqual(Buffer.from(await(await response).arrayBuffer()),item.data);}
  assert.equal((await snapshot.match('https://offline.test'+article)).status,200);
 }
});
