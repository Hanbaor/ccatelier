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
test('forty-six visually reviewed entries bind exact article, image and full original SHA-256',async()=>{
 assert.equal(allowlist.length,46);assert.equal(new Set(allowlist.map(entry=>entry.filename)).size,46);
 for(const entry of allowlist) {
  assert.match(entry.sha256,/^[a-f0-9]{64}$/);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(sourceDir,image(entry)))).digest('hex'),entry.sha256);
  assert.equal(entriesForPost(identity(entry)).includes(entry),true);
  const guarded=createArticleImageAltEnhancer({sourceDir}),raw=input(entry);
  for(const post of [{...identity(entry),source_id:'different'},{...identity(entry),source:'_posts/other.md'}])assert.equal(await guarded(raw,post),raw);
  for(const suffix of ['?v=1','#x']) {
   const changedUrl=raw.replace(image(entry),image(entry)+suffix);
   assert.equal(await guarded(changedUrl,identity(entry)),changedUrl);
  }
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
   for(const alt of [entry.oldAlt+'x',' '+entry.oldAlt,entry.filename,'00000000000000000000000000000000.png']) {
    const raw=`<img src="${image(entry)}" alt="${alt}">`;
    assert.equal(await enhance(raw,identity(entry)),raw);
   }
  }
 }
});
test('wrong article, unknown images and non-exact URLs receive no fallback',async()=>{
 const entry=allowlist.find(entry=>entry.oldAlt===null),raw=input(entry),enhance=createArticleImageAltEnhancer({sourceDir});
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
 const entry=allowlist.find(entry=>entry.oldAlt===null),enhance=createArticleImageAltEnhancer({sourceDir});
 const original=`<p title="原文 &amp; 引号">可见正文</p><IMG data-caption='a > b &amp; c alt=""' src='${image(entry)}' alt='' width="1432" height="722" decoding="async" loading="lazy" />尾文`;
 const expected=original.replace("alt=''",`alt="${entry.alt}"`);
 assert.equal(await enhance(original,identity(entry)),expected);
});
test('three reviewed informational images add alt only and leave visible prose and captions unchanged',async()=>{
 const enhance=createArticleImageAltEnhancer({sourceDir});
 const expected=[
  ['131792879','e1df2de5eca5ecc16f09.png','熵公式：H(S)＝−∑（i从1到n）p(xᵢ)log₂(p(xᵢ))。'],
  ['124460411','ba63f2a7c086e0536048.png','集合{1,2,3,4}与{2,3,4,5}的运算结果：并集{1,2,3,4,5}，交集{2,3,4}，差集{1}，对称差集{1,5}。'],
  ['149880710','8ee68f08799aa1321e8a.png','10张服饰灰度样例，从左到右标注为：包、凉鞋、套头衫、凉鞋、凉鞋、连衣裙、衬衫、连衣裙、衬衫、套头衫。']
 ];
 for(const [sourceId,filename,alt] of expected) {
  const entry=allowlist.find(entry=>entry.filename===filename);
  assert.equal(entry.sourceId,sourceId);assert.equal(entry.oldAlt,null);
  assert.equal(entry.caption,undefined);assert.equal(entry.alt,alt);
  for(const caption of ['', '<figcaption>作者的解释</figcaption>']) {
   const raw=`<p>原文保持不变</p><figure class="image-caption">${input(entry)}${caption}</figure>`;
   const output=await enhance(raw,identity(entry));
   assert.equal(output,raw.replace(input(entry),`<img src="${image(entry)}" alt="${escapeAttribute(alt)}">`));
  }
 }
});
test('permutation prompt fills only its reviewed image alt and preserves captions, author text and neighboring images',async()=>{
 const entry=allowlist.find(entry=>entry.filename==='be60532e3a158247397d.png');
 const alt='全排列题面：输入自然数N（1≤N≤9），从小到大输出1到N的所有排列，每行一个。输入2时依次输出12、21；输入3时依次输出123、132、213、231、312、321。';
 assert.equal(entry.sourceId,'124338541');assert.equal(entry.source,'_posts/csdn/124338541.md');
 assert.equal(entry.oldAlt,null);assert.equal(entry.caption,undefined);assert.equal(entry.alt,alt);
 assert.equal(entry.sha256,'ee6459596e748b0b92c1737c590e64644a651e2fefb6eaefb045529de90418b1');
 const enhance=createArticleImageAltEnhancer({sourceDir});
 for(const caption of ['', '<figcaption>作者的题目解释</figcaption>']) {
  for(const target of [input(entry),`<img src="${image(entry)}" alt="">`]) {
   const raw=`<p>先来看题：</p><figure class="image-caption">${target}${caption}</figure><p>全排列的问题是最经典的dfs问题。</p><img src="/atelier/images/posts/unreviewed.png" alt=""><img src="${image(entry)}" alt="作者补充的题面说明">`;
   const output=await enhance(raw,identity(entry));
   assert.equal(output,raw.replace(target,`<img src="${image(entry)}" alt="${escapeAttribute(alt)}">`));
   assert.equal(await enhance(output,identity(entry)),output);
  }
 }
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
 const filters={},entry=allowlist.find(entry=>entry.oldAlt===null);
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
test('only exact Redefine machine captions reuse the hash-verified description',async()=>{
 const enhance=createArticleImageAltEnhancer({sourceDir});
 for(const entry of allowlist.filter(entry=>entry.oldAlt!==null)) {
  const img=input(entry),caption=`<figcaption>${escapeAttribute(entry.oldAlt)}</figcaption>`;
  const figure=body=>`<figure class="image-caption">${body}</figure>`;
  const raw=figure(img+caption),output=await enhance(raw,identity(entry));
  assert.equal(output,figure(img.replace(`alt="${entry.oldAlt}"`,`alt="${entry.alt}"`)+`<figcaption>${escapeAttribute(entry.caption??entry.alt)}</figcaption>`));
  assert.equal(await enhance(output,identity(entry)),output);
  assert.equal(await enhance(raw.replaceAll('+','&plus;'),identity(entry)),output);
  for(const wrapper of ['strong','em']) {
   const enhancedImg=img.replace(`alt="${entry.oldAlt}"`,`alt="${entry.alt}"`);
   assert.equal(await enhance(figure(`<${wrapper}>${img}${caption}</${wrapper}>`),identity(entry)),figure(`<${wrapper}>${enhancedImg}<figcaption>${escapeAttribute(entry.caption??entry.alt)}</figcaption></${wrapper}>`));
  }
  // A previously enhanced image can still have the old theme-generated caption.
  assert.equal(await enhance(figure(img.replace(entry.oldAlt,entry.alt)+caption),identity(entry)),output);
  for(const body of [
   img+'<figcaption>作者的解释</figcaption>',
   img+`<figcaption>${escapeAttribute(entry.alt)}</figcaption>`,
   img+'<figcaption>gif.latex?unverified-formula</figcaption>',
   img+`<figcaption><span>${escapeAttribute(entry.oldAlt)}</span></figcaption>`,
   img+`<figcaption title="作者标记">${escapeAttribute(entry.oldAlt)}</figcaption>`,
   img+`<figcaption> ${escapeAttribute(entry.oldAlt)}</figcaption>`,
   img+caption+caption,img+img+caption,
   `<strong title="author">${img}${caption}</strong>`,
   `<strong>${img}${caption}</strong>`+caption,
   `<strong>${img}${caption}</strong>`+img,
   `<a>${img}</a>`+caption,img+caption+'<!-- author note -->'
  ]) {
   const raw=figure(body),result=await enhance(raw,identity(entry));
   assert.equal(result.replaceAll(`alt="${entry.alt}"`,`alt="${entry.oldAlt}"`),raw);
  }
  for(const wrapper of ['<figure>','<figure class="image-caption custom">','<figure class="image-caption" id="author">']) {
   const raw=wrapper+img+caption+'</figure>';
   assert.equal((await enhance(raw,identity(entry))).replace(`alt="${entry.alt}"`,`alt="${entry.oldAlt}"`),raw);
  }
  assert.equal(await enhance(raw,{...identity(entry),source_id:'other'}),raw);
  assert.equal(await createArticleImageAltEnhancer({sourceDir:'/nonexistent'})(raw,identity(entry)),raw);
 }
});
test('real Hexo loader, Warehouse posts and native cache rendering apply all forty-six descriptions from actual Markdown',async()=>{
 const Hexo=require('hexo'),frontMatter=require('hexo-front-matter');
 for(const root of ['/','/lab/']) {
  // No init/load/generate or database save: only real in-memory Hexo APIs.
  const hexo=new Hexo(base,{silent:true});hexo.config.root=root;
  hexo.theme.config={articles:{style:{image_caption:true}}};
  await hexo.loadPlugin(require.resolve('hexo-theme-redefine/scripts/filters/img-handle.js'));
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
   assert.equal(attrs.alt,entry.alt);
   if(entry.oldAlt!==null) {
    assert.ok(post.content.includes(`<figcaption>${escapeAttribute(entry.caption??entry.alt)}</figcaption>`));
    assert.ok(!post.content.includes(`<figcaption>${escapeAttribute(entry.oldAlt)}</figcaption>`));
   } else {
    assert.ok(!post.content.includes(`<figcaption>${escapeAttribute(entry.alt)}</figcaption>`),'alt-only entries must not introduce visible captions');
   }
   assert.ok(Number(attrs.width)>0);assert.ok(Number(attrs.height)>0);
   assert.equal(post._content,frontMatter.parse(fs.readFileSync(post.full_source,'utf8'))._content);
  }
  // Only this fully reviewed article is expected to have no machine labels.
  const reviewed=allowlist.filter(entry=>entry.sourceId==='124338392');
  assert.equal(reviewed.length,31);
  for(const entry of reviewed) {
   assert.equal(typeof entry.caption,'string');assert.ok(entry.caption.length<=24);
  }
  const article=hexo.model('Post').findOne({source_id:'124338392'});
  const captions=[];
  function checkLabels(node) {
   if(node.name==='img')assert.doesNotMatch(node.attribs.alt||'',/gif\.latex\?|[a-f0-9]{20,}\.(?:png|jpe?g)/i);
   if(node.name==='figcaption') {
    assert.equal(node.children.length,1);assert.equal(node.children[0].type,'text');
    const label=node.children[0].data;captions.push(label);
    assert.doesNotMatch(label,/gif\.latex\?|[a-f0-9]{20,}\.(?:png|jpe?g)/i);
   }
   for(const child of node.children||[])checkLabels(child);
  }
  checkLabels(parseDocument(article.content));
  assert.equal(captions.length,31);
  assert.deepEqual(captions.slice().sort(),reviewed.map(entry=>entry.caption).sort());
  // Native cached rerender must respect an author edit to the original source.
  const entry=allowlist.find(entry=>entry.oldAlt===null),post=hexo.model('Post').findOne({source_id:entry.sourceId});
  post._content=post._content.replace(`![](${image(entry)})`,`![作者的新说明](${image(entry)})`);
  await post.save();
  await hexo.execFilter('before_generate',null,{context:hexo});
  assert.equal(findImage(hexo.model('Post').findOne({source_id:entry.sourceId}).content,entry).alt,'作者的新说明');
 }
});
