'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {createRequire}=require('node:module');
const {JSDOM}=require('jsdom');
function generate(posts,config={}){
 let generate;const file=path.join(__dirname,'../scripts/after-hours.js');
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{require:createRequire(file),hexo:{extend:{helper:{register(){}},generator:{register(name,fn){generate=fn;}}}}});
 return generate.call({config:{title:'CC & Atelier',author:'CC',url:'https://ccatelier.top',root:'/',...config}},{posts:{sort:()=>({toArray:()=>posts})}}).find(x=>x.path==='atom.xml').data;
}
const post=(i,extra={})=>({path:`p/${i}/`,title:'A & B',date:new Date('2020-01-01'),updated:new Date('2021-01-01'),content:'<p>正文</p>',raw:'---\ndate: 2020-01-01\nupdated: 2021-01-01\n---\n正文',...extra});
const xml=text=>new JSDOM(text,{contentType:'text/xml'}).window.document;
test('Atom reflects the most recent valid emitted entry date without widening its scope',()=>{
 const posts=Array.from({length:21},(_,i)=>post(i));posts[4].updated=new Date('2024-01-01');posts[20].updated=new Date('2030-01-01');posts.unshift(post(99,{series:'hot100',updated:new Date('2035-01-01')}));
 const doc=xml(generate(posts));assert.equal(doc.querySelectorAll('entry').length,20);assert.equal(doc.documentElement.querySelector('updated').textContent,'2024-01-01T00:00:00.000Z');assert.equal(doc.querySelector('title').textContent,'CC & Atelier');
});
test('Atom invalid dates fall back deterministically and /lab/ links stay under the publication root',()=>{
 const posts=[post(1,{date:new Date('invalid'),updated:new Date('2023-01-01')}),post(2,{date:null,updated:'invalid'})];
 const text=generate(posts,{url:'https://ccatelier.top/lab/',root:'/lab/'}),doc=xml(text);
 assert.equal(doc.querySelector('entry published').textContent,'2023-01-01T00:00:00.000Z');
 assert.equal(doc.querySelector('entry link').getAttribute('href'),'https://ccatelier.top/lab/p/1/');
 assert.equal(doc.querySelector('link[rel="self"]').getAttribute('href'),'https://ccatelier.top/lab/atom.xml');
 assert.doesNotMatch(text,/Invalid Date|NaN/);assert.equal(generate([]),generate([]));assert.match(generate([]),/1970-01-01T00:00:00.000Z/);
});

test('Atom ignores changed filesystem mtime while honoring explicit source updates and timezone conversion',()=>{
 const raw='---\ndate: 2020-01-01 12:00:00\n---\n正文';
 const original=post(1,{raw,date:new Date('2020-01-01T04:00:00Z'),updated:new Date('2025-01-01')});
 assert.equal(generate([original]),generate([{...original,updated:new Date('2026-01-01')}]));
 const changed={...original,raw:raw.replace('date:','updated: 2024-02-01 12:00:00\ndate:'),updated:new Date('2024-02-01T04:00:00Z')};
 assert.equal(xml(generate([changed])).querySelector('entry updated').textContent,'2024-02-01T04:00:00.000Z');
 assert.notEqual(generate([original]),generate([changed]));
});

test('Atom summaries retain real prose and inline code while excluding generated code and directory noise',()=>{
 const content='<p><strong>目录</strong></p><p><a href="#part">前言</a></p><p><a href="#part2">第二节</a></p><figure class="image-caption"><img src="a.jpg"><figcaption>noise.jpg</figcaption></figure><figure class="highlight"><table><tr><td class="gutter"><pre>123</pre></td><td><pre>import torch</pre></td></tr></table></figure><h2 id="part">前言</h2><p>使用 <code>torch</code> 进行真实实验 &amp; 记录。</p>';
 const doc=xml(generate([post(1,{content})]));
 const text=doc.querySelector('entry summary').textContent;
 assert.equal(text,'前言 使用 torch 进行真实实验 & 记录。');
 assert.doesNotMatch(text,/目录|第二节|123|import|noise\.jpg/);
 assert.equal(doc.querySelectorAll('entry').length,1);
});
