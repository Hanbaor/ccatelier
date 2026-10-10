const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {metadata,exerciseState,articleContent,CODE_PLACEHOLDER,ANALYSIS_PLACEHOLDER}=require('../tools/content-catalog.cjs');
const repo=path.resolve(__dirname,'..'),output=path.resolve(repo,process.env.CATALOG_PUBLIC_DIR||'public'),prefix=process.env.CATALOG_ROOT||'/';
const read=relative=>fs.readFileSync(path.join(output,relative),'utf8');
const index=JSON.parse(read('atelier/data/archive.json')).posts;
const raw=n=>fs.readFileSync(path.join(repo,'source/_posts/hot100',String(n).padStart(3,'0')+'.md'),'utf8');

test('metadata distinguishes technical writing from actual exercise code and empty analyses',()=>{
 assert.equal(index.length,109);assert.equal(index.filter(p=>p.kind==='technical').length,8);
 assert.equal(index.filter(p=>p.group==='writing').length,9);
 const exercises=index.filter(p=>p.group==='hot100');assert.equal(exercises.length,100);
 assert.equal(exercises.filter(p=>p.exercise.hasCode).length,30);
 assert.equal(exercises.filter(p=>p.exercise.hasAnalysis).length,0);
 for(const p of exercises){
  assert.deepEqual(p.exercise,exerciseState({series:'hot100',raw:raw(p.order)}));
  assert.ok(p.excerpt.length>5,p.path);assert.doesNotMatch(p.excerpt,/项目 内容|在这里填写|在这里补充/);
  assert.doesNotMatch(p.text,/在这里填写你的代码|在这里补充：/);
  assert.ok(p.topics.includes(p.tags[0]));assert.ok(['简单','中等','困难'].includes(p.difficulty));
 }
 const catalog=JSON.parse(fs.readFileSync(path.join(repo,'source/_data/writing_catalog.json')));
 assert.equal(Object.keys(catalog).length,8);
 for(const [id,entry] of Object.entries(catalog)){
  const post=index.find(p=>p.path===prefix+'writing/csdn-'+id+'/');
  assert.ok(post);assert.equal(post.excerpt,entry.summary);assert.deepEqual(post.topics,entry.topics);
  assert.ok(entry.summary.length>=40);assert.ok(entry.summary.length<=100);
  assert.ok(entry.topics.every(t=>post.tags.includes(t)));
  assert.ok(fs.existsSync(path.join(repo,'source/_posts/csdn',id+'.md')));
 }
});

