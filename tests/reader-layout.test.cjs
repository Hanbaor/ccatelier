const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ejs=require('ejs');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
function render({chapters=true}={}){
 const content='<h1 id="opening">长篇技术文</h1><h2 id="p-2">B. 世界冰球锦标赛</h2><h3 id="analysis">思路</h3><p>正文内容</p>';
 return ejs.render(fs.readFileSync(path.join(root,'custom/redefine/nijika/post.ejs'),'utf8'),{page:{title:'测试文章',content,author:'CC'},config:{author:'CC'},url_for:v=>'/'+v,partial:()=>'<button data-reader-size-cycle>Aa</button>',after_hours_minutes:()=>5,live_reader_content:()=>content,live_metadata:()=>({}),live_related:()=>[],toc:()=>chapters?'<ol><li><a href="#p-2">世界冰球锦标赛</a><ol><li><a href="#analysis">思路</a></li></ol></li></ol>':''});
}
function setup(html,mobile=false){
 const dom=new JSDOM(html,{url:'https://ccatelier.test/writing/csdn-154834561/'}),{window}=dom;
 Object.assign(globalThis,{window,document:window.document,location:window.location,localStorage:window.localStorage,innerHeight:900,matchMedia:()=>({matches:mobile,addEventListener(){}}),requestAnimationFrame:()=>0});
 return dom;
}
test('article template removes the entire right rail and keeps optional controls closed at the end',()=>{
 for(const chapters of [true,false]){
  const dom=setup(render({chapters}));try{
   const doc=dom.window.document,columns=doc.querySelector('.reader-columns'),options=doc.querySelector('.reader-options');
   assert.equal(doc.querySelector('.reader-workbench'),null);
   assert.equal(columns.children.length,chapters?3:2);
   assert.deepEqual([...columns.children].map(n=>n.className),chapters?['reader-frontmatter','reading-toc chapter-rail','reader-paper']:['reader-frontmatter','reader-paper']);
   assert.equal(options.open,false);
   assert.equal(doc.querySelector('.reader-frontmatter button'),null);
   assert.equal(doc.querySelector('.reader-encore,.reader-related,.chapter-meter,.chapter-library'),null);
   assert.equal(doc.querySelector('.reader-comments').open,false);assert.equal(options.closest('article'),doc.querySelector('.reader-paper'));
   if(chapters)assert.equal(doc.querySelector('.chapter-rail details').open,false,'mobile and no-script baseline is closed');else assert.ok(columns.classList.contains('reader-no-toc'));
   assert.equal(doc.querySelector('.reader-paper').getAttribute('aria-labelledby'),'article-title');
   if(chapters)assert.ok(doc.getElementById(doc.querySelector('.chapter-rail a').hash.slice(1)));
  }finally{dom.window.close();}
 }
});
test('reader restores saved preferences and works without any optional tool controls',async()=>{
 const {initReader}=await import('../source/atelier/js/reader.js');
 for(const omit of [false,true]){
  const dom=setup(render());try{
   const doc=dom.window.document;localStorage.setItem('cc-reader',JSON.stringify({size:21,leading:22,width:'narrow'}));
   if(omit)doc.querySelector('.reader-options').remove();
   assert.doesNotThrow(initReader);
   const studio=doc.querySelector('.reading-studio');assert.equal(studio.style.getPropertyValue('--reader-size'),'21px');assert.equal(studio.style.getPropertyValue('--reader-leading'),'2.2');assert.equal(studio.style.getPropertyValue('--reader-width'),'580px');
   assert.equal(doc.querySelector('.chapter-rail details').open,true);
   doc.querySelector('[data-reader-size-cycle]').click();assert.equal(studio.style.getPropertyValue('--reader-size'),'23px');
  }finally{dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();}
 }
});
test('small-screen table of contents remains user-controlled after initialization',async()=>{
 const {initReader}=await import('../source/atelier/js/reader.js');const dom=setup(render(),true);
 try{initReader();const chapters=document.querySelector('.chapter-rail details');assert.equal(chapters.open,false);chapters.open=true;dom.window.dispatchEvent(new dom.window.Event('resize'));assert.equal(chapters.open,true);assert.equal(document.querySelector('.reader-options').open,false);}finally{dom.window.close();}
});
test('reading styles have two real columns, compact nesting and no sidebar selectors',()=>{
 const reader=fs.readFileSync(path.join(root,'source/atelier/css/reader.css'),'utf8'),refinement=fs.readFileSync(path.join(root,'source/atelier/css/refinement.css'),'utf8');
 assert.match(reader,/grid-template-columns:136px minmax\(0,720px\)/);assert.match(refinement,/grid-template-columns:136px minmax\(0,720px\)/);assert.doesNotMatch(reader+refinement,/reader-workbench/);assert.match(reader,/padding-left:8px!important/);assert.match(reader,/scrollbar-color:var\(--line\) transparent/);
});
test('chapter copy uses decorative SVGs with named buttons and preserves encoded copy and reading text',async t=>{
 const dom=setup(render()),doc=dom.window.document;
 const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 const nodeFilterDescriptor=Object.getOwnPropertyDescriptor(globalThis,'NodeFilter');
 const copied=[];let rejectCopy=false;
 // Only this in-memory clipboard is used; no system clipboard is accessed.
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{async writeText(value){if(rejectCopy)throw new Error('denied');copied.push(value);}}}});
 Object.defineProperty(globalThis,'NodeFilter',{configurable:true,value:dom.window.NodeFilter});
 t.mock.timers.enable({apis:['setTimeout']});
 try{
  const {initReader}=await import('../source/atelier/js/reader.js');
  const {articleText}=await import('../source/atelier/js/text-anchors.js');
  const toast=doc.createElement('div');toast.id='toast';doc.body.append(toast);
  doc.querySelector('.article-body h3').id='题目 描述';
  const article=doc.querySelector('.article-body'),before=articleText(article).text;
  const headings=[...article.querySelectorAll('h2,h3')],titles=headings.map(h=>h.textContent);
  initReader();
  assert.equal(article.querySelectorAll('.chapter-copy').length,2);
  assert.equal(article.querySelector('h1 .chapter-copy'),null);
  const template=fs.readFileSync(path.join(root,'custom/redefine/nijika/editorial-arrow.ejs'),'utf8');
  for(const [index,heading] of headings.entries()){
   const button=heading.querySelector('button.chapter-copy'),svg=button.querySelector('svg');
   assert.equal(button.getAttribute('aria-label'),'复制章节链接：'+titles[index]);
   assert.ok(button.hasAttribute('data-reader-exclude'));
   assert.equal(button.textContent,'','no font-dependent arrow glyph remains');
   assert.equal(svg.namespaceURI,'http://www.w3.org/2000/svg');
   assert.equal(svg.getAttribute('viewBox'),'0 0 24 24');
   assert.equal(svg.getAttribute('aria-hidden'),'true');
   assert.equal(svg.getAttribute('focusable'),'false');
   assert.equal(svg.querySelector('path').getAttribute('d'),template.match(/d="([^"]+)"/)[1]);
   button.click();await Promise.resolve();
   assert.equal(copied.at(-1),'https://ccatelier.test/writing/csdn-154834561/#'+encodeURIComponent(heading.id));
   assert.equal(toast.textContent,'已复制章节链接');
  }
  assert.equal(articleText(article).text,before,'SVG controls do not enter search or speech text');
  headings[1].querySelector('button').click();await Promise.resolve();
  assert.equal(copied.length,3,'repeated clicks keep copying the same chapter');
  rejectCopy=true;headings[0].querySelector('button').click();await Promise.resolve();
  assert.equal(copied.length,3);
  assert.equal(toast.textContent,'复制失败，可从左侧目录打开章节并复制地址');
 }finally{
  if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;
  if(nodeFilterDescriptor)Object.defineProperty(globalThis,'NodeFilter',nodeFilterDescriptor);else delete globalThis.NodeFilter;
  dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();
 }
});
