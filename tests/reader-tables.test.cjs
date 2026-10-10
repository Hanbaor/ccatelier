'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {articleContent}=require('../tools/content-catalog.cjs');
const root=path.resolve(__dirname,'..');
const reading=content=>articleContent({content},{reading:true});
const table=n=>'<table><tr>'+Array.from({length:n},(_,i)=>'<th>列'+i+'</th>').join('')+'</tr><tr>'+Array.from({length:n},()=>'<td>long_identifier_and_中文</td>').join('')+'</tr></table>';

test('real six-column article table becomes keyboard focusable without changing its content or code tables',()=>{
 const original=new JSDOM(fs.readFileSync(path.join(root,'public/writing/csdn-154834561/index.html'),'utf8'));
 const content=original.window.document.querySelector('.article-body').innerHTML;
 const out=reading(content),dom=new JSDOM(out);
 try{
  const data=dom.window.document.querySelector('table:not(.highlight table)');
  assert.equal(data.querySelectorAll('thead th').length,6);
  assert.equal(data.tabIndex,0);data.focus();assert.equal(dom.window.document.activeElement,data);
  assert.equal(data.getAttribute('role'),null,'native table semantics remain');
  assert.equal(out.replace(/ tabindex="0"/g,''),content.replace(/ tabindex="0"/g,''),'only the keyboard attribute changes');
  const before=[...original.window.document.querySelectorAll('figure.highlight table')].map(n=>n.outerHTML);
  assert.ok(before.length>0);assert.deepEqual([...dom.window.document.querySelectorAll('figure.highlight table')].map(n=>n.outerHTML),before);
  assert.equal(reading(out),out,'repeated rendering is idempotent');
  assert.equal(articleContent({content}),content,'catalog/search content is unchanged');
 }finally{original.window.close();dom.window.close();}
});

test('small, wrapped, nested, opt-out and explicitly focused tables retain author markup',()=>{
 for(const content of [table(2),'<figure class="highlight">'+table(6)+'</figure>','<div class="table-container" tabindex="0">'+table(6)+'</div>',table(6).replace('<table>','<table tabindex="-1">'),table(6).replace('<table>','<table class="not-markdown">'),'<blockquote>'+table(6)+'</blockquote>'])assert.equal(reading(content),content);
 const multiple=table(4)+'<p>中间正文 &amp; 内容</p>'+table(6);
 assert.equal((reading(multiple).match(/tabindex="0"/g)||[]).length,2);
 assert.equal(reading(multiple).replace(/ tabindex="0"/g,''),multiple);
});

test('wide-table fallback keeps local overflow, readable cells and existing long-word wrapping in both themes',()=>{
 const css=fs.readFileSync(path.join(root,'source/atelier/css/reader.css'),'utf8');
 const rules=css.split('\n').filter(line=>line.startsWith('.reading-studio .article-body.markdown-body>table')).join('\n');
 assert.match(rules,/display:block;table-layout:auto;max-width:100%;overflow-x:auto/);
 assert.match(rules,/min-width:90px;overflow-wrap:anywhere/);
 assert.match(rules,/:focus-visible\{outline:2px solid var\(--yellow\);outline-offset:3px\}/);
 for(const theme of ['light','dark']){
  const dom=new JSDOM('<style>'+rules+'</style><body class="nijika '+theme+'"><section class="reading-studio"><article class="article-body markdown-body">'+reading(table(6))+'<figure class="highlight">'+table(2)+'</figure></article></section>');
  try{
   const data=dom.window.document.querySelector('article>table'),style=dom.window.getComputedStyle(data);
   assert.equal(style.display,'block');assert.equal(style.tableLayout,'auto');assert.equal(style.overflowX,'auto');assert.equal(style.maxWidth,'100%');
   assert.equal(dom.window.getComputedStyle(data.querySelector('th')).minWidth,'90px');
   assert.equal(dom.window.getComputedStyle(data.querySelector('th')).overflowWrap,'anywhere');
   assert.notEqual(dom.window.getComputedStyle(dom.window.document.querySelector('figure table')).display,'block');
  }finally{dom.window.close();}
 }
 // Static width budget, not browser layout: six readable columns must scroll;
 // two 90px columns still fit within the narrowest 280px article width.
 for(const viewport of [320,360,375,390,430]){
  const available=viewport-40;
  assert.ok(6*90>available);assert.ok(2*90<available);
  assert.ok(available/6-30<36,'old fixed columns leave under three 13px characters');
 }
});
