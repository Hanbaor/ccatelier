// Audit built, uncompressed JS file bytes. This is not a network or runtime benchmark.
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {analyzeModule}=require('./browser-module-analysis.cjs');
function staticImports(source){return analyzeModule(source).imports.filter(item=>item.kind==='import-statement').map(item=>item.path);}
function graph(directory,entries){
 const seen=new Set();
 function visit(file){if(seen.has(file))return;seen.add(file);for(const specifier of staticImports(fs.readFileSync(file,'utf8'))){if(!specifier.startsWith('.'))throw Error('Unexpected non-local browser import: '+specifier);visit(path.resolve(path.dirname(file),specifier));}}
 for(const entry of entries)visit(path.resolve(directory,entry));
 const files=[...seen].map(file=>({path:path.relative(directory,file).replaceAll('\\','/'),bytes:fs.statSync(file).size})).sort((a,b)=>a.path.localeCompare(b.path));
 return {modules:files.length,bytes:files.reduce((total,file)=>total+file.bytes,0),files};
}
const routes=[['/',[]],['/atelier/',[]],['/guestbook/',['community-comments.js']],['/series/hot100/',['series-filter.js','notebook.js']],['/notes/',['archive.js','archive-worker.js']],['/notes/?view=graph',['archive.js','archive-worker.js','constellation.js']],['/2026/09/22/Hello-CC-Atelier/',['reader.js','notebook.js','community-comments.js']],['/hot100/001/',['reader.js','notebook.js','code-studio.js','algorithm-demo.js','community-comments.js']],['/studio/',['studio.js','stage-engine.js']],['/studio/practice/',['practice.js']],['/projects/',[]],['/admin/',['community-moderation.js']]];
function report(directory){
 const initial=graph(directory,['atelier/js/main.js']);
 return {metric:'Built uncompressed file bytes; not measured network transfer, parse time, or a performance score',initial,routes:routes.map(([route,features])=>({route,...graph(directory,['atelier/js/main.js',...features.map(file=>'atelier/js/'+file)])}))};
}
function verifyBuiltFeatures(directory){
 const checks=[['series/hot100/index.html','[data-hot100-filter]'],['series/hot100/index.html','.series-intro .article-body'],['guestbook/index.html','[data-comments]'],['2026/09/22/Hello-CC-Atelier/index.html','[data-comments]'],['hot100/001/index.html','[data-comments]'],['admin/index.html','[data-owner-login]'],['notes/index.html','[data-archive]'],['hot100/001/index.html','.article-body .code-container'],['2026/09/22/Hello-CC-Atelier/index.html','.article-body'],['studio/index.html','[data-studio]'],['studio/practice/index.html','[data-practice]']];
 for(const [file,selector] of checks){const dom=new JSDOM(fs.readFileSync(path.join(directory,file),'utf8'));if(!dom.window.document.querySelector(selector))throw Error('Route graph assumptions changed: '+file);dom.window.close();}
}
if(require.main===module){const directory=path.resolve(process.argv[2]||'public');verifyBuiltFeatures(directory);console.log(JSON.stringify(report(directory),null,2));}
module.exports={staticImports,graph,report};
