const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ejs=require('ejs'),{JSDOM}=require('jsdom'),yaml=require('js-yaml');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const writing=[{title:'笔记 <script>不执行</script>',path:'writing/example/',date:'2025-08-03'},{title:'更早的文章',path:'writing/earlier/',date:'2022-04-24'}];
function render(name,prefix='/',posts=writing){const context={theme:yaml.load(read('_config.redefine.yml')),url_for:p=>prefix+String(p).replace(/^\//,''),nijika_art_srcset:()=>'',nijika_writing:()=>posts,date_xml:d=>d,date:d=>d,live_metadata:p=>({excerpt:'真实摘要',topics:[]}),page:{posts:{each:fn=>posts.forEach(fn)}},nijika_count:n=>String(n)};context.partial=(name,vars={})=>name==='nijika/pagination'?'':ejs.render(read('custom/redefine/'+name+'.ejs'),{...context,...vars});return new JSDOM(ejs.render(read('custom/redefine/nijika/'+name+'.ejs'),context));}
for(const prefix of ['/','/lab/']){
 test(`notes preserves tools and offers native curated routes (${prefix})`,()=>{
  const dom=render('notes',prefix),d=dom.window.document;
  assert.equal(d.querySelectorAll('h1').length,1);
  assert.equal(d.querySelectorAll('.notes-path').length,3);
  assert.match(d.querySelector('#reading-paths').textContent,/编辑选读/);
  assert.equal(d.querySelectorAll('.notes-path details[open]').length,3);
  for(const details of d.querySelectorAll('.notes-path details')) {assert.ok(details.querySelector('summary'));assert.ok(details.querySelectorAll('ol a[href]').length>=2);details.open=false;assert.equal(details.open,false);details.open=true;}
  for(const selector of ['[data-duration]','[data-tag]','#archive-sort','[data-view=graph]','.queue-open','[data-graph-select]','[data-archive-results]','[data-archive-more]'])assert.ok(d.querySelector(selector),selector);
  assert.equal(d.querySelector('.archive-app').hidden,true);assert.equal(d.querySelector('.archive-fallback').hidden,false);
  assert.equal(d.querySelectorAll('.archive-fallback .archive-record').length,2);
  assert.equal(d.querySelectorAll('script, [onclick]').length,0);
  for(const a of d.querySelectorAll('.notes-path a'))assert.ok(a.getAttribute('href').startsWith(prefix));
  dom.window.close();
 });
 test(`atelier is an honest creation index, with dates from published writing (${prefix})`,()=>{
  const dom=render('stage',prefix),d=dom.window.document;
  assert.equal(d.querySelectorAll('h1').length,1);
  assert.equal(d.querySelectorAll('.creation-main-work').length,1);
  assert.equal(d.querySelectorAll('.creation-small-work').length,2);
  assert.equal(d.querySelectorAll('.atelier-writing-feature').length,0);
  assert.equal(d.querySelectorAll('.creation-traces time').length,2);
  assert.deepEqual([...d.querySelectorAll('.creation-traces time')].map(n=>n.dateTime),writing.map(p=>p.date));
  assert.match(d.querySelector('.creation-traces').textContent,/<script>不执行<\/script>/);
  assert.equal(d.querySelectorAll('script,[onclick],a a,button').length,0);
  assert.match(d.querySelector('.creation-query').textContent,/教学/);
  assert.match(d.querySelector('.creation-query-visual').textContent,/COUNT\(t.id\)/);
  for(const route of ['studio/practice/','projects/','research/#sql-lab-title','notes/','about/','life/'])assert.ok(d.querySelector(`a[href="${prefix}${route}"]`),route);
  for(const img of d.querySelectorAll('img')) {assert.ok(img.alt.includes('主题插画'));assert.ok(img.width&&img.height);assert.ok(fs.existsSync(path.join(root,'source',img.getAttribute('src').slice(prefix.length))));}
  for(const a of d.querySelectorAll('a[href^="#"]'))assert.ok(d.querySelector(a.getAttribute('href')));
  assert.doesNotMatch(d.body.textContent,/求职|简历|在投|未公开|最近活动|昨天|今日更新/);
  dom.window.close();
 });
}
test('empty writing stays honest and route layout remains responsive and keyboard accessible',()=>{
 const dom=render('stage','/',[]);assert.match(dom.window.document.body.textContent,/笔记正在整理中/);assert.equal(dom.window.document.querySelectorAll('time').length,0);dom.window.close();
 const css=read('source/atelier/css/editorial-index.css'),sheet=new JSDOM('<style>'+css+'</style>');
 assert.ok(sheet.window.document.styleSheets[0].cssRules.length>50);
 assert.match(css,/var\(--layout-width\)/);assert.match(css,/var\(--page-gutter\)/);assert.match(css,/@media\(max-width:700px\)/);assert.match(css,/:focus-visible/);assert.match(css,/overflow-wrap:anywhere/);
 assert.doesNotMatch(css,/animation:|opacity:0|visibility:hidden|!important/);
 sheet.window.close();
});
test('curated article destinations exist in published content',()=>{
 const notes=read('custom/redefine/nijika/notes.ejs');const matches=[...notes.matchAll(/writing\/csdn-(\d+)\//g)];assert.equal(matches.length,6);
 const posts=fs.readdirSync(path.join(root,'source/_posts/csdn'));
 for(const [,id] of matches){assert.ok(posts.some(file=>read('source/_posts/csdn/'+file).includes('writing/csdn-'+id+'/')),id);}
});

// JSDOM has no layout engine. Evaluate actual route CSS cascade (including media
// queries), then the CSS replaced-image sizing equation. Browser QA separately
// observed the negative control as 523.156 x 1024px at a 1170px viewport.
const {parse:parseCSS}=require('rrweb-cssom');
function selectorParts(value){let depth=0,start=0,result=[];for(let i=0;i<value.length;i++){if(value[i]==='('||value[i]==='[')depth++;if(value[i]===')'||value[i]===']')depth--;if(value[i]===','&&!depth){result.push(value.slice(start,i).trim());start=i+1;}}result.push(value.slice(start).trim());return result;}
function specificity(selector){let score=0;selector=selector.replace(/:(is|not|has)\(([^()]*)\)/g,(_,name,args)=>{score+=Math.max(...selectorParts(args).map(specificity));return '';}).replace(/:where\([^()]*\)/g,'');return score+(selector.match(/#[\w-]+/g)||[]).length*10000+(selector.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g)||[]).length*100+(selector.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|:[\w-]+/g,'').match(/\b[a-z][\w-]*\b/gi)||[]).length;}
function notesSheets(doc,route='notes'){
 const html=ejs.render(read('custom/redefine/nijika/head.ejs'),{page:{nijika:route},theme:{nijika:{cover:'/cover.webp'}},nijika_page_metadata:()=>({}),is_post:()=>false,is_home:()=>false,is_archive:()=>false,is_category:()=>false,is_tag:()=>false,is_page:()=>false,url_for:p=>'/'+p,open_graph:()=>'',export_config:()=>''});
 const head=new JSDOM(html),files=[...head.window.document.querySelectorAll('link[rel="stylesheet"]'),...doc.querySelectorAll('link[rel="stylesheet"]')].map(n=>n.getAttribute('href').slice(1));head.window.close();
 return files.map(file=>({file,rules:parseCSS(read((file==='atelier/css/redefine.css'?'public/':'source/')+file)).cssRules}));
}
function cascade(sheets,node,property,width,withoutAuto=false){
 let answer={value:'',priority:-1,weight:-1};
 function visit(rules,file){for(const rule of rules){
  if(rule.cssRules){if(rule.media){const condition=rule.media.mediaText;if(/print|prefers-reduced-motion/.test(condition))continue;if([...condition.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)].some(([,bound,n])=>bound==='max'?width>+n:width<+n))continue;}visit(rule.cssRules,file);continue;}
  if(!rule.selectorText||!rule.style.getPropertyValue(property))continue;
  if(withoutAuto&&file.endsWith('/editorial-index.css')&&property==='height'&&rule.selectorText==='.notes-editorial-heading figure img')continue;
  for(const selector of selectorParts(rule.selectorText)){let matches=false;try{matches=node.matches(selector);}catch{continue;}if(!matches)continue;const weight=specificity(selector),priority=rule.style.getPropertyPriority(property)==='important'?1:0;if(priority>answer.priority||priority===answer.priority&&weight>=answer.weight)answer={value:rule.style.getPropertyValue(property),weight,priority,file,selector};}
 }}for(const sheet of sheets)visit(sheet.rules,sheet.file);return answer;
}
for(const width of [390,600,700,701,900,1170,1180])test(`notes hero has a bounded uncropped landscape image at ${width}px across actual route CSS`,async()=>{
 const dom=render('notes'),d=dom.window.document;d.body.className='nijika light';d.body.dataset.section='notes';const sheets=notesSheets(d),image=d.querySelector('.notes-editorial-heading figure img'),heading=d.querySelector('.notes-editorial-heading');
 assert.ok(sheets.some(s=>s.file==='atelier/css/stage-engine.css'));
 assert.equal(sheets.at(-1).file,'atelier/css/editorial-index.css');
 const dimensions=await require('sharp')(path.join(root,'source',image.getAttribute('src'))).metadata();
 assert.equal(dimensions.width/dimensions.height,1.5,'the picture itself is 3:2');
 assert.equal(cascade(sheets,image,'width',width).value,'100%');
 assert.equal(cascade(sheets,image,'height',width).value,'auto');
 assert.equal(cascade(sheets,image,'aspect-ratio',width).value,'3 / 2');
 assert.equal(cascade(sheets,image,'object-fit',width).value,'contain');
 assert.equal(cascade(sheets,image,'min-height',width).value,'0');
 assert.equal(cascade(sheets,image,'height',width,true).value,'','negative control exposes HTML presentational height, not an unrelated CSS height');
 const gutter=Math.max(20,Math.min(width*.04,56));
 const layout=Math.min(1200,width-2*gutter),columns=cascade(sheets,heading,'grid-template-columns',width).value,gap=parseFloat(cascade(sheets,heading,'gap',width).value);
 assert.equal(columns,width<=700?'1fr':'1fr 1.05fr');
 const imageWidth=width<=700?layout:(layout-gap)*1.05/2.05;
 const displayedHeight=imageWidth/(dimensions.width/dimensions.height);
 assert.ok(displayedHeight>=190&&displayedHeight<=430,`${imageWidth} x ${displayedHeight}`);
 assert.ok(displayedHeight<imageWidth,'landscape instead of the reported vertical strip');
 assert.ok(Number(image.getAttribute('height'))>2*displayedHeight,'removing auto recreates the >2x oversized image');
 // Contain preserves the whole source rectangle, including face and both hands.
 const scale=Math.min(imageWidth/dimensions.width,displayedHeight/dimensions.height);
 assert.ok(Math.abs(dimensions.height*scale-displayedHeight)<.001);
 assert.ok(Math.abs(dimensions.width*scale-imageWidth)<.001);
 dom.window.close();
});

function contrastRatio(a,b){
 const luminance=hex=>{let value=hex.replace('#','');if(value.length===3)value=value.split('').map(n=>n+n).join('');const linear=[0,2,4].map(i=>parseInt(value.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return .2126*linear[0]+.7152*linear[1]+.0722*linear[2];};
 const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
for(const theme of ['light','dark'])test(`atelier reading-system arrows remain legible on the inverted ${theme} card`,()=>{
 const dom=render('stage'),d=dom.window.document;d.body.className='nijika '+theme;d.body.dataset.section='atelier';const sheets=notesSheets(d,'atelier'),card=d.querySelector('.creation-code-visual'),arrows=card.querySelectorAll('strong>span,i');
 assert.equal(arrows.length,3);
 const bg=cascade(sheets,d.body,'--bg',1180).value,ink=cascade(sheets,d.body,'--ink',1180).value;
 assert.match(bg,/^#[0-9a-f]{6}$/i);assert.match(ink,/^#[0-9a-f]{6}$/i);
 assert.equal(cascade(sheets,card,'background',1180).value,'var(--ink)');
 for(const arrow of arrows){const color=cascade(sheets,arrow,'color',1180);assert.equal(color.value,'var(--bg)');assert.equal(color.file,'atelier/css/editorial-index.css');assert.ok(contrastRatio(bg,ink)>=7,`${theme}: ${contrastRatio(bg,ink).toFixed(2)}:1`);}
 if(theme==='dark'){const old=contrastRatio('#efd176',ink);assert.ok(old<1.5,`negative control reproduces the pale yellow on pale ink failure (${old.toFixed(2)}:1)`);assert.ok(contrastRatio(bg,ink)>old*10);}
 dom.window.close();
});
