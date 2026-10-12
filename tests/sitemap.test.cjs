'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createRequire}=require('node:module');
const {JSDOM}=require('jsdom');
const Hexo=require('hexo');
// Use Hexo's real output resolver without loading the site or generating files.
const hexo=new Hexo(path.join(__dirname,'..'),{silent:true});
for(const [source,output] of Object.entries({md:'html',ejs:'html',styl:'css',css:'css',js:'js',json:'json'})){
 hexo.extend.renderer.register(source,output,data=>data.text,true);
}
async function generate({posts=[],pages=[],routes={},config={}}={}){
 let generate;const file=path.join(__dirname,'../scripts/sitemap.js');
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:createRequire(file),hexo:{extend:{generator:{register(name,fn){generate=fn;}}}}});
 return generate.call({render:hexo.render,config:{url:'https://ccatelier.top',root:'/',...config},extend:{generator:{get:name=>routes[name]?()=>routes[name]:null}}},{posts,pages});
}
const parse=result=>new JSDOM(result.data,{contentType:'text/xml'}).window.document;
test('sitemap lists actual public routes once, omitting empty taxonomy, admin, 404 and pagination',async()=>{
 const result=await generate({posts:[{path:'hot100/001/',date:'2020-01-01',updated:'2021-01-01',raw:'---\ndate: 2020-01-01\nupdated: 2021-01-01\n---\n正文'},{path:'draft/',published:false}],pages:[{source:'about/index.md',path:'about/index.html'},{source:'admin/index.md',path:'admin/index.html'},{source:'404.html',path:'404.html'}],routes:{'nijika-cover':{path:'index.html'},index:[{path:'notes/index.html',data:{current:1,posts:{length:9}}},{path:'notes/page/2/index.html',data:{current:2,posts:{length:3}}}],category:[{path:'categories/算法/index.html',data:{current:1,posts:{length:2}}},{path:'categories/empty/index.html',data:{posts:{length:0}}}],archive:[{path:'archives/2020/index.html',data:{posts:{length:1}}}],'nijika-after-hours':[{path:'guestbook/index.html'},{path:'admin/index.html'}]}});
 const doc=parse(result),urls=[...doc.querySelectorAll('loc')].map(x=>x.textContent);
 assert.equal(result.path,'sitemap.xml');assert.equal(urls.length,7);assert.equal(new Set(urls).size,urls.length);assert.deepEqual(urls,[...urls].sort());
 assert.ok(urls.includes('https://ccatelier.top/hot100/001/'));assert.ok(urls.includes('https://ccatelier.top/categories/%E7%AE%97%E6%B3%95/'));
 assert.doesNotMatch(result.data,/draft|empty|admin|404|page\/2|index\.html/);assert.equal(doc.querySelectorAll('lastmod').length,1);assert.equal(doc.querySelector('lastmod').textContent,'2021-01-01T00:00:00.000Z');
});
test('sitemap XML escapes URLs, preserves /lab/, deduplicates index URLs and never invents lastmod',async()=>{
 const input={config:{url:'https://ccatelier.top/lab/',root:'/lab/'},posts:[{path:'a&b/',date:'invalid',updated:null},{path:'/lab/existing/',date:'2020-01-01',raw:'---\ndate: 2020-01-01\n---\n正文'}],pages:[{source:'existing/index.md',path:'existing/index.html'},{source:'about/index.md',path:'about/index.html'}]};
 const result=await generate(input),doc=parse(result);assert.equal(doc.querySelectorAll('loc').length,3);assert.match(result.data,/a&amp;b/);assert.ok([...doc.querySelectorAll('loc')].every(x=>x.textContent.startsWith('https://ccatelier.top/lab/')));assert.equal(doc.querySelectorAll('lastmod').length,1);assert.equal(result.data,(await generate(input)).data);
});
test('sitemap includes every current source post from its frontmatter',async()=>{
 // Source frontmatter is authoritative; this test needs no build/public output.
 const yaml=require('js-yaml');
 const files=fs.readdirSync(path.join(__dirname,'../source/_posts'),{recursive:true}).filter(x=>x.endsWith('.md'));
 const posts=files.map(file=>{
  const source=fs.readFileSync(path.join(__dirname,'../source/_posts',file),'utf8');
  const front=yaml.load(source.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1]);
  return {...front,raw:source,path:front.permalink||new Date(front.date).toISOString().slice(0,10).replaceAll('-','/')+'/'+path.basename(file,'.md')+'/'};
 });
 const doc=parse(await generate({posts}));assert.equal(doc.querySelectorAll('loc').length,posts.length);assert.equal(posts.length,109);
});

