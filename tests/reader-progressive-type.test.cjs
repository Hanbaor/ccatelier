'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ejs=require('ejs');
const {JSDOM}=require('jsdom');
const {articleContent}=require('../tools/content-catalog.cjs');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const reading=content=>articleContent({content},{reading:true});
const figure='<figure class="highlight cpp"><table><tr><td class="gutter"><pre>1\n2</pre></td><td class="code"><pre><span class="line">vector&lt;int&gt; a; // &amp; &#123;</span>\n<span class="line">'+ 'long_identifier_'.repeat(8)+'</span></pre></td></tr></table></figure>';

test('build-time code focus adds only one outer target, preserving code bytes and copy controls',()=>{
 const input='<h2 id="code">代码</h2><div class="code-container" data-rel="Cpp">'+figure+'<button class="copy-code">复制</button></div>';
 const out=reading(input),dom=new JSDOM(out);
 try{
  assert.equal(out.replace(' tabindex="0"',''),input);
  const target=dom.window.document.querySelector('figure');
  assert.equal(target.tabIndex,0);target.focus();assert.equal(dom.window.document.activeElement,target);
  assert.equal(dom.window.document.querySelectorAll('[tabindex]').length,1);
  assert.equal(reading(out),out);
  assert.equal(articleContent({content:input}),input,'search/catalog markup remains unchanged');
 }finally{dom.window.close();}
});

test('code focus preserves explicit focus or opt-out and skips non-code figures',()=>{
 for(const input of [figure.replace('<figure','<figure tabindex="-1"'),figure.replace('<figure','<figure tabindex="0"'),figure.replace('<table>','<table tabindex="0">'),'<div tabindex="0">'+figure+'</div>','<figure class="highlight"><table><tr><td>data</td></tr></table></figure>','<figure class="image-caption"><img src="x"></figure>'])assert.equal(reading(input),input);
 const nested='<figure class="highlight">'+figure+'</figure>';
 assert.equal((reading(nested).match(/tabindex="0"/g)||[]).length,1);
});

test('bare C++ figure still receives its existing demo after focus enhancement',()=>{
 const html=ejs.render(read('custom/redefine/nijika/post.ejs'),{
  page:{source_id:'124338541',title:'全排列',content:figure},config:{author:'CC'},
  live_metadata:()=>({}),live_reader_content:()=>reading(figure),nijika_permutation_demo:()=>true,
  partial:name=>name==='nijika/permutation-demo'?'<details id="demo"><summary>演示</summary></details>':'',toc:()=>'',url_for:v=>'/'+v
 });
 const dom=new JSDOM(html);try{assert.ok(dom.window.document.querySelector('figure[tabindex="0"]'));assert.ok(dom.window.document.getElementById('demo'));}finally{dom.window.close();}
});

test('technical text scales with reader size at the same compact baseline and retains local overflow',()=>{
 const css=read('source/atelier/css/refinement.css'),reader=read('source/atelier/css/reader.css'),content=read('source/atelier/css/content.css');
 assert.match(css,/\.reading-studio \.code-container pre,\.reading-studio \.article-body\.markdown-body figure\.highlight \{font-size:calc\(var\(--reader-size\) \/ 18 \* 13\);line-height:1\.85\}/);
 assert.match(css,/table:not\(\.highlight table\) \{font-size:calc\(var\(--reader-size\) \/ 18 \* 13\)\}/);
 assert.equal(18/18*13,13);assert.ok(23/18*13>16);assert.ok(14/18*13<13);
 assert.match(content,/figure\.highlight\{[^}]*overflow-x:auto/);
 assert.match(content,/figure\.highlight table\{[^}]*font:inherit/);
 assert.match(content,/figure\.highlight pre\{[^}]*font:inherit/);
 assert.match(reader,/figure\.highlight:focus-visible\{outline:2px solid var\(--yellow\);outline-offset:-2px\}/);
 assert.match(reader,/>table:not\(\.not-markdown\)\{display:block;table-layout:auto;max-width:100%;overflow-x:auto\}/);
 // Static width budgets, not a browser layout claim: long lines exceed a phone
 // and can exceed desktop measure; the overflow rules must remain local.
 for(const width of [280,350,720])assert.ok(120*13*.6>width);
});

