const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {connectionCatalog,sourceBlocks,evidenceFor}=require('../tools/connection-catalog.cjs');
const entry=(path,html,topics=['set','lower_bound'])=>({path,html,topics});

test('evidence preserves decoded source substrings, Unicode and code/prose provenance, excludes templates and identifier substrings',()=>{
 const html='<h2 id="real &amp; exact">边界</h2><p>dataset reset subset</p><table><tr><td>set</td></tr></table><script>set</script><p>LeetCode #1 · set</p><p>返回目录</p><pre><code>'+('🎵'.repeat(70))+'st.lower_bound(x); &lt;img onerror=x&gt;'+('尾'.repeat(180))+'</code></pre><p>set 的正文 &amp; 保留。</p>';
 const blocks=sourceBlocks(html),code=evidenceFor(blocks,'lower_bound'),prose=evidenceFor(blocks,'set');
 assert.equal(code.kind,'code');assert.equal(code.anchor,'real & exact');assert.ok(Array.from(code.excerpt).length<=160);assert.ok(blocks.find(b=>b.kind==='code').text.includes(code.excerpt));assert.equal(code.before,true);assert.equal(code.after,true);assert.ok(!code.excerpt.includes('\ufffd'));
 assert.equal(prose.excerpt,'set 的正文 & 保留。');assert.equal(prose.kind,'prose');assert.equal(evidenceFor(sourceBlocks('<p>dataset reset subset set_count</p>'),'set'),null);
 assert.equal(evidenceFor(sourceBlocks('<p>算法</p>'),'不存在'),null);
 const catalog=connectionCatalog([entry('/a/','<p>算法 LeetCode 算法学习</p>',['算法','LeetCode','算法学习'])]);assert.equal(catalog.posts[0].evidence.length,0);
});

test('real train/set connection has source-exact witnesses and every emitted fragment exists',async()=>{
 const posts=require('../public/atelier/data/archive.json').posts,documents=new Map();
 const entries=posts.filter(p=>p.group==='writing').map(p=>{
  const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'../public',p.path,'index.html'),'utf8'));documents.set(p.path,dom.window.document);
  return entry(p.path,dom.window.document.querySelector('.article-body').innerHTML,p.topics);
 });
 const index=connectionCatalog(entries),{connectedArticles,validateConnections}=await import('../source/atelier/js/reading-trail-core.mjs');
 const valid=validateConnections(index),matches=connectedArticles(valid,posts.filter(p=>p.group==='writing'),'/writing/csdn-124514677/');
 const set=matches.find(m=>m.post.path==='/writing/csdn-124460411/');assert.ok(set);assert.ok(set.shared.some(e=>e.concept==='lower_bound'));
 for(const post of index.posts)for(const e of post.evidence){
  const doc=documents.get(post.path);if(e.anchor)assert.ok(doc.getElementById(e.anchor),e.anchor);
  assert.ok(sourceBlocks(doc.querySelector('.article-body').innerHTML).some(b=>b.kind===e.kind&&b.text.includes(e.excerpt)));
 }
 assert.deepEqual(connectedArticles(valid.slice().reverse(),posts.slice().reverse(),'/writing/csdn-124514677/'),connectedArticles(valid,posts,'/writing/csdn-124514677/'));
 assert.equal(connectedArticles(valid,posts.filter(p=>p.path==='/writing/csdn-124514677/'),'/writing/csdn-124514677/').length,0);
 assert.equal(connectedArticles(valid,posts,'/2026/09/22/Hello-CC-Atelier/').length,0);
 for(const doc of documents.values())doc.defaultView.close();
});

test('ranking is bounded, deterministic, excludes out-of-scope and unsafe paths, rejects malformed data',async()=>{
 const {connectedArticles,validateConnections}=await import('../source/atelier/js/reading-trail-core.mjs');
 const entries=['a','b','c','d','e'].map(p=>entry('/lab/'+p+'/','<p>set lower_bound</p>'));
 const index=validateConnections(connectionCatalog(entries),'/lab/'),posts=entries.map(p=>({path:p.path}));
 assert.deepEqual(connectedArticles(index,posts,'/lab/a/').map(p=>p.post.path),['/lab/b/','/lab/c/','/lab/d/']);
 assert.equal(connectedArticles(index,[posts[0]],'/lab/a/').length,0);
 const data=connectionCatalog([entry('//evil/a/','<p>set</p>'),entry('/outside/','<p>set</p>'),entry('/lab/%2e%2e/a/','<p>set</p>'),entries[0]]);
 assert.deepEqual(validateConnections(data,'/lab/').map(p=>p.path),['/lab/a/']);
 assert.throws(()=>validateConnections({version:2,posts:[]}));assert.throws(()=>validateConnections({version:1,posts:[{path:'/a/',evidence:{}}]}));
});

test('generator emits only published evidence and keeps subdirectory paths without changing archive payload',()=>{
 const vm=require('node:vm'),{createRequire}=require('node:module'),generators=new Map();
 const script=path.resolve(__dirname,'../scripts/live-archive.js');
 vm.runInNewContext(fs.readFileSync(script,'utf8'),{require:createRequire(script),hexo:{extend:{generator:{register:(name,fn)=>generators.set(name,fn)},helper:{register(){}}}}});
 const post=(name,published)=>({title:name,published,path:name+'/',content:'<h2 id="code">Code</h2><p>lower_bound</p>',date:new Date('2026-01-01'),tags:{toArray:()=>[]},categories:{toArray:()=>[]}});
 const routes=generators.get('live-archive').call({config:{root:'/lab/'},base_dir:path.resolve(__dirname,'..')},{posts:{sort:()=>({toArray:()=>[post('public',true),post('secret',false)]})},data:{}});
 const evidence=JSON.parse(routes.find(r=>r.path==='atelier/data/connections.json').data),archive=JSON.parse(routes.find(r=>r.path==='atelier/data/archive.json').data);
 assert.deepEqual(evidence.posts.map(p=>p.path),['/lab/public/']);assert.ok(!JSON.stringify(evidence).includes('secret'));assert.equal(evidence.posts[0].evidence[0].anchor,'code');assert.equal(archive.posts[0].evidence,undefined);
});
