'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const esbuild=require('esbuild'),{parse}=require('rrweb-cssom');
const manifest=require('./archive-scene-selectors.json');
const hash=data=>createHash('sha256').update(data).digest('hex');
const key=(media,selector)=>JSON.stringify({media,selector});
// Explicitly reviewed selector+media identities, not a broad prefix-based purge.
// New rules remain global by default. Removed/changed/duplicated identities fail
// the build until their ownership has been reviewed again.
async function archiveGlobalBytes(data){
 const source=new TextDecoder('utf-8',{fatal:true}).decode(data);
 if(data.subarray(0,3).equals(Buffer.from([0xef,0xbb,0xbf]))||/@(?:import|charset|namespace)\b|sourceMappingURL/i.test(source))throw Error('Unsafe archive stylesheet directive or BOM');
 const checked=await esbuild.transform(source,{loader:'css',logLevel:'silent'});
 if(checked.warnings.length||/@(?:import|charset|namespace)\b/i.test(checked.code))throw Error('Malformed or unsafe archive stylesheet');
 const wanted=new Set(manifest.map(({media,selector})=>key(media,selector)));
 if(wanted.size!==manifest.length)throw Error('Duplicate archive selector manifest entry');
 const removals=[],seen=new Set(),retained=[];
 function walk(rules,media=[]){for(const rule of rules){
  if(rule.type===4){walk(rule.cssRules,[...media,rule.conditionText]);continue;}
  if(rule.type!==1||!Number.isInteger(rule.__starts)||!Number.isInteger(rule.__ends))throw Error('Unsupported archive CSS syntax');
  const identity=key(media,rule.selectorText);
  if(wanted.has(identity)){
   if(seen.has(identity))throw Error('Duplicate archive scene selector: '+identity);
   seen.add(identity);removals.push([rule.__starts,rule.__ends]);
  }else retained.push({media,selector:rule.selectorText,style:rule.style.cssText});
 }}
 walk(parse(source).cssRules);
 if(seen.size!==wanted.size)throw Error('Archive scene selector manifest needs review');
 let output=source;for(const [start,end] of removals.sort((a,b)=>b[0]-a[0]))output=output.slice(0,start)+output.slice(end);
 const final=[];function verify(rules,media=[]){for(const rule of rules){if(rule.type===4)verify(rule.cssRules,[...media,rule.conditionText]);else final.push({media,selector:rule.selectorText,style:rule.style.cssText});}}verify(parse(output).cssRules);
 if(JSON.stringify(final)!==JSON.stringify(retained))throw Error('Archive global cascade changed');
 return Buffer.from(output);
}
async function prepareArchiveVariant(directory){
 for(const file of ['archive-global.css','delivery-dialogs-global.css'])if(fs.existsSync(path.join(directory,file)))throw Error('Shared stylesheet output collision: '+file);
 const archive=await archiveGlobalBytes(fs.readFileSync(path.join(directory,'archive.css')));
 const after=fs.readFileSync(path.join(directory,'after-hours.css'));
 const bundle=Buffer.concat([after,Buffer.from('\n'),archive]);
 return [{path:'atelier/css/archive-global.css',data:archive,sha256:hash(archive)}, {path:'atelier/css/delivery-dialogs-global.css',data:bundle,sha256:hash(bundle),members:[{file:'after-hours.css',sha256:hash(after)},{file:'archive-global.css',sha256:hash(archive)}]}];
}
module.exports={archiveGlobalBytes,prepareArchiveVariant};
