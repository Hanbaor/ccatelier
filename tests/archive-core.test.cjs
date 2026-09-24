const test=require('node:test');
const assert=require('node:assert/strict');
const core=()=>import('../source/atelier/js/archive-core.mjs');
const posts=[
 {path:'/lab/a/',title:'二叉树 traversal',text:'递归 与 Stack',tags:['树'],group:'hot100',minutes:8,date:'2026-09-20'},
 {path:'/lab/b/',title:'Stack 手记',text:'二叉树与遍历',tags:['树','笔记'],group:'writing',minutes:3,date:'2026-09-22'},
 {path:'/lab/c/',title:'夜间随笔',text:'今晚的鼓声',tags:['生活'],group:'writing',minutes:2,date:'2026-09-21'}
];
test('fulltext search ranks title matches, combines filters and keeps stable sorts',async()=>{
 const {queryArchive}=await core();
 assert.deepEqual(queryArchive(posts,{q:'Ｓｔａｃｋ'}).map(p=>p.path),['/lab/b/','/lab/a/']);
 assert.deepEqual(queryArchive(posts,{q:'二叉树',group:'writing',tag:'树',duration:'short'}).map(p=>p.path),['/lab/b/']);
 assert.equal(queryArchive(posts,{q:'不存在'}).length,0);
 assert.deepEqual(queryArchive(posts,{sort:'oldest'}).map(p=>p.path),['/lab/a/','/lab/c/','/lab/b/']);
});
test('shareable query ignores invalid enums, preserves Unicode and clamps search length',async()=>{
 const {readQuery,writeQuery}=await core();
 const q=readQuery('?q=二叉树&group=writing&tag=树&duration=short&sort=minutes&view=graph');
 assert.deepEqual(readQuery(writeQuery(q)),q);
 const bad=readQuery('?view=<script>&sort=__proto__&group=admin');
 assert.equal(bad.view,'grid');assert.equal(bad.group,'all');assert.equal(bad.sort,'newest');
 assert.equal(readQuery('?q='+ 'x'.repeat(501)).q.length,200);
});
test('constellation has actual tag membership and related posts exclude unrelated results',async()=>{
 const {buildGraph,relatedPosts}=await core();const g=buildGraph(posts);
 assert.equal(g.nodes.length,6);assert.equal(g.edges.length,4);
 assert.ok(g.edges.some(e=>e.source==='/lab/b/'&&e.target==='tag:笔记'));
 assert.deepEqual(relatedPosts(posts,posts[0]).map(p=>p.path),['/lab/b/']);
});
test('published rich index resolves every article and preserves full source text for search',()=>{
 const fs=require('node:fs'),path=require('node:path');const output=path.resolve(__dirname,'../public');
 const index=JSON.parse(fs.readFileSync(path.join(output,'atelier/data/archive.json'),'utf8'));
 assert.equal(index.posts.length,JSON.parse(fs.readFileSync(path.join(output,'search.json'),'utf8')).length);
 for(const post of index.posts){assert.ok(fs.existsSync(path.join(output,decodeURI(post.path),'index.html')));assert.ok(post.text.length>=post.excerpt.length);assert.ok(post.minutes>=1);}
 const hello=fs.readFileSync(path.join(output,'2026/09/22/Hello-CC-Atelier/index.html'),'utf8');
 const body=hello.match(/<div class="article-body markdown-body">([\s\S]*?)<\/div>/)[1];assert.doesNotMatch(body,/<h1\b[^>]*>Hello CC Atelier<\/h1>/);
});
