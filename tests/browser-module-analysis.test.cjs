'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const analyzer=require.resolve('../tools/browser-module-analysis.cjs');

function auditInCleanDirectory(t,files,checks){
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'atelier-module-audit-'));
 t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
 for(const [name,contents]of Object.entries(files)){
  const file=path.join(cwd,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,contents);
 }
 // Start esbuild in this cwd: changing cwd after requiring it can leave its
 // compiler service scanning the original repository (and node_modules).
 const result=spawnSync(process.execPath,['-e',`
  const assert=require('node:assert/strict');
  const {analyzeModule}=require(${JSON.stringify(analyzer)});
  ${checks}
 `],{cwd,encoding:'utf8',timeout:30000,maxBuffer:64*1024});
 assert.ifError(result.error);
 assert.equal(result.status,0,result.stderr||result.stdout);
}

for(const [label,files]of Object.entries({
 'without matching files':{'nested/.keep':''},
 'with matching nested files':{'one.js':'export const one=1;','nested/two.js':'export const two=2;'}
}))test('compiler audit rejects relative dynamic globs '+label,t=>{
 const sources=[
  'export const load=name=>import(`./${name}.js`);',
  'export const load=name=>import("./"+name+".js");',
  'export const load=name=>import(`./nested/${name}.js`);'
 ];
 auditInCleanDirectory(t,files,`
  for(const source of ${JSON.stringify(sources)})
   assert.throws(()=>analyzeModule(source),/Unsupported browser module dependency: wildcard/);
 `);
});

test('clean-directory audit preserves literal imports, re-exports and escaped specifiers',t=>{
 const source=String.raw`import "./a.js";export {b} from "./b.js";export * from "./all.js";import "./\u0063.js";export const load=()=>import("./lazy.js");`;
 auditInCleanDirectory(t,{},`
  assert.deepEqual(analyzeModule(${JSON.stringify(source)}).imports.map(({path,kind})=>({path,kind})),[
   {path:'./a.js',kind:'import-statement'},
   {path:'./b.js',kind:'import-statement'},
   {path:'./all.js',kind:'import-statement'},
   {path:'./c.js',kind:'import-statement'},
   {path:'./lazy.js',kind:'dynamic-import'}
  ]);
  assert.throws(()=>analyzeModule('export const load=()=>import(window.moduleURL)'),/not be bundled|not a string literal/);
 `);
});
