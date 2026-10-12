'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ejs=require('ejs'),{JSDOM}=require('jsdom'),sharp=require('sharp');
const base=process.env.CC_ATELIER_ROOT||path.resolve(__dirname,'..');
const patch=process.env.CC_ATELIER_PATCH_ROOT||base;
const read=file=>fs.readFileSync(path.join(base,file),'utf8');
const template=name=>fs.readFileSync(path.join(patch,`custom/redefine/nijika/${name}.ejs`),'utf8');
const helpers={};
vm.runInNewContext(read('scripts/nijika.js'),{require:require('node:module').createRequire(path.join(base,'scripts/nijika.js')),hexo:{extend:{helper:{register:(name,fn)=>helpers[name]=fn},filter:{register(){}},generator:{register(){}}}}});
const routes={notes:{selector:'.notes-editorial-heading img',asset:'v2/notes',width:1536,height:1024,alt:'日光窗边写笔记的虹夏主题插画'},studio:{selector:'.studio-soundcheck',asset:'v3/hero',width:1916,height:821,alt:'虹夏在暖金舞台上演奏鼓组的精绘主题同人插画'}};
function render(name,root='/'){
 const context={page:{posts:{each(){}}},theme:{nijika:{reading_art:'/atelier/images/v2/notes.webp',studio_art:'/atelier/images/v3/hero.webp'}},url_for:value=>root+String(value).replace(/^\//,''),partial:()=>''};
 context.nijika_art_srcset=helpers.nijika_art_srcset.bind(context);
 return new JSDOM(ejs.render(template(name),context));
}
// sizes is advisory: cache, density and data-saving policies may affect currentSrc.
// Restricted authored sizes grammar, not a native browser/network assertion.
function entries(input){let depth=0,start=0,out=[];for(let i=0;i<input.length;i++){if(input[i]==='(')depth++;if(input[i]===')')depth--;assert.ok(depth>=0);if(input[i]===','&&!depth){out.push(input.slice(start,i).trim());start=i+1;}}assert.equal(depth,0);out.push(input.slice(start).trim());return out;}
function hint(input,v){for(const part of entries(input)){const media=part.match(/^\(max-width:(\d+)px\)\s+/);if(media&&v>Number(media[1]))continue;let expr=media?part.slice(media[0].length):part;assert.ok(!/var\(|%|auto/.test(expr));expr=expr.replace(/([\d.]+)vw/g,(_,n)=>`(${Number(n)*v/100})`).replace(/([\d.]+)px/g,'$1');assert.match(expr,/^[\d\s.,()+*/\-a-z]+$/);assert.ok([...expr.matchAll(/[a-z]+/g)].every(m=>['min','max','clamp','calc'].includes(m[0])));return Function('min','max','clamp','calc',`return (${expr})`)(Math.min,Math.max,(a,b,c)=>Math.max(a,Math.min(b,c)),x=>x);}throw Error('No fallback size');}
const shell=v=>Math.min(1200,v-2*Math.min(56,Math.max(20,.04*v)));
const notesSlot=v=>v<=700?shell(v):(shell(v)-(v<=900?30:55))*21/41;
function sizes(name){const dom=render(name);try{return dom.window.document.querySelector(routes[name].selector).sizes;}finally{dom.window.close();}}
for(const root of ['/','/lab/'])for(const [name,route] of Object.entries(routes))test(`${name} keeps artwork, real candidates, dimensions and eager first-screen loading (${root})`,async()=>{
 const dom=render(name,root);
 try{const img=dom.window.document.querySelector(route.selector);assert.ok(img);
  assert.equal(img.getAttribute('src'),`${root}atelier/images/${route.asset}.webp`);
  assert.equal(img.getAttribute('srcset'),`${root}atelier/images/${route.asset}-960.webp 960w, ${root}atelier/images/${route.asset}.webp ${route.width}w`);
  assert.equal(img.width,route.width);assert.equal(img.height,route.height);assert.equal(img.alt,route.alt);
  assert.equal(img.getAttribute('loading'),null);assert.equal(img.getAttribute('decoding'),'async');assert.equal(img.getAttribute('fetchpriority'),name==='notes'?'high':null);
  for(const [suffix,width,height] of [['-960',960,name==='notes'?640:411],['',route.width,route.height]]){const m=await sharp(path.join(base,'source/atelier/images',route.asset+suffix+'.webp')).metadata();assert.equal(m.width,width);assert.equal(m.height,height);}
  assert.ok(img.sizes.length>0);
 }finally{dom.window.close();}
});
test('Notes hint exactly follows the final grid at gutter, column and gap breakpoints',()=>{
 const input=sizes('notes');
 for(const v of [320,360,390,500,501,600,699,700,701,768,899,900,901,1024,1280,1304,1305,1400,1440,1920]){
  const expected=notesSlot(v),actual=hint(input,v);assert.ok(Math.abs(actual-expected)<1e-8,`${v}: ${actual} differs from ${expected}`);
  for(const dpr of [1,2,3]){const pick=slot=>[960,1536].find(w=>w>=slot*dpr)||1536;assert.equal(pick(actual),pick(expected));}
 }
 assert.ok(460*2<960);assert.ok(hint(input,1440)*2>960,'old fixed slot underdeclared the wide 2x requirement');
 for(const v of [360,390])assert.ok(hint(input,v)*2<960,'small phones need no larger candidate for Notes');
 const css=read('source/atelier/css/editorial-index.css'),layout=read('source/atelier/css/immersive.css');
 assert.match(layout,/--layout-width:1200px/);assert.match(layout,/--page-gutter:clamp\(20px,4vw,56px\)/);
 assert.match(css,/\.live-archive\.catalog-v3 \{width:min\(var\(--layout-width\),calc\(100% - 2 \* var\(--page-gutter\)\)\);max-width:none;padding-inline:0\}/);
 assert.match(css,/\.catalog-v3 \.notes-editorial-heading \{grid-template-columns:1fr 1\.05fr;gap:55px/);
 assert.match(css,/@media\(max-width:900px\)\s*\{\s*\.catalog-v3 \.notes-editorial-heading \{gap:30px\}/);
 assert.match(css,/@media\(max-width:700px\)\s*\{\s*\.catalog-v3 \.notes-editorial-heading \{grid-template-columns:1fr;gap:26px/);
 assert.match(css,/\.notes-editorial-heading figure img \{display:block;width:100%;height:auto;min-height:0;aspect-ratio:3 \/ 2;object-fit:contain;object-position:center\}/);
});
test('Studio requests the existing full original conservatively for its text-height-driven cover crop',()=>{
 const input=sizes('studio');assert.equal(input,'1916px');
 // Min-height is a lower bound, not a measured rendered height. Text may grow.
 // Full-original selection follows Home's policy and avoids pretending 100vw
 // describes the source width when object-fit:cover crops a wide stage to portrait.
 for(const v of [320,360,390,600,601,768,800,801,1024,1440,1920]){
  const h=v<=600?410:v<=800?390:420;
  const lowerBound=Math.max(shell(v)*(v<=600?1:.84),h*1916/821);
  assert.ok(hint(input,v)>=lowerBound);
  for(const dpr of [1,2])assert.equal([960,1916].find(w=>w>=hint(input,v)*dpr)||1916,1916);
 }
 assert.ok(390*2<960);assert.ok(410*1916/821*2>960,'phone crop requires more pixels than the old viewport-only hint budgets');
 const css=read('source/atelier/css/studio.css'),daylight=read('source/atelier/css/daylight.css');
 assert.match(daylight,/\.studio-soundcheck\{position:absolute;[^}]*height:100%;object-fit:cover/);
 assert.match(css,/\.studio-editorial \.studio-mast\.studio-illustrated\{min-height:420px;padding:44px/);
 assert.match(css,/\.studio-editorial \.studio-soundcheck\{width:84%;object-position:64% 30%/);
 const tablet=css.slice(css.indexOf('@media(max-width:800px)')),mobile=css.slice(css.indexOf('@media(max-width:600px){.music-studio.studio-editorial'));
 assert.match(tablet,/\.studio-editorial \.studio-mast\.studio-illustrated\{min-height:390px;padding:34px/);
 assert.match(mobile,/\.studio-editorial \.studio-mast\.studio-illustrated\{min-height:410px;padding:95px 23px 28px/);
 assert.match(mobile,/\.studio-editorial \.studio-soundcheck\{width:100%;object-position:82% 25%;opacity:\.7;mask-image:linear-gradient\(0deg,transparent,#000 95%\)\}/);
});