test('root and subpath articles retain native content while noscript hides reader-only tools',()=>{
 for(const prefix of ['/','/lab/']){
  const html=ejs.render(read('custom/redefine/layout.ejs'),{
   page:{},theme:{nijika:{cursor:false,motion:false}},config:{search:{path:'search.json'}},nijika_section:()=> 'notes',url_for:v=>prefix+v.replace(/^\//,''),
   body:'<article class="reading-studio"><nav class="reading-toc"><details><summary>目录</summary><a href="#section">章节</a></details></nav><div class="article-body"><h2 id="section">正文</h2>'+reading(figure)+'<details id="native"><summary>原文折叠</summary>内容</details><a href="'+prefix+'notes/">笔记</a></div><details class="reader-options"><summary>阅读工具</summary><input type="search"><button>朗读</button></details></article>',partial:()=>''
  });
  const dom=new JSDOM(html);try{
   const doc=dom.window.document,rule=doc.querySelector('noscript style').textContent;
   // jsdom can inspect the actual no-script stylesheet without executing scripts.
   const style=doc.createElement('style');style.textContent=rule;doc.head.append(style);
   assert.equal(dom.window.getComputedStyle(doc.querySelector('.reader-options')).display,'none');
   for(const selector of ['.article-body','.reading-toc','#native'])assert.notEqual(dom.window.getComputedStyle(doc.querySelector(selector)).display,'none');
   assert.equal(doc.querySelector('figure').tabIndex,0);
   assert.ok([...doc.querySelectorAll('.no-script-nav a')].every(a=>a.getAttribute('href').startsWith(prefix)));
   assert.equal(doc.querySelector('.article-body>a').getAttribute('href'),prefix+'notes/');
  }finally{dom.window.close();}
 }
});

test('generated permutation article keeps exactly one demo and byte-identical author code',()=>{
 const doc=new JSDOM(read('public/writing/csdn-124338541/index.html')).window.document;
 try{
  const raw=read('source/_posts/csdn/124338541.md').match(/^```cpp\n([\s\S]*?)^```\s*$/m)[1];
  const demo=doc.querySelector('[data-permutation-demo]');
  assert.equal(doc.querySelectorAll('[data-permutation-demo]').length,1);
  assert.ok(demo.previousElementSibling.matches('.code-container,figure.highlight'));
  const code=demo.previousElementSibling;
  const targets=[...(code.matches('[tabindex]')?[code]:[]),...code.querySelectorAll('[tabindex]')];
  assert.equal(targets.length,1);assert.ok(targets[0].matches('figure.highlight'));assert.equal(targets[0].tabIndex,0);
  assert.equal([...code.querySelectorAll('.code .line')].map(line=>line.textContent).join('\n'),raw.replace(/\n$/,''));
 }finally{doc.defaultView.close();}
});

test('real Redefine important pre rules cannot pin inner code, gutter or syntax glyphs during reader resizing',()=>{
 const theme=read('public/atelier/css/redefine.css'),css=read('source/atelier/css/refinement.css'),content=read('source/atelier/css/content.css');
 // Use the actual compiled theme declarations that caused the browser regression,
 // including !important line-height and padding. Do not replace them with mocks.
 const themeFont=theme.match(/pre\s*\{[^}]*font-size:\s*0\.9rem[^}]*\}/)?.[0];
 const themeLeading=theme.match(/pre,\s*code\s*\{[^}]*line-height:[^}]*\}/)?.[0];
 assert.ok(themeFont);assert.ok(themeLeading);
 assert.match(themeFont,/font-size:\s*0\.9rem\s*!important/);
 assert.match(themeLeading,/line-height:\s*1\.5\s*!important/);
 const scaled=css.split('\n').find(line=>line.startsWith('.reading-studio .code-container pre,'));
 const correction=css.split('\n').find(line=>line.startsWith('.reading-studio .article-body.markdown-body figure.highlight :is(pre,code)'));
 assert.ok(correction);
 const tableInheritance=content.match(/\.article-body\.markdown-body figure\.highlight table\{[^}]*\}/)[0];
 const html='<section class="reading-studio"><div class="article-body markdown-body">'+figure.replace('vector&lt;int&gt;','<code><span class="keyword">vector</span>&lt;int&gt;</code>')+'</div></section><pre id="outside">unrelated code</pre>';
 const dom=new JSDOM('<style>'+[themeFont,themeLeading,scaled,tableInheritance,correction].join('\n')+'</style>'+html),doc=dom.window.document;
 try{
  const rule=[...doc.styleSheets[0].cssRules].find(rule=>rule.selectorText?.endsWith('figure.highlight :is(pre,code)'));
  assert.equal(rule.style.getPropertyPriority('font-size'),'important');
  assert.equal(rule.style.getPropertyPriority('line-height'),'important');
  assert.equal(rule.style.getPropertyValue('font-size'),'inherit');assert.equal(rule.style.getPropertyValue('line-height'),'inherit');
  // jsdom does not resolve CSS variables or inherited font metrics. Resolve only
  // these two properties along the real DOM chain, preserving explicit values.
  // A lingering .9rem on pre therefore fails at the actual glyph descendants.
  function metric(node,property,size){
   const value=dom.window.getComputedStyle(node).getPropertyValue(property);
   if(!value||value==='inherit')return node.parentElement?metric(node.parentElement,property,size):property==='font-size'?16:1.2;
   if(value==='calc(var(--reader-size) / 18 * 13)')return size/18*13;
   if(value.endsWith('rem'))return parseFloat(value)*16;
   return parseFloat(value);
  }
  const textNodes=[...doc.querySelectorAll('figure.highlight,figure table,figure pre,figure .line,figure code,figure .keyword')];
  assert.ok(textNodes.length>=8);
  for(const size of [18,23,14]){
   doc.querySelector('.reading-studio').style.setProperty('--reader-size',size+'px');
   for(const node of textNodes){assert.ok(Math.abs(metric(node,'font-size',size)-size/18*13)<.00001,node.outerHTML);assert.equal(metric(node,'line-height',size),1.85,node.outerHTML);}
  }
  assert.equal(metric(doc.getElementById('outside'),'font-size',23),14.4,'unrelated pre retains theme size');
  assert.equal(metric(doc.getElementById('outside'),'line-height',23),1.5,'unrelated pre retains theme leading');
  assert.equal(dom.window.getComputedStyle(doc.querySelector('figure pre')).paddingTop,'14px','padding is intentionally unchanged');
  doc.querySelector('style').textContent=[themeFont,themeLeading,scaled,tableInheritance].join('\n');
  assert.equal(metric(doc.querySelector('figure .keyword'),'font-size',23),14.4,'negative control reproduces the original frozen inner glyph size');
  assert.equal(metric(doc.querySelector('figure .keyword'),'line-height',23),1.5,'negative control reproduces the original theme leading');
 }finally{dom.window.close();}
});
