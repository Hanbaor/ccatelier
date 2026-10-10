'use strict';
const path=require('node:path');
const {buildMainEntry}=require('../tools/build-main-entry.cjs');
let prepared,wrapped=false;
// Hexo 8 emits generateAfter BEFORE after_generate. Watch writes route updates
// immediately, so compile before generators and replace the original page/asset
// before its sole route.set, rather than mutating an already-published route.
hexo.extend.filter.register('before_generate',async function(){
 prepared=undefined;
 const result=await buildMainEntry(path.join(this.source_dir,'atelier/js'));
 if(!wrapped){
  for(const name of ['page','asset']) {
  const original=this.extend.generator.get(name);
  if(!original)throw Error('Native '+name+' generator is required for main entry delivery');
  this.extend.generator.register(name,async function(locals){
   if(!prepared)throw Error('Main entry compilation has not completed');
   const routes=await original.call(this,locals);
   const matches=routes.filter(route=>route.path==='atelier/js/main.js');
   if(matches.length>1)throw Error('Duplicate main.js routes');
   return routes.map(route=>route===matches[0]?{...route,data:{data:prepared,modified:true}}:route);
  });
  }
  wrapped=true;
 }
 const owners=['Page','Asset'].flatMap(name=>this.model(name).toArray().filter(item=>item.path==='atelier/js/main.js'));
 if(owners.length!==1)throw Error('Expected exactly one native main.js source');
 prepared=result.code;
},1);
