'use strict';
// Source-only regressions: no generated public files, Hexo build or browser.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHash}=require('node:crypto'),yaml=require('js-yaml'),ejs=require('ejs'),{JSDOM}=require('jsdom');
const {metadata,exerciseState,articleContent,section,CODE_PLACEHOLDER}=require('../tools/content-catalog.cjs');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8'),sha=value=>createHash('sha256').update(value).digest('hex');
const posts=fs.readdirSync(path.join(root,'source/_posts/hot100')).filter(name=>name.endsWith('.md')).sort().map(name=>{
 const raw=read('source/_posts/hot100/'+name);
 const front=yaml.load(raw.split('---')[1]);
 return {...front,source:'_posts/hot100/'+name,path:front.permalink,raw};
});
const original=posts.find(post=>post.source==='_posts/hot100/028.md');
const snapshots=posts.map(post=>[post.source,sha(post.raw)]);

test('audited 028 empty implementation is pending without discarding its original stub',()=>{
 assert.equal(sha(original.raw),'46c38799513f3e0acbbd2cc5daba337c69234ba62d15a3cc39682deb149047b1');
 assert.match(section(original.raw,'代码实现'),/ListNode\* addTwoNumbers\(ListNode\* l1, ListNode\* l2\) \{\s*\}/);
 const state=exerciseState(Object.freeze({...original}));
 assert.deepEqual(state,{hasCode:false,hasAnalysis:false,codePlaceholder:false,analysisPlaceholder:true});
 assert.deepEqual(metadata(original).exercise,state);
 const html='<h2>代码实现</h2><pre>'+section(original.raw,'代码实现')+'</pre>';
 assert.equal(articleContent({...original,content:html}),html,'the source stub is preserved, not deleted like the template prompt');
 assert.equal(articleContent({...original,content:html},{reading:true}),html);
 assert.deepEqual(exerciseState({...original,raw:undefined,_content:original.raw}),state,'Hexo _content is supported');
});

test('implementation edits and extra code leave the narrow fingerprint exception automatically',()=>{
 // This intentionally minimal return tests detection only, not correctness.
 const implemented=original.raw.replace(/(ListNode\* addTwoNumbers\([^\n]+\) \{)\s*\}/,'$1\n        return l1;\n    }');
 assert.notEqual(implemented,original.raw);
 assert.equal(exerciseState({...original,raw:implemented}).hasCode,true);
 assert.equal(exerciseState({...original,_content:implemented}).hasCode,true,'current Hexo content wins over an old raw value');
 assert.equal(exerciseState({...original,raw:original.raw.replace('const int mod=10;','const int mod=11;')}).hasCode,true,'nonmatching fingerprint is not classified');
 assert.equal(exerciseState({...original,raw:original.raw+'\n\n## 代码实现\n```cpp\nint example = 1;\n```'}).hasCode,true);
});

test('the exception cannot catch another post, missing source, constructors or multiple Solution classes',()=>{
 for(const source of [undefined,'_posts/hot100/027.md','hot100/028/','_posts/other/028.md','source/_posts/hot100/028.md']){
  assert.equal(exerciseState({...original,source}).hasCode,true,String(source));
 }
 assert.equal(exerciseState({...original,series:'other'}),null);
 const real='## 代码实现\n```cpp\nstruct ListNode { int val; ListNode(int x) : val(x) {} };\nclass Solution { public: int answer() { return 1; } };\nclass Solution { public: int answer() { return 2; } };\n```';
 assert.equal(exerciseState({...original,raw:real}).hasCode,true);
});

test('100 source records retain 100 pending analyses, exactly 29 unverified code records and historical text',()=>{
 assert.equal(posts.length,100);
 assert.equal(posts.filter(post=>exerciseState(post).hasCode).length,29);
 assert.equal(posts.filter(post=>!exerciseState(post).hasAnalysis).length,100);
 for(const post of posts){
  const previous=section(post.raw,'代码实现')!==CODE_PLACEHOLDER;
  if(post!==original)assert.equal(exerciseState(post).hasCode,previous,post.source);
  assert.deepEqual(Object.keys(metadata(post).exercise).sort(),['analysisPlaceholder','codePlaceholder','hasAnalysis','hasCode']);
 }
 for(const [source,digest] of snapshots)assert.equal(sha(read('source/'+source)),digest,source+' bytes unchanged');
});

// Exercise the real helper registration without invoking generators or reading public.
const helpers={};
vm.runInNewContext(read('scripts/live-archive.js'),{
 require:id=>require(id.startsWith('../')?path.join(root,id.slice(3)):id),
 hexo:{extend:{generator:{register(){}},helper:{register:(name,fn)=>helpers[name]=fn}}}
});
function markup(prefix){return ejs.render(read('custom/redefine/nijika/series.ejs'),{
 page:{seriesPosts:posts,introHtml:'<p>导入时的历史声明保持原样。</p>'},url_for:p=>prefix+p,
 live_catalog_counts:()=>helpers.live_catalog_counts.call({site:{posts:{toArray:()=>posts},data:{}}}),
 live_metadata:post=>helpers.live_metadata.call({site:{data:{}}},post),nijika_count:n=>String(n).padStart(2,'0'),
 partial:()=>read('custom/redefine/nijika/editorial-arrow.ejs')
});}
for(const prefix of ['/','/lab/'])test('real metadata helper, series template and code-only filter agree '+prefix,async()=>{
 const counts=helpers.live_catalog_counts.call({site:{posts:{toArray:()=>posts},data:{}}});
 assert.equal(counts.withCode,29);assert.equal(counts.analysisPending,100);
 const dom=new JSDOM(markup(prefix),{url:'https://example.test'+prefix+'series/hot100/'});
 try{
  const d=dom.window.document,rows=[...d.querySelectorAll('.series-track')],row=rows.find(n=>+n.dataset.seriesOrder===28);
  assert.equal(rows.length,100);assert.equal(row.dataset.seriesHasCode,'false');assert.match(row.textContent,/题面/);
  assert.match(d.querySelector('.series-header').textContent,/100 道题 · 29 题已有代码 · 100 题解析待补/);
  assert.match(d.querySelector('.series-status-note').textContent,/尚未做正确性校验/);
  assert.equal(d.querySelector('.series-intro .article-body').textContent,'导入时的历史声明保持原样。');
  const {initSeriesFilter}=await import('../source/atelier/js/series-filter.js');initSeriesFilter({root:d});
  const control=d.querySelector('[data-series-code]');control.checked=true;control.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  assert.equal(rows.filter(n=>!n.hidden).length,29);assert.equal(row.hidden,true);
  control.checked=false;control.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  assert.equal(rows.filter(n=>!n.hidden).length,100);assert.equal(row.hidden,false);
 }finally{dom.window.close();}
});


test('actual reader template labels the preserved empty stub pending and other code unverified',()=>{
 for(const post of [original,posts[0]]){
  const content='<h2>代码实现</h2><pre>class Solution { /* original code retained */ };</pre>';
  const dom=new JSDOM(ejs.render(read('custom/redefine/nijika/post.ejs'),{
   page:{...post,date:null,tags:undefined,content},config:{author:'CC'},live_metadata:metadata,
   live_reader_content:page=>articleContent(page,{reading:true}),toc:()=>'',url_for:p=>'/'+p,
   nijika_series:()=>[],partial:()=>''
  }));
  try{
   const d=dom.window.document;
   assert.equal(d.querySelector('.exercise-readiness').textContent,post===original?'代码待补 · 解析待补':'代码未校验 · 解析待补');
   assert.equal(d.querySelector('.article-body').innerHTML,content);
  }finally{dom.window.close();}
 }
});
