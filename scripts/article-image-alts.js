'use strict';
const {entriesForPost,createArticleImageAltEnhancer}=require('../tools/article-image-alts.cjs');
const enhance=createArticleImageAltEnhancer({sourceDir:hexo.source_dir,root:hexo.config.root||'/'});
// Render from the author's source, never from a previously enhanced cache.
hexo.extend.filter.register('before_generate',async()=>{
 for(const post of hexo.model('Post').toArray()) {
  if(entriesForPost(post).length&&typeof post._content==='string'&&typeof post.content==='string'&&/<img\b/i.test(post.content)) {
   // Optional string fields accept undefined, not null, when Warehouse saves.
   post.content=undefined;
   // Warehouse queries return separate documents. Persist to its in-memory
   // model before Hexo's native render_post filter queries that model again.
   await post.save();
  }
 }
},6);
hexo.extend.filter.register('after_post_render',async data=>{
 if(data.content)data.content=await enhance(data.content,data);
 return data;
},21);
