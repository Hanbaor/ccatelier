const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ejs=require('ejs'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const collection=items=>({length:items.length,each:fn=>items.forEach(fn)});
const originalPosts=[
  {title:'旧笔记',path:'writing/older/',date:'2025-01-01'},
  {title:'题面 & <img src=x onerror=alert(1)>',path:'hot100/001/',date:'2026-01-03'},
  {title:'中间笔记',path:'writing/middle/',date:'2026-01-02'},
  {title:'最近笔记',path:'writing/latest/',date:'2026-01-04'},
  {title:'未发布草稿',path:'draft/private/',date:'2027-01-01',published:false}
];
function render(prefix='/',categories=[{name:'算法 & <测试>',path:'categories/算法/',length:107,posts:collection(originalPosts)},{name:'空分类',path:'categories/empty/',length:0,posts:collection([])}]){
  return new JSDOM(ejs.render(read('custom/redefine/nijika/categories.ejs'),{
    site:{categories:collection(categories)},url_for:value=>encodeURI(prefix+value.replace(/^\//,'')),
    date_xml:value=>new Date(value).toISOString(),date:value=>value.replaceAll('-','.')
  }));
}
for(const prefix of ['/','/lab/'])test('category directory is a native, escaped reading directory at '+prefix,()=>{
  const dom=render(prefix),d=dom.window.document;
  try{
    assert.equal(d.querySelectorAll('h1').length,1);
    assert.equal(d.querySelector('.archive-count').textContent,'2 个分类');
    assert.equal(d.querySelectorAll('.category-directory-entry').length,2);
    const entry=d.querySelector('.category-directory-entry'),link=entry.querySelector('.category-directory-link');
    assert.equal(entry.querySelector('h2').textContent,'算法 & <测试>');
    assert.equal(link.querySelector('small').textContent,'107 篇');
    assert.equal(decodeURI(link.getAttribute('href')),prefix+'categories/算法/');
    assert.equal(d.getElementById(entry.getAttribute('aria-labelledby')),entry.querySelector('h2'));
    const previews=[...entry.querySelectorAll('.category-directory-preview li a')];
    assert.equal(previews.length,3);
    assert.deepEqual(previews.map(a=>a.querySelector('span').textContent),['最近笔记','题面 & <img src=x onerror=alert(1)>','中间笔记']);
    assert.equal(previews[0].getAttribute('href'),prefix+'writing/latest/');
    assert.equal(previews[1].getAttribute('href'),prefix+'hot100/001/');
    assert.equal(previews[0].querySelector('time').getAttribute('datetime'),'2026-01-04T00:00:00.000Z');
    assert.equal(previews[0].querySelector('time').textContent,'2026.01.04');
    assert.equal(d.querySelector('img,测试,script,button,a a,[hidden]'),null);
    assert.doesNotMatch(d.body.textContent,/未发布草稿|完整解析|掌握|完成度/);
    assert.match(d.querySelector('.category-directory-empty').textContent,/还没有文章/);
    assert.equal(d.querySelector('.archive-return').getAttribute('href'),prefix+'notes/');
    assert.equal(d.querySelector('.taxonomy-nav [aria-current=page]').getAttribute('href'),prefix+'categories/');
    assert.ok([...d.querySelectorAll('a')].every(a=>a.getAttribute('href').startsWith(prefix)));
    assert.equal(originalPosts[0].title,'旧笔记','sorting does not mutate source collection');
  }finally{dom.window.close();}
});
test('empty directory and one-post category need no invented previews',()=>{
  const empty=render('/',[]);assert.equal(empty.window.document.querySelector('.archive-count').textContent,'0 个分类');assert.ok(empty.window.document.querySelector('.empty-hint'));empty.window.close();
  const one=render('/',[{name:'随笔',path:'categories/随笔/',length:1,posts:collection(originalPosts.slice(0,1))}]);
  assert.equal(one.window.document.querySelectorAll('.category-directory-preview li').length,1);one.window.close();
});
test('category CSS is scoped, touch-friendly, responsive and theme-token based',()=>{
  const css=read('source/atelier/css/category-directory.css'),dom=new JSDOM('<style>'+css+'</style>');
  function inspect(rules){for(const rule of rules){if(rule.cssRules)inspect(rule.cssRules);else if(rule.selectorText)for(const selector of rule.selectorText.split(','))assert.ok(selector.trim().startsWith('.category-directory '),selector);}}
  inspect(dom.window.document.styleSheets[0].cssRules);
  assert.match(css,/min-height:44px/);assert.match(css,/max-width:600px/);assert.match(css,/max-width:360px/);
  assert.match(css,/focus-visible/);assert.match(css,/var\(--ink\)/);assert.match(css,/var\(--muted\)/);
  assert.doesNotMatch(css,/\b(?:font-size|font):\s*(?:[0-9]|1[012])px/);
  dom.window.close();
});
test('category stylesheet is served only for the category directory and respects prefixes',()=>{
  const head=read('custom/redefine/nijika/head.ejs');
  for(const prefix of ['/','/lab/'])for(const scene of ['categories','tags','notes','cover','research']){
    const html=ejs.render(head,{page:{nijika:scene},theme:{nijika:{cover:'/cover.webp'}},nijika_page_metadata:()=>({documentTitle:'Test',description:'',title:'Test',url:'https://example.test/'}),is_post:()=>false,is_home:()=>false,is_archive:()=>false,is_category:()=>false,is_tag:()=>false,is_page:()=>true,url_for:value=>prefix+value.replace(/^\//,''),open_graph:()=>'',export_config:()=>'',nijika_art_srcset:()=>''});
    const styles=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match=>match[1]);
    assert.equal(styles.includes(prefix+'atelier/css/category-directory.css'),scene==='categories',prefix+scene);
    if(scene==='categories')assert.ok(styles.indexOf(prefix+'atelier/css/category-directory.css')>styles.indexOf(prefix+'atelier/css/immersive.css'));
  }
});
