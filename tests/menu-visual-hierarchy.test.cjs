'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ejs=require('ejs');
const {JSDOM}=require('jsdom'),{parse}=require('rrweb-cssom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const head=read('custom/redefine/nijika/head.ejs');
const menu=read('custom/redefine/nijika/dialogs.ejs').split('</dialog>')[0]+'</dialog>';
const cache=new Map();
function pathsFor(route){
 const html=ejs.render(head,{page:route==='article'?{}:{nijika:route},theme:{nijika:{cover:''}},nijika_page_metadata:()=>({}),
  is_post:()=>route==='article',is_page:()=>route==='ordinary',is_home:()=>false,is_archive:()=>false,is_category:()=>false,is_tag:()=>false,
  url_for:v=>'/'+v,nijika_art_srcset:()=>'',open_graph:()=>'',export_config:()=>''});
 return [...html.matchAll(/<link rel="stylesheet" href="\/([^\"]+)"/g)].map(m=>m[1]);
}
function flatten(rules,width,reduced){
 return [...rules].flatMap(rule=>{
  if(rule.type===7)return []; // Keyframes are checked in the scene tests.
  if(!rule.cssRules)return [rule.cssText];
  if(rule.media){
   const q=rule.media.mediaText;
   if(/print/.test(q)||(/prefers-reduced-motion:\s*reduce/.test(q)&&!reduced))return [];
   if([...q.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)].some(([,bound,n])=>bound==='max'?width>+n:width<+n))return [];
  }
  return flatten(rule.cssRules,width,reduced);
 }).join('\n');
}
function fixture(route,width,light,reduced=false){
 const paths=pathsFor(route),sources=paths.map(file=>{
  // JSDOM lets an earlier font shorthand mask later font-weight longhands.
  // Expand this unchanged menu baseline without changing its declaration order.
  if(!cache.has(file))cache.set(file,parse(read((['atelier/css/redefine.css','atelier/css/archive-global.css'].includes(file)?'public/':'source/')+file)
   .replace(/font:400 24px\/1.5 var\(--chinese\)/g,'font-weight:400;font-size:24px;line-height:1.5;font-family:sans-serif')
   .replace(/var\(--chinese\)/g,'sans-serif')).cssRules);
  // Pseudo-state substitution verifies declarations/cascade only, never real
  // hover hit-testing or keyboard focus-ring rendering in a browser.
  return flatten(cache.get(file),width,reduced).replace(/:focus-visible/g,'.test-focus').replace(/:hover/g,'.test-hover');
 });
 const dom=new JSDOM(sources.map(css=>`<style>${css}</style>`).join('')+`<body class="nijika ${light?'light light-mode':'dark-mode'} ${route==='cover'?'on-cover':''}" data-section="${route}">`+ejs.render(menu,{
  url_for:v=>'/lab/'+v,nijika_art_srcset:()=>'',partial:()=>'<svg aria-hidden="true"></svg>'
 })+'</body>');
 dom.window.document.documentElement.classList.toggle('dark',!light);
 // Resolve these body palette tokens only: JSDOM does not resolve var() colors.
 const palette=dom.window.getComputedStyle(dom.window.document.body);
 const colors=Object.fromEntries(['muted','yellow','ink','bg'].map(name=>[name,palette.getPropertyValue('--'+name).trim()]));
 [...dom.window.document.querySelectorAll('style')].forEach((style,i)=>{style.textContent=sources[i].replace(/var\(--(muted|yellow|ink|bg)\)/g,(_,name)=>colors[name]);});
 return {dom,paths,colors};
}
function contrast(a,b){
 const luminance=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const [high,low]=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (high+.05)/(low+.05);
}
const rgb=hex=>'rgb('+hex.slice(1).match(/../g).map(v=>parseInt(v,16)).join(', ')+')';
for(const route of ['cover','atelier','about','studio','article','ordinary'])for(const width of [320,700,1180])for(const light of [true,false]){
 test(`quiet menu retains structure and state hierarchy: ${route}, ${width}px, ${light?'light':'dark'}`,()=>{
  const {dom,paths,colors}=fixture(route,width,light),doc=dom.window.document,style=n=>dom.window.getComputedStyle(n);
  try{
   assert.ok(paths.indexOf('atelier/css/navigation-scenes.css')>paths.indexOf('atelier/css/immersive.css'));
   const links=[...doc.querySelectorAll('.menu-v3-layout > nav > a')];
   assert.equal(links.length,9);
   for(const name of ['ink','yellow','muted'])assert.ok(contrast(colors[name],colors.bg)>=4.5,name+' remains readable on the menu surface');
   const layout=doc.querySelector('.menu-v3-layout');
   assert.equal(style(layout).gridTemplateColumns.replace(/\s*,\s*/g,','),width<=360?'minmax(0,1.15fr) minmax(0,1fr)':width<=760?'minmax(0,1fr) minmax(0,.85fr)':'minmax(0,1.05fr) minmax(0,1fr)');
   assert.equal(style(layout.querySelector('nav')).minWidth,'0');
   assert.deepEqual(links.map(a=>a.dataset.menuScene),['atelier','notes','projects','research','life','about','lounge','studio','guestbook']);
   for(const link of links){
    assert.equal(style(link).borderTopWidth,'0px');assert.equal(style(link).borderBottomWidth,'0px');
    assert.equal(style(link).minHeight,width<=600?'49px':width<=760?'57px':'61px');
    assert.equal(style(link).lineHeight,'1.5');
    assert.ok(['','auto'].includes(style(link).height));
    assert.ok(['','none'].includes(style(link).maxHeight));
    assert.ok(!['hidden','clip'].includes(style(link).overflow));
    assert.equal(style(link).fontWeight,'400');
    assert.equal(style(link.querySelector('svg')).color,rgb(colors.muted));
    assert.equal(style(link.querySelector('svg')).flexShrink,'0');
    assert.equal(style(link.querySelector('span')).overflowWrap,'anywhere');
    assert.equal(link.href.endsWith('/lab/'+link.dataset.menuScene+'/'),true);
    assert.ok(link.dataset.sceneSrc&&link.dataset.sceneAlt);
   }
   const current=links[0],hover=links[1],focus=links[2];
   current.setAttribute('aria-current','page');hover.classList.add('test-hover');focus.classList.add('test-focus');focus.focus();
   assert.equal(doc.activeElement,focus);
   for(const link of [current,hover,focus]){
    assert.equal(style(link).color,rgb(colors.yellow));
    assert.equal(style(link.querySelector('svg')).color,rgb(colors.yellow));
    assert.equal(style(link).borderTopWidth,'0px');
   }
   assert.equal(style(current).fontWeight,'500','current destination has a non-color cue');
   assert.equal(style(focus).outline,`2px solid ${colors.yellow}`);
   assert.equal(style(focus).outlineOffset,'4px');
   assert.equal(style(doc.querySelector('dialog')).overflow,'auto');
   assert.equal(style(doc.querySelector('.menu-scene')).aspectRatio,'var(--menu-scene-ratio, 2 / 3)');
   assert.equal(style(doc.querySelector('.menu-scene-image')).objectFit,'contain');
  }finally{dom.window.close();}
 });
}
for(const reduced of [true,false])test(`menu scene motion can be disabled via ${reduced?'system preference':'site setting'}`,()=>{
 const {dom}=fixture('cover',320,true,reduced);
 try{
  if(!reduced)dom.window.document.body.classList.add('motion-off');
  const image=dom.window.document.querySelector('.menu-scene-image');image.classList.add('is-entering');
  assert.equal(dom.window.getComputedStyle(image).animation,'none');
 }finally{dom.window.close();}
});
