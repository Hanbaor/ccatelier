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
