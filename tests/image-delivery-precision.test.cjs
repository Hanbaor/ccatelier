'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const sharp=require('sharp'),ejs=require('ejs'),{JSDOM}=require('jsdom');
const {localImagePath,createArticleImageEnhancer}=require('../tools/article-images.cjs');
const {allowlist,createArticleImageAltEnhancer}=require('../tools/article-image-alts.cjs');
const base=path.resolve(__dirname,'..'),sourceDir=path.join(base,'source');
const read=file=>fs.readFileSync(path.join(base,file),'utf8');
const stem='/atelier/images/posts/9f96d32fa0ab600a4aea',webp=stem+'.webp';
const sha=data=>crypto.createHash('sha256').update(data).digest('hex');
const helpers={};
vm.runInNewContext(read('scripts/nijika.js'),{require,hexo:{extend:{helper:{register:(name,fn)=>helpers[name]=fn},filter:{register(){}},generator:{register(){}}}}});
function render(name,root='/') {
 const context={page:{nijika:'cover'},theme:{nijika:{cover:'/atelier/images/v3/hero.webp'}},
  url_for:value=>root+String(value).replace(/^\//,''),nijika_writing:()=>[],partial:()=>'',
  nijika_page_metadata:()=>({documentTitle:'CC',title:'CC',description:'test',url:'https://example.test'+root}),
  open_graph:()=>'',export_config:()=>'',is_post:()=>false,is_home:()=>false,is_archive:()=>false,is_category:()=>false,is_tag:()=>false,is_page:()=>true};
 context.nijika_art_srcset=helpers.nijika_art_srcset.bind(context);
 return ejs.render(read(`custom/redefine/nijika/${name}.ejs`),context);
}
test('the retained PNG and lossless WebP decode to byte-identical full-size RGBA',async()=>{
 const pngFile=path.join(sourceDir,stem+'.png'),webpFile=path.join(sourceDir,webp);
 const png=fs.readFileSync(pngFile),encoded=fs.readFileSync(webpFile);
 assert.equal(png.length,6026865);assert.equal(sha(png),'a56cd92678ccf9975045493a72272b533a30c2b08283694fced49e0b9ac31842');
 assert.equal(encoded.length,3894804);assert.ok(encoded.length<png.length);
 const original=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const result=await sharp(encoded).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 assert.equal(result.info.width,3464);assert.equal(result.info.height,2380);assert.equal(result.info.channels,4);
 assert.deepEqual(result.info,original.info);assert.ok(result.data.equals(original.data),'all RGBA bytes match, with no resizing or crop');
 const metadata=await sharp(encoded).metadata();assert.equal(metadata.format,'webp');assert.equal(metadata.pages||1,1);
});
test('only the large article illustration URL changes; its existing alt remains untouched',()=>{
 const markdown=read('source/_posts/csdn/131792879.md');
 assert.equal(markdown.split('\n')[12],`![](${webp})`);
 assert.equal(markdown.split(webp).length-1,1);assert.ok(!markdown.includes(stem+'.png'));
 assert.ok(!allowlist.some(entry=>entry.filename.startsWith('9f96d32fa0ab600a4aea')),'no existing human-written description is bypassed');
});
for(const root of ['/','/lab/']) {
 test(`WebP URL, exact metadata, original alt and offline collection remain compatible (${root})`,async()=>{
  const url=root+webp.slice(1),input=`<img src="${url}" alt="">`;
  assert.equal(localImagePath(url,root),path.basename(webp));
  const geometry=createArticleImageEnhancer({sourceDir,root});
  const describe=createArticleImageAltEnhancer({sourceDir,root});
  const html=await describe(await geometry(input),{source_id:'131792879',source:'_posts/csdn/131792879.md'});
  const dom=new JSDOM(html);
  try {const img=dom.window.document.querySelector('img');assert.equal(img.getAttribute('src'),url);assert.equal(img.getAttribute('alt'),'');assert.equal(img.width,3464);assert.equal(img.height,2380);assert.equal(img.loading||img.getAttribute('loading'),'eager');assert.equal(img.getAttribute('decoding'),'async');}finally{dom.window.close();}
  assert.equal(await geometry(html),html);
  const {articleResources}=await import('../source/atelier/js/offline-resources.mjs');
  const {cacheableURL}=await import('../source/atelier/js/offline-core.mjs');
  const origin='https://example.test';
  assert.deepEqual(articleResources(html,origin+root+'writing/csdn-131792879/',origin+root),[origin+url]);
  assert.ok(cacheableURL(url,origin+root));
 });
 test(`wide-stage picture and both preloads share crop-aware candidates/sizes (${root})`,async()=>{
  const cover=render('cover',root),head=render('head',root),dom=new JSDOM(head+cover);
  try {
   const doc=dom.window.document,source=doc.querySelector('picture source'),img=doc.querySelector('#cover-image');
   const phone=doc.querySelector('link[as="image"][media="(max-width:600px)"]'),desktop=doc.querySelector('link[as="image"][media="(min-width:601px)"]');
   const candidates=`${root}atelier/images/v3/hero-960.webp 960w, ${root}atelier/images/v3/hero.webp 1916w`;
   assert.equal(source.media,'(max-width:600px)');assert.equal(source.srcset,candidates);assert.equal(phone.getAttribute('imagesrcset'),source.srcset);
   assert.equal(source.sizes,'(max-width:500px) calc(130vw - 52px), (max-width:760px) 119.6vw, 1916px');assert.equal(phone.getAttribute('imagesizes'),source.sizes);
   assert.equal(phone.getAttribute('href'),root+'atelier/images/v3/hero-960.webp');
   assert.equal(img.getAttribute('srcset'),candidates);assert.equal(img.sizes,'(max-width:500px) calc(130vw - 52px), (max-width:760px) 119.6vw, 1916px');assert.equal(desktop.getAttribute('imagesizes'),img.sizes);assert.equal(desktop.getAttribute('imagesrcset'),candidates);
   assert.equal(source.sizes,img.sizes);assert.equal(desktop.getAttribute('href'),root+'atelier/images/v3/hero.webp');
   assert.equal(img.width,1916);assert.equal(img.height,821);assert.equal(img.getAttribute('fetchpriority'),'high');
   for(const [filename,width] of [['hero-960.webp',960],['hero.webp',1916]])assert.equal((await sharp(path.join(sourceDir,'atelier/images/v3',filename)).metadata()).width,width);
   const {articleResources}=await import('../source/atelier/js/offline-resources.mjs');
   const resources=articleResources(head+cover,'https://example.test'+root,'https://example.test'+root);
   for(const filename of ['hero-960.webp','hero.webp'])assert.ok(resources.includes('https://example.test'+root+'atelier/images/v3/'+filename));
  }finally{dom.window.close();}
 });
 test(`article zoom opens the full-resolution WebP using click and keyboard (${root})`,()=>{
  const url=root+webp.slice(1),dom=new JSDOM(`<div class="article-body"><img src="${url}" alt="" width="3464" height="2380"></div><dialog id="image-dialog"><img><figcaption></figcaption></dialog><div class="reading-progress"><span></span></div>`,{url:'https://example.test'+root});
  try {
   const doc=dom.window.document;let opened=0;
   vm.runInNewContext(read('source/atelier/js/reading.js').replace(/^import[^\n]+\n/,'').replace('export function','function')+'\ninitReading();',{
    document:doc,window:dom.window,$:(s,within=doc)=>within.querySelector(s),$$:(s,within=doc)=>[...within.querySelectorAll(s)],
    openDialog:id=>{assert.equal(id,'image-dialog');opened++;},toast(){},innerHeight:900,scrollY:0,requestAnimationFrame:()=>0,matchMedia:()=>({matches:false})});
   const img=doc.querySelector('.article-body img'),large=doc.querySelector('dialog img');
   for(const activate of [()=>img.click(),()=>img.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',cancelable:true})),()=>img.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:' ',cancelable:true}))]) {activate();assert.equal(large.src,'https://example.test'+url);assert.equal(large.alt,'');}
   assert.equal(opened,3);assert.equal(img.getAttribute('aria-label'),'放大图片：文章图片');
   doc.querySelector('dialog').dispatchEvent(new dom.window.Event('close'));assert.equal(doc.activeElement,img);
  }finally{dom.window.close();}
 });
}
test('wide-stage sizes include actual gutter, mobile cover crop and conservative full-resolution desktop selection',async()=>{
 const head=read('custom/redefine/nijika/head.ejs'),css=read('source/atelier/css/personal-home.css'),layout=read('source/atelier/css/immersive.css');
 assert.ok(head.indexOf('css/editorial.css')<head.indexOf('css/immersive.css'));
 assert.match(layout,/--page-gutter:clamp\(20px,4vw,56px\)/);assert.match(layout,/--layout-width:1200px/);
 assert.match(css,/width:min\(var\(--layout-width\),calc\(100% - 2 \* var\(--page-gutter\)\)\)/);
 const edition=css.slice(css.indexOf('/* Home edition:'));
 assert.match(edition,/\.personal-home\.home-edition \.personal-portrait\{position:absolute;inset:0;aspect-ratio:auto/);
 assert.match(edition,/\.personal-home\.home-edition \.personal-portrait img\{object-position:center;transform:translateX\(var\(--portrait-x,0\)\) scale\(1\.012\)/);
 // Read the current edition's mobile rules, not superseded legacy portrait styles.
 const mobile=edition.slice(edition.indexOf('@media(max-width:760px)'));
 assert.match(mobile,/\.personal-home\.home-edition \.personal-portrait\{position:relative;inset:auto;order:1;z-index:0;aspect-ratio:1\.8;width:100%\}/);
 assert.match(mobile,/\.personal-home\.home-edition \.personal-portrait img\{object-position:75% center;transform:none\}/);
 assert.match(css,/\.personal-portrait img \{[^}]*object-fit:cover/);
 const asset=await sharp(path.join(sourceDir,'atelier/images/v3/hero.webp')).metadata();
 assert.equal(asset.width,1916);assert.equal(asset.height,821);
 const scale=asset.width/asset.height/1.8;
 // Round up the 1.29655 cover multiplier to 1.30, under 0.3% overhead.
 assert.equal(Math.ceil(scale*100)/100,1.30);
 for(const width of [320,360,390,430,500,501,600,601,760]) {
  const frame=Math.min(1200,width-2*Math.min(56,Math.max(20,width*.04)));
  const declared=width<=500?1.30*width-52:1.196*width;
  assert.ok(declared>=frame*scale&&declared<frame*scale*1.003,`crop-aware mobile source width at ${width}px`);
 }
 assert.ok((1.30*390-52)*2<=960,'390px/2x can use 960w after the wider, unscaled mobile crop');
 assert.ok((1.30*430-52)*2>960,'430px/2x can request the original rather than under-sample');
 // Desktop is text-height-driven, not fixed to its CSS min-height. Request the
 // complete 1916w asset conservatively rather than claiming an exact crop slot.
 // There are only 960w and 1916w candidates: this avoids under-sampling if text
 // wraps or the title stack grows, without adding an extra candidate/download.
 assert.match(edition,/min-height:540px/);
 assert.match(edition,/\.personal-home\.home-edition \.personal-portrait img\{object-position:center;transform:translateX\(var\(--portrait-x,0\)\) scale\(1\.012\)/);
 assert.equal(asset.width,1916,'desktop sizes selects the original, not an invented intermediate asset');
 assert.match(head,/\(max-width:500px\) calc\(130vw - 52px\), \(max-width:760px\) 119\.6vw, 1916px/);
});
test('actual Markdown rendering preserves all article content, image metadata and reviewed descriptions',async()=>{
 const Hexo=require('hexo'),frontMatter=require('hexo-front-matter');
 const raw=read('source/_posts/csdn/131792879.md'),data=frontMatter.parse(raw);
 for(const root of ['/','/lab/']) {
  // Real renderer only, with no init/load/generate, filesystem output or database save.
  const hexo=new Hexo(base,{silent:true});hexo.config.root=root;
  await hexo.loadPlugin(require.resolve('hexo-renderer-marked'));
  const geometry=createArticleImageEnhancer({sourceDir,root}),describe=createArticleImageAltEnhancer({sourceDir,root});
  const renderArticle=async text=>describe(await geometry(hexo.render.renderSync({text,engine:'md'})),{source_id:'131792879',source:'_posts/csdn/131792879.md'});
  const current=await renderArticle(data._content),previous=await renderArticle(data._content.replace(webp,stem+'.png'));
  assert.equal(current.replace(webp,stem+'.png'),previous,'the complete rendered article differs only by this image URL');
  const dom=new JSDOM(current);
  try {
   const images=[...dom.window.document.images],first=images[0];
   assert.equal(first.getAttribute('src'),root+webp.slice(1));assert.equal(first.width,3464);assert.equal(first.height,2380);
   assert.ok(!first.hasAttribute('alt')||first.alt==='','original missing description stays unchanged');
   for(const entry of allowlist.filter(entry=>entry.sourceId==='131792879')) {
    const image=images.find(image=>image.getAttribute('src').endsWith('/'+entry.filename));assert.equal(image.alt,entry.alt);
   }
  }finally{dom.window.close();}
 }
});
test('tablet-only stage crop retains the drumming gesture without moving phone or wide artwork',async()=>{
 const css=read('source/atelier/css/personal-home.css');
 assert.match(css,/@media\(min-width:761px\) and \(max-width:1000px\)\{\s*\.personal-home\.home-edition \.personal-portrait img\{object-position:90% center\}/);
 const asset=await sharp(path.join(sourceDir,'atelier/images/v3/hero.webp')).metadata();
 // Visually estimated from the authored source: the far hand/gesture extends
 // to roughly x=1750. This guards the crop geometry, not pixel segmentation.
 const gesture={left:1020,right:1750};
 for(const viewport of [761,800,900,1000]){
  const frame=viewport-2*Math.max(20,viewport*.04);
  // The tablet stage uses 500px minimum height. Check extra text growth too;
  // the browser QA separately verifies real glyph placement and face overlap.
  for(const height of [500,540,580]){
   const scale=Math.max(frame/asset.width,height/asset.height);
   const croppedWidth=asset.width*scale-frame;
   const left=croppedWidth*.9/scale,right=left+frame/scale;
   // Account for the artwork's 1.012 overscan and maximum 1.5px pointer drift.
   const inset=frame/scale*(1-1/1.012)/2+1.5/scale;
   assert.ok(left+inset<gesture.left&&right-inset>gesture.right,`${viewport}×${height}: visible source x=${left.toFixed(0)}–${right.toFixed(0)}`);
  }
 }
});
