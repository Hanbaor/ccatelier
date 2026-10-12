'use strict';
const fs=require('node:fs'),path=require('node:path');
const {planMainEntry}=require('./build-main-entry.cjs');
const {analyzeModule}=require('./browser-module-analysis.cjs');
// These are DOM-gated entry points, not a denylist of shared implementation.
// All other imports, including lazy dialog/queue/search and article tools, remain.
const routeMarkers={
 'practice.js':'data-practice','livehouse.js':'data-live-open','studio.js':'data-studio','stage-engine.js':'data-studio',
 'archive.js':'data-archive','backstage.js':'data-backstage-scene','series-filter.js':'data-hot100-filter'
};
function buildOfflineProfile(sourceDir,root='/',options={}){
 const directory=path.join(sourceDir,'atelier/js'),plan=planMainEntry(directory,options),dependencies={},unsupported=new Set();
 const url=file=>root+path.relative(sourceDir,file).replaceAll('\\','/');
 const resolve=(file,specifier)=>specifier==='/js/plugins/tabs.js'?root+'js/plugins/tabs.js':url(path.resolve(path.dirname(file),specifier));
 const visited=new Set();
 function edges(file,source){
  const result=[];
  if(/\bimportScripts\s*\(/.test(source))unsupported.add(url(file));
  for(const item of analyzeModule(source).imports){
   const target=resolve(file,item.path);
   if(target.includes('/atelier/vendor/')){unsupported.add(url(file));continue;}
   if(item.path==='/js/plugins/tabs.js'){
    const themeModule=require.resolve('hexo-theme-redefine/source/js/plugins/tabs.js');
    if(analyzeModule(fs.readFileSync(themeModule,'utf8')).imports.length)throw Error('Theme tabs dependency graph needs review');
    dependencies[target]=[];
   }
   // A static dependency bundled inside main has no independent delivered URL.
   const resolved=path.resolve(path.dirname(file),item.path);
   if(item.kind==='import-statement'&&plan.bundled.has(file)&&plan.bundled.has(resolved))continue;
   const marker=item.kind==='dynamic-import'&&['main.js','route-features.js'].includes(path.basename(file))&&routeMarkers[path.basename(item.path)];
   result.push(marker?{url:target,when:marker}:target);
   if(item.path.startsWith('.'))visit(resolved);
  }
  // import.meta URL dependencies include workers and dynamically installed CSS.
  // Deliberately constrain this to literal URL expressions, never arbitrary text.
  for(const match of source.matchAll(/new\s+URL\(\s*(['"])(\.\.?\/[^'"\s]+)\1\s*,\s*import\.meta\.url\s*\)/g)){
   const resolved=path.resolve(path.dirname(file),match[2]);
   if(!fs.existsSync(resolved))throw Error('Missing offline URL dependency: '+resolved);
   result.push(url(resolved));visit(resolved);
  }
  // Root-relative runtime styles are known public CSS; data/API URLs are not
  // inferred or admitted here (e.g. connections.json keeps its current policy).
  for(const match of source.matchAll(/\b(?:root|document\.body\.dataset\.root)\s*\+\s*(['"])(atelier\/css\/[A-Za-z0-9_./-]+\.css)\1/g)){
   const file=path.join(sourceDir,match[2]);if(!fs.existsSync(file))throw Error('Missing offline style: '+file);result.push(root+match[2]);
  }
  return [...new Map(result.map(item=>[JSON.stringify(item),item])).values()];
 }
 function visit(file){
  if(visited.has(file))return;visited.add(file);
  if(!/\.m?js$/.test(file))return;
  if(!fs.existsSync(file))throw Error('Missing offline module: '+file);
  dependencies[url(file)]=edges(file,plan.modules.get(file)?.source??fs.readFileSync(file,'utf8'));
 }
 // Include independent scripts as graph nodes so HTML-discovered demo/worker
 // entries get their complete closure. Nodes alone are never cache requests.
 for(const file of plan.modules.keys())visit(file);
 const entryEdges=[];
 for(const file of plan.bundled)entryEdges.push(...dependencies[url(file)]);
 dependencies[url(plan.entry)]=[...new Map(entryEdges.map(item=>[JSON.stringify(item),item])).values()];
 return {version:2,entries:[url(plan.entry)],dependencies,unsupported:[...unsupported]};
}
module.exports={buildOfflineProfile,routeMarkers};
