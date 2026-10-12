'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
test('print-only selectors suppress reading controls while preserving original content and attribution',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../source/atelier/css/refinement.css'),'utf8');
 const print=css.slice(css.indexOf('@media print {'));
 const match=print.match(/([^{}]*\[data-reader-exclude\][^{}]*)\{display:none!important\}/);assert.ok(match);
 assert.equal(css.slice(0,css.indexOf('@media print {')).includes('.reading-page [data-reader-exclude]'),false);
 const dom=new JSDOM('<section class="reading-page"><article><h1>标题</h1><p>正文</p><img src="original.png"><button class="copy-code">复制</button><button class="chapter-copy">链接</button><button class="code-workbench-open">工作台</button><details data-reader-exclude open><summary>演示</summary></details><details class="reader-comments" open><summary>评论</summary></details><p class="article-source">来源</p><footer class="article-footer">版权</footer></article></section><div class="reading-progress"></div><button class="selection-note"></button>');
 const doc=dom.window.document,hidden=[...doc.querySelectorAll(match[1].trim())];assert.equal(hidden.length,7);
 for(const selector of ['h1','p','img','.article-source','.article-footer'])assert.equal(doc.querySelector(selector).matches(match[1].trim()),false,selector);
 dom.window.close();
});
