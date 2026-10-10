'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),vm=require('node:vm');
const {parseDocument}=require('htmlparser2');
const {allowlist,entriesForPost,escapeAttribute,createArticleImageAltEnhancer}=require('../tools/article-image-alts.cjs');
const {createArticleImageEnhancer}=require('../tools/article-images.cjs');
const base=path.resolve(__dirname,'..'),sourceDir=path.join(base,'source');
const identity=entry=>({source_id:entry.sourceId,source:entry.source});
const image=entry=>'/atelier/images/posts/'+entry.filename;
const input=entry=>`<img src="${image(entry)}"${entry.oldAlt===null?'':` alt="${entry.oldAlt}"`}>`;
const imageAttrs=html=>parseDocument(html).children.find(node=>node.name==='img').attribs;
test('twelve visually reviewed entries bind exact article, image and full original SHA-256',async()=>{
 assert.equal(allowlist.length,12);assert.equal(new Set(allowlist.map(entry=>entry.filename)).size,12);
 for(const entry of allowlist) {
  assert.match(entry.sha256,/^[a-f0-9]{64}$/);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(sourceDir,image(entry)))).digest('hex'),entry.sha256);
  assert.equal(entriesForPost(identity(entry)).includes(entry),true);
  for(const root of ['/','/lab/']) {
   const enhance=createArticleImageAltEnhancer({sourceDir,root});
   for(const prefix of root==='/'?['']:['','/lab']) {
    const raw=input(entry).replace('src="/','src="'+prefix+'/');
    const output=await enhance(raw,identity(entry));
    assert.equal(imageAttrs(output).alt,entry.alt);assert.equal(imageAttrs(output).src,prefix+image(entry));
    assert.equal(await enhance(output,identity(entry)),output);
   }
  }
 }
});
test('only absent or exactly empty alt is filled; meaningful author text and formula states are preserved',async()=>{
 const enhance=createArticleImageAltEnhancer({sourceDir});
 for(const entry of allowlist) {
  for(const alt of ['作者描述','实验输出',' ','不同编码串','&quot;作者 &amp; 图&quot;']) {
   const raw=`<img src="${image(entry)}" alt="${alt}">`;
   assert.equal(await enhance(raw,identity(entry)),raw);
  }
  const empty=`<IMG src='${image(entry)}' alt='' width='12' loading='eager' />`;
  if(entry.oldAlt===null) {
   const out=await enhance(empty,identity(entry));
   assert.equal(imageAttrs(out).alt,entry.alt);assert.equal(imageAttrs(out).width,'12');assert.equal(imageAttrs(out).loading,'eager');
  } else {
   for(const raw of [empty,`<img src="${image(entry)}">`,`<img src="${image(entry)}" alt="gif.latex?(2022)_9">`])assert.equal(await enhance(raw,identity(entry)),raw);
  }
 }
});
test('wrong article, unknown images and non-exact URLs receive no fallback',async()=>{
 const entry=allowlist[0],raw=input(entry),enhance=createArticleImageAltEnhancer({sourceDir});
 for(const post of [{},{source_id:entry.sourceId},{source:entry.source},{...identity(entry),source_id:'different'},{...identity(entry),source:'_posts/other.md'},{...identity(entry),source_id:Number(entry.sourceId)}])assert.equal(await enhance(raw,post),raw);
 for(const src of [image(entry)+'?v=1',image(entry)+'#x','/lab'+image(entry),'https://example.com'+image(entry),'//example.com'+image(entry),image(entry).replace('0d10','%30d10'),'/atelier/images/posts/../'+entry.filename,'/atelier/images/posts/unknown.png']) {
  const html=`<img src="${src}">`;assert.equal(await enhance(html,identity(entry)),html);
 }
 for(const html of [`<img src="${image(entry)}" srcset="x 2x">`,`<img src="${image(entry)}" data-src="x">`,`<picture>${raw}</picture>`,`<div aria-hidden="true">${raw}</div>`,`<img hidden src="${image(entry)}">`,`<img role="presentation" src="${image(entry)}">`,`<img alt="" alt="作者描述" src="${image(entry)}">`])assert.equal(await enhance(html,identity(entry)),html);
});
test('original bytes are rechecked across calls; missing, changed and escaped files fail closed',async()=>{
 for(const entry of allowlist) {
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'article-image-alts-'));
 try {
  const dir=path.join(temp,'atelier/images/posts');fs.mkdirSync(dir,{recursive:true});
  const file=path.join(dir,entry.filename),raw=input(entry),enhance=createArticleImageAltEnhancer({sourceDir:temp});
  assert.equal(await enhance(raw,identity(entry)),raw);
  const original=fs.readFileSync(path.join(sourceDir,image(entry)));fs.writeFileSync(file,original);
  assert.equal(imageAttrs(await enhance(raw,identity(entry))).alt,entry.alt);
  const mutated=Buffer.from(original);mutated[mutated.length-1]^=1;fs.writeFileSync(file,mutated);
  assert.equal(await enhance(raw,identity(entry)),raw);
  fs.unlinkSync(file);fs.symlinkSync(path.join(sourceDir,image(entry)),file);
  assert.equal(await enhance(raw,identity(entry)),raw);
 } finally { fs.rmSync(temp,{recursive:true,force:true}); }
 }
});
test('attribute escaping is safe and existing surrounding markup is byte-preserved',async()=>{
 assert.equal(escapeAttribute('"<&\'>'),'&quot;&lt;&amp;&#39;&gt;');
 const entry=allowlist[0],enhance=createArticleImageAltEnhancer({sourceDir});
 const original=`<p title="原文 &amp; 引号">可见正文</p><IMG data-caption='a > b &amp; c alt=""' src='${image(entry)}' alt='' width="1432" height="722" decoding="async" loading="lazy" />尾文`;
 const expected=original.replace("alt=''",`alt="${entry.alt}"`);
 assert.equal(await enhance(original,identity(entry)),expected);
});
test('geometry and alt filters commute without losing attributes, changing source bytes or visible content',async()=>{
 for(const root of ['/','/lab/']) {
  const geometry=createArticleImageEnhancer({sourceDir,root}),alts=createArticleImageAltEnhancer({sourceDir,root});
  for(const entry of allowlist) {
   const raw=input(entry),post=identity(entry);
   const first=await geometry(await alts(raw,post));
   const second=await alts(await geometry(raw),post);
   assert.deepEqual(imageAttrs(first),imageAttrs(second));
   const before=imageAttrs(await geometry(raw)),after=imageAttrs(second);
   for(const [name,value] of Object.entries(before))if(name!=='alt')assert.equal(after[name],value);
   assert.equal(after.alt,entry.alt);
   assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(sourceDir,image(entry)))).digest('hex'),entry.sha256);
  }
 }
});
test('independent Hexo filter uses priority 21 and only refreshes eligible source-backed post caches',async()=>{
 const filters={},entry=allowlist[0];
 let saved=0;
 const matching={...identity(entry),content:input(entry),_content:'author markdown',save:async()=>{saved++;}};
 const unknown={source_id:'unknown',source:'_posts/unknown.md',content:input(entry),_content:'author markdown'};
 const noSource={...identity(entry),content:input(entry)};
 const context={require:name=>require(path.resolve(base,'scripts',name)),hexo:{source_dir:sourceDir,config:{root:'/lab/'},model:name=>{assert.equal(name,'Post');return {toArray:()=>[matching,unknown,noSource]};},extend:{filter:{register:(name,fn,priority)=>{filters[name]=fn;assert.equal(priority,name==='before_generate'?6:21);}}}}};
 vm.runInNewContext(fs.readFileSync(path.join(base,'scripts/article-image-alts.js'),'utf8'),context);
 await filters.before_generate();assert.equal(saved,1);assert.equal(matching.content,undefined);assert.equal(matching._content,'author markdown');assert.equal(unknown.content,input(entry));assert.equal(noSource.content,input(entry));
 const post={...identity(entry),title:'原标题',content:input(entry).replace('src="/','src="/lab/')};
 assert.equal(await filters.after_post_render(post),post);assert.equal(post.title,'原标题');assert.equal(imageAttrs(post.content).alt,entry.alt);
 const authorEdited={...identity(entry),content:`<img src="${image(entry)}" alt="作者后来补充的说明">`,_content:'author edited markdown'};
 await filters.after_post_render(authorEdited);assert.equal(imageAttrs(authorEdited.content).alt,'作者后来补充的说明');
});
test('real Hexo loader, Warehouse posts and native cache rendering apply all twelve descriptions from actual Markdown',async()=>{
 const Hexo=require('hexo'),frontMatter=require('hexo-front-matter');
 for(const root of ['/','/lab/']) {
  // No init/load/generate or database save: only real in-memory Hexo APIs.
  const hexo=new Hexo(base,{silent:true});hexo.config.root=root;
  await hexo.loadPlugin(require.resolve('hexo-renderer-marked'));
  await hexo.loadPlugin(path.join(base,'scripts/article-images.js'));
  await hexo.loadPlugin(path.join(base,'scripts/article-image-alts.js'));
  require('hexo/dist/plugins/filter/after_post_render')(hexo);
  hexo.extend.filter.register('before_generate',require('hexo/dist/plugins/filter/before_generate/render_post'),10);
  const posts=new Map();
  for(const entry of allowlist) {
   if(posts.has(entry.sourceId))continue;
   const raw=fs.readFileSync(path.join(sourceDir,entry.source),'utf8'),data=frontMatter.parse(raw);
   const post=await hexo.model('Post').insert({...data,source:entry.source,slug:'csdn/'+entry.sourceId,raw,content:'<p>stale cache</p>'+input(entry)});
   assert.equal(post.constructor.name,'_Document');assert.equal(post.source_id,entry.sourceId);
   assert.equal(post.full_source,path.join(sourceDir,entry.source));
   posts.set(entry.sourceId,post);
  }
  const observed=[];
  hexo.extend.filter.register('after_post_render',data=>{
   assert.equal(data.constructor.name,'_Document');assert.ok(posts.has(data.source_id));
   assert.equal(data.source,`_posts/csdn/${data.source_id}.md`);
   assert.equal(data.full_source,path.join(sourceDir,data.source));
   observed.push(data.source_id);return data;
  },22);
  await hexo.execFilter('before_generate',null,{context:hexo});
  assert.equal(observed.length,posts.size);
  function findImage(html,entry) {
   let found;function visit(node){if(node.name==='img'&&node.attribs.src.endsWith('/'+entry.filename))found=node.attribs;for(const child of node.children||[])visit(child);}
   visit(parseDocument(html));return found;
  }
  for(const entry of allowlist) {
   const post=hexo.model('Post').findOne({source_id:entry.sourceId}),attrs=findImage(post.content,entry);
   assert.equal(attrs.alt,entry.alt);assert.ok(Number(attrs.width)>0);assert.ok(Number(attrs.height)>0);
   assert.equal(post._content,frontMatter.parse(fs.readFileSync(post.full_source,'utf8'))._content);
  }
  // Native cached rerender must respect an author edit to the original source.
  const entry=allowlist[0],post=hexo.model('Post').findOne({source_id:entry.sourceId});
  post._content=post._content.replace(`![](${image(entry)})`,`![作者的新说明](${image(entry)})`);
  await post.save();
  await hexo.execFilter('before_generate',null,{context:hexo});
  assert.equal(findImage(hexo.model('Post').findOne({source_id:entry.sourceId}).content,entry).alt,'作者的新说明');
 }
});
