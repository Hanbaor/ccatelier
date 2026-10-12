'use strict';
// Real Hexo/Warehouse cache regression. No network, browser, or database-file save.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createRequire}=require('node:module');
const repo=process.env.CC_REPO||path.resolve(__dirname,'..'),req=createRequire(path.join(repo,'package.json'));
const Hexo=req('hexo'),{JSDOM}=req('jsdom');
const {allowlist}=req('./tools/article-image-alts.cjs'),{articleContent}=req('./tools/content-catalog.cjs');
const entry=allowlist.find(e=>e.sourceId==='124338541'&&e.oldAlt===null);
const imagePath='/atelier/images/posts/'+entry.filename;
const raw='原作者段落。\n\n```cpp\n  int n = 1;\n\n\treturn n;\n```\n\n![]('+imagePath+')\n';
function inspect(html,label){
 const dom=new JSDOM('<article class="article-body">'+html+'</article>'),d=dom.window.document;
 try{
  const figures=[...d.querySelectorAll('figure.highlight')],wrappers=[...d.querySelectorAll('.code-container')];
  assert.ok(figures.length>0,label+': expected real highlighted code');
  assert.equal(wrappers.length,figures.length,label+': every code block must have a wrapper');
  assert.equal(d.querySelectorAll('.code-container .code-container').length,0,label+': no nested wrappers');
  const code=figures.map(f=>{
   assert.ok(f.parentElement.classList.contains('code-container'),label+': immediate wrapper');
   assert.equal(f.getAttribute('tabindex'),'0',label+': actual scroller stays keyboard focusable');
   assert.equal(f.parentElement.hasAttribute('tabindex'),false,label+': wrapper must not take focus');
   const language=[...f.classList].find(c=>!['highlight','iseeu'].includes(c));
   assert.equal(f.parentElement.dataset.rel,language==='plain'?'Code':language[0].toUpperCase()+language.slice(1));
   return [...f.querySelectorAll('.code .line')].map(n=>n.textContent);
  });
  return {code,html,images:[...d.images].map(i=>({width:i.getAttribute('width'),height:i.getAttribute('height'),alt:i.getAttribute('alt')}))};
 }finally{dom.window.close();}
}
for(const mode of ['geometry','alt','both'])test(mode+': first render, image-triggered second, stable third, same-URL image replacement',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cc-code-cache-'));
 try{
  const hexo=new Hexo(temp,{silent:true});hexo.source_dir=path.join(temp,'source');hexo.config.root='/';hexo.config.disableNunjucks=true;
  hexo.config.syntax_highlighter='highlight.js';Object.assign(hexo.config.highlight,{enable:true,line_number:true,wrap:true,hljs:false,auto_detect:false,tab_replace:'',strip_indent:false});
  const local=path.join(hexo.source_dir,imagePath);fs.mkdirSync(path.dirname(local),{recursive:true});fs.copyFileSync(path.join(repo,'source',imagePath),local);
  // Actual pinned upstream filter, not an imitation of its _processedHighlight guard.
  await hexo.loadPlugin(req.resolve('hexo-theme-redefine/scripts/helpers/theme-helpers.js'));
  await hexo.loadPlugin(req.resolve('hexo-renderer-marked'));
  if(mode!=='alt')await hexo.loadPlugin(path.join(repo,'scripts/article-images.js'));
  if(mode!=='geometry')await hexo.loadPlugin(path.join(repo,'scripts/article-image-alts.js'));
  req('hexo/dist/plugins/highlight')(hexo);
  req('hexo/dist/plugins/filter/before_post_render')(hexo);
  req('hexo/dist/plugins/filter/after_post_render')(hexo);
  hexo.extend.filter.register('before_generate',req('hexo/dist/plugins/filter/before_generate/render_post'),10);
  let renders=0;hexo.extend.filter.register('after_post_render',data=>{renders++;return data;},100);
  const common={title:'作者标题',author:'原作者',_content:raw,raw:'original source bytes',_otherDerivedMarker:'keep',published:true};
  const post=await hexo.model('Post').insert({...common,source:entry.source,source_id:entry.sourceId,slug:'code-cache-post'});
  const page=await hexo.model('Page').insert({...common,source:'code-cache-page.md',path:'code-cache-page/'});
  const unrelated=await hexo.model('Post').insert({...common,source:'_posts/unrelated.md',slug:'unrelated',_content:'不相关正文。',content:'<p>untouched cached body</p>',_processedHighlight:true});
  const refs=[['Post',post],['Page',page]],read=(model,record)=>hexo.model(model).findById(record._id);
  const stableFields=p=>Object.fromEntries(['title','author','_content','raw','source','source_id','_otherDerivedMarker'].map(k=>[k,p[k]]));
  const originals=refs.map(([m,p])=>stableFields(read(m,p))),unrelatedBefore=JSON.stringify(read('Post',unrelated).toObject());
  const run=()=>hexo.execFilter('before_generate',null,{context:hexo});
  const snapshot=label=>refs.map(([model,record],i)=>{
   const p=read(model,record);assert.deepEqual(stableFields(p),originals[i],label+': author/source fields');assert.equal(p._processedHighlight,true);
   return inspect(articleContent(p,{reading:true}),label+' '+model);
  });
  await run();const first=snapshot('first');assert.equal(renders,2);
  assert.deepEqual(first[0].code,[['  int n = 1;','','\treturn n;']]);
  const step=mode==='alt'?1:2;
  await run();const second=snapshot('second');assert.equal(renders,2+step,'native image invalidator actually rerendered');
  assert.deepEqual(second.map(x=>x.code),first.map(x=>x.code));
  await run();const third=snapshot('third');assert.equal(renders,2+step*2);
  assert.deepEqual(third,second,'no accumulated wrappers or altered derived markup on third generation');
  assert.equal(JSON.stringify(read('Post',unrelated).toObject()),unrelatedBefore,'unrelated cache and markers untouched');
  // A different existing image is copied only into the temporary source tree.
  const replacement=path.join(repo,'source/atelier/images/posts/8198fee5ab08f9872dcc.png');
  fs.copyFileSync(replacement,local);
  await run();const fourth=snapshot('same URL, changed image bytes');assert.equal(renders,2+step*3);
  assert.deepEqual(fourth.map(x=>x.code),first.map(x=>x.code));
  if(mode!=='alt'){
   const meta=await req('sharp')(replacement).metadata();
   for(const state of fourth){assert.equal(state.images[0].width,String(meta.width));assert.equal(state.images[0].height,String(meta.height));}
  }
  if(mode==='alt')assert.equal(fourth[1].html,first[1].html,'alt invalidator does not touch Pages');
  assert.equal(JSON.stringify(read('Post',unrelated).toObject()),unrelatedBefore);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
});
