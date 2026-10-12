'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ejs=require('ejs');
const {JSDOM}=require('jsdom'),{parse}=require('rrweb-cssom');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const context={page:{nijika:'research'},theme:{nijika:{cover:''}},nijika_page_metadata:()=>({}),
 is_post:()=>false,is_page:()=>true,is_home:()=>false,is_archive:()=>false,is_category:()=>false,is_tag:()=>false,
 url_for:v=>'/'+v,nijika_art_srcset:()=>'',open_graph:()=>'',export_config:()=>'',partial:()=>''};
const markup=ejs.render(read('custom/redefine/nijika/head.ejs'),context)+ejs.render(read('custom/redefine/nijika/research.ejs'),context);
const paths=[...markup.matchAll(/<link rel="stylesheet" href="\/([^\"]+)"/g)].map(m=>m[1]);
const sheets=paths.map(file=>parse(read((['atelier/css/redefine.css','atelier/css/archive-global.css'].includes(file)?'public/':'source/')+file)).cssRules);
function flatten(rules,width,doc){
 return [...rules].map(rule=>{
  if(rule.cssRules){
   if(rule.media){
    const condition=rule.media.mediaText;
    if(/print|prefers-reduced-motion|hover/.test(condition))return '';
    if([...condition.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)].some(([,bound,size])=>bound==='max'?width>+size:width<+size))return '';
   }
   return flatten(rule.cssRules,width,doc);
  }
  // JSDOM does not correctly cascade shorthand against subsequent font-size.
  // Expand real declarations only; selectors and their order remain unchanged.
  return rule.cssText.replace(/font:\s*([^;]+);/g,(declaration,value)=>{
   const probe=doc.createElement('span');probe.style.font=value.replace(/var\(--(?:sans|chinese|condensed)\)/g,'sans-serif');
   if(!probe.style.fontSize)return declaration;
   return ['font-style','font-variant','font-weight','font-stretch','font-size','line-height','font-family'].map(name=>probe.style.getPropertyValue(name)?`${name}:${probe.style.getPropertyValue(name)};`:'').join('');
  });
 }).join('\n');
}
function contrast(a,b){
 const luminance=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const [hi,lo]=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (hi+.05)/(lo+.05);
}
for(const width of [320,393,768,1280])for(const theme of ['light','dark'])test(`research reading text retains its final route cascade at ${width}px ${theme}`,()=>{
 const dom=new JSDOM(`<body class="nijika ${theme}" data-section="research">${markup}</body>`),doc=dom.window.document;
 try{
  assert.deepEqual(paths.slice(-2),['atelier/css/research-sql.css','atelier/css/research-local-table.css']);
  const sheet=doc.createElement('style');sheet.textContent=sheets.map(rules=>flatten(rules,width,doc)).join('\n');doc.head.append(sheet);
  const style=selector=>dom.window.getComputedStyle(doc.querySelector(selector));
  for(const selector of ['.sql-editor-help','.sql-result-heading h5','.sql-result-empty','.sql-insight p','.sql-boundaries p','.sql-plan p','.sql-plan [data-sql-plan-output]','.personal-research-caption'])
   assert.ok(parseFloat(style(selector).fontSize)>=13,selector+' readable functional text: '+style(selector).fontSize);
  for(const selector of ['.sql-lab-heading>span','.sql-result-heading span','.sql-lab caption>span','.personal-research-art figcaption'])
   assert.ok(parseFloat(style(selector).fontSize)>=12,selector+' secondary labels');
  for(const selector of ['.sql-lab summary','.sql-boundaries summary','.sql-draft-tools','.sql-share-panel p'])
   assert.ok(parseFloat(style(selector).fontSize)>=13,selector+' existing correction preserved');
  for(const selector of ['.sql-lab-heading','.sql-result-heading','.sql-draft-tools','.sql-case-switch'])assert.equal(style(selector).flexWrap,'wrap',selector+' can wrap');
  if(width<=650){assert.equal(style('.sql-lab-heading>span').maxWidth,'100%');assert.equal(style('.sql-draft-tools select').fontSize,'16px');}
  assert.equal(style('.sql-text-button').minHeight,'44px');
  // Actual body palette is checked separately because JSDOM does not resolve
  // inherited var() values. Geometry, visual wrapping and touch need browser QA.
  const body=dom.window.getComputedStyle(doc.body);
  for(const background of ['--bg','--surface'])assert.ok(contrast(body.getPropertyValue('--muted').trim(),body.getPropertyValue(background).trim())>=4.5,'muted text contrast on '+background);
  assert.equal(doc.querySelectorAll('details[open]').length,0,'disclosures remain folded');
 }finally{dom.window.close();}
});
