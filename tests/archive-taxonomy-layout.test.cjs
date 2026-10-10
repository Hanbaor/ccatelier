const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ejs=require('ejs'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const collection=items=>({length:items.length,each:fn=>items.forEach(fn)});
function render(name,{prefix='/',view='archives',count=10,empty=false}={}){
 const posts=Array.from({length:count},(_,i)=>({path:`writing/example-${i}/`,title:i?'文章 '+i:'中文标题 & <测试>',date:'2026-09-22'}));
 const context={page:{posts:collection(posts),total:11,current:1},site:{posts:{length:109},tags:collection(empty?[]:[{name:'中文标签',path:'tags/中文标签/',length:17},{name:'PyTorch',path:'tags/PyTorch/',length:1}]),categories:collection(empty?[]:[{name:'算法',path:'categories/算法/',length:100}])},
  is_tag:()=>view==='tags',is_category:()=>view==='categories',nijika_list_title:()=>view==='tags'?'# 中文标签':view==='categories'?'算法':'归档',url_for:p=>encodeURI(prefix+p),date_xml:d=>d+'T00:00:00Z',date:d=>d.replaceAll('-','.'),
  paginator:()=>`<span class="page-number current">1</span><a class="page-number" href="${prefix}archives/page/2/">2</a><a class="extend next" href="${prefix}archives/page/2/">下一页 →</a>`};
 context.partial=(name,vars={})=>ejs.render(read('custom/redefine/'+name+'.ejs'),{...context,...vars});
 return new JSDOM(ejs.render(read(`custom/redefine/nijika/${name}.ejs`),context));
}
for(const prefix of ['/','/lab/']){
 for(const view of ['archives','tags','categories'])test(`legacy article index labels only its actual page count and keeps routes (${prefix}${view})`,()=>{
  const dom=render('list',{prefix,view}),d=dom.window.document;
  assert.equal(d.querySelector('.archive-count').textContent,'本页 10 篇');
  assert.equal(d.querySelectorAll('.post-row').length,10);
  assert.equal(d.querySelector('.archive-heading h1 span'),null);
  assert.doesNotMatch(d.querySelector('.archive-heading').textContent,/109|110/);
  assert.equal(d.querySelector('.taxonomy-nav [aria-current=page]').getAttribute('href'),prefix+view+'/');
  assert.equal(d.querySelector('.archive-return').getAttribute('href'),prefix+'notes/');
  assert.equal(d.querySelector('.pagination .next').getAttribute('href'),prefix+'archives/page/2/');
  assert.equal(d.querySelector('.post-row h2').textContent,'中文标题 & <测试>');assert.equal(d.querySelector('测试'),null);
  assert.equal(d.querySelector('time').getAttribute('datetime'),'2026-09-22T00:00:00Z');
  assert.ok([...d.querySelectorAll('.post-row')].every(a=>a.getAttribute('href').startsWith(prefix)));
  dom.window.close();
 });
 for(const name of ['tags','categories'])test(`taxonomy indexes preserve true item counts and Unicode links (${prefix}${name})`,()=>{
  const dom=render(name,{prefix}),d=dom.window.document;
  assert.equal(d.querySelector('.archive-count').textContent,name==='tags'?'2 个标签':'1 个分类');
  const links=[...d.querySelectorAll('.tag-cloud>a,.taxonomy-list>a')];
  assert.equal(links[0].querySelector('small').textContent,name==='tags'?'17 篇':'100 篇');
  assert.equal(decodeURI(links[0].getAttribute('href')),prefix+(name==='tags'?'tags/中文标签/':'categories/算法/'));
  assert.equal(d.querySelector('.archive-return').getAttribute('href'),prefix+'notes/');
  assert.equal(d.querySelector('.taxonomy-nav [aria-current=page]').textContent,name==='tags'?'标签':'分类');
  dom.window.close();
 });
}
test('last pages and empty taxonomies retain honest counts and useful empty states',()=>{
 const last=render('list',{count:9});assert.equal(last.window.document.querySelector('.archive-count').textContent,'本页 9 篇');last.window.close();
 for(const name of ['tags','categories']){const dom=render(name,{empty:true});assert.match(dom.window.document.querySelector('.archive-count').textContent,/^0 个/);assert.ok(dom.window.document.querySelector('.empty-hint'));dom.window.close();}
});
test('archive typography is scoped, line-free, and keeps native pagination touch targets',()=>{
 const css=read('source/atelier/css/immersive.css'),dom=new JSDOM('<style>'+css+'</style>');assert.ok(dom.window.document.styleSheets[0].cssRules.length>50);
 assert.match(css,/\.archive-page \.post-list \{[^}]*gap:28px/);
 assert.match(css,/\.archive-page \.post-row \{[^}]*border:0/);
 assert.match(css,/\.archive-page \.post-row:last-child \{border:0\}/);
 assert.match(css,/\.archive-page \.taxonomy-list>a,\.archive-page \.tag-cloud>a \{[^}]*border:0/);
 assert.match(css,/\.archive-page \.pagination>a,\.archive-page \.pagination>span \{min-width:44px;min-height:44px/);
 assert.match(css,/\.archive-page a:focus-visible \{outline:2px/);
 dom.window.close();
});

// Evaluate the real old/new CSS rules at the formerly conflicting 600/640 boundary.
// JSDOM does not apply viewport media queries; this small cascade checks only the
// affected grid-column property, including selector specificity and source order.
test('archive dates do not span the desktop grid at 601, 620, 640 or 641 CSS pixels',()=>{
 const names=['atelier','content','stage','refinement','editorial','immersive'];
 const dom=render('list'),doc=dom.window.document;
 for(const name of names){const style=doc.createElement('style');style.textContent=read('source/atelier/css/'+name+'.css');doc.head.append(style);}
 const date=doc.querySelector('.archive-page .post-row time');
 function mediaMatches(condition,width){
  if(!condition.includes('width'))return false;
  for(const match of condition.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)){
   if(match[1]==='min'&&width<Number(match[2]))return false;
   if(match[1]==='max'&&width>Number(match[2]))return false;
  }
  return true;
 }
 function resolve(width,lastSheet=names.length){
  let result='',weight=-1,found=0;
  function visit(rules){for(const rule of rules){
   if(rule.type===4){if(mediaMatches(rule.conditionText,width))visit(rule.cssRules);continue;}
   if(rule.type!==1||!rule.style.getPropertyValue('grid-column'))continue;
   for(const selector of rule.selectorText.split(',')){
    if(!selector.includes('.post-row')||!selector.trim().endsWith('time'))continue;
    if(!date.matches(selector))continue;
    const specificity=(selector.match(/\.[\w-]+/g)||[]).length*100+(selector.match(/\btime\b/g)||[]).length;
    if(specificity>=weight){weight=specificity;result=rule.style.getPropertyValue('grid-column');found++;}
   }
  }}
  for(const sheet of [...doc.styleSheets].slice(0,lastSheet))visit(sheet.cssRules);
  assert.ok(found>0);return result;
 }
 for(const width of [601,620,640])assert.equal(resolve(width,names.length-1),'1/-1','the legacy max-640 rule is genuinely active at '+width);
 for(const width of [320,600,601,620,640,641,1440])assert.equal(resolve(width),'auto','dates keep automatic grid placement at '+width);
 dom.window.close();
});
