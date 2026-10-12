const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const core=import('../source/atelier/js/practice-core.mjs'),renderer=import('../source/atelier/js/practice-score-export.mjs');
const fixture=(overrides={})=>({id:'original-export',title:'原创练习',description:'原创鼓点',bpm:120,bars:[{hits:[{step:0,type:'kick',velocity:1},{step:0,type:'hat',velocity:.4},{step:15,type:'snare',velocity:.6},{step:2,type:'tom',velocity:0}]},{hits:[]}],...overrides});
const parse=svg=>new JSDOM(svg,{contentType:'image/svg+xml'});

test('standalone score retains actual hits, numbering, full bars, tempo and silent bars',async()=>{
 const {renderPracticeScoreSvg}=await renderer,input=fixture({bpm:143.5}),before=structuredClone(input),svg=renderPracticeScoreSvg(input),dom=parse(svg),d=dom.window.document;
 assert.deepEqual(input,before);assert.equal(d.documentElement.localName,'svg');
 const notes=[...d.querySelectorAll('g > title')].filter(n=>n.textContent.includes('力度'));
 assert.deepEqual(notes.map(n=>n.textContent),['底鼓 · 第 1 格 · 力度 1','踩镲 · 第 1 格 · 力度 0.4','军鼓 · 第 16 格 · 力度 0.6']);
 assert.match(d.documentElement.textContent,/143\.5 BPM.*4\/4.*2 小节/);
 assert.match(d.documentElement.textContent,/整小节休止/);assert.equal(d.querySelectorAll('ellipse').length,2);assert.equal(d.querySelectorAll('path').length,1);
 assert.equal(d.querySelectorAll('script,foreignObject,a,image,animate,button').length,0);
 assert.doesNotMatch(svg,/var\(|currentColor|class=|opacity=|href=|on\w+=|practice-cursor|is-outside/);
 assert.equal(d.querySelector('svg > rect').getAttribute('fill'),'#fff');assert.match(svg,/非官方乐谱/);dom.window.close();
});

test('full titles stay inert XML text while visible long CJK and emoji titles are bounded',async()=>{
 const {renderPracticeScoreSvg}=await renderer;
 for(const title of ['<script>alert("hi")</script> & \'quoted\'','鼓🥁中文节奏'.repeat(10),'W'.repeat(80),'家👩‍👩‍👦'.repeat(8)]){
  const dom=parse(renderPracticeScoreSvg(fixture({title}))),d=dom.window.document;
  assert.equal(d.querySelector('#score-title').textContent,title);assert.equal(d.querySelectorAll('script').length,0);
  const lines=[...d.querySelectorAll('text[font-size="24"]')];assert.ok(lines.length<=2);
  assert.ok(lines.every(n=>Array.from(n.textContent).length<=23));
  if(title.includes('鼓🥁'))assert.match(lines.at(-1).textContent,/…$/);
  dom.window.close();
 }
 for(const title of ['bad\ud800','bad\udfff','bad\ufffe','bad\uffff'])assert.throws(()=>renderPracticeScoreSvg(fixture({title})),/SVG 不支持/);
});

test('all-zero records stay rests and the maximum legal score stays within fixed budgets',async()=>{
 const {renderPracticeScoreSvg,SCORE_SVG_LIMITS}=await renderer,{PRACTICE_TYPES}=await core;
 const hits=Array.from({length:16},(_,step)=>PRACTICE_TYPES.map(type=>({step,type,velocity:1}))).flat();
 const zero=parse(renderPracticeScoreSvg(fixture({bars:[{hits:hits.map(h=>({...h,velocity:0}))}]})));
 assert.equal(zero.window.document.querySelectorAll('ellipse,path').length,0);assert.match(zero.window.document.documentElement.textContent,/整小节休止/);zero.window.close();
 const svg=renderPracticeScoreSvg(fixture({title:'长标题'.repeat(26),bars:Array.from({length:64},()=>({hits}))})),dom=parse(svg),d=dom.window.document;
 assert.equal(d.querySelectorAll('ellipse,path').length,4096);assert.ok(Number(d.documentElement.getAttribute('height'))<=SCORE_SVG_LIMITS.maxHeight);assert.equal(d.documentElement.getAttribute('width'),'800');assert.ok(Buffer.byteLength(svg)<=SCORE_SVG_LIMITS.maxBytes);assert.match(svg,/第 64 小节/);dom.window.close();
 assert.throws(()=>renderPracticeScoreSvg(fixture({bars:Array.from({length:65},()=>({hits:[]}))})),/1–64/);
});

test('all demos serialize and only the click handler loads the optional module',async()=>{
 const {renderPracticeScoreSvg}=await renderer,{PRACTICE_DEMOS}=await core;
 for(const value of PRACTICE_DEMOS){const dom=parse(renderPracticeScoreSvg(value));dom.window.close();}
 const source=fs.readFileSync('source/atelier/js/practice.js','utf8');assert.match(source,/loadScoreExporter=\(\)=>import\('\.\/practice-score-export\.mjs'\)/);assert.doesNotMatch(source,/^import .*practice-score-export/m);
});
