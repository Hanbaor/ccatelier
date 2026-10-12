const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ejs=require('ejs');
const {JSDOM}=require('jsdom'),{parse}=require('rrweb-cssom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
// Inspect every stylesheet selected by the actual article head, in source order.
// This checks declarations, not measured layout: JSDOM does not render text zoom.
const head=ejs.render(read('custom/redefine/nijika/head.ejs'),{
 page:{content:'<p>正文</p>'},theme:{nijika:{cover:'/cover.webp'}},nijika_page_metadata:()=>({}),
 is_post:()=>true,is_home:()=>false,is_archive:()=>false,is_category:()=>false,is_tag:()=>false,is_page:()=>false,
 url_for:p=>'/'+p,open_graph:()=>'',export_config:()=>''
});
const headDom=new JSDOM(head);
const routeStyles=[...headDom.window.document.querySelectorAll('link[rel=stylesheet]')].map(link=>{
 const file=link.getAttribute('href').slice(1),source='source/'+file;
 const css=read(fs.existsSync(path.join(root,source))?source:'public/'+file);
 // Only neighbor-specific rules participate in this bounded cascade. Unrelated
 // generated Tailwind @layers are outside rrweb-cssom's supported syntax.
 return {file,rules:css.includes('.neighbor-posts')?parse(css).cssRules:[]};
});
headDom.window.close();
function fixture(count=2,prefix='/'){
 const previous={path:'writing/previous/',title:'从连续存储到有序查询：很长的相邻文章标题如何在手机上保持可读性'},next={path:'writing/next/',title:'LongUnbrokenTechnicalIdentifier'.repeat(5)};
 const html=ejs.render(read('custom/redefine/nijika/post.ejs'),{
  page:{title:'测试文章',author:'CC',prev:count==='next'?null:previous,next:count===1?null:next},config:{author:'CC'},url_for:p=>prefix+p,
  partial:()=>'',live_reader_content:()=>'<p>正文</p>',live_metadata:()=>({}),toc:()=>''
 });
 const dom=new JSDOM(html),doc=dom.window.document;
 return {dom,doc,previous,next};
}
function mediaMatches(condition,width){
 if(!/^\s*\((?:min|max)-width:\s*\d+px\)\s*$/.test(condition))return false;
 const [,kind,size]=condition.match(/(min|max)-width:\s*(\d+)px/);
 return kind==='min'?width>=Number(size):width<=Number(size);
}
// Intentionally bounded to the real, simple neighbor selectors. Resolve their
// specificity explicitly: JSDOM's cascade does not reliably model specificity.
function resolve(doc,element,property,width){
 let value='',weight=-1;
 function visit(rules){for(const rule of rules){
  if(rule.type===4){if(mediaMatches(rule.conditionText,width))visit(rule.cssRules);continue;}
  if(rule.type!==1||!rule.style.getPropertyValue(property))continue;
  for(const raw of rule.selectorText.split(',')){
   const selector=raw.trim();if(!selector.includes('.neighbor-posts')||selector.includes(':'))continue;
   assert.match(selector,/^[.\w\s>-]+$/,'extend this bounded cascade if neighbor selectors gain new syntax');
   if(!element.matches(selector))continue;
   const classes=(selector.match(/\.[\w-]+/g)||[]).length;
   const types=(selector.replace(/\.[\w-]+/g,'').match(/\b[a-z][\w-]*\b/g)||[]).length;
   const score=classes*100+types+(rule.style.getPropertyPriority(property)==='important'?10000:0);
   if(score>=weight){weight=score;value=rule.style.getPropertyValue(property);}
  }
 }}
 for(const sheet of routeStyles)visit(sheet.rules);
 return value;
}
test('phone neighbor links use one unconstrained column, including either lone adjacent article',()=>{
 for(const count of [1,2,'next']){
  const {dom,doc}=fixture(count);
  try{for(const width of [320,393,600]){
   const nav=doc.querySelector('.neighbor-posts');
   assert.equal(resolve(doc,nav,'display',width),'grid',`single-column navigation at ${width}px`);
   assert.equal(resolve(doc,nav,'grid-template-columns',width),'minmax(0,1fr)');
   assert.equal(resolve(doc,nav,'gap',width),'12px');
   for(const link of nav.querySelectorAll('a')){
    assert.equal(resolve(doc,link,'max-width',width),'none');
    assert.equal(resolve(doc,link,'min-width',width),'0');
    assert.equal(resolve(doc,link,'padding',width),'0','keep the quiet, unboxed appearance');
   }
  }}finally{dom.window.close();}
 }
});
test('desktop still presents two flexible adjacent links after the mobile boundary',()=>{
 const {dom,doc}=fixture();
 try{for(const width of [601,760,1366]){
  const nav=doc.querySelector('.neighbor-posts');
  assert.equal(resolve(doc,nav,'display',width),'flex');assert.equal(resolve(doc,nav,'gap',width),'24px');
  for(const link of nav.querySelectorAll('a')){assert.equal(resolve(doc,link,'flex',width),'1');assert.equal(resolve(doc,link,'max-width',width),'50%');}
 }}finally{dom.window.close();}
});
test('long CJK and unbroken Latin titles retain wrapping constraints and native destinations at 200% text',()=>{
 const {dom,doc,previous,next}=fixture(2,'/lab/');
 try{
  const links=[...doc.querySelectorAll('.neighbor-posts a')];
  assert.deepEqual(links.map(a=>a.getAttribute('href')),['/lab/'+previous.path,'/lab/'+next.path]);
  assert.deepEqual(links.map(a=>a.querySelector('span').textContent),[previous.title,next.title]);
  for(const width of [320,393])for(const link of links){
   const title=link.querySelector('span');title.style.fontSize='200%';
   assert.equal(resolve(doc,title,'overflow-wrap',width),'anywhere');
   assert.equal(resolve(doc,title,'white-space',width),'','no neighbor rule disables normal wrapping');
   assert.equal(resolve(doc,link,'height',width),'','no fixed link height clips enlarged titles');
   assert.equal(resolve(doc,link,'max-height',width),'');
   assert.equal(resolve(doc,link,'max-width',width),'none');
  }
 }finally{dom.window.close();}
});

for(const width of [320,393,600,601,760,1366])test(`focused reading hides neighbors through repeated toggles across the full route cascade at ${width}px`,()=>{
 assert.ok(routeStyles.length>=15);
 assert.ok(routeStyles.some(sheet=>sheet.file==='atelier/css/after-hours.css'));
 assert.ok(routeStyles.some(sheet=>sheet.file==='atelier/css/refinement.css'));
 const {dom,doc}=fixture();
 try{
  const nav=doc.querySelector('.neighbor-posts'),original=nav.innerHTML;
  for(const focused of [true,false,true,false]){
   doc.body.classList.toggle('reading-focused',focused);
   assert.equal(resolve(doc,nav,'display',width),focused?'none':width<=600?'grid':'flex',`focus=${focused} at ${width}px`);
   assert.equal(nav.innerHTML,original,'toggling focus preserves original links and titles');
  }
 }finally{dom.window.close();}
});
