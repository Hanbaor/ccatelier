const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ejs=require('ejs');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),route='/writing/csdn-154834561/';
function toolbar(){return ejs.render(fs.readFileSync(path.join(root,'custom/redefine/nijika/article-tools.ejs'),'utf8'),{page:{title:'分治（1）'}});}
function page(){
 const dom=new JSDOM('<body data-root="/"><section class="reading-studio"><article class="article-body"><h1 id="original">原文标题</h1><p>正文</p></article><details class="reader-options"><summary>阅读工具</summary>'+toolbar()+'</details></section><div id="toast"></div></body>',{url:'https://ccatelier.test'+route});
 const {window}=dom;Object.assign(globalThis,{window,document:window.document,location:window.location,localStorage:window.localStorage,innerHeight:900,matchMedia:()=>({matches:false,addEventListener(){}}),requestAnimationFrame:()=>0});return dom;
}
test('article actions remain inside a closed end-of-article tool section',()=>{
 const dom=page();try{
  const doc=dom.window.document,row=doc.querySelector('.reading-switches'),more=doc.querySelector('.reader-options');
  assert.equal(more.open,false);assert.equal(more.querySelector('summary').textContent,'阅读工具');
  assert.deepEqual([...row.children].map(n=>n.tagName),['BUTTON','BUTTON','BUTTON','BUTTON','BUTTON','BUTTON']);
  for(const hook of ['data-bookmark','data-applause','data-copy-link'])assert.ok(more.querySelector('['+hook+']'));
  assert.equal(row.querySelector('[data-reading-resume]').hidden,true);
  assert.equal(doc.querySelector('[data-stat="pageViews"]'),null);assert.doesNotMatch(doc.querySelector('.article-toolbox').textContent,/分钟|次来访/);
  assert.equal(doc.querySelector('[data-article-tool-status]').getAttribute('role'),'status');
  assert.equal(doc.querySelector('[data-focus-reading]').getAttribute('aria-pressed'),'false');
 }finally{dom.window.close();}
});
test('reader toolbar supports fresh and saved-progress sessions without adding a separate resume row',async()=>{
 let initAfterHours,initReader;
 for(const saved of [false,true]){
  const dom=page();try{
   const doc=dom.window.document;
   if(saved)localStorage.setItem('cc-recent',JSON.stringify([{path:route,title:'分治（1）',progress:.5}]));
   ({initAfterHours}=await import('../source/atelier/js/after-hours.js'));({initReader}=await import('../source/atelier/js/reader.js'));
   let scrolled=null;dom.window.scrollTo=value=>{scrolled=value;};
   initAfterHours();initReader();
   const resume=doc.querySelector('[data-reading-resume]'),more=doc.querySelector('.reader-options');
   assert.equal(resume.hidden,!saved);assert.equal(resume.parentElement.className,'reading-switches');assert.equal(more.open,false);
   doc.querySelector('[data-focus-reading]').click();assert.equal(doc.querySelector('[data-focus-reading]').getAttribute('aria-pressed'),'true');
   doc.querySelector('[data-reader-size-cycle]').click();assert.equal(doc.querySelector('.reading-studio').style.getPropertyValue('--reader-size'),'20px');
   if(saved){assert.match(resume.textContent,/50%/);resume.click();assert.equal(resume.hidden,true);assert.ok(scrolled);}
   assert.equal(doc.querySelector('.article-body h1').id,'original','original Markdown heading remains intact');
  }finally{dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();}
 }
});
test('toolbar spacing is compact and first-heading reset is narrowly scoped',()=>{
 const css=fs.readFileSync(path.join(root,'source/atelier/css/refinement.css'),'utf8');
 assert.match(css,/\.reading-studio \.article-toolbox \{grid-column:1\/-1;padding:0;margin:0;border:0;background:none;position:static\}/);
 assert.match(css,/\.reading-studio \.reading-switches \{flex-wrap:wrap;gap:6px 18px;margin-top:0\}/);
 assert.match(css,/\.article-body\.markdown-body>:is\(h1,h2,h3,h4,h5,h6\):first-child,/);
 assert.match(css,/\[data-feature-status\]:first-child\+:is\(h1,h2,h3,h4,h5,h6\) \{margin-top:0\}/);
 assert.match(css,/\.reading-studio \.reader-options,\.reading-studio \.reader-comments \{border:0;/);
});
