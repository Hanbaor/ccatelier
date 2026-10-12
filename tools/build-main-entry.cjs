'use strict';
const fs=require('node:fs'),path=require('node:path'),esbuild=require('esbuild');
const {analyzeModule}=require('./browser-module-analysis.cjs');
const {parseDocument}=require('htmlparser2');
const slash=value=>value.replaceAll('\\','/');
// Template references can turn an otherwise exclusive initial module into an
// independent entry. Scan authored templates/content, conservatively retaining
// any literal module reference, including source links and inline module code.
function referencedModules(directory,referenceDirectories){
 const found=new Set();
 function visit(dir){if(!fs.existsSync(dir))return;for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,item.name);if(item.isDirectory())visit(file);
  else if(/\.(?:ejs|html|md)$/.test(item.name)){
   const source=fs.readFileSync(file,'utf8');
   for(const match of source.matchAll(/atelier\/js\/([A-Za-z0-9_./-]+\.m?js)\b/g))found.add(path.resolve(directory,match[1]));
   function scripts(node){
    if(node.name!=='script'){for(const child of node.children||[])scripts(child);return;}
    const attrs=node.attribs||{},body=(node.children||[]).map(child=>child.data||'').join('');
    const mime=(attrs.type||'').trim().toLowerCase();
    if(mime.includes('<%'))throw Error('Unanalyzable script type in '+file);
    // Read actual HTML attributes, never strings embedded in another attribute.
    // Classic JavaScript can import modules too. Non-JS data blocks cannot.
    if(mime&&!/^(?:module|(?:text|application)\/(?:x-)?(?:java|ecma)script|text\/(?:javascript1\.[0-5]|jscript|livescript))$/.test(mime))return;
    if(Object.hasOwn(attrs,'src')){const value=attrs.src;if(!/^(?:<%=\s*url_for\(['"]atelier\/js\/[A-Za-z0-9_./-]+\.m?js['"]\)\s*%>|\/?(?:[A-Za-z0-9_-]+\/)*atelier\/js\/[A-Za-z0-9_./-]+\.m?js)$/.test(value))throw Error('Unanalyzable module entry in '+file);const entry=value.match(/atelier\/js\/([A-Za-z0-9_./-]+\.m?js)\b/);found.add(path.resolve(directory,entry[1]));}
    else {const parsed=analyzeModule(body);for(const dep of parsed.imports){const match=dep.path.match(/atelier\/js\/([A-Za-z0-9_./-]+\.m?js)$/);if(!match)throw Error('Unanalyzable inline module entry in '+file);found.add(path.resolve(directory,match[1]));}}
   }
   scripts(parseDocument(source));
  }
 }}
 for(const dir of referenceDirectories)visit(dir);return found;
}
function planMainEntry(directory,{referenceDirectories}={}){
 directory=path.resolve(directory);
 const entry=path.join(directory,'main.js'),modules=new Map();
 function collect(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,item.name);if(item.isDirectory())collect(file);else if(/\.m?js$/.test(item.name)){const source=fs.readFileSync(file,'utf8');try{modules.set(file,{source,...analyzeModule(source)});}catch(error){throw Error('Cannot safely analyze '+slash(path.relative(directory,file))+': '+error.message,{cause:error});}}}}
 collect(directory);
 function target(file,specifier){
  if(!specifier.startsWith('.'))throw Error('Unexpected non-local browser import in '+file+': '+specifier);
  if(/[?#]/.test(specifier))throw Error('Module URL suffix needs explicit analysis: '+specifier);
  const resolved=path.resolve(path.dirname(file),specifier);
  if(!fs.existsSync(resolved)||!fs.statSync(resolved).isFile())throw Error('Missing browser dependency: '+resolved);
  return resolved;
 }
 const edges=new Map();
 for(const [file,module] of modules){edges.set(file,module.imports.map(item=>{
  if(item.path==='/js/plugins/tabs.js'&&item.kind==='dynamic-import')return {...item,target:null};
  const resolved=target(file,item.path);
  if(item.kind==='import-statement'&&!modules.has(resolved))throw Error('Static dependency outside managed module directory: '+resolved);
  return {...item,target:resolved};
 }));}
 function closure(seeds){const seen=new Set();function visit(file){if(seen.has(file))return;seen.add(file);for(const edge of edges.get(file)||[])if(edge.kind==='import-statement')visit(edge.target);}for(const file of seeds)visit(file);return seen;}
 const initial=closure([entry]);
 if(!modules.has(entry))throw Error('Missing main.js');
 for(const file of initial)if(!modules.has(file))throw Error('Initial import outside managed module directory: '+file);
 // Every non-initial module is an independent consumer, even if today's HTML
 // does not reference it. Dynamic targets and import.meta owners retain URLs.
 if(!referenceDirectories)referenceDirectories=path.basename(directory)==='js'&&path.basename(path.dirname(directory))==='atelier'?[path.resolve(directory,'../..'),path.resolve(directory,'../../../custom')]:[];
 const retained=new Set([...modules.keys()].filter(file=>!initial.has(file)));
 for(const file of referencedModules(directory,referenceDirectories)){if(!modules.has(file))throw Error('Missing independent module entry: '+file);if(file!==entry)retained.add(file);}
 for(const [file,module] of modules){
  if(file!==entry&&(module.hasImportMeta||path.dirname(file)!==directory))retained.add(file);
  for(const edge of edges.get(file))if(edge.kind==='dynamic-import'&&edge.target)retained.add(edge.target);
  // Conservatively preserve literal module URL references, including Workers.
  for(const match of module.source.matchAll(/['"](\.\.?\/[^'"\s]+\.m?js)['"]/g)){
   const dest=target(file,match[1]);
   if(!edges.get(file).some(edge=>edge.target===dest))retained.add(dest);
  }
 }
 const externalDynamic=new Set([...edges.values()].flat().filter(edge=>edge.kind==='dynamic-import'&&edge.target&&!modules.has(edge.target)).map(edge=>edge.target));
 for(const file of externalDynamic){
  const parsed=analyzeModule(fs.readFileSync(file,'utf8'));
  if(parsed.imports.length)throw Error('External dynamic module needs explicit dependency analysis: '+file);
 }
 const shared=closure(retained);
 if(shared.has(entry))throw Error('main.js is consumed by another entry; cannot combine safely');
 const bundled=new Set([...initial].filter(file=>!shared.has(file)));
 return {directory,entry,modules,edges,initial,shared,bundled};
}
async function buildMainEntry(directory,options){
 const plan=planMainEntry(directory,options);
 const result=await esbuild.build({absWorkingDir:plan.directory,entryPoints:['main.js'],outfile:'main.js',bundle:true,write:false,metafile:true,format:'esm',platform:'browser',target:'es2022',minify:true,keepNames:true,legalComments:'inline',logLevel:'silent',plugins:[{name:'preserve-module-identity',setup(build){
  build.onResolve({filter:/.*/},args=>{
   if(args.kind==='entry-point')return {path:plan.entry};
   if(!args.path.startsWith('.'))throw Error('Unexpected bundled import: '+args.path);
   const target=path.resolve(path.dirname(args.importer),args.path);
   if(args.kind==='dynamic-import'||!plan.bundled.has(target))return {path:'./'+slash(path.relative(plan.directory,target)),external:true};
   return {path:target};
  });
  // Use the same source snapshot that was analyzed, including in watch mode.
  build.onLoad({filter:/.*/},args=>({contents:plan.modules.get(args.path).source,loader:'js'}));
 }}]});
 if(result.warnings.length)throw Error('Entry build warning: '+result.warnings.map(item=>item.text).join('; '));
 if(result.outputFiles.length!==1)throw Error('Expected one main.js output');
 const code=result.outputFiles[0].text;
 analyzeModule(code); // Validate the delivered imports too, before touching routes.
 return {code,plan,metafile:result.metafile};
}
module.exports={planMainEntry,buildMainEntry};
