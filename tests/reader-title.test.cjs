const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ejs=require('ejs');
const {JSDOM}=require('jsdom'),{articleContent,plain}=require('../tools/content-catalog.cjs');
const toc=require('hexo/dist/plugins/helper/toc');
const root=path.resolve(__dirname,'..');
const reading=page=>articleContent(page,{reading:true});
const documentFor=html=>new JSDOM(html).window.document;

test('reading-only matching title becomes an anchor while historical catalog output stays unchanged',()=>{
 const content='<h1 id="old-heading">Same title</h1><p>Opening paragraph.</p><h1 id="later">Same title</h1>';
 const page={title:'Same title',content,_content:'# Same title\n\nOpening paragraph.'};
 const result=reading(page),doc=documentFor(result);
 assert.equal(doc.getElementById('old-heading').tagName,'SPAN');assert.equal(doc.getElementById('later').tagName,'H1');
 assert.equal(doc.querySelector('p').textContent,'Opening paragraph.');assert.equal(doc.querySelectorAll('h1').length,1);
 assert.equal(articleContent(page),'<p>Opening paragraph.</p><h1 id="later">Same title</h1>','catalog retains its prior exact-match behavior');
 assert.equal(page.content,content);assert.equal(page._content,'# Same title\n\nOpening paragraph.');
});

test('strict normalization handles spaced Markdown em-dash and whitespace but keeps different meanings',()=>{
 assert.match(reading({title:'分治  ---  （1）',content:'<h1 id="old">分治 — （1）</h1>'}),/reader-title-anchor/);
 assert.match(reading({title:'A\t B',content:'<h1 id="old"> A&nbsp;  B </h1>'}),/reader-title-anchor/);
 for(const [title,heading] of [['A B','AB'],['Case','case'],['A-B','A—B'],['x---y','x—y'],['A ---- B','A — B'],['A -- B','A — B'],['算法（1）','算法(1)'],['Version 1','Version 2']]){
  const content='<h1 id="old">'+heading+'</h1>';assert.equal(reading({title,content}),content,title+' must not match '+heading);
 }
 const legacy={title:'分治 --- （1）',content:'<h1 id="old">分治 — （1）</h1>'};assert.equal(articleContent(legacy),legacy.content,'catalog does not adopt reading normalization');
});

test('only a first standard h1 is eligible; meaningful links, media and named descendants survive',()=>{
 for(const content of ['<p>Introduction</p><h1 id="old">Title</h1>','<img src="cover.png"><h1 id="old">Title</h1>','<!-- preserve -->\n<h1 id="old">Title</h1>','<h2 id="old">Title</h2>','<div><h1 id="old">Title</h1></div>','<h1 id="old">Title<img src="a.png"></h1>','<h1 id="old"><a href="https://example.com">Title</a></h1>','<h1 id="old"><span id="child">Title</span></h1>','<h1 id="old"><button>Title</button></h1>','<h1 id="old">Different</h1><h1 id="later">Title</h1>','<p>No heading here.</p>'])assert.equal(reading({title:'Title',content}),content);
 assert.equal(reading({title:'Title',content:''}),'');
});

test('inline text formatting and Hexo permalinks are allowed, and IDs are safely preserved',()=>{
 const content='<h1 data-note="x > y" id="中文&amp;&#34;anchor"><a href="#old" class="headerlink" title="A &amp; B"></a><em>A</em> &amp; <strong>B</strong></h1><p>Body</p>';
 const result=reading({title:'A & B',content}),doc=documentFor(result);
 assert.equal(doc.getElementById('中文&"anchor').tagName,'SPAN');assert.equal(doc.querySelectorAll('[id]').length,1);assert.equal(doc.querySelector('p').textContent,'Body');assert.doesNotMatch(result,/<h1|<em|<strong/);
 const noId=documentFor(reading({title:'Title',content:'<h1>Title</h1><p>Body</p>'}));assert.ok(noId.querySelector('.reader-title-anchor'));assert.equal(noId.querySelector('.reader-title-anchor').hasAttribute('id'),false);
});

