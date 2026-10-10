const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const {pageMetadata} = require('../tools/site-metadata.cjs');
const root = path.resolve(__dirname, '..');
const head = fs.readFileSync(path.join(root, 'custom/redefine/nijika/head.ejs'), 'utf8');
const shared = ['fonts','redefine','atelier','content','effects','stage','after-hours','archive','stage-engine','daylight','refinement','editorial','immersive','navigation-scenes'];
function styles(page = {}, type = 'generated', prefix = '/') {
  const context = {
    page, config: {title:'CC Atelier', description:'Test', url:'https://example.test'+prefix, root:prefix}, theme: {nijika:{cover:'/cover.webp'}},
    is_post: () => type === 'post', is_page: () => type === 'page', is_home: () => type === 'home',
    is_category: () => type === 'category', is_tag: () => type === 'tag', is_archive: () => type === 'archive',
    url_for: value => prefix + value.replace(/^\//,''), full_url_for: value => 'https://example.test' + prefix + value,
    nijika_list_title: () => 'Archive', nijika_art_srcset: () => '', open_graph: () => '', export_config: () => ''
  };
  context.nijika_page_metadata = () => pageMetadata(context);
  const html = ejs.render(head, context);
  return [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match => match[1]);
}
const cases = [
  ['cover',{nijika:'cover'},'generated',false,false],
  ['atelier',{nijika:'atelier'},'generated',false,false],
  ['notes',{nijika:'notes'},'generated',false,false],
  ['home pagination',{},'home',false,false],
  ['archives/categories/tags listing',{},'generated',false,false],
  ['studio',{nijika:'studio'},'generated',false,true],
  ['practice',{nijika:'practice'},'generated',false,false],
  ['guestbook',{nijika:'guestbook'},'generated',false,false],
  ['lounge',{nijika:'lounge'},'generated',false,false],
  ['admin',{nijika:'admin'},'generated',false,false],
  ...['projects','research','life','about','categories','tags'].map(nijika => [nijika,{nijika},'page',false,false]),
  ['article',{content:'<p>Article</p>'},'post',true,false],
  ['empty article',{},'post',true,false],
  ['ordinary page',{content:'<p>Page</p>'},'page',true,false],
  ['empty ordinary page',{},'page',true,false],
  ['unknown custom page',{nijika:'future-page'},'page',true,false],
  ['series with introduction',{nijika:'notes',introHtml:'<p>Original introduction</p>'},'generated',true,false],
  ['series without introduction',{nijika:'notes'},'generated',false,false]
];
test('route stylesheet selection preserves reading and studio dependencies at root and /lab/', () => {
  for (const prefix of ['/','/lab/']) for (const [name,page,type,reader,studio] of cases) {
    const links = styles(page,type,prefix), css = file => prefix+'atelier/css/'+file+'.css';
    assert.equal(links.includes(css('reader')),reader,name+' reader');
    assert.equal(links.includes(css('studio')),studio,name+' studio');
    assert.equal(new Set(links).size,links.length,name+' duplicate stylesheet');
    for (const file of shared) assert.ok(links.includes(css(file)),name+' shared '+file);
    assert.ok(links.indexOf(css('archive')) < links.indexOf(css('stage-engine')));
    if (reader) assert.ok(links.indexOf(css('archive')) < links.indexOf(css('reader')) && links.indexOf(css('reader')) < links.indexOf(css('stage-engine')));
    if (studio) assert.ok(links.indexOf(css('archive')) < links.indexOf(css('studio')) && links.indexOf(css('studio')) < links.indexOf(css('stage-engine')));
  }
});
test('existing conditional styles and content utility styles are retained', () => {
  const has = (page,type,file) => styles(page,type).includes('/'+file);
  for (const nijika of ['cover','studio']) assert.ok(has({nijika},'generated','atelier/css/livehouse.css'));
  assert.ok(has({nijika:'practice'},'generated','atelier/css/practice.css'));
  assert.ok(has({nijika:'projects'},'page','atelier/css/projects.css'));
  for (const [page,type] of [[{nijika:'notes'},'generated'],[{},'home'],[{},'post']]) assert.ok(has(page,type,'atelier/css/content-catalog.css'));
  assert.ok(has({content:'<p class="fa-solid">Text</p>'},'post','css/build/tailwind.css'));
  assert.ok(has({content:'<p class="fa-solid">Text</p>'},'post','fontawesome/solid.min.css'));
});
test('page template dispatch stays aligned with the reader stylesheet guard', () => {
  const pageTemplate=fs.readFileSync(path.join(root,'custom/redefine/page.ejs'),'utf8');
  for (const [,page,type,reader] of cases.filter(entry => entry[2] === 'page')) {
    const rendered=ejs.render(pageTemplate,{page,partial: value=>value}).trim();
    assert.equal(rendered==='nijika/post',reader,'page dispatch for '+(page.nijika||'ordinary'));
  }
  assert.match(fs.readFileSync(path.join(root,'custom/redefine/nijika/series.ejs'),'utf8'), /page\.introHtml[\s\S]*class="article-body markdown-body"/);
});
test('removed links reduce selected source bytes without changing shared styles', () => {
  const bytes = file => fs.statSync(path.join(root,'source/atelier/css',file+'.css')).size;
  const removed = (page,type) => ['reader','studio'].filter(file=>!styles(page,type).includes('/atelier/css/'+file+'.css')).reduce((sum,file)=>sum+bytes(file),0);
  assert.equal(removed({nijika:'cover'},'generated'),bytes('reader')+bytes('studio'));
  assert.equal(removed({},'post'),bytes('studio'));
  assert.equal(removed({nijika:'studio'},'generated'),bytes('reader'));
});

const legacyScenes = ['backstage','live-art','rooms-v2'];
const sceneCases = [
  ['cover',{nijika:'cover'},'generated',['live-art']],
  ['atelier',{nijika:'atelier'},'generated',['backstage']],
  ...['projects','research','life','about','lounge','guestbook'].map(nijika=>[nijika,{nijika},'generated',['rooms-v2']]),
  ...['notes','studio','practice','admin','categories','tags'].map(nijika=>[nijika,{nijika},'generated',[]]),
  ...['post','home','archive','category','tag'].map(type=>[type,{},type,[]]),
  ['series introduction',{nijika:'notes',introHtml:'<p>Reading introduction</p>'},'generated',[]],
  ['ordinary page',{content:'<p>Custom page</p>'},'page',legacyScenes],
  ['empty ordinary page',{},'page',legacyScenes],
  ['unknown page',{nijika:'future-page'},'page',legacyScenes],
  ['unknown generated route',{nijika:'future-room'},'generated',legacyScenes],
  ['unknown post template',{nijika:'future-post'},'post',legacyScenes],
  ['legacy unclassified listing',{},'generated',legacyScenes],
  ['404 fallback',{layout:'404'},'generated',legacyScenes]
];
test('legacy scene styles follow audited template identities and keep unknown fallbacks at root and /lab/',()=>{
  for(const prefix of ['/','/lab/']) for(const [name,page,type,expected] of sceneCases) {
    for(const route of ['original/index.html','alias/unrelated-name/index.html']) {
      const links=styles({...page,path:route},type,prefix);
      const selected=legacyScenes.filter(file=>links.includes(prefix+'atelier/css/'+file+'.css'));
      assert.deepEqual(selected,expected,`${prefix} ${name} ${route}`);
      // The smaller set is still server-rendered, with the original cascade positions.
      for(const [file,before,after] of [['backstage','stage','after-hours'],['live-art','stage-engine','daylight'],['rooms-v2','editorial','immersive']]) {
        if(!expected.includes(file)) continue;
        const index=name=>links.indexOf(prefix+'atelier/css/'+name+'.css');
        assert.ok(index(before)<index(file)&&index(file)<index(after),name+' '+file+' cascade position');
      }
    }
  }
});
test('scene guards preserve globally generated dialogs, queue, offline rows and accessibility styles',()=>{
  for(const prefix of ['/','/lab/']) for(const [name,page,type] of sceneCases) {
    const links=styles(page,type,prefix);
    for(const file of ['atelier','content','after-hours','archive','stage-engine','refinement','editorial','immersive','navigation-scenes'])
      assert.ok(links.includes(prefix+'atelier/css/'+file+'.css'),name+' shared dynamic styles '+file);
  }
  const read=file=>fs.readFileSync(path.join(root,file),'utf8');
  const archive=read('source/atelier/css/archive.css');
  for(const selector of ['.live-dialog','.live-dialog-head','.live-dialog-tools','.live-status','.queue-row','.queue-history'])assert.ok(archive.includes(selector),selector);
  assert.match(read('source/atelier/js/queue.js'),/makeDialog\('queue-dialog'/);
  assert.match(read('source/atelier/js/offline.js'),/makeDialog\('offline-dialog'/);
  assert.match(read('source/atelier/js/offline.js'),/element\('div','queue-row'/);
  assert.match(read('custom/redefine/layout.ejs'),/partial\('nijika\/dialogs'\)/);
  for(const selector of ['.sequencer','.sequence-row','.rhythm-bottom','.help-shortcuts'])assert.ok(read('source/atelier/css/after-hours.css').includes(selector),selector);
  assert.match(read('source/atelier/css/stage-engine.css'),/\.sr-only\{/);
  assert.match(read('source/atelier/js/route-features.js'),/notice.className='sr-only'/);
  // Offline restoration serves the complete saved HTML and its styles; this change must not prune the shell.
  assert.match(read('scripts/live-archive.js'),/\['js','css','fonts'\]/);
  assert.match(read('custom/live-sw.template'),/articleResources\(html,articleURL,BASE\)/);
});
