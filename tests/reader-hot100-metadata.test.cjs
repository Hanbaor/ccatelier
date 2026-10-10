'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const renderMarkdown=require('hexo-renderer-marked/lib/renderer');
const {articleContent}=require('../tools/content-catalog.cjs');
const render=markdown=>renderMarkdown.call({config:{marked:{}},execFilterSync(){}},{text:markdown},{});
const reading=(content,series='hot100')=>articleContent({series,content},{reading:true});
const fixture=render('<span>LeetCode #1 · Two Sum</span>\n\n| 项目 | 内容 |\n| --- | --- |\n| 难度 | <font>简单</font> |\n| 专题 | 哈希 |\n| 标签 | 数组、哈希表 |\n| 题目链接 | [打开 LeetCode 原题](https://leetcode.cn/problems/two-sum/) |\n\n## 题目要求\n\n正文。');
function inspect(html,fn){const dom=new JSDOM(html);try{return fn(dom.window.document);}finally{dom.window.close();}}

test('all 100 source exercises compact only their known opening, preserving title, tags, URL and remaining bytes',()=>{
 const dir=path.resolve(__dirname,'../source/_posts/hot100'),files=fs.readdirSync(dir).filter(file=>/^\d+\.md$/.test(file));
 assert.equal(files.length,100);
 for(const file of files){
  const raw=fs.readFileSync(path.join(dir,file),'utf8'),markdown=raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,''),content=render(markdown);
  const expected=inspect(content,doc=>({title:doc.querySelector('p').textContent,labels:[...doc.querySelectorAll('tbody tr')].slice(0,4).map(row=>row.lastElementChild.textContent),href:doc.querySelector('tbody a').getAttribute('href')}));
  const result=reading(content);
  assert.notEqual(result,content,file);
  assert.equal(result.slice(result.indexOf('</details>')+10),content.slice(content.indexOf('</table>')+8),file+' body must remain byte-identical');
  inspect(result,doc=>{
   const summary=doc.querySelector('.exercise-summary'),details=doc.querySelector('.exercise-meta-details');
   assert.equal(summary.textContent,expected.labels[0]+' · '+expected.labels[1]+' · 原题',file);
   assert.equal(summary.querySelector('a').getAttribute('href'),expected.href,file);
   assert.equal(details.open,false);assert.equal(details.querySelector('summary').textContent,'题目信息');
   assert.deepEqual([...details.querySelectorAll('p')].map(p=>p.textContent),[expected.title,'标签：'+expected.labels[2]]);
   assert.equal(details.querySelector('table'),null);assert.equal(summary.previousElementSibling,null);
   assert.equal(details.nextElementSibling.tagName,'H2');
  });
  assert.equal(articleContent({series:'hot100',content}),content,file+' default/index output is byte-identical');
  assert.equal(reading(result),result,file+' is idempotent');
 }
});

test('only the leading Hot100 import template qualifies, and other tables and external links are unchanged',()=>{
 const suffix='\n<table><tr><td>难度</td><td>我的内容</td></tr></table><p><a href="https://example.com/?x=1&amp;y=2">外部资料</a></p>';
 assert.ok(reading(fixture+suffix).endsWith(suffix));
 for(const series of [undefined,null,'Hot100','algorithms',''])assert.equal(reading(fixture,series===undefined?'not-hot100':series),fixture);
 const cases=[
  '<!-- introduction -->'+fixture,'<p>前言</p>'+fixture,
  fixture.replace('</p>','</p><!-- preserve -->'),fixture.replace('</p>','</p></bogus>'),
  fixture.replace('<span>','<span id="original-title">'),fixture.replace('<p>','<p class="special">'),
  fixture.replace('LeetCode #1 · Two Sum','Two Sum'),fixture.replace('项目','字段'),fixture.replace('内容','说明'),
  fixture.replace('难度','级别'),fixture.replace('专题','分类'),fixture.replace('标签','标记'),fixture.replace('题目链接','链接'),
  fixture.replace('<font>简单</font>','简单'),fixture.replace('简单','未知'),
  fixture.replace('<td>哈希</td>','<td><em>哈希</em></td>'),fixture.replace('<td>数组、哈希表</td>','<td></td>'),
  fixture.replace('<table>','<table id="important-table">'),fixture.replace('<td>','<td colspan="2">'),
  fixture.replace('</tbody>','<tr><td>备注</td><td>保留我</td></tr></tbody>'),
  fixture.replace('<td>标签</td>','<td>标签</td><td>额外信息</td>'),fixture.replace('</font>',''),
  fixture.replace('Two Sum','Two </bogus>Sum'),fixture.replace('数组、哈希表','数组</bogus>、哈希表'),
  fixture.replace('打开 LeetCode 原题','用户自定义链接'),fixture.replace('<a href=','<a title="保留标题" href='),
  fixture.replace('数组、哈希表','数组<!--保留-->、哈希表')
 ];
 for(const content of cases)assert.equal(reading(content),content,content.slice(0,160));
});