test('sitemap lastmod is stable across checkout mtimes and changes only with explicit content dates',async()=>{
 const raw='---\ndate: 2020-01-01 12:00:00\n---\n正文';
 const post={path:'article/',raw,date:'2020-01-01T04:00:00Z',updated:'2025-01-01'};
 const before=await generate({posts:[post]});
 assert.equal(before.data,(await generate({posts:[{...post,updated:'2026-01-01'}]})).data);
 assert.equal(parse(before).querySelector('lastmod').textContent,'2020-01-01T04:00:00.000Z');
 const changed=await generate({posts:[{...post,raw:raw.replace('date:','updated: 2024-02-01 12:00:00\ndate:'),updated:'2024-02-01T04:00:00Z'}]});
 assert.equal(parse(changed).querySelector('lastmod').textContent,'2024-02-01T04:00:00.000Z');
 assert.equal(parse(await generate({posts:[{path:'unknown/',date:'2020-01-01',updated:'2026-01-01'}]})).querySelectorAll('lastmod').length,0);
});

for(const root of ['/', '/lab/'])test(`sitemap selects HTML page outputs and preserves genuine dotted routes under ${root}`,async()=>{
 const pages=[
  {source:'about/index.md',path:'about/index.html'},
  {source:'standalone.html',path:'standalone.html',layout:false},
  {source:'legacy.htm',path:'legacy.htm',layout:'false'},
  {source:'plain.HTML',path:'plain.HTML',layout:'off'},
  {source:'manual.ejs',path:'manual/index.html',layout:'false'},
  {source:'release.md',path:'release.v2/',layout:'page'},
  {source:'dotted.md',path:'dotted.slug',layout:'page'},
  {source:'atelier/css/main.css',path:'atelier/css/main.css',layout:'false'},
  {source:'atelier/css/theme.styl',path:'atelier/css/theme.css',layout:'false'},
  {source:'atelier/js/main.js',path:'atelier/js/main.js',layout:'false'},
  {source:'atelier/vendor/provenance.json',path:'atelier/vendor/provenance.json',layout:'false'},
  // A pretty route or an HTML-looking permalink does not change the output type.
  {source:'data.json',path:'pretty-data/',layout:'page'},
  {source:'script.js',path:'looks-like-page.html',layout:'page'},
  {source:'draft.md',path:'draft/index.html',published:false},
  {source:'hidden.md',path:'hidden/index.html',nijika:'admin'},
  {source:'admin/index.md',path:'admin/index.html'},
  {source:'404.html',path:'404.html'}
 ];
 const result=await generate({config:{url:'https://ccatelier.top'+root,root},pages,
  posts:[{path:'post.v2/'}],routes:{index:{path:'index.html',data:{current:1,posts:{length:1}}},
   category:{path:'categories/node.js/index.html',data:{current:1,posts:{length:1}}},
   tag:{path:'tags/v1.0/index.html',data:{current:1,posts:{length:1}}},
   archive:{path:'archives/2026/index.html',data:{current:1,posts:{length:1}}}}});
 const urls=[...parse(result).querySelectorAll('loc')].map(x=>x.textContent);
 const expected=['','about/','standalone.html','legacy.htm','plain.HTML','manual/','release.v2/',
  'dotted.slug','post.v2/','categories/node.js/','tags/v1.0/','archives/2026/']
  .map(route=>'https://ccatelier.top'+root+route).sort();
 assert.deepEqual(urls,expected);
 assert.doesNotMatch(result.data,/atelier\/|pretty-data|looks-like-page|draft|hidden|admin|404/);
});
