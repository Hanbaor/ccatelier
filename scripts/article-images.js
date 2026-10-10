'use strict';
const {createArticleImageEnhancer,metadataAvailable,localImagePath}=require('../tools/article-images.cjs');
const {parseDocument}=require('htmlparser2');
if(!metadataAvailable)hexo.log.warn('Article image dimensions were not enhanced: sharp is unavailable. Install the locked dev dependencies with npm ci; original images remain unchanged.');
const enhance=createArticleImageEnhancer({sourceDir:hexo.source_dir,root:hexo.config.root||'/'});
// Hexo's native render_post filter runs at priority 10 and skips cached content.
// Invalidate only relevant rendered caches; let Hexo render original _content.
hexo.extend.filter.register('before_generate',async()=>{
  if(!metadataAvailable)return;
  function containsLocalImage(node) {
    if(node.type==='tag'&&node.name==='img'&&localImagePath(node.attribs.src,hexo.config.root||'/'))return true;
    return (node.children||[]).some(containsLocalImage);
  }
  for(const model of ['Post','Page'])for(const entry of hexo.model(model).toArray()) {
    if(typeof entry.content!=='string'||!/<img\b/i.test(entry.content)||typeof entry._content!=='string')continue;
    let relevant=false;
    try { relevant=containsLocalImage(parseDocument(entry.content)); } catch { continue; }
    if(relevant) {
      // Warehouse queries return document copies. Persist before native rendering
      // queries again; undefined removes the optional String (null is invalid).
      entry.content=undefined;
      await entry.save();
    }
  }
},5);
hexo.extend.filter.register('after_post_render',async data=>{
  if(data.content)data.content=await enhance(data.content);
  return data;
},20);
