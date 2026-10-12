'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),ejs=require('ejs');
const {JSDOM}=require('jsdom');
const {canonicalUrl,summary,pageMetadata}=require('../tools/site-metadata.cjs');
const openGraph=require('hexo/dist/plugins/helper/open_graph');
const config={url:'https://ccatelier.top',root:'/',title:'CC Atelier',description:'记录代码、研究与生活。',language:'zh-CN',pretty_urls:{trailing_index:true,trailing_html:true}};
function context(kind,page={}){return {config,page,is_category:()=>kind==='category',is_tag:()=>kind==='tag',is_archive:()=>kind==='archive',is_home:()=>kind==='home',is_post:()=>kind==='post',is_page:()=>kind==='page',nijika_list_title:()=>page.category|| (page.tag?'# '+page.tag:kind==='archive'?'归档':'笔记')};}
test('publication URLs normalize index identities and a subdirectory exactly once',()=>{
 for(const route of ['/hot100/001/','hot100/001/index.html'])assert.equal(canonicalUrl(config,route),'https://ccatelier.top/hot100/001/');
 const lab={...config,url:'https://ccatelier.top/lab/',root:'/lab/'};
 for(const route of ['notes/index.html','/lab/notes/'])assert.equal(canonicalUrl(lab,route),'https://ccatelier.top/lab/notes/');
 assert.equal(canonicalUrl(lab),'https://ccatelier.top/lab/');
 assert.equal(canonicalUrl(config,'tags/算法/index.html'),'https://ccatelier.top/tags/%E7%AE%97%E6%B3%95/');
});
test('descriptions use existing prose without code, executable text or template noise',()=>{
 assert.equal(summary('<script>secret()</script><style>body{}</style><p>已有 &amp; 正文。</p><pre><code>int main(){}</code></pre>{% tag %}<p>第二段</p>'),'已有 & 正文。 第二段');
 assert.equal(summary('<p>使用 <code>nums</code> 和 <code>target</code>。</p>'),'使用 nums 和 target。');
 assert.equal(summary('<figure><img src="a.jpg"><figcaption>noise.jpg</figcaption></figure><p><strong>目录</strong></p><p><a href="#part">导航</a></p><p>正文</p>'),'正文');
 assert.equal([...summary('<p>'+ '文'.repeat(180)+'</p>')].length,155);
 const page={path:'p/',title:'文章',content:'<p>这是真实内容。</p>'};
 assert.equal(pageMetadata(context('post',page)).description,'这是真实内容。');
 assert.equal(pageMetadata(context('post',{...page,series:'hot100',content:'<p>元信息</p><table><tr><td>模板</td></tr></table><h2>题目要求</h2><p>给定 <code>nums</code>。</p><h2>示例</h2>'})).description,'给定 nums。');
 assert.equal(pageMetadata(context('post',{...page,description:'明确 & 摘要'})).description,'明确 & 摘要');
 for(const [kind,key,value] of [['category','category','算法'],['tag','tag','链表']])assert.ok(pageMetadata(context(kind,{[key]:value})).description.includes(value));
 assert.match(pageMetadata(context('archive',{year:2025,month:11})).description,/2025 年 11 月/);
 assert.match(pageMetadata(context('home',{current:2})).title,/第 2 页/);
});
test('head emits one description and identical canonical/share URLs, independent of preview host',()=>{
 const ctx=context('post',{title:'正文标题',path:'hot100/001/index.html',content:'<p>已有 &amp; 正文。</p>'});
 Object.assign(ctx,{theme:{nijika:{cover:'/atelier/images/v3/hero.webp'}},url:'https://preview.invalid/hot100/001/index.html',url_for:p=>'/'+p.replace(/^\//,''),export_config:()=>'',nijika_art_srcset:()=>'',nijika_page_metadata:()=>pageMetadata(ctx)});
 ctx.open_graph=options=>openGraph.call(ctx,options);
 const html=ejs.render(fs.readFileSync(path.join(__dirname,'../custom/redefine/nijika/head.ejs'),'utf8'),ctx);
 const doc=new JSDOM(html).window.document;
 assert.equal(doc.querySelectorAll('meta[name="description"]').length,1);
 assert.equal(doc.querySelectorAll('meta[property="og:description"]').length,1);
 assert.equal(doc.querySelector('meta[name="description"]').content,'已有 & 正文。');
 assert.equal(doc.querySelector('meta[property="og:description"]').content,'已有 & 正文。');
 assert.equal(doc.querySelector('link[rel="canonical"]').href,'https://ccatelier.top/hot100/001/');
 assert.equal(doc.querySelector('meta[property="og:url"]').content,doc.querySelector('link[rel="canonical"]').href);
 assert.equal(doc.querySelector('meta[property="og:title"]').content,'正文标题');
});

const theme={nijika:{cover:'/atelier/images/v3/hero.webp',reading_art:'/atelier/images/v2/notes.webp',studio_art:'/atelier/images/v3/hero.webp'}};
const shareCases=[
 ['cover','index.html','page','v3/hero.webp'],
 ['projects','projects/index.html','page','v3/projects.webp'],
 ['about','about/index.html','page','v3/hero.webp'],
 [undefined,'notes/index.html','home','v3/hero.webp'],
 ['research','research/index.html','page','v2/research.webp'],
 ['studio','studio/index.html','page','v3/hero.webp'],
 ['atelier','atelier/index.html','page','v3/hero.webp']
];
function shareContext(nijika,route,kind='page',prefix='/'){
 const ctx=context(kind,{nijika,path:route,title:nijika||'笔记'});
 Object.assign(ctx,{config:{...config,url:'https://ccatelier.top'+prefix,root:prefix},theme,
  url:'https://preview.invalid/'+route,url_for:p=>prefix+p.replace(/^\//,''),export_config:()=>'',nijika_art_srcset:()=>''});
 ctx.nijika_page_metadata=()=>pageMetadata(ctx);
 ctx.open_graph=options=>openGraph.call(ctx,options);
 return ctx;
}
function renderHead(ctx){return new JSDOM(ejs.render(fs.readFileSync(path.join(__dirname,'../custom/redefine/nijika/head.ejs'),'utf8'),ctx)).window.document;}
test('main-page cards select existing crop-conscious artwork with production/root-safe URLs and accurate descriptions',()=>{
 for(const prefix of ['/','/lab/'])for(const [scene,route,kind,image] of shareCases){
  const ctx=shareContext(scene,route,kind,prefix),metadata=pageMetadata(ctx),doc=renderHead(ctx);
  const expected='https://ccatelier.top'+prefix+'atelier/images/'+image;
  assert.equal(metadata.image.url,expected,scene||'notes');
  assert.equal(doc.querySelectorAll('meta[property="og:image"]').length,1);
  assert.equal(doc.querySelectorAll('meta[name="twitter:image"]').length,1);
  assert.equal(doc.querySelector('meta[property="og:image"]').content,expected);
  assert.equal(doc.querySelector('meta[name="twitter:image"]').content,expected);
  assert.equal(doc.querySelector('meta[property="og:image:alt"]').content,metadata.image.alt);
  assert.equal(doc.querySelector('meta[name="twitter:image:alt"]').content,metadata.image.alt);
  assert.equal(doc.querySelector('meta[property="og:image:width"]').content,String(metadata.image.width));
  assert.equal(doc.querySelector('meta[property="og:image:height"]').content,String(metadata.image.height));
  assert.equal(doc.querySelector('link[rel="canonical"]').href,canonicalUrl(ctx.config,route));
  assert.equal(doc.querySelector('meta[property="og:url"]').content,canonicalUrl(ctx.config,route));
  assert.equal(doc.querySelector('meta[name="description"]').content,metadata.description);
  assert.equal(doc.querySelector('meta[property="og:description"]').content,metadata.description);
  assert.notEqual(metadata.description,config.description);
  assert.ok(metadata.description.length<155);
  assert.ok(!doc.head.innerHTML.includes('preview.invalid'));
 }
 assert.match(pageMetadata(shareContext('research','research/')).description,/SQL 教学实验/);
 assert.match(pageMetadata(shareContext('projects','projects/')).description,/课程实践/);
});
test('curated card dimensions match actual existing WebP files and artwork remains used on-page',async()=>{
 const sharp=require('sharp');
 const templates={cover:'cover',projects:'projects',about:'cover',notes:'cover',research:'research',studio:'studio',atelier:'cover'};
 for(const [scene,route,kind,image] of shareCases){
  const metadata=pageMetadata(shareContext(scene,route,kind));
  const actual=await sharp(path.join(__dirname,'../source/atelier/images',image)).metadata();
  assert.equal(metadata.image.width,actual.width);
  assert.equal(metadata.image.height,actual.height);
  assert.equal(actual.format,'webp');
  const source=fs.readFileSync(path.join(__dirname,'../custom/redefine/nijika',templates[scene||'notes']+'.ejs'),'utf8');
  if(scene==='studio')assert.ok(source.includes('theme.nijika.studio_art'));
  else assert.ok(source.includes('atelier/images/'+image));
 }
});
test('explicit descriptions and custom covers remain authoritative without invented image metadata',()=>{
 const ctx=shareContext('projects','projects/','page','/lab/');
 ctx.page.description='明确 & 摘要';
 ctx.theme={nijika:{...theme.nijika,cover:'/custom-cover.jpg?v=2'}};
 assert.equal(pageMetadata(ctx).image.url,'https://ccatelier.top/lab/custom-cover.jpg?v=2');
 assert.equal(pageMetadata(ctx).description,'明确 & 摘要');
 ctx.page.cover='https://images.example.test/own.jpg?a=1&b=2';
 assert.deepEqual(pageMetadata(ctx).image,{url:ctx.page.cover});
 const doc=renderHead(ctx);
 assert.equal(doc.querySelector('meta[property="og:image"]').content,ctx.page.cover);
 assert.equal(doc.querySelector('meta[property="og:image:alt"]'),null);
 assert.equal(doc.querySelector('meta[property="og:image:width"]'),null);
 assert.equal(doc.querySelector('meta[name="twitter:image:alt"]'),null);
 delete ctx.page.cover;
 ctx.theme=theme;
 for(const [scene,key] of [['studio','studio_art'],[undefined,'reading_art']]){
  const custom=shareContext(scene,scene?'studio/':'notes/',scene?'page':'home','/lab/');
  custom.theme={nijika:{...theme.nijika,[key]:'/lab/custom-scene.webp'}};
  assert.deepEqual(pageMetadata(custom).image,{url:'https://ccatelier.top/lab/custom-scene.webp'});
 }
});
test('article, taxonomy, series and paginated index descriptions keep their own semantics',()=>{
 const article=shareContext(undefined,'writing/example/','post');
 article.page.content='<p>原有文章内容。</p>';
 assert.equal(pageMetadata(article).description,'原有文章内容。');
 assert.equal(pageMetadata(article).image.url,'https://ccatelier.top/atelier/images/v3/hero.webp');
 const series=shareContext('notes','series/hot100/');
 series.page.seriesPosts=[];
 assert.equal(pageMetadata(series).description,config.description);
 const taxonomy=shareContext(undefined,'tags/算法/','tag');
 taxonomy.page.tag='算法';
 assert.match(pageMetadata(taxonomy).description,/「算法」/);
 const next=shareContext(undefined,'notes/page/2/','home','/lab/');
 next.page.current=2;
 assert.match(pageMetadata(next).description,/第 2 页。$/);
 assert.equal(pageMetadata(next).image.url,'https://ccatelier.top/lab/atelier/images/v3/hero.webp');
});

test('malformed cover values safely fall back without crashing or borrowing unrelated artwork metadata',()=>{
 const invalid=[undefined,null,false,true,42,{},[],['/own.jpg'],'','   ','https://','https://[broken','http:broken','https:///','//','data:image/png;base64,abc','javascript:alert(1)','ftp://images.test/own.jpg','https://user:secret@images.test/own.jpg','/bad\nimage.webp','#fragment','?version=2'];
 for(const value of invalid){
  const ctx=shareContext('projects','projects/','page','/lab/');
  ctx.page.cover=value;
  ctx.theme={nijika:{...theme.nijika,cover:'https://images.example.test/custom.jpg'}};
  assert.deepEqual(pageMetadata(ctx).image,{url:'https://images.example.test/custom.jpg'},String(value));
  const doc=renderHead(ctx);
  assert.equal(doc.querySelector('meta[property="og:image"]').content,'https://images.example.test/custom.jpg');
  assert.equal(doc.querySelector('meta[property="og:image:width"]'),null);
  assert.equal(doc.querySelector('meta[property="og:image:alt"]'),null);
  ctx.theme={nijika:{cover:value}};
  assert.equal(pageMetadata(ctx).image.url,'https://ccatelier.top/lab/atelier/images/v3/projects.webp');
  const article=shareContext(undefined,'writing/example/','post','/lab/');
  article.page.cover=value;
  article.theme=ctx.theme;
  assert.equal(pageMetadata(article).image.url,'https://ccatelier.top/lab/atelier/images/v3/hero.webp');
  for(const [scene,key] of [['studio','studio_art'],[undefined,'reading_art']]){
   const local=shareContext(scene,scene?'studio/':'notes/',scene?'page':'home');
   local.theme={nijika:{...theme.nijika,[key]:value}};
   assert.equal(pageMetadata(local).image.url,'https://ccatelier.top/atelier/images/v3/hero.webp');
  }
 }
 const trimmed=shareContext('projects','projects/');
 trimmed.page.cover='  //images.example.test/custom.jpg  ';
 assert.deepEqual(pageMetadata(trimmed).image,{url:'https://images.example.test/custom.jpg'});
 assert.equal(pageMetadata(shareContext('studio','studio/')).description,'在浏览器里编排鼓点与试听节奏，导出 MIDI 或 WAV，探索互动鼓组和现场灯光。');
});

test('portrait and top-aligned default illustrations keep the wide sharing fallback, while explicit art still wins',()=>{
 for(const prefix of ['/','/lab/']){
  for(const [scene,kind] of [['about','page'],['atelier','page'],[undefined,'home']]){
   const ctx=shareContext(scene,scene?scene+'/':'notes/',kind,prefix);
   const image=pageMetadata(ctx).image;
   assert.equal(image.url,'https://ccatelier.top'+prefix+'atelier/images/v3/hero.webp');
   assert.equal(image.width,1916);
   assert.equal(image.height,821);
   assert.match(image.alt,/舞台追光/);
   ctx.page.cover='/atelier/images/v3/about.webp';
   assert.equal(pageMetadata(ctx).image.url,'https://ccatelier.top'+prefix+'atelier/images/v3/about.webp');
  }
  const notes=shareContext(undefined,'notes/','home',prefix);
  notes.theme={nijika:{...theme.nijika,reading_art:'https://ccatelier.top'+prefix+'atelier/images/v2/notes.webp'}};
  assert.equal(pageMetadata(notes).image.url,'https://ccatelier.top'+prefix+'atelier/images/v3/hero.webp');
  notes.theme.nijika.reading_art='/my-reading-cover.jpg';
  assert.deepEqual(pageMetadata(notes).image,{url:'https://ccatelier.top'+prefix+'my-reading-cover.jpg'});
 }
});