test('only exact empty source sections are removed from presentation; partial work survives',()=>{
 const rendered='<h2 id="题目要求">题目要求</h2><p>problem</p><h2 id="代码实现">代码实现</h2><div class="code-container"><figure><pre>// 在这里填写你的代码</pre></figure></div><h2 id="个人解析">个人解析</h2><blockquote><p>在这里补充：解题思路、关键推导、时间复杂度、空间复杂度、易错点与复盘记录。</p></blockquote><p><a href="/lab/series/hot100/">返回目录</a></p>';
 const markdown='## 题目要求\nproblem\n\n## 代码实现\n'+CODE_PLACEHOLDER+'\n\n## 个人解析\n'+ANALYSIS_PLACEHOLDER+'\n\n[返回目录](/series/hot100/)';
 const post={series:'hot100',_content:markdown,content:rendered};
 const cleaned=articleContent(post);
 assert.doesNotMatch(cleaned,/代码实现|个人解析|在这里/);assert.match(cleaned,/题目要求/);assert.match(cleaned,/\/lab\/series\/hot100\//);
 assert.equal(post.content,rendered);assert.equal(post._content,markdown,'source remains untouched');
 const partlyWritten={...post,_content:markdown.replace('// 在这里填写你的代码','// 在这里填写你的代码\nint answer = 1;').replace(ANALYSIS_PLACEHOLDER,ANALYSIS_PLACEHOLDER+'\n\n先建立哈希表。')};
 assert.equal(articleContent(partlyWritten),rendered,'a template prompt beside real work must never remove that work');
 assert.equal(exerciseState(partlyWritten).hasCode,true);assert.equal(exerciseState(partlyWritten).hasAnalysis,true);
 assert.equal(articleContent({...post,series:undefined}),rendered,'ordinary writing is not subject to exercise cleanup');
 const duplicate={...post,_content:markdown+'\n\n## 代码实现\n```cpp\nint answer = 1;\n```',content:rendered+'<h2>代码实现</h2><pre>int answer = 1;</pre>'};
 assert.match(articleContent(duplicate),/int answer = 1/);assert.equal(exerciseState(duplicate).hasCode,true);
 assert.equal(exerciseState({...post,_content:markdown+'\n\n## 代码实现\n'+CODE_PLACEHOLDER}).hasCode,false);
 const decorated={...post,_content:markdown.replace('[返回目录](/series/hot100/)','[返回目录](/series/hot100/) · 补充说明\n\n需要保留的正文。'),content:rendered.replace('返回目录</a></p>','返回目录</a> · 补充说明</p><p>需要保留的正文。</p>')};
 assert.match(articleContent(decorated),/返回目录<\/a> · 补充说明/);assert.match(articleContent(decorated),/需要保留的正文/);
 assert.doesNotMatch(articleContent(decorated),/在这里填写你的代码|在这里补充：/);
});

test('all 100 generated exercise articles have one honest readiness note and retain real code',()=>{
 for(let n=1;n<=100;n++){
  const dom=new JSDOM(read('hot100/'+String(n).padStart(3,'0')+'/index.html'));
  try{
   const d=dom.window.document,body=d.querySelector('.article-body'),readiness=d.querySelectorAll('.exercise-readiness');
   assert.equal(readiness.length,1);assert.match(readiness[0].textContent,/解析待补/);
   assert.doesNotMatch(body.textContent,/在这里填写你的代码|在这里补充：/);
   assert.ok(body.querySelector('h2[id="题目要求"]'));
   assert.equal(Boolean(body.querySelector('h2[id="代码实现"]')),n<=30);
   if(n<=30){assert.match(readiness[0].textContent,/代码未校验/);assert.match(body.textContent,/class Solution/);}
   else assert.match(readiness[0].textContent,/代码待补/);
   assert.equal(body.querySelector('h2[id="个人解析"]'),null);
   assert.equal(d.querySelector('.chapter-library'),null);
   assert.equal(d.querySelector('.reading-nav a').getAttribute('href'),prefix+'series/hot100/');
   assert.equal(body.querySelector('a[href$="series/hot100/"]').getAttribute('href'),prefix+'series/hot100/');
  }finally{dom.window.close();}
 }
});

test('static Notes matches the writing-first default and the series exposes source-derived readiness',()=>{
 const dom=new JSDOM(read('notes/index.html'));
 try{
  const d=dom.window.document;
  assert.equal(d.querySelector('.catalog-heading-v3 h1').textContent,'笔记');
  assert.ok(d.querySelector('.catalog-heading-v3 a[href$="series/hot100/"]'));
  assert.doesNotMatch(d.querySelector('.catalog-heading-v3').textContent,/篇技术笔记|篇手记/);
  const rows=[...d.querySelectorAll('.archive-fallback .archive-record')];assert.ok(rows.length);
  for(const row of rows){assert.ok(!row.querySelector('a').getAttribute('href').includes('/hot100/'));assert.ok(row.querySelector('p').textContent.length);}
  assert.equal(d.querySelector('[data-group]').dataset.group,'writing');
  assert.equal(d.querySelector('.archive-app').hidden,true);assert.equal(d.querySelector('.archive-fallback').hidden,false);
  assert.ok(d.querySelector('.archive-fallback a[href$="archives/"]'));
 }finally{dom.window.close();}
 const series=new JSDOM(read('series/hot100/index.html'));
 try{
  const d=series.window.document;assert.match(d.querySelector('.series-header').textContent,/100 道题 · 30 题已有代码 · 100 题解析待补/);
  const states=[...d.querySelectorAll('.series-track-state')].map(n=>n.textContent);
  assert.equal(states.length,100);assert.equal(states.filter(s=>s.includes('已有代码')).length,30);
  assert.equal(states.filter(s=>s.includes('解析待补')).length,100);
  assert.match(d.querySelector('.series-intro summary').textContent,/导入时/);
  assert.equal(d.querySelectorAll('.series-track>.editorial-arrow').length,100);
 }finally{series.window.close();}
});

test('content catalogue CSS is route-scoped, parseable, offline-listed, and prefix-safe',()=>{
 const css=read('atelier/css/content-catalog.css'),dom=new JSDOM('<style>'+css+'</style>');
 try{assert.ok(dom.window.document.styleSheets[0].cssRules.length>15);}finally{dom.window.close();}
 for(const route of ['notes','series/hot100','hot100/001','writing/csdn-124387071'])assert.ok(read(route+'/index.html').includes('href="'+prefix+'atelier/css/content-catalog.css"'));
 for(const route of ['projects','studio','studio/practice','about'])assert.doesNotMatch(read(route+'/index.html'),/content-catalog\.css/);
 assert.ok(JSON.parse(read('atelier/data/offline-shell.json')).includes(prefix+'atelier/css/content-catalog.css'));
});