test('unknown and unsafe URLs or attributes decline the whole conversion',()=>{
 const href='https://leetcode.cn/problems/two-sum/';
 for(const url of ['javascript:alert(1)','data:text/html,x','http://leetcode.cn/problems/two-sum/','//leetcode.cn/problems/two-sum/','https://evil.test/problems/two-sum/','https://leetcode.cn.evil.test/problems/two-sum/','https://leetcode.cn@evil.test/problems/two-sum/','https://leetcode.cn/problems/two-sum/?x=1','https://leetcode.cn/problems/two-sum/#answer','https://leetcode.cn/problems/../account/','https://leetcode.cn/problems/two%22sum/']){
  const content=fixture.replace(href,url);assert.equal(reading(content),content,url);
 }
 for(const attrs of ['onclick="alert(1)"','id="keep-this"','name="keep-this"','download','class="custom"','target="named-window"','rel="opener"']){
  const content=fixture.replace('<a href=','<a '+attrs+' href=');assert.equal(reading(content),content,attrs);
 }
 const content=fixture.replace('<a href=','<a class="link" target="_blank" rel="noopener" href=');
 inspect(reading(content),doc=>{const a=doc.querySelector('.exercise-summary a');assert.equal(a.href,href);assert.equal(a.target,'_blank');assert.match(a.rel,/noopener/);});
});

test('decoded metadata remains safely escaped text, with no introduced HTML',()=>{
 const content=fixture.replace('Two Sum','Two &lt;img src=x onerror=alert(1)&gt; &amp; &quot;Sum&quot;').replace('<td>哈希</td>','<td>哈希 &amp; &lt;svg&gt;</td>').replace('数组、哈希表','数组 &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;标签&quot;');
 const result=reading(content);assert.notEqual(result,content);
 inspect(result,doc=>{
  assert.equal(doc.querySelector('img,script,svg,[onerror]'),null);
  assert.equal(doc.querySelector('.exercise-meta-details p').textContent,'LeetCode #1 · Two <img src=x onerror=alert(1)> & "Sum"');
  assert.equal(doc.querySelector('.exercise-meta-details p:last-child').textContent,'标签：数组 <script>alert(1)</script> & "标签"');
  assert.equal(doc.querySelector('.exercise-summary').textContent,'简单 · 哈希 & <svg> · 原题');
 });
 assert.equal(articleContent({series:'hot100',content}),content);
});

test('reading title deduplication and historical title-anchor behavior stay intact',()=>{
 const content='<h1 id="legacy-title">标题</h1><h2 id="section">正文</h2><p>段落</p>',page={title:'标题',series:'hot100',content};
 const result=articleContent(page,{reading:true});
 assert.equal(result,'<span class="reader-title-anchor" id="legacy-title" aria-hidden="true"></span><h2 id="section">正文</h2><p>段落</p>');
 assert.equal(articleContent(page),'<h2 id="section">正文</h2><p>段落</p>');
 assert.equal(page.content,content);
});
