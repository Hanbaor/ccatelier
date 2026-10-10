const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
async function setup(){
 const dom=new JSDOM('<details data-algorithm-comparison><summary>对照实验</summary></details>',{pretendToBeVisual:true}),host=dom.window.document.querySelector('details');
 const {initAlgorithmComparison}=await import('../source/atelier/js/algorithm-comparison.js');initAlgorithmComparison(host);return {dom,host,initAlgorithmComparison};
}
test('independent steppers, end, reverse, disclosure and reset preserve truthful counters',async()=>{
 const {dom,host,initAlgorithmComparison}=await setup();try{
  initAlgorithmComparison(host);assert.equal(host.querySelectorAll('form').length,1);
  const brute=host.querySelector('[data-comparison-model=brute]'),hash=host.querySelector('[data-comparison-model=hash]');
  brute.querySelector('[data-comparison-next]').click();assert.match(brute.querySelector('[data-comparison-counts]').textContent,/1 次/);assert.match(hash.querySelector('[data-comparison-counts]').textContent,/读取 0 次/);
  hash.querySelector('[data-comparison-end]').click();assert.match(hash.textContent,/读取 3 次 · 写入 2 次 · 峰值 2/);assert.match(hash.querySelector('[data-comparison-message]').textContent,/返回 \[1, 2\]/);assert.equal(hash.querySelector('[data-comparison-next]').disabled,true);
  hash.querySelector('[data-comparison-prev]').click();assert.match(hash.querySelector('[data-comparison-state]').textContent,/字典读取/);
  host.open=true;host.open=false;host.open=true;assert.match(brute.querySelector('[data-comparison-counts]').textContent,/1 次/);
  const preset=host.querySelector('[data-comparison-preset]');preset.value='4';preset.dispatchEvent(new dom.window.Event('change'));
  assert.match(host.querySelector('[data-comparison-verification]').textContent,/枚举返回 \[0, 3\].*哈希返回 \[1, 2\]/);assert.equal(host.querySelector('[data-comparison-prev]').disabled,true);assert.equal(host.querySelector('.algorithm-comparison-verification').open,false);
  for(const message of host.querySelectorAll('[data-comparison-message]'))assert.equal(message.getAttribute('aria-live'),'polite');
 }finally{dom.window.close();}
});
test('custom input errors keep prior run, successful correction resets both, text cannot execute',async()=>{
 const {dom,host}=await setup();try{
  const nums=host.querySelector('[data-comparison-nums]'),target=host.querySelector('[data-comparison-target]'),form=host.querySelector('form'),submit=()=>form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));
  host.querySelector('[data-comparison-next]').click();const old=host.querySelector('[data-comparison-input]').textContent;
  nums.value='<img src=x onerror=alert(1)>';nums.dispatchEvent(new dom.window.Event('input'));assert.equal(host.querySelector('[data-comparison-preset]').value,'custom');submit();
  assert.match(host.querySelector('[data-comparison-error]').textContent,/当前运行保持不变/);assert.equal(host.querySelector('[data-comparison-input]').textContent,old);assert.match(host.querySelector('[data-comparison-counts]').textContent,/1 次/);assert.equal(host.querySelector('img'),null);assert.equal(nums.getAttribute('aria-invalid'),'true');
  nums.value='-4, 0, 4';target.value='0';submit();assert.equal(host.querySelector('[data-comparison-error]').textContent,'');assert.equal(nums.hasAttribute('aria-invalid'),false);assert.match(host.querySelector('[data-comparison-input]').textContent,/\[-4, 0, 4\]/);assert.match(host.querySelector('[data-comparison-counts]').textContent,/0 次/);
  nums.value='1 2';target.value='99';submit();assert.match(host.querySelector('[data-comparison-verification]').textContent,/全部 0 个.*枚举返回 无解.*哈希返回 无解/);
 }finally{dom.window.close();}
});
test('article enhancement leaves lab DOM absent until opened and initializes once on repeated toggles',async()=>{
 const dom=new JSDOM('<details data-algorithm-demo><div class="algorithm-demo-body"><select data-demo-example><option value="0">example</option></select><button data-demo-prev></button><button data-demo-next></button><p data-demo-state></p><table><tbody data-demo-map></tbody></table><p data-demo-message></p><span data-demo-position></span><div data-demo-controls></div><p data-demo-fallback></p></div></details>',{pretendToBeVisual:true});
 try{
  const {initAlgorithmDemo}=await import('../source/atelier/js/algorithm-demo.js');initAlgorithmDemo({root:dom.window.document});
  const lab=dom.window.document.querySelector('[data-algorithm-comparison]');assert.ok(lab);assert.equal(lab.open,false);assert.equal(lab.querySelector('form'),null);
  lab.open=true;lab.dispatchEvent(new dom.window.Event('toggle'));lab.dispatchEvent(new dom.window.Event('toggle'));
  // The dynamic import resolves asynchronously; wait for its DOM mutation, not a fixed delay.
  if(!lab.querySelector('form'))await new Promise((resolve,reject)=>{const observer=new dom.window.MutationObserver(()=>{if(lab.querySelector('form')){observer.disconnect();clearTimeout(timeout);resolve();}});const timeout=setTimeout(()=>{observer.disconnect();reject(new Error('comparison did not initialize'));},3000);observer.observe(lab,{childList:true,subtree:true});});
  lab.open=false;lab.dispatchEvent(new dom.window.Event('toggle'));lab.open=true;lab.dispatchEvent(new dom.window.Event('toggle'));assert.equal(lab.querySelectorAll('form').length,1);
 }finally{dom.window.close();}
});
test('array chips defeat real theme decimal markers without changing ordinary ordered lists',async()=>{
 const fs=require('node:fs'),path=require('node:path'),read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
 const theme=read('node_modules/hexo-theme-redefine/source/css/common/markdown.styl'),css=read('source/atelier/css/algorithm-demo.css');
 assert.match(theme,/ol:not\(\.not-markdown\)[\s\S]*?\n    li\n      list-style decimal/);
 // Match the installed theme rule; assert the stronger selector as JSDOM is not a full cascade engine.
 assert.match(css,/\.article-body \.algorithm-demo \.algorithm-comparison-array li\s*\{[^}]*list-style:none/);
 const dom=new JSDOM(`<style>.markdown-body ol:not(.not-markdown) li{list-style:decimal}</style><style>${css}</style><div class="article-body markdown-body"><ol id="ordinary"><li>Author list</li></ol><details class="algorithm-demo"><details data-algorithm-comparison><summary>Compare</summary></details></details></div>`);
 try{
  const {initAlgorithmComparison}=await import('../source/atelier/js/algorithm-comparison.js');initAlgorithmComparison(dom.window.document.querySelector('[data-algorithm-comparison]'));
  for(const chip of dom.window.document.querySelectorAll('.algorithm-comparison-array li'))assert.equal(dom.window.getComputedStyle(chip).listStyle,'none');
  assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector('#ordinary li')).listStyle,'decimal');
 }finally{dom.window.close();}
});
