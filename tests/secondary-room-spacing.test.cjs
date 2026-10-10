const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),{parse}=require('rrweb-cssom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const paths=[...read('custom/redefine/nijika/head.ejs').matchAll(/url_for\('(atelier\/css\/[^']+\.css)'\)/g)].map(match=>match[1]);
// JSDOM does not evaluate media queries or geometry. Select the real responsive
// rules explicitly; these tests cover cascade and DOM transitions, not pixels.
function screenRules(rules,width){
 return Array.from(rules).flatMap(rule=>{
  if(!rule.cssRules)return [rule.cssText];
  if(rule.media){
   const condition=rule.media.mediaText;
   if(/\bprint\b/.test(condition))return [];
   if([...condition.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)].some(([,bound,value])=>bound==='max'?width>+value:width<+value))return [];
  }
  return screenRules(rule.cssRules,width);
 }).join('\n');
}
const sheets=paths.map(file=>parse(read((file==='atelier/css/redefine.css'?'public/':'source/')+file)).cssRules);
const collection=read('custom/redefine/nijika/lounge.ejs').match(/<section class="lounge-card collection-card">[\s\S]*?<\/section>/)[0];
const privacy=read('custom/redefine/nijika/guestbook.ejs').match(/<p class="guestbook-rules">[\s\S]*?<\/p>/)[0];
const emptySelector='.room-lounge [data-reading-list]:has(>.community-empty:only-child)';
function fixture(width,theme){
 const styles=sheets.map(rules=>'<style>'+screenRules(rules,width)+'</style>').join('');
 return new JSDOM(`${styles}<body class="nijika ${theme}"><main class="atelier-room room-lounge">${collection}</main><section class="guestbook-compose">${privacy}</section></body>`);
}
function mountShelf(dom,saved,recent){
 const document=dom.window.document,lists={saved,recent};
 const code=read('source/atelier/js/after-hours.js').split('function discovery() {')[1].split('\nfunction passport()')[0];
 vm.runInNewContext('function discovery() {'+code+'\ndiscovery();',{
  document,$:selector=>document.querySelector(selector),$$:selector=>[...document.querySelectorAll(selector)],
  loadList:key=>lists[key],saveList:(key,list)=>{lists[key]=list;}
 });
 return selector=>dom.window.getComputedStyle(document.querySelector(selector));
}
for(const width of [1440,768,398,360])for(const theme of ['light','dark']){
 test(`secondary-room spacing preserves empty and populated shelves at ${width}px ${theme}`,()=>{
  const dom=fixture(width,theme),doc=dom.window.document;
  try{
   const style=mountShelf(dom,[],Array.from({length:12},(_,i)=>({path:`/notes/${i}/`,title:'较长的中文阅读条目标题，依然可以换行并且保留阅读列表容量 '+i})));
   const shelf=doc.querySelector('[data-reading-list]');
   assert.ok(shelf.matches(emptySelector));
   assert.equal(style('[data-reading-list]').height,'auto');
   assert.equal(style('.community-empty').paddingTop,'16px');
   assert.equal(style('.community-empty').paddingBottom,'16px');
   assert.equal(style('.community-empty').overflowWrap,'anywhere');
   assert.equal(style('.community-empty').maxHeight,'');
   assert.equal(style('.community-empty').whiteSpace,'');
   assert.match(shelf.textContent,/在文章末尾展开「阅读工具」并收藏，留待下次。/);
   doc.querySelector('[data-reading-list-tab="recent"]').click();
   assert.ok(!shelf.matches(emptySelector));
   assert.equal(shelf.querySelectorAll('.reading-shelf-row').length,12);
   assert.equal(style('[data-reading-list]').height,width<=760?'153px':'132px');
   assert.equal(style('[data-reading-list]').overflow,'auto');
   assert.equal(doc.querySelector('[data-reading-list-tab="recent"]').getAttribute('aria-pressed'),'true');
   doc.querySelector('[data-reading-list-tab="saved"]').click();
   assert.equal(style('[data-reading-list]').height,'auto');
   assert.match(doc.querySelector('.lounge-fine-print').textContent,/仅保存在这台浏览器。/);
   assert.equal(style('.guestbook-rules').fontSize,'13px');
   assert.equal(style('.guestbook-rules').lineHeight,width<=760?'1.85':'1.9');
   assert.match(doc.querySelector('.guestbook-rules').textContent,/昵称与留言将公开显示。请别留下电话、住址等私人信息。/);
  }finally{dom.window.close();}
 });
 test(`removing the last saved entry and switching to empty recents reflows at ${width}px ${theme}`,()=>{
  const dom=fixture(width,theme),doc=dom.window.document;
  try{
   const style=mountShelf(dom,[{path:'/notes/saved/',title:'已收藏文章'}],[]);
   assert.equal(style('[data-reading-list]').height,width<=760?'153px':'132px');
   assert.equal(doc.querySelector('[data-saved-count]').textContent,'01');
   doc.querySelector('.reading-shelf-row>button').click();
   assert.equal(style('[data-reading-list]').height,'auto');
   assert.equal(doc.querySelector('[data-saved-count]').textContent,'00');
   doc.querySelector('[data-reading-list-tab="recent"]').click();
   assert.equal(style('[data-reading-list]').height,'auto');
   assert.match(doc.querySelector('[data-reading-list]').textContent,/读过的文章，会在这里留下足迹。/);
   doc.querySelector('[data-reading-list-tab="saved"]').click();
   assert.equal(style('[data-reading-list]').height,'auto');
  }finally{dom.window.close();}
 });
}
