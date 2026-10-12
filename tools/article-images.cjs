'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {parseDocument}=require('htmlparser2');

// sharp is an explicit, lockfile-pinned build dependency.
// A production-only install must still be able to render the original article.
let sharp;
try { sharp=require('sharp'); } catch {}

function localImagePath(src,root='/') {
  if(typeof src!=='string'||!src.startsWith('/')||src.startsWith('//')||/[\\\0]/.test(src))return null;
  let pathname;
  try { pathname=decodeURIComponent(src.split(/[?#]/,1)[0]); } catch { return null; }
  if(/[\\\0?#%]/.test(pathname)||pathname.split('/').some(part=>part==='.'||part==='..'))return null;
  const prefix='/atelier/images/posts/';
  const rooted='/'+String(root).replace(/^\/+|\/+$/g,'')+prefix;
  const relative=pathname.startsWith(prefix)?pathname.slice(prefix.length):root!=='/'&&pathname.startsWith(rooted)?pathname.slice(rooted.length):null;
  // The imported image collection is flat. No traversal or unrelated local files.
  return relative&& !relative.includes('/')&&/\.(?:png|jpe?g|webp|gif)$/i.test(relative)?relative:null;
}

function createArticleImageEnhancer({sourceDir,root='/',readMetadata=sharp?file=>sharp(file).metadata():null}={}) {
  const cache=new Map();
  async function metadata(filename) {
    if(!readMetadata)return null;
    try {
      const source=await fs.realpath(sourceDir);
      const directory=path.join(source,'atelier/images/posts');
      if(await fs.realpath(directory)!==directory)return null;
      const file=await fs.realpath(path.join(directory,filename));
      if(path.dirname(file)!==directory)return null;
      const stat=await fs.stat(file);
      if(!stat.isFile())return null;
      const key=file+'\0'+stat.size+'\0'+stat.mtimeMs;
      if(!cache.has(key))cache.set(key,Promise.resolve().then(()=>readMetadata(file)).catch(()=>null));
      const info=await cache.get(key);
      // Do not infer geometry for disguised SVG or multi-frame images.
      if(!['png','jpeg','webp','gif'].includes(info?.format)||(info.pages||1)>1)return null;
      // Browser image orientation follows EXIF. sharp exposes the oriented size.
      const size=info?.autoOrient||info;
      if(!Number.isSafeInteger(size?.width)||!Number.isSafeInteger(size?.height)||size.width<1||size.height<1)return null;
      if(info.orientation>=5&&!info.autoOrient)return null;
      return {width:size.width,height:size.height,bytes:stat.size};
    } catch { return null; }
  }
  return async function enhance(content) {
    if(typeof content!=='string'||!/<img\b/i.test(content))return content;
    let document;
    try { document=parseDocument(content,{withStartIndices:true,withEndIndices:true}); } catch { return content; }
    const images=[];
    function visit(node) { if(node.type==='tag'&&node.name==='img')images.push(node);for(const child of node.children||[])visit(child); }
    visit(document);
    const edits=[];
    for(const [index,node] of images.entries()) {
      const attrs=node.attribs,filename=localImagePath(attrs.src,root);
      if(!filename||'srcset'in attrs||'data-src'in attrs||node.parent?.name==='picture')continue;
      const size=await metadata(filename);
      if(!size)continue;
      const additions=[];
      // Partial author-specified dimensions may intentionally change presentation.
      if(!('width'in attrs)&&!('height'in attrs))additions.push(`width="${size.width}"`,`height="${size.height}"`);
      if(!('decoding'in attrs))additions.push('decoding="async"');
      if(!('loading'in attrs)) {
        if(index===0)additions.push('loading="eager"');
        // Small formula images retain normal loading, even far down an article.
        else if(size.width>=320&&size.height>=180&&size.bytes>=32768)additions.push('loading="lazy"');
      }
      if(!additions.length)continue;
      const start=node.startIndex,end=node.endIndex+1,original=content.slice(start,end);
      if(!/^<img\b/i.test(original)||!/>$/.test(original))continue;
      edits.push({start,end,value:original.replace(/\s*\/?>$/,ending=>' '+additions.join(' ')+ending)});
    }
    for(const edit of edits.reverse())content=content.slice(0,edit.start)+edit.value+content.slice(edit.end);
    return content;
  };
}
module.exports={localImagePath,createArticleImageEnhancer,metadataAvailable:Boolean(sharp)};
