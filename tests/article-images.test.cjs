'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const sharp=require('sharp');
const {localImagePath,createArticleImageEnhancer}=require('../tools/article-images.cjs');
const base=path.resolve(__dirname,'..'),sourceDir=path.join(base,'source');
const image='/atelier/images/posts/2d4f29d4f98cf718e8b5.png';
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
test('only controlled flat local image URLs resolve, with deployment roots and encoding',()=>{
 for(const root of ['/','/lab/']) {
  assert.equal(localImagePath(image,root),'2d4f29d4f98cf718e8b5.png');
  assert.equal(localImagePath(image.replace('2d4','%32d4')+'?v=2#figure',root),'2d4f29d4f98cf718e8b5.png');
 }
 assert.equal(localImagePath('/lab'+image,'/lab/'),'2d4f29d4f98cf718e8b5.png');
 for(const src of ['https://example.com'+image,'//example.com'+image,'data:image/png;base64,a','/lab'+image,'/atelier/images/posts/../secret.png','/atelier/images/posts/%2e%2e/secret.png','/atelier/images/posts/%252e%252e.png','/atelier/images/posts/a%2fb.png','/atelier/images/posts/a%5cb.png','/atelier/images/posts/a%00.png','/atelier/images/posts/a%3fb.png','/atelier/images/posts/%broken.png','/atelier/images/other.png'])assert.equal(localImagePath(src),null,src);
});
test('adds exact dimensions without rewriting existing content or author attributes',async()=>{
 const enhance=createArticleImageEnhancer({sourceDir});
 const input=`<p>原文 &amp; 引号</p><IMG alt='原图 &amp; 描述' src='${image}' /><img src="${image}" width="100" height="50" loading="eager" decoding="sync"><img src="${image}" width="100">`;
 const output=await enhance(input),dom=new JSDOM(output),imgs=[...dom.window.document.images];
 assert.equal(imgs[0].width,831);assert.equal(imgs[0].height,213);assert.equal(imgs[0].getAttribute('loading'),'eager');assert.equal(imgs[0].getAttribute('decoding'),'async');
 assert.ok(output.startsWith('<p>原文 &amp; 引号</p><IMG alt=\'原图 &amp; 描述\' src=\''+image+'\''));
 assert.equal(imgs[1].width,100);assert.equal(imgs[1].height,50);assert.equal(imgs[1].getAttribute('decoding'),'sync');assert.equal(imgs[1].getAttribute('loading'),'eager');
 assert.equal(imgs[2].getAttribute('height'),null,'partial author dimensions stay untouched');
 assert.equal(await enhance(output),output,'idempotent');dom.window.close();
});
test('first image remains eager, larger later illustrations are lazy, formulas remain normal',async()=>{
 const names=fs.readdirSync(path.join(sourceDir,'atelier/images/posts'));
 const sizes=await Promise.all(names.map(async name=>({name,...await sharp(path.join(sourceDir,'atelier/images/posts',name)).metadata()})));
 const formula=sizes.find(s=>s.height<100);
 const enhance=createArticleImageEnhancer({sourceDir,root:'/lab/'});
 const input=`<img src="/lab${image}"><img src="${image}"><img src="/atelier/images/posts/${formula.name}">`;
 const dom=new JSDOM(await enhance(input)),imgs=[...dom.window.document.images];
 assert.deepEqual(imgs.map(i=>i.getAttribute('loading')),['eager','lazy',null]);
 assert.deepEqual(imgs.map(i=>i.getAttribute('src')),['/lab'+image,image,'/atelier/images/posts/'+formula.name]);dom.window.close();
});
test('metadata is awaited and cached; unsupported, missing, corrupt, symlink-escaped files stay unchanged',async()=>{
 let reads=0;const enhance=createArticleImageEnhancer({sourceDir,readMetadata:async file=>{reads++;await new Promise(r=>setTimeout(r,5));return sharp(file).metadata();}});
 const html=`<img src="${image}">`;
 await Promise.all([enhance(html),enhance(html)]);assert.equal(reads,1);
 const absent=createArticleImageEnhancer({sourceDir,readMetadata:null});assert.equal(await absent(html),html);
 const failure=createArticleImageEnhancer({sourceDir,readMetadata:async()=>{throw Error('metadata unavailable');}});assert.equal(await failure(html),html);
 let forbiddenReads=0;const guard=createArticleImageEnhancer({sourceDir,readMetadata:()=>{forbiddenReads++;throw Error();}});
 for(const src of ['https://example.com'+image,'/atelier/images/posts/%2e%2e/a.png','/atelier/images/posts/missing.png']){const raw=`<img src="${src}">`;assert.equal(await guard(raw),raw);}assert.equal(forbiddenReads,0);
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'article-images-'));
 try{
  const dir=path.join(temp,'atelier/images/posts');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'corrupt.png'),'not an image');fs.symlinkSync(path.join(sourceDir,image.slice(1)),path.join(dir,'escaped.png'));
  const local=createArticleImageEnhancer({sourceDir:temp});
  for(const name of ['corrupt.png','escaped.png']){const raw=`<img src="/atelier/images/posts/${name}">`;assert.equal(await local(raw),raw);}
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
 const responsive=`<img src="${image}" srcset="elsewhere.png 2x">`;assert.equal(await enhance(responsive),responsive);
 const picture=`<picture><source srcset="elsewhere.png"><img src="${image}"></picture>`;assert.equal(await enhance(picture),picture);
 for(const metadata of [{format:'svg',width:831,height:213},{format:'gif',width:831,height:213,pages:2,pageHeight:106},{format:'jpeg',width:831,height:213,orientation:6}]){
  const unsupported=createArticleImageEnhancer({sourceDir,readMetadata:async()=>metadata});assert.equal(await unsupported(html),html);
 }
});
test('all 54 current original article images retain bytes, src, alt and receive verified dimensions',async()=>{
 const enhance=createArticleImageEnhancer({sourceDir});let count=0;
 function* pages(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())yield* pages(file);else if(entry.name==='index.html')yield file;}}
 for(const file of pages(path.join(base,'public'))){
  const html=fs.readFileSync(file,'utf8');if(!html.includes('class="reader-paper"'))continue;
  const before=new JSDOM(html);const article=before.window.document.querySelector('.reader-paper .article-body');if(!article){before.window.close();continue;}
  const original=[...article.querySelectorAll('img')];
  const snapshots=original.map(img=>{const file=path.join(sourceDir,img.getAttribute('src').slice(1));return {src:img.getAttribute('src'),alt:img.getAttribute('alt'),attrs:[...img.attributes].map(attr=>[attr.name,attr.value]),file,hash:hash(file)};});
  const enhanced=await enhance(article.innerHTML);
  const normalize=html=>html.replace(/<img\b[^>]*>/gi,tag=>tag.replace(/ (?:width|height)="\d+"| decoding="async"| loading="(?:lazy|eager)"/g,''));
  assert.equal(normalize(enhanced),normalize(article.innerHTML),'only new image attributes change');
  assert.equal(await enhance(enhanced),enhanced,'already enhanced public is idempotent');
  const after=new JSDOM(enhanced),images=[...after.window.document.images];assert.equal(images.length,original.length);
  for(const [index,img] of images.entries()){
   const snapshot=snapshots[index],metadata=await sharp(snapshot.file).metadata(),size=metadata.autoOrient||metadata;
   assert.equal(img.getAttribute('src'),snapshot.src);assert.equal(img.getAttribute('alt'),snapshot.alt);assert.equal(hash(snapshot.file),snapshot.hash);
   for(const [name,value] of snapshot.attrs)assert.equal(img.getAttribute(name),value,'existing '+name+' is preserved');
   assert.equal(img.width,size.width);assert.equal(img.height,size.height);assert.equal(img.getAttribute('decoding'),'async');if(index===0)assert.equal(img.getAttribute('loading'),'eager');count++;
  }
  before.window.close();after.window.close();
 }
 assert.equal(count,54);
});
test('Hexo filter waits for enhancement and does not change other post data',async()=>{
 let filter;
 const context={require:name=>name.startsWith('.')?require(path.resolve(base,'scripts',name)):require(name),hexo:{source_dir:sourceDir,config:{root:'/lab/'},extend:{filter:{register:(name,fn,priority)=>{if(name==='before_generate'){assert.equal(priority,5);return;}assert.equal(name,'after_post_render');assert.equal(priority,20);filter=fn;}}}}};
 vm.runInNewContext(fs.readFileSync(path.join(base,'scripts/article-images.js'),'utf8'),context);
 const data={title:'原文',content:`<img src="/lab${image}">`};assert.equal(await filter(data),data);assert.match(data.content,/width="831"/);assert.equal(data.title,'原文');
});
test('missing optional metadata capability warns once while preserving every post',async()=>{
 let filter,warnings=0;
 const context={require:name=>name==='htmlparser2'?require(name):({metadataAvailable:false,createArticleImageEnhancer:()=>async content=>content}),hexo:{source_dir:sourceDir,config:{root:'/'},log:{warn:message=>{warnings++;assert.match(message,/sharp is unavailable/);}},extend:{filter:{register:(name,fn)=>{if(name==='before_generate'){fn();return;}filter=fn;}}}}};
 vm.runInNewContext(fs.readFileSync(path.join(base,'scripts/article-images.js'),'utf8'),context);
 const data={content:`<img src="${image}">`};await filter(data);await filter(data);assert.equal(warnings,1);assert.equal(data.content,`<img src="${image}">`);
});
test('sharp is an explicit locked build dependency with the existing version',()=>{
 const pkg=require('../package.json'),lock=require('../package-lock.json');assert.equal(pkg.devDependencies.sharp,'0.35.4');assert.equal(lock.packages[''].devDependencies.sharp,'0.35.4');assert.equal(lock.packages['node_modules/sharp'].version,'0.35.4');
});
test('real Warehouse cached Post/Page HTML rerenders through native Hexo, including same-path image updates',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'article-image-cache-'));
 try {
  const dir=path.join(temp,'atelier/images/posts');fs.mkdirSync(dir,{recursive:true});
  const target=path.join(dir,'illustration.png');fs.copyFileSync(path.join(sourceDir,image.slice(1)),target);
  const raw='<h1 id="original">标题</h1><p>原文</p><img src="/atelier/images/posts/illustration.png">';
  const Hexo=require('hexo'),hexo=new Hexo(temp,{silent:true});
  hexo.source_dir=temp;hexo.config.root='/';hexo.config.disableNunjucks=true;hexo.config.syntax_highlighter='';
  let renders=0;
  hexo.extend.renderer.register('html','html',data=>{renders++;return data.text;},true);
  const insert=(model,name,content)=>hexo.model(model).insert({title:name,source:name+'.html',slug:name,path:name+'.html',content,_content:content,raw:'frontmatter\n'+content});
  const post=await insert('Post','article',raw),page=await insert('Page','page',raw),unrelated=await insert('Post','text','<p>文字</p>'),external=await insert('Post','external','<img src="https://example.com/a.png">'),unsafe=await insert('Post','unsafe','<img src="/atelier/images/posts/%2e%2e/a.png">');
  const refs=[['Post',post],['Page',page],['Post',unrelated],['Post',external],['Post',unsafe]];
  const read=(model,entry)=>hexo.model(model).findById(entry._id);
  const snapshots=()=>refs.map(([model,entry])=>{const doc=read(model,entry);return {raw:doc.raw,_content:doc._content};});
  const originals=snapshots(),saves=[];
  for(const model of ['Post','Page']){
    const instance=hexo.model(model),save=instance.save.bind(instance);
    instance.save=async data=>{await new Promise(resolve=>setTimeout(resolve,3));saves.push(data._id);return save(data);};
  }
  // Explicitly prove the old mutation-only approach does not update Warehouse.
  const detached=read('Post',post);detached.content=undefined;
  assert.equal(read('Post',post).content,raw);
  vm.runInNewContext(fs.readFileSync(path.join(base,'scripts/article-images.js'),'utf8'),{hexo,require:name=>name.startsWith('.')?require(path.resolve(base,'scripts',name)):require(name)});
  assert.equal(hexo.extend.filter.list('before_generate').length,1);
  const invalidator=hexo.extend.filter.list('before_generate')[0];
  // Use real Warehouse models, the native filter, and native post.render.
  require('hexo/dist/plugins/filter/before_generate')(hexo);
  const native=hexo.extend.filter.list('before_generate').find(fn=>fn!==invalidator);assert.ok(invalidator.priority<native.priority);
  const run=()=>hexo.execFilter('before_generate',null,{context:hexo});
  await invalidator();assert.equal(read('Post',post).content,undefined);assert.equal(read('Page',page).content,undefined);assert.equal(read('Post',unrelated).content,'<p>文字</p>');assert.match(read('Post',external).content,/https:/);assert.match(read('Post',unsafe).content,/%2e/);
  await native.call(hexo);assert.match(read('Post',post).content,/width="831" height="213"/);assert.equal(renders,2);
  // Change only image bytes at the same URL, without touching the article source.
  fs.copyFileSync(path.join(sourceDir,'atelier/images/posts/8198fee5ab08f9872dcc.png'),target);
  await run();assert.match(read('Post',post).content,/width="888" height="220"/);assert.match(read('Page',page).content,/width="888" height="220"/);assert.equal(renders,4);
  assert.deepEqual(snapshots(),originals);
  assert.ok(saves.length===8&&saves.every(id=>id===post._id||id===page._id),'only relevant caches are persisted and rendered');
  assert.equal(read('Post',unrelated).content,'<p>文字</p>');assert.match(read('Post',post).content,/^<h1 id="original">标题<\/h1><p>原文<\/p>/);
  hexo.model('Post').save=async()=>{throw new Error('cache persistence failed');};
  await assert.rejects(invalidator(),/cache persistence failed/,'failed persistence must not look like a successful invalidation');
 } finally {fs.rmSync(temp,{recursive:true,force:true});}
});
