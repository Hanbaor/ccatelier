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
