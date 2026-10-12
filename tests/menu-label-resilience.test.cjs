'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ejs=require('ejs');
const {JSDOM}=require('jsdom'),{parse}=require('rrweb-cssom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const head=read('custom/redefine/nijika/head.ejs');
const menu=read('custom/redefine/nijika/dialogs.ejs').split('</dialog>')[0]+'</dialog>';
const parsed=new Map();
function screenRules(rules,width){
 return [...rules].flatMap(rule=>{
  if(!rule.cssRules)return [rule.cssText];
  if(rule.media){
   const condition=rule.media.mediaText;
   if(/print|prefers-|hover/.test(condition))return [];
   if([...condition.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)].some(([,bound,value])=>bound==='max'?width>+value:width<+value))return [];
  }
  return screenRules(rule.cssRules,width);
 }).join('\n');
}
function fixture(route,width){
 const markup=ejs.render(head,{page:{nijika:route},theme:{nijika:{cover:''}},nijika_page_metadata:()=>({}),
  is_post:()=>false,is_page:()=>false,is_home:()=>false,is_archive:()=>false,is_category:()=>false,is_tag:()=>false,
  url_for:value=>'/'+value,nijika_art_srcset:()=>'',open_graph:()=>'',export_config:()=>''});
 const paths=[...markup.matchAll(/<link rel="stylesheet" href="\/([^\"]+)"/g)].map(match=>match[1]);
 const styles=paths.map(file=>{
  // JSDOM cannot resolve family variables in a font shorthand. Substitute only
  // the family token so the real unitless leading remains inspectable.
  if(!parsed.has(file))parsed.set(file,parse(read((['atelier/css/redefine.css','atelier/css/archive-global.css'].includes(file)?'public/':'source/')+file).replace(/var\(--chinese\)/g,'sans-serif')).cssRules);
  return `<style>${screenRules(parsed.get(file),width)}</style>`;
 }).join('');
 return new JSDOM(styles+`<body class="nijika light ${route==='cover'?'on-cover':''}" data-section="${route}">`+ejs.render(menu,{
  url_for:value=>'/lab/'+value,nijika_art_srcset:()=>'',partial:()=>'<svg aria-hidden="true"></svg>'
 })+'</body>');
}

// This verifies the actual route cascade and content-sizing rules, not rendered
// wrapping or browser text zoom. JSDOM has no pixel layout or font measurement.
for(const route of ['cover','atelier','about'])for(const [width,columns] of [
 [320,'minmax(0,1.15fr) minmax(0,1fr)'],[390,'minmax(0,1.05fr) minmax(0,1fr)'],
 [700,'minmax(0,1fr) minmax(0,.85fr)'],[1180,'minmax(0,1.05fr) minmax(0,1fr)']
])test(`menu long labels retain content-sized rows on ${route} at ${width}px`,()=>{
 const dom=fixture(route,width),doc=dom.window.document,style=node=>dom.window.getComputedStyle(node);
 try{
  const layout=doc.querySelector('.menu-v3-layout'),nav=layout.querySelector('nav');
  assert.equal(style(layout).gridTemplateColumns.replace(/\s*,\s*/g,','),columns);
  assert.equal(style(nav).minWidth,'0');
  const links=[...nav.querySelectorAll('a')];
  links[0].querySelector('span').textContent='LongUnbrokenNavigationDestination'.repeat(8);
  links[1].querySelector('span').textContent='创作室里的音乐与技术研究笔记'.repeat(8);
  for(const link of links){
   const label=link.querySelector('span'),arrow=link.querySelector('svg');
   assert.equal(style(label).minWidth,'0');
   assert.equal(style(label).overflowWrap,'anywhere');
   assert.notEqual(style(label).whiteSpace,'nowrap');
   assert.equal(style(arrow).flexShrink,'0');
   assert.ok(parseFloat(style(link).minHeight)>=44);
   assert.ok(['','auto'].includes(style(link).height));
   assert.ok(['','none'].includes(style(link).maxHeight));
   assert.ok(!['clip','hidden'].includes(style(link).overflow));
   assert.equal(style(link).lineHeight,'1.5');
  }
  const dialog=doc.querySelector('dialog');
  assert.equal(style(dialog).overflow,'auto');
  assert.equal(style(dialog).height,'auto');
  assert.match(style(dialog).maxHeight,/100dvh/);
  assert.equal(links.length,9);
  links[0].focus();assert.equal(doc.activeElement,links[0]);
  assert.equal(links[0].getAttribute('href'),'/lab/atelier/');
  assert.equal(doc.querySelector('.menu-scene').querySelectorAll('img').length,1);
 }finally{dom.window.close();}
});
