'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),source=path.join(root,'source/atelier/css');
const {archiveGlobalBytes,prepareArchiveVariant}=require('../tools/build-archive-global.cjs');
const {groups,variantGroup,generatedPaths,prepareStylesheets,rewriteStylesheets,expandStylesheetURLs}=require('../tools/build-shared-stylesheets.cjs');
const manifest=require('../tools/archive-scene-selectors.json'),{parse}=require('rrweb-cssom');
const links=html=>[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(x=>x[1]);
const tag=file=>`<link rel="stylesheet" href="${file}">`;
const read=file=>fs.readFileSync(path.join(root,file));
const fixed=['cover','atelier','studio','practice','guestbook','lounge','admin','projects','research','life','about','categories','tags'];
function renderHead(nijika,type='generated',prefix='/'){
 const page={nijika,path:'unrelated-alias/index.html'},context={page,theme:{nijika:{cover:'/cover.webp'}},is_post:()=>type==='post',is_page:()=>type==='page',is_home:()=>type==='home',is_archive:()=>type==='archive',is_category:()=>type==='category',is_tag:()=>type==='tag',url_for:value=>prefix+value.replace(/^\//,''),nijika_page_metadata:()=>({}),nijika_art_srcset:()=>'',open_graph:()=>'',export_config:()=>''};
 return require('ejs').render(read('custom/redefine/nijika/head.ejs').toString(),context);
}
test('fixed non-reading scenes alone select global archive CSS at unchanged cascade position',()=>{
 for(const prefix of ['/','/lab/'])for(const nijika of [...fixed,'notes','future-page',undefined])for(const type of ['generated','page','post','home']){
  const expected=fixed.includes(nijika)&&type!=='post'&&(type!=='page'||['projects','research','life','about','categories','tags'].includes(nijika));
  const raw=links(renderHead(nijika,type,prefix)),global=prefix+'atelier/css/archive-global.css',full=prefix+'atelier/css/archive.css';
  assert.equal(raw.includes(global),expected,`${prefix} ${nijika} ${type}`);assert.equal(raw.includes(full),!expected);
  const i=raw.indexOf(expected?global:full);assert.equal(raw[i-1],prefix+'atelier/css/after-hours.css');assert.ok(i<raw.indexOf(prefix+'atelier/css/stage-engine.css'));
  const delivered=links(rewriteStylesheets(renderHead(nijika,type,prefix)));assert.deepEqual(expandStylesheetURLs(delivered),raw);assert.equal(raw.length-delivered.length,7);
 }
});
test('new variant retains exact global rule order and source substrings and saves 11426 bytes',async()=>{
 const original=read('source/atelier/css/archive.css'),small=await archiveGlobalBytes(original),prepared=await prepareArchiveVariant(source);
 assert.equal(original.length-small.length,11426);assert.equal(small.length,1724);assert.equal(manifest.length,140);
 const keys=new Set(manifest.map(x=>JSON.stringify(x)));
 function leaves(rules,media=[]){return rules.flatMap(r=>r.cssRules?leaves(r.cssRules,[...media,r.conditionText]):[{media,selector:r.selectorText,style:r.style.cssText}]);}
 const expected=leaves(parse(original.toString()).cssRules).filter(({media,selector})=>!keys.has(JSON.stringify({media,selector})));
 assert.deepEqual(leaves(parse(small.toString()).cssRules),expected);assert.equal(expected.length,22);
 assert.deepEqual(prepared[0].data,small);assert.deepEqual(prepared[1].data,Buffer.concat([read('source/atelier/css/after-hours.css'),Buffer.from('\n'),small]));
 const old=await prepareStylesheets(source);assert.equal(old.length,4);assert.deepEqual(old[1].data,Buffer.concat([read('source/atelier/css/after-hours.css'),Buffer.from('\n'),original]));
 for(const selector of ['.live-dialog','.live-dialog-head','.live-dialog-tools','.live-file-label','.live-status','.queue-row','.queue-history'])assert.ok(small.toString().includes(selector));
});
test('selector changes, duplicate identities, parser hazards and reserved outputs fail closed',async t=>{
 const original=read('source/atelier/css/archive.css').toString();
 for(const text of [original.replace('.live-archive{','.renamed-archive{'),original+'\n.live-archive{color:red}',original+'\n@supports(display:grid){.future{display:grid}}',original+'\n@import "bad.css";',original+'\n@\\69mport "bad.css";',original+'\n.broken {','\ufeff'+original])await assert.rejects(archiveGlobalBytes(Buffer.from(text)));
 // Added selectors are retained conservatively, never automatically purged.
 const added='\n.archive-future-rule{color:red}\n';assert.ok((await archiveGlobalBytes(Buffer.from(original+added))).toString().endsWith(added));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'archive-global-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));for(const file of ['archive.css','after-hours.css'])fs.copyFileSync(path.join(source,file),path.join(dir,file));
 for(const name of ['archive-global.css','delivery-dialogs-global.css']){fs.writeFileSync(path.join(dir,name),'collision');await assert.rejects(prepareArchiveVariant(dir),/collision/);fs.unlinkSync(path.join(dir,name));}
});
test('variant rewriting remains conservative, idempotent and prefix safe',()=>{
 for(const prefix of ['/','/lab/']){
  const a=tag(prefix+'atelier/css/after-hours.css'),b=tag(prefix+'atelier/css/archive-global.css');
  const html='<head>'+a+'\n'+b+'</head>',rewritten=rewriteStylesheets(html);assert.deepEqual(links(rewritten),[prefix+'atelier/css/delivery-dialogs-global.css']);assert.equal(rewriteStylesheets(rewritten),rewritten);
  for(const unsafe of [a+'<!-- boundary -->'+b,b+a,a.replace('rel=','media="screen" rel=')+b,a+b.replace('.css','.css?v=1')])assert.equal(rewriteStylesheets('<head>'+unsafe+'</head>'),'<head>'+unsafe+'</head>');
 }
 assert.deepEqual(groups.map(x=>x.file),['delivery-foundation.css','delivery-dialogs.css','delivery-editorial.css','delivery-immersive.css']);assert.deepEqual(variantGroup.members,['after-hours.css','archive-global.css']);
});
test('generated fixed scenes use smaller group without extra links, and offline shell lists old and new assets',()=>{
 for(const [route,count] of [['index.html',10],['atelier/index.html',10],['projects/index.html',9],['research/index.html',11],['about/index.html',9],['studio/index.html',9]]){
  const urls=links(read('public/'+route).toString());assert.equal(urls.length,count,route);assert.ok(urls.includes('/atelier/css/delivery-dialogs-global.css'),route);assert.ok(!urls.includes('/atelier/css/delivery-dialogs.css'),route);
 }
 for(const route of ['notes/index.html','notes/page/2/index.html','series/hot100/index.html','2026/09/22/Hello-CC-Atelier/index.html','404.html']){
  const urls=links(read('public/'+route).toString());assert.ok(urls.includes('/atelier/css/delivery-dialogs.css'),route);assert.ok(!urls.includes('/atelier/css/delivery-dialogs-global.css'),route);
 }
 const shell=JSON.parse(read('public/atelier/data/offline-shell.json'));for(const asset of ['archive.css','archive-global.css','delivery-dialogs-global.css'])assert.ok(shell.includes('/atelier/css/'+asset),asset);
});
test('both worker profiles save and restore the new bundle and standalone global CSS at both roots',async()=>{
 const {snapshotHarness}=require('../tools/offline-snapshot-audit.cjs');
 for(const prefix of ['/','/lab/'])for(const legacy of [false,true]){
  const html='<head>'+tag('/atelier/css/delivery-dialogs-global.css')+tag('/atelier/css/archive-global.css')+'</head><body></body>';
  const h=await snapshotHarness({root:prefix,legacy,html,publicDir:path.join(root,'public')}),article=prefix+'2026/09/22/Hello-CC-Atelier/';
  const {rows}=await h.handle({type:'save',path:article}),snapshot=await h.caches.open(rows[0].snapshot);
  let handler;h.context.self.addEventListener=(type,fn)=>{if(type==='fetch')handler=fn;};const worker=read('custom/live-sw.template').toString();vm.runInContext(worker.slice(worker.indexOf("self.addEventListener('fetch'")),h.context);h.context.self.clients.get=async()=>({url:'https://offline.test'+article});
  for(const file of ['delivery-dialogs-global.css','archive-global.css']){
   const url=prefix+'atelier/css/'+file,saved=await snapshot.match('https://offline.test'+url);assert.ok(saved);assert.deepEqual(Buffer.from(await saved.arrayBuffer()),read('public/atelier/css/'+file));h.fail(url);let response;handler({request:new Request('https://offline.test'+url),clientId:'saved-article',respondWith:value=>{response=value;}});assert.deepEqual(Buffer.from(await(await response).arrayBuffer()),read('public/atelier/css/'+file));
  }
 }
});
test('cached generation refreshes variants atomically and rejects all new reserved route collisions',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'archive-variant-cache-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.mkdirSync(path.join(dir,'source/atelier/css'),{recursive:true});for(const group of groups)for(const file of group.members)fs.copyFileSync(path.join(source,file),path.join(dir,'source/atelier/css',file));fs.writeFileSync(path.join(dir,'_config.yml'),'theme: false\nroot: /lab/\n');
 const Hexo=require('hexo'),hexo=new Hexo(dir,{silent:true});await hexo.init();t.after(()=>hexo.exit());const script=path.join(root,'scripts/shared-stylesheets.js');vm.runInNewContext(fs.readFileSync(script,'utf8'),{hexo,require:require('node:module').createRequire(script)});
 const html='<head>'+tag('/lab/atelier/css/delivery-dialogs-global.css')+'</head>';hexo.extend.generator.register('cached-page',()=>({path:'index.html',data:{data:html,modified:false}}));await hexo.call('generate',{bail:true});
 const bytes=async file=>{const chunks=[];for await(const x of hexo.route.get(file))chunks.push(Buffer.from(x));return Buffer.concat(chunks);};
 const file=path.join(dir,'source/atelier/css/archive.css'),original=fs.readFileSync(file),target='atelier/css/delivery-dialogs-global.css',before=await bytes(target);
 fs.appendFileSync(file,'\n.future-global-rule{color:red}\n');await hexo.call('generate',{bail:true});const changed=await bytes(target);assert.notDeepEqual(changed,before);assert.deepEqual(fs.readFileSync(path.join(dir,'public',target)),changed);assert.equal(fs.readFileSync(path.join(dir,'public/index.html'),'utf8'),html);
 fs.writeFileSync(file,original.toString().replace('.live-archive{','.changed-scene{'));await assert.rejects(hexo._generate({cache:true}),/manifest/);assert.deepEqual(await bytes(target),changed);
 fs.writeFileSync(file,original);await hexo._generate({cache:true});assert.deepEqual(await bytes(target),before);
 for(const reserved of ['atelier/css/archive-global.css',target]){
  hexo.extend.generator.register('variant-collision',()=>({path:reserved,data:'bad'}));await assert.rejects(hexo._generate({cache:true}),/generated route collision/);assert.deepEqual(await bytes(target),before);hexo.extend.generator.register('variant-collision',()=>[]);await hexo._generate({cache:true});
 }
});
test('every generated document using the global-only bundle lacks all reviewed scene roots',()=>{
 const {parseDocument}=require('htmlparser2'),sceneRoots=new Set(manifest.flatMap(item=>item.selector.split(',').map(selector=>selector.trim().match(/^\.([\w-]+)/)[1])));
 let checked=0;for(const route of fs.readdirSync(path.join(root,'public'),{recursive:true}).filter(file=>file.endsWith('.html'))){
  const html=read('public/'+route).toString();if(!links(html).some(url=>url.endsWith('/delivery-dialogs-global.css')))continue;checked++;
  function visit(node){for(const name of (node.attribs?.class||'').split(/\s+/))assert.ok(!sceneRoots.has(name),route+' unexpectedly owns scene root '+name);for(const child of node.children||[])visit(child);}visit(parseDocument(html));
 }
 assert.equal(checked,13,'every audited fixed scene is generated and checked');
});
