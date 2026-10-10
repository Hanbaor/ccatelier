const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('archive generator excludes unpublished fixtures even when Hexo exposes drafts',()=>{
 const generators=new Map(),catalog=require('../tools/content-catalog.cjs');
 const context={require:name=>name==='../tools/content-catalog.cjs'?catalog:require(name),hexo:{extend:{generator:{register:(name,fn)=>generators.set(name,fn)},helper:{register(){}}}},console};
 vm.runInNewContext(fs.readFileSync('scripts/live-archive.js','utf8'),context);
 const post=(title,published)=>({title,published,path:title+'/',content:'<p>'+title+' public text</p>',date:new Date('2026-01-01'),tags:{toArray:()=>[]},categories:{toArray:()=>[]}});
 const result=generators.get('live-archive').call({config:{root:'/lab/'},base_dir:path.resolve('.')},{posts:{sort:()=>({toArray:()=>[post('published',true),post('legacy',undefined),post('secret-draft',false)]})},data:{}});
 const index=JSON.parse(result.find(file=>file.path==='atelier/data/archive.json').data);assert.deepEqual(index.posts.map(p=>p.path),['/lab/published/','/lab/legacy/']);assert.ok(index.posts.every(p=>typeof p.text==='string'));assert.ok(!JSON.stringify(index).includes('secret-draft'));
 const publicIndex=JSON.parse(fs.readFileSync('public/atelier/data/archive.json','utf8'));assert.equal(publicIndex.posts.length,109,'existing published corpus remains 109 articles; this test does not rebuild it');
});
