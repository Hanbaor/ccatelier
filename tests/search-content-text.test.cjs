'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const {plain}=require('../tools/content-catalog.cjs');
const root=path.resolve(__dirname,'..');
const html='<p>Code &copy; &nbsp; &#x1F3B5;</p><pre><code>if (a &lt; b &amp;&amp; c &gt; d) &#123; vector&lt;int&gt; x; &#x7D;</code></pre>';
const expected='Code © 🎵 if (a < b && c > d) { vector<int> x; }';

test('HTML text extraction decodes named, decimal and hexadecimal references once while preserving code',()=>{
 assert.equal(plain(html),expected);
 assert.equal(plain('<code>&amp;#123; &amp;lt;img&amp;gt; &lt;img src=x onerror=alert(1)&gt;</code>'),'&#123; &lt;img&gt; <img src=x onerror=alert(1)>');
 assert.equal(plain('<p>a < b && c > d</p><p>next<br>line</p>'),'a < b && c > d next line');
 assert.equal(plain('<span>a</span><b>b</b><table><tr><td>one</td><td>two</td></tr></table>'),'ab one two');
});

test('actual scripts, styles, comments and inert templates are excluded, encoded markup stays literal',()=>{
 assert.equal(plain('<p>before<script>throw Error("secret")</script><style>.secret{display:none}</style><!--secret--><template>secret</template> after</p>'),'before after');
 assert.equal(plain('<p>&lt;script&gt;literal()&lt;/script&gt; &#60;style&#62;literal&#60;/style&#62;</p>'),'<script>literal()</script> <style>literal</style>');
 assert.equal(plain('<img src=x onerror="secret()"><p>safe</p>'),'safe');
});

function loadScript(file,config={}){
 const generators=new Map(),filters=new Map();
 const hexo={config:{root:'/',theme:'redefine',search:{path:'search.json',field:'post',content:true,format:'striptags'},...config},base_dir:root,theme:{setView(){}},extend:{generator:{register:(name,fn)=>generators.set(name,fn),get:name=>generators.get(name)},filter:{register:(name,fn)=>filters.set(name,fn)},helper:{register(){}}}};
 generators.set('json',require('hexo-generator-searchdb/lib/json_generator'));
 vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),{hexo,require:createRequire(path.join(root,file)),console});
 return {hexo,generators,filters};
}
const post=()=>({title:'Code',path:'/code/',content:html,date:new Date('2026-01-01'),tags:{toArray:()=>[]},categories:{toArray:()=>[]}});

test('real SearchDB generator emits once-decoded text without mutating the configured format',async()=>{
 const {hexo,generators,filters}=loadScript('scripts/nijika.js');
 filters.get('before_generate').call(hexo);
 const article=post();article.content+='<code>&amp;#123; &lt;script&gt;literal&lt;/script&gt;</code><script>hidden()</script>';
 const route=await generators.get('json').call(hexo,{posts:[article]});
 const [entry]=JSON.parse(route.data);
 assert.equal(entry.content,expected+' &#123; <script>literal</script>');
 assert.equal(entry.url,'/code/');assert.equal(hexo.config.search.format,'striptags');
 assert.equal(article.content.includes('&#123;'),true,'rendered source remains untouched');
});

test('search wrapper keeps raw and HTML formats and disabled content intact',async()=>{
 for(const format of ['raw','html','striptags']){
  const {hexo,generators,filters}=loadScript('scripts/nijika.js',{search:{path:'search.json',field:'post',format,content:format!=='striptags'}});
  filters.get('before_generate').call(hexo);
  const article={...post(),_content:'literal &amp;#123;'};
  const [entry]=JSON.parse((await generators.get('json').call(hexo,{posts:[article]})).data);
  assert.equal(entry.content,format==='raw'?article._content:format==='html'?html:'');
 }
});

test('archive generator uses the same decoded text for future offline snapshots',()=>{
 const {hexo,generators}=loadScript('scripts/live-archive.js');
 const routes=generators.get('live-archive').call(hexo,{posts:{sort:()=>({toArray:()=>[post()]})},data:{}});
 const [entry]=JSON.parse(routes.find(route=>route.path==='atelier/data/archive.json').data).posts;
 assert.equal(entry.text,expected);
 assert.equal(entry.excerpt,expected);
});

