'use strict';
const esbuild=require('esbuild');
// Use the compiler's parser, never a line-based import regexp: bundled output
// has multiple imports per line and may use escaped module specifiers.
const cache=new Map();
function analyzeModule(source){
 if(cache.has(source))return cache.get(source);
 // This existing runtime-root expression addresses an upstream theme module,
 // not an atelier module. Normalize ONLY for analysis; never rewrite delivery.
 const analysis=source.replace(/import\(document\.body\.dataset\.root\s*\+\s*(['"])js\/plugins\/tabs\.js\1\)/g,"import('/js/plugins/tabs.js')");
 const result=esbuild.buildSync({stdin:{contents:analysis,sourcefile:'module.js'},bundle:true,write:false,metafile:true,format:'esm',platform:'browser',external:['*'],treeShaking:false,logLevel:'silent',logOverride:{'unsupported-dynamic-import':'error','unsupported-require-call':'error'}});
 const imports=Object.values(result.metafile.inputs).flatMap(input=>input.imports);
 // Relative non-literal imports can become synthetic glob imports rather than
 // unsupported-dynamic-import errors. Reject the compiler's wildcard edges,
 // even when the cwd happens to contain matching files and produces no warning.
 if(imports.some(item=>item.path.includes('*')))throw Error('Unsupported browser module dependency: wildcard');
 if(result.warnings.length)throw Error('Module analysis warning: '+result.warnings.map(item=>item.text).join('; '));
 if(imports.some(item=>!['import-statement','dynamic-import'].includes(item.kind)))throw Error('Unsupported browser module dependency');
 const value={imports,hasImportMeta:/\bimport\.meta\b/.test(result.outputFiles[0].text)};
 // Bound memory during long-lived Hexo watch sessions.
 if(cache.size>512)cache.clear();cache.set(source,value);return value;
}
module.exports={analyzeModule};
