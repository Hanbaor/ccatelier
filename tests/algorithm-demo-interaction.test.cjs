const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ejs=require('ejs');
const {JSDOM}=require('jsdom');
const repo=path.resolve(__dirname,'..'),template=fs.readFileSync(path.join(repo,'custom/redefine/nijika/post.ejs'),'utf8');
const body='<h2>代码实现</h2><div class="code-container" data-rel="Cpp"><figure><pre>twoSum</pre></figure></div><p>返回目录</p>';
function render(order=1,prefix='/lab/'){
 const page={series:'hot100',series_order:order,title:'两数之和',author:'CC'};
 return ejs.render(template,{page,config:{author:'CC'},live_metadata:()=>({exercise:{hasCode:true,codePlaceholder:false,analysisPlaceholder:true,hasAnalysis:false}}),live_reader_content:()=>body,toc:()=>'',url_for:p=>prefix+p,nijika_series:()=>[],partial:()=>''});
}
function setup(){return new JSDOM(render(),{pretendToBeVisual:true,url:'https://test.invalid/lab/hot100/001/'});}
test('template places one collapsed, scoped enhancement after code with readable no-JS fallback',()=>{
 const dom=setup(),doc=dom.window.document;try{
  const host=doc.querySelector('[data-algorithm-demo]');assert.ok(host);assert.equal(host.open,false);assert.equal(doc.querySelectorAll('[data-algorithm-demo]').length,1);
  assert.equal(host.previousElementSibling.tagName,'LINK');assert.equal(host.previousElementSibling.previousElementSibling.className,'code-container');assert.equal(host.nextElementSibling.textContent,'返回目录');
  assert.equal(host.querySelector('[data-demo-controls]').hidden,true);assert.equal(host.querySelector('[data-demo-fallback]').hidden,false);assert.match(host.textContent,/JavaScript.*不是在浏览器里执行 C\+\+/);assert.match(host.textContent,/operator\[\]/);assert.match(host.textContent,/按键排序/);
  assert.match(doc.querySelector('.exercise-readiness').textContent,/代码未校验/);assert.equal(doc.querySelector('link').getAttribute('href'),'/lab/atelier/css/algorithm-demo.css');
  const other=new JSDOM(render(2));assert.equal(other.window.document.querySelector('[data-algorithm-demo]'),null);assert.equal(other.window.document.querySelector('.article-body').innerHTML,body,'non-demo article bytes stay unchanged');other.window.close();
 }finally{dom.window.close();}
});
test('native controls step backward and forward, reset examples, retain state through close and initialize once',async()=>{
 const {initAlgorithmDemo}=await import('../source/atelier/js/algorithm-demo.js'),dom=setup(),doc=dom.window.document;
 try{
  initAlgorithmDemo({root:doc});initAlgorithmDemo({root:doc});const host=doc.querySelector('[data-algorithm-demo]'),prev=doc.querySelector('[data-demo-prev]'),next=doc.querySelector('[data-demo-next]'),select=doc.querySelector('[data-demo-example]');
  assert.equal(host.open,false);assert.equal(doc.querySelector('[data-demo-fallback]').hidden,true);assert.equal(doc.querySelector('[data-demo-controls]').hidden,false);assert.equal(prev.disabled,true);
  host.open=true;next.focus();next.click();assert.equal(doc.activeElement,next);assert.match(doc.querySelector('[data-demo-message]').textContent,/第 2 \/ 7 步/);assert.equal(doc.querySelector('[data-demo-map]').textContent,'30');
  prev.click();assert.equal(prev.disabled,true);for(let i=0;i<20;i++)next.click();assert.equal(next.disabled,true);assert.match(doc.querySelector('[data-demo-message]').textContent,/返回 \[1, 2\]/);
  host.open=false;host.open=true;assert.equal(next.disabled,true);select.value='1';select.dispatchEvent(new dom.window.Event('change'));assert.equal(prev.disabled,true);assert.equal(next.disabled,false);assert.match(doc.querySelector('[data-demo-message]').textContent,/第 1 \/ 5 步/);
  for(let i=0;i<4;i++)next.click();assert.match(doc.querySelector('[data-demo-message]').textContent,/返回 \[0, 1\]/);prev.click();assert.match(doc.querySelector('[data-demo-message]').textContent,/条件成立/);
  assert.equal(doc.querySelector('[data-demo-message]').getAttribute('aria-live'),'polite');assert.equal(select.tagName,'SELECT');assert.equal(next.type,'button');
 }finally{dom.window.close();}
});
test('enhancement has no automatic motion, global shortcuts or executable source evaluation',()=>{
 const source=fs.readFileSync(path.join(repo,'source/atelier/js/algorithm-demo.js'),'utf8'),css=fs.readFileSync(path.join(repo,'source/atelier/css/algorithm-demo.css'),'utf8');
 assert.doesNotMatch(source,/setInterval|setTimeout|requestAnimationFrame|eval\(|new Function|addEventListener\('keydown'/);assert.doesNotMatch(css,/animation\s*:|transition\s*:/);assert.match(css,/:focus-visible/);
});
