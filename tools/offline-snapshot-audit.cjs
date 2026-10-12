'use strict';
// Deterministic local response-body accounting, not disk usage or network timing.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {buildMainEntry}=require('./build-main-entry.cjs');
const {buildOfflineProfile}=require('./offline-profile.cjs');
async function snapshotHarness({root='/',legacy=false,html,publicDir=path.resolve('public')}={}){
 const source=path.resolve('source'),origin='https://offline.test',base=origin+root;
 const {cacheableURL}=await import('../source/atelier/js/offline-core.mjs');
 const {articleResources}=await import('../source/atelier/js/offline-resources.mjs');
 const {code,plan}=await buildMainEntry(path.join(source,'atelier/js'));
 const profile=buildOfflineProfile(source,root),shell=[];
 function collect(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,item.name);if(item.isDirectory())collect(file);else if(/\.(?:m?js|css|ttf|woff2?)$/.test(file))shell.push(root+path.relative(source,file).replaceAll('\\','/'));}}
 for(const name of ['js','css','fonts'])collect(path.join(source,'atelier',name));
 const stores=new Map(),fetched=[],key=value=>typeof value==='string'?new URL(value,base).href:value.url;
 let failed=null,revision=0,failPut=null,bodyReads=0;
 const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {async match(value){const response=store.get(key(value))?.clone();if(response){const read=response.arrayBuffer.bind(response);response.arrayBuffer=()=>{bodyReads++;return read();};}return response;},async put(value,response){if(failPut?.(name,key(value)))throw Error('QuotaExceededError');store.set(key(value),response.clone());},async keys(){return [...store.keys()].map(url=>({url}));},async delete(value){return store.delete(key(value));}};},async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);}};
 const archive=JSON.parse(fs.readFileSync(path.join(publicDir,'atelier/data/archive.json'),'utf8'));
 if(root!=='/')for(const post of archive.posts)post.path=root+post.path.replace(/^\//,'');
 const fetch=async input=>{
  const url=new URL(key(input));fetched.push(url.href);if(failed===url.pathname)throw Error('Simulated missing dependency');
  const rel=url.pathname.slice(root.length);
  if(rel==='atelier/data/offline-profile.json')return new Response(JSON.stringify(legacy?shell:profile));
  if(rel==='atelier/data/offline-shell.json')return new Response(JSON.stringify(shell));
  if(rel==='atelier/data/archive.json')return new Response(JSON.stringify(archive));
  if(rel==='atelier/js/main.js')return new Response(code+(revision?'\n// revision '+revision:''));
  if(archive.posts.some(post=>post.path===url.pathname)){
   const page=html??fs.readFileSync(path.join(publicDir,rel,'index.html'),'utf8');
   return new Response(root==='/'?page:page.replaceAll('="/','="'+root));
  }
  for(const dir of [source,publicDir]){const file=path.join(dir,rel);if(fs.existsSync(file)&&fs.statSync(file).isFile())return new Response(fs.readFileSync(file));}
  throw Error('Missing audit fixture: '+rel);
 };
 const events={},self={location:{origin},addEventListener:(name,fn)=>events[name]=fn,clients:{claim:async()=>{}},skipWaiting:async()=>{}};
 const context=vm.createContext({self,caches,fetch,URL,URLSearchParams,Response,Request,crypto,cacheableURL,articleResources,console});
 let worker=fs.readFileSync('custom/live-sw.template','utf8').replace(/^import[^\n]+\n/gm,'').replaceAll('__ROOT__',JSON.stringify(root));
 // Compare old resource selection directly, without adding rollout fallback traffic.
 if(legacy)worker=worker.replace('shell=await resourceProfile(html,discovered)',"shell=await (await get(new URL(ROOT+'atelier/data/offline-shell.json',BASE).href)).json()");
 vm.runInContext(worker,context);
 return {setHTML(value){html=value;},context,profile,plan,stores,caches,fetched,archive,handle:data=>context.handle(data),fail(pathname){failed=pathname;},failWrites(fn){failPut=fn;},revise(){revision++;},resetReads(){bodyReads=0;},get bodyReads(){return bodyReads;}};
}
async function audit(){
 const paths=['/2026/09/22/Hello-CC-Atelier/','/hot100/001/'],result={};
 for(const legacy of [true,false]){
  const h=await snapshotHarness({legacy});const saves=[];
  for(const article of paths){const before=h.fetched.length,{rows}=await h.handle({type:'save',path:article}),row=rows.find(row=>row.path===article),store=h.stores.get(row.snapshot);saves.push({path:article,resources:store.size,bytes:row.bytes,fetches:h.fetched.length-before});}
  const rows=(await h.handle({type:'list'})).rows,[a,b]=rows.map(row=>h.stores.get(row.snapshot));let duplicateBytes=0,duplicateURLs=0;
  for(const [url,response] of a)if(b.has(url)){duplicateURLs++;duplicateBytes+=(await response.clone().arrayBuffer()).byteLength;}
  h.resetReads();await h.handle({type:'list'});
  result[legacy?'legacy':'profile']={saves,duplicateURLs,duplicateBytes,listBodyReads:h.bodyReads};
 }
 console.log(JSON.stringify(result,null,2));
}
module.exports={snapshotHarness};
if(require.main===module)audit().catch(error=>{console.error(error);process.exitCode=1;});