function exercisePost(){
 const {CODE_PLACEHOLDER,ANALYSIS_PLACEHOLDER}=require('../tools/content-catalog.cjs');
 return {...post(),title:'全排列',series:'hot100',
  _content:'## 题目要求\n全排列 dfs\n\n## 代码实现\n'+CODE_PLACEHOLDER+'\n\n## 个人解析\n'+ANALYSIS_PLACEHOLDER+'\n\n[返回目录](/series/hot100/)',
  content:'<h2>题目要求</h2><p>全排列 dfs</p><h2>代码实现</h2><div class="code-container"><figure><table><tr><td class="gutter"><pre>1</pre></td><td><pre>// 在这里填写你的代码</pre></td></tr></table></figure></div><h2>个人解析</h2><blockquote><p>'+ANALYSIS_PLACEHOLDER.slice(2)+'</p></blockquote><p>返回目录</p>'};
}

test('plain SearchDB indexes canonical exercise content without false unfinished-analysis hits or model mutation',async()=>{
 const {hexo,generators,filters}=loadScript('scripts/nijika.js');filters.get('before_generate').call(hexo);
 const original=exercisePost(),before={...original};
 // Hexo models expose metadata via inherited getters; cloning must retain them.
 const article=Object.create(original,{path:{get:()=>'/hot100/055/'}});
 const entries=JSON.parse((await generators.get('json').call(hexo,{posts:[article]})).data);
 const {findEntries}=await import('../source/atelier/js/search-core.mjs');
 assert.equal(entries.length,1);assert.equal(entries[0].url,'/hot100/055/');
 assert.equal(findEntries('全排列 dfs',entries).length,1);
 assert.equal(findEntries('全排列 时间复杂度',entries).length,0);
 assert.doesNotMatch(entries[0].content,/在这里填写|在这里补充|个人解析|代码实现/);
 assert.deepEqual(original,before);assert.equal(article.content,original.content);
});

test('search preserves legitimate author text, partial work, code syntax, raw/html modes and disabled content',async()=>{
 for(const format of ['striptags','raw','html']){
  const {hexo,generators,filters}=loadScript('scripts/nijika.js',{root:'/lab/',search:{path:'search.json',field:'all',format,content:true}});filters.get('before_generate').call(hexo);
  const empty=exercisePost(),partial=exercisePost(),ordinary={...exercisePost(),series:undefined};
  partial._content+='\n\n## 个人解析\n实际推导的时间复杂度。';
  partial.content+='<h2>个人解析</h2><p>实际推导的时间复杂度。</p><pre>vector&lt;int&gt; nums;</pre>';
  const entries=JSON.parse((await generators.get('json').call(hexo,{posts:[empty,partial,ordinary],pages:[post()]})).data);
  assert.equal(entries.length,4);assert.equal(entries[0].url,'/lab/code/');
  if(format==='striptags'){
   assert.doesNotMatch(entries[0].content,/在这里补充/);
   assert.match(entries[1].content,/在这里补充/);assert.match(entries[1].content,/实际推导的时间复杂度/);assert.match(entries[1].content,/vector<int>/);
   assert.match(entries[2].content,/在这里补充/);assert.doesNotMatch(entries[2].content,/\b1\b/,'SearchDB still removes gutter numbers');
   assert.equal(entries[3].content,expected);
  }else assert.equal(entries[0].content,format==='raw'?empty._content:empty.content.replace(/<td class="gutter">.*?<\/td>/g,''));
 }
 const {hexo,generators,filters}=loadScript('scripts/nijika.js',{search:{path:'search.json',field:'post',format:'striptags',content:false}});filters.get('before_generate').call(hexo);
 assert.equal(JSON.parse((await generators.get('json').call(hexo,{posts:[exercisePost()]})).data)[0].content,'');
});


test('page-only plain SearchDB does not require or rewrite post models',async()=>{
 const {hexo,generators,filters}=loadScript('scripts/nijika.js',{search:{path:'search.json',field:'page',format:'striptags',content:true}});filters.get('before_generate').call(hexo);
 const entries=JSON.parse((await generators.get('json').call(hexo,{pages:[post()]})).data);
 assert.equal(entries.length,1);assert.equal(entries[0].content,expected);
});
