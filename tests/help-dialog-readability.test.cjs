'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ejs=require('ejs');
const {JSDOM}=require('jsdom'),{parse}=require('rrweb-cssom');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const head=read('custom/redefine/nijika/head.ejs');
const help=read('custom/redefine/nijika/dialogs.ejs').match(/<dialog id="help-dialog"[\s\S]*?<\/dialog>/)[0];
const routes=[['cover','generated'],['atelier','generated'],['studio','generated'],['guestbook','generated'],['notes','generated'],['article','post'],['ordinary','page']];
function sheetPaths(route,type){
 const page=['article','ordinary'].includes(route)?{}:{nijika:route};
 const html=ejs.render(head,{page,theme:{nijika:{cover:''}},nijika_page_metadata:()=>({}),
  is_post:()=>type==='post',is_page:()=>type==='page',is_home:()=>false,is_archive:()=>false,is_category:()=>false,is_tag:()=>false,
  url_for:v=>'/'+v,nijika_art_srcset:()=>'',open_graph:()=>'',export_config:()=>''});
 return [...html.matchAll(/<link rel="stylesheet" href="\/([^\"]+)"/g)].map(m=>m[1]);
}
function screenRules(rules,width){
 return [...rules].flatMap(rule=>{
  if(!rule.cssRules)return [rule.cssText];
  if(rule.media){
   const condition=rule.media.mediaText;
   if(/\bprint\b/.test(condition))return [];
   const sizes=[...condition.matchAll(/\((min|max)-(width|height):\s*(\d+)px\)/g)];
   if(sizes.some(([,bound,axis,size])=>bound==='max'?(axis==='width'?width:850)>+size:(axis==='width'?width:850)<+size))return [];
  }
  return screenRules(rule.cssRules,width);
 }).join('\n');
}
const parsed=new Map();
function sheet(file,width){
 // Compiled theme is read-only. Every authored sheet is read from source, in the
 // real route's EJS order. No build or public-file writes occur in this test.
 if(!parsed.has(file))parsed.set(file,parse(read((file==='atelier/css/redefine.css'?'public/':'source/')+file)).cssRules);
 return screenRules(parsed.get(file),width);
}
function fixture(route,type,width,theme){
 const paths=sheetPaths(route,type),styles=paths.map(file=>`<style>${sheet(file,width)}</style>`).join('');
 const markup=ejs.render(help,{url_for:v=>'/'+v});
 const dom=new JSDOM(`${styles}<body class="nijika ${theme}" data-section="${route}">${markup}</body>`);
 return {dom,paths};
}
function contrast(a,b){
 const luminance=hex=>{const channels=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};
 const [x,y]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (x+.05)/(y+.05);
}
for(const [route,type] of routes)for(const width of [393,1180])for(const theme of ['light','dark']){
 test(`help functional text survives ${route} route cascade at ${width}px ${theme}`,()=>{
  const {dom,paths}=fixture(route,type,width,theme),doc=dom.window.document,style=selector=>dom.window.getComputedStyle(doc.querySelector(selector));
  try{
   assert.ok(paths.indexOf('atelier/css/atelier.css')<paths.indexOf('atelier/css/after-hours.css'));
   assert.ok(paths.indexOf('atelier/css/after-hours.css')<paths.indexOf('atelier/css/immersive.css'));
   for(const selector of ['.help-shortcuts p','.help-shortcuts kbd','.help-shortcuts p>span','.help-links>a','.help-links>button','.credits-note']){
    assert.ok(parseFloat(style(selector).fontSize)>=13,selector+' readable size');
    assert.ok(parseFloat(style(selector).lineHeight)>=1.5,selector+' Chinese-friendly leading');
   }
   assert.equal(style('.help-shortcuts p>span').fontSize,'14px');
   assert.equal(style('.help-shortcuts p>span').minWidth,'0');
   for(const selector of ['.help-shortcuts p>span','.help-links>a','.help-links>button','.credits-note'])assert.equal(style(selector).overflowWrap,'anywhere');
   assert.equal(style('.help-shortcuts kbd').whiteSpace,'nowrap');
   for(const selector of ['.help-links>a','.help-links>button']){
    assert.equal(style(selector).whiteSpace,'normal');assert.equal(style(selector).maxWidth,'100%');
   }
   assert.equal(doc.querySelectorAll('.help-links>a').length,5);assert.equal(doc.querySelectorAll('.help-links>button').length,2);
   assert.equal(doc.querySelector('.close-button').dataset.close,'help-dialog');
   // JSDOM does not resolve inherited CSS variables. Check the actual final body
   // palette separately; browser QA owns wrapping, geometry, focus and Escape.
   const body=dom.window.getComputedStyle(doc.body),surface=body.getPropertyValue('--surface').trim();
   for(const token of ['--text','--yellow','--ink'])assert.ok(contrast(body.getPropertyValue(token).trim(),surface)>=4.5,token+' contrast');
  }finally{dom.window.close();}
 });
}
test('help correction remains scoped, with original native controls and text',()=>{
 const css=read('source/atelier/css/after-hours.css').split('/* Help is functional reading, including its local-storage and moderation notice. */')[1];
 assert.ok(css);for(const rule of parse(css).cssRules)for(const selector of rule.selectorText.split(','))assert.ok(selector.startsWith('#help-dialog '));
 assert.match(css,/#help-dialog \.credits-note\{[^}]*color:var\(--text\)/);
 assert.match(help,/留言审核后公开；来访按浏览器去重，同一页面每半小时计一次。/);
});
