'use strict';
const {stripHTML,unescapeHTML}=require('hexo-util');
const fs=require('node:fs'),path=require('node:path');
const plain=html=>unescapeHTML(stripHTML(String(html||'').replace(/<\/(?:p|h[1-6]|li|tr|pre)>/gi,'$& '))).replace(/\s+/g,' ').trim();
const tagsFor=post=>[...new Set([...(post.tags?.toArray()||[]).map(t=>t.name),...(post.categories?.toArray()||[]).map(t=>t.name)])];
hexo.extend.generator.register('live-archive',function(locals){
  const root=this.config.root||'/';
  const posts=locals.posts.sort('date',-1).toArray().map(post=>{
    const text=plain(post.content);
    return {path:root+post.path.replace(/^\//,''),title:post.title,text,tags:tagsFor(post),group:post.series==='hot100'?'hot100':'writing',date:post.date.toISOString().slice(0,10),minutes:Math.max(1,Math.ceil(text.length/500)),excerpt:text.slice(0,125)};
  });
  const shell=[],sourceDir=path.join(this.base_dir,'source');
  function collect(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())collect(file);else if(/\.(?:m?js|css|ttf|woff2?)$/.test(entry.name))shell.push(root+path.relative(sourceDir,file).replaceAll('\\','/'));}}
  for(const directory of ['js','css','fonts'])collect(path.join(sourceDir,'atelier',directory));
  const sw=fs.readFileSync(path.join(this.base_dir,'custom/live-sw.template'),'utf8').replaceAll('__ROOT__',JSON.stringify(root));
  return [{path:'atelier/data/archive.json',data:JSON.stringify({version:1,posts})},{path:'atelier/data/offline-shell.json',data:JSON.stringify(shell)},{path:'live-sw.js',data:sw}];
});
hexo.extend.helper.register('live_article_content',function(page){
  // Remove only an identical leading rendered title. The source Markdown is untouched.
  return String(page.content||'').replace(/^(\s*)<h1\b[^>]*>([\s\S]*?)<\/h1>/i,(all,space,title)=>plain(title)===plain(page.title)?space:all).replace(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi,(all,level,content)=>plain(content)||/<(?:img|svg|video)\b/i.test(content)?all:'');
});
hexo.extend.helper.register('live_related',function(page){
  const tags=new Set(tagsFor(page));
  return this.site.posts.toArray().filter(p=>p.path!==page.path).map(p=>({p,score:tagsFor(p).filter(t=>tags.has(t)).length})).filter(p=>p.score>0).sort((a,b)=>b.score-a.score||b.p.date-a.p.date).slice(0,4).map(({p})=>p);
});
hexo.extend.generator.register('nijika-studio',()=>({path:'studio/index.html',layout:['nijika/studio'],data:{nijika:'studio',title:'节奏实验室'}}));