test('the screenshot article retains old root and section hashes without a duplicate TOC root',()=>{
 const original=documentFor(fs.readFileSync(path.join(root,'public/writing/csdn-154834561/index.html'),'utf8'));
 const title=original.querySelector('#article-title').textContent,body=original.querySelector('.article-body').innerHTML;
 // Use the original imported title shape, independent of a future regenerated page.
 const rootId='✨算法题目推荐-—-分治（1）';
 const rest=body.replace(/^\s*(?:<h1\b[\s\S]*?<\/h1>|<span class="reader-title-anchor"[\s\S]*?<\/span>)/i,'');
 const content='<h1 id="'+rootId+'"><a href="#'+rootId+'" class="headerlink" title="✨算法题目推荐 — 分治（1）"></a>✨算法题目推荐 — 分治（1）</h1>'+rest;
 const page={title,content},out=reading(page),doc=documentFor(out),outline=toc(out,{list_number:false,max_depth:3});
 assert.equal(doc.getElementById(rootId).tagName,'SPAN');assert.equal(doc.getElementById('p-2').tagName,'H2');assert.doesNotMatch(outline,/✨算法题目推荐/);assert.match(outline,/#p-2/);
 assert.equal(plain(out),plain(content).replace(/^✨算法题目推荐 — 分治（1）\s*/,''));
 assert.equal(articleContent(page),content,'legacy catalog text remains exactly as before');
});

test('post template uses one reading result for article and TOC without changing identity or license',()=>{
 const page={title:'Title',content:'<h1 id="old">Title</h1><h2 id="section">Section</h2><p>Body</p>',source_url:'https://blog.csdn.net/example/article/details/1'};
 let calls=0,tocInput;
 const html=ejs.render(fs.readFileSync(path.join(root,'custom/redefine/nijika/post.ejs'),'utf8'),{page,config:{author:'CC'},url_for:v=>'/'+v,partial:()=>'',after_hours_minutes:()=>1,live_reader_content:p=>{calls++;return reading(p);},live_metadata:()=>({}),live_related:()=>[],toc:(content,options)=>{tocInput=content;return toc(content,options);}});
 const doc=documentFor(html);assert.equal(calls,1);assert.equal(doc.querySelector('.article-body').innerHTML,tocInput);assert.equal(doc.querySelector('#article-title').textContent,'Title');assert.equal(doc.querySelector('.reader-paper').getAttribute('aria-labelledby'),'article-title');
 assert.equal(doc.querySelector('.chapter-rail a').getAttribute('href'),'#section');assert.equal(doc.getElementById('old').tagName,'SPAN');assert.match(doc.querySelector('.article-footer').textContent,/CC BY-SA 4.0/);assert.equal(doc.querySelector('.article-source a').href,page.source_url);
});

test('legacy anchor is a zero-height scroll target and following headings do not regain title spacing',()=>{
 const css=fs.readFileSync(path.join(root,'source/atelier/css/refinement.css'),'utf8');
 assert.match(css,/\.reader-title-anchor \{display:block;height:0;margin:0;padding:0;scroll-margin-top:110px\}/);assert.match(css,/\.reading-studio \.article-body\.markdown-body>\.reader-title-anchor\+:is\(h1,h2,h3,h4,h5,h6\) \{margin-top:0\}/);
 const reset=css.match(/([^{}]+)\{margin-top:0\}/g).find(rule=>rule.includes('reader-title-anchor'));
 const readerCss=fs.readFileSync(path.join(root,'source/atelier/css/reader.css'),'utf8');
 const specificity=selector=>[0,(selector.match(/\.[a-z][\w-]*/gi)||[]).length,1]; // Both selectors have one type: h2/h3 or :is(h1,...,h6).
 for(const heading of ['h2','h3']){
  const selector='.reading-studio .article-body.markdown-body '+heading;
  assert.ok(readerCss.includes(selector+'{'));
  assert.deepEqual(specificity(selector),[0,3,1]);
  assert.deepEqual(specificity(reset.split('{')[0]),[0,4,1]);
  assert.ok(specificity(reset)[1]>specificity(selector)[1],'anchor reset must outrank the established '+heading+' margin');
 }
 assert.doesNotMatch(reset,/!important/);
});
