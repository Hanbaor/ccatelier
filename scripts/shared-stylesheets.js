'use strict';
const path=require('node:path');
const {generatedPaths,prepareStylesheets,rewriteStylesheets}=require('../tools/build-shared-stylesheets.cjs');
const {prepareArchiveVariant}=require('../tools/build-archive-global.cjs');
let prepared;
const guarded=new WeakSet();
const paths=new Set(generatedPaths);
hexo.extend.filter.register('before_generate',async function(){
 // Build every output before publishing any route. Failed preparation leaves
 // the previous good routes intact, and a subsequent generation retries fully.
 prepared=undefined;
 const directory=path.join(this.source_dir,'atelier/css');
 const next=[...await prepareStylesheets(directory),...await prepareArchiveVariant(directory)];
 for(const name of ['Page','Asset'])for(const item of this.model(name).toArray()){
  if(paths.has(item.path))throw Error('Shared stylesheet output collision: '+item.path);
 }
 prepared=next;
},1);
// Run after conventional generator setup (including nijika at priority 100).
// Plugins registering later than this boundary require separate coordination.
hexo.extend.filter.register('before_generate',function(){
 // Hexo collects every generator result before _routerRefresh publishes any
 // of them. Reject competing generated routes at that boundary as well.
 for(const [name,original] of Object.entries(this.extend.generator.list())){
  if(name==='shared-stylesheets'||guarded.has(original))continue;
  const guard=async function(locals){
   const result=await original.call(this,locals);
   for(const route of Array.isArray(result)?result:[result]){
    if(route?.path!=null&&paths.has(this.route.format(route.path)))throw Error('Shared stylesheet generated route collision: '+route.path);
   }
   return result;
  };
  this.extend.generator.register(name,guard);
  guarded.add(this.extend.generator.get(name));
 }
},1000);
hexo.extend.generator.register('shared-stylesheets',function(){
 if(!prepared)throw Error('Shared stylesheet preparation has not completed');
 return prepared.map(item=>({path:item.path,data:{data:item.data,modified:true}}));
});
// Registered once, after normal HTML rendering. Cached original HTML remains
// valid; cached rewritten HTML references the same stable, regenerated URLs.
hexo.extend.filter.register('after_render:html',rewriteStylesheets,100);
