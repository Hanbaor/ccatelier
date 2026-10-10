'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ejs=require('ejs'),sharp=require('sharp'),{JSDOM}=require('jsdom');
const {url_for}=require('hexo-util');
const base=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(base,file),'utf8');
const helpers={};
vm.runInNewContext(read('scripts/nijika.js'),{require,hexo:{extend:{
 helper:{register:(name,fn)=>helpers[name]=fn},filter:{register(){}},generator:{register(){}}
}}});
const curated={v2:{hero:1672,stage:1672,notes:1536,research:1536,life:1536,lounge:1536},v3:{hero:1916,projects:1672,about:1024,guestbook:1916},v5:{'practice-room':1536}};
function context(root,scene='cover') {
 const ctx={config:{root,url:'https://atelier.test'+root},page:{nijika:scene},
  theme:{nijika:{cover:'/atelier/images/v3/hero.webp'}},nijika_writing:()=>[],
  nijika_page_metadata:()=>({documentTitle:'CC Atelier',title:'CC Atelier',description:'test',url:'https://atelier.test'+root}),
  open_graph:()=>'',export_config:()=>'',is_post:()=>false,is_home:()=>false,is_archive:()=>false,is_category:()=>false,is_tag:()=>false,is_page:()=>true};
 ctx.url_for=url_for.bind(ctx);
 ctx.nijika_art_srcset=helpers.nijika_art_srcset.bind(ctx);
 ctx.partial=name=>ejs.render(read(`custom/redefine/${name}.ejs`),ctx);
 return ctx;
}
function candidates(value){return value.split(', ').map(candidate=>{const [url,width]=candidate.split(' ');return {url,width:Number(width.slice(0,-1))};});}
for(const root of ['/','/lab/']) {
 test(`every curated candidate names an existing WebP with its real width (${root})`,async()=>{
  const ctx=context(root);
  for(const [version,images] of Object.entries(curated))for(const [name,width] of Object.entries(images)) {
   const source=`/atelier/images/${version}/${name}.webp`;
   const value=ctx.nijika_art_srcset(source);
   assert.equal(value,`${root}atelier/images/${version}/${name}-960.webp 960w, ${root}atelier/images/${version}/${name}.webp ${width}w`);
   for(const candidate of candidates(value)) {
    const file=path.join(base,'source',candidate.url.slice(root.length));
    const metadata=await sharp(file).metadata();
    assert.equal(metadata.format,'webp');assert.equal(metadata.width,candidate.width);
   }
  }
 });
 for(const [template,selector,sizes] of [
  ['cover','.home-afterhours-art img','(max-width:760px) 92vw, 60vw'],
  ['stage','.creation-scene img','(max-width:700px) 92vw, 60vw']
 ])test(`real ${template} render offers both practice candidates (${root})`,()=>{
  const ctx=context(root,template==='cover'?'cover':'atelier');
  const dom=new JSDOM(ejs.render(read(`custom/redefine/nijika/${template}.ejs`),ctx));
  try {
   const img=dom.window.document.querySelector(selector);
   assert.ok(img);assert.equal(img.getAttribute('src'),`${root}atelier/images/v5/practice-room.webp`);
   assert.equal(img.getAttribute('srcset'),`${root}atelier/images/v5/practice-room-960.webp 960w, ${root}atelier/images/v5/practice-room.webp 1536w`);
   assert.equal(img.sizes,sizes);assert.equal(img.width,1536);assert.equal(img.height,1024);
   assert.equal(img.closest('a').getAttribute('href'),`${root}studio/practice/`);
   if(template==='cover')assert.equal(img.getAttribute('loading'),'lazy');
   else assert.equal(img.getAttribute('fetchpriority'),'high');
  }finally{dom.window.close();}
 });
 test(`real cover preloads retain the same hero candidates and sizes as the picture (${root})`,()=>{
  const ctx=context(root),dom=new JSDOM(ejs.render(read('custom/redefine/nijika/head.ejs'),ctx)+ejs.render(read('custom/redefine/nijika/cover.ejs'),ctx));
  try {
   const doc=dom.window.document,img=doc.querySelector('#cover-image'),source=doc.querySelector('picture source');
   const preloads=[...doc.querySelectorAll('link[rel="preload"][as="image"]')];
   assert.equal(preloads.length,2);
   assert.equal(img.getAttribute('srcset'),`${root}atelier/images/v3/hero-960.webp 960w, ${root}atelier/images/v3/hero.webp 1916w`);
   assert.equal(source.srcset,img.getAttribute('srcset'));assert.equal(source.sizes,img.sizes);
   for(const preload of preloads) {
    assert.equal(preload.getAttribute('imagesrcset'),img.getAttribute('srcset'));
    assert.equal(preload.getAttribute('imagesizes'),img.sizes);
    assert.ok(candidates(img.getAttribute('srcset')).some(candidate=>candidate.url===preload.getAttribute('href')));
   }
  }finally{dom.window.close();}
 });
 test(`unknown/custom sources cannot manufacture nonexistent variants (${root})`,()=>{
  const ctx=context(root);
  for(const source of [undefined,null,'','/atelier/images/v4/practice-room.webp','/atelier/images/v6/practice-room.webp',
   '/atelier/images/v5/hero.webp','/atelier/images/v5/practice-room-extra.webp','/atelier/images/v5/practice-room-960.webp',
   '/atelier/images/v2/constructor.webp','/atelier/images/v3/custom.webp','/atelier/images/custom.webp',
   '/custom/atelier/images/v5/practice-room.webp','https://custom.test/atelier/images/v5/practice-room.webp',
   '//custom.test/atelier/images/v5/practice-room.webp','/atelier/images/v5/practice-room.png',
   '/atelier/images/v5/practice-room.webp?custom=1','/atelier/images/v5/practice-room.webp#custom'])
   assert.equal(ctx.nijika_art_srcset(source),'',String(source));
 });
}
test('practice candidates retain the verified geometry and smaller static transfer size',async()=>{
 const directory=path.join(base,'source/atelier/images/v5');
 const original=path.join(directory,'practice-room.webp'),small=path.join(directory,'practice-room-960.webp');
 const full=await sharp(original).metadata(),reduced=await sharp(small).metadata();
 assert.deepEqual([full.width,full.height],[1536,1024]);assert.deepEqual([reduced.width,reduced.height],[960,640]);
 assert.ok(fs.statSync(small).size<fs.statSync(original).size);
 // Candidate availability and byte sizes are tested here, not browser selection or LCP.
});
