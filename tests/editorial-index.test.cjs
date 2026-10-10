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
