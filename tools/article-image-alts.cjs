'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {parseDocument}=require('htmlparser2');

// Descriptions were checked against these exact original image bytes.
// This is deliberately not a generic missing-alt generator.
const allowlist=Object.freeze([
 ['124338541','0d10b4b4cfb687c1b8e6.png','108fb2790632f9f9d18a17934a1f83f5ab0ff7027e0c906af2d74ed9e8a4e09d',null,'全排列的深度优先搜索示意：首位选1，跳过已用数字，依次得到123与132，并沿箭头回溯。'],
 ['124514677','63738c13849aabe4f477.png','32b647a8bedd5c2d21f65c890359563ada04c6d62f52b4d4f3d69d0294009904',null,'轨道内车号从左到右为2、4、8时可按要求出站；2、8、4的排列会使4挡住8。'],
 ['124514677','b19c58f2b634f5b5dafb.png','e144860542af0226bad29c4c8eec335f845e958ab25914bd8ec55e12681b087b',null,'四条调度轨道示意：从上到下分别停放1、2、4、8；3、5；6、9；7号列车。'],
 ['131792879','989ef65b22020321ceab.png','48354140b67972a8bdefc8a0d7dc1207690e1bc02e7986a3547d3127cafe8898',null,'以1为根的树中，节点5与6用红框标出，它们的最近公共祖先节点2用蓝框标出。'],
 ['149880710','4ae2d76d016b3caff5ed.png','1cae8e688756e780a3c246a750838a629ef8d45328f31167fc4539dea8aa1c53',null,'逻辑回归训练结果：训练集与测试集损失随轮次下降，准确率曲线保持水平，测试集略高于训练集。'],
 ['124338392','2f10f404a35b05f8422b.png','60a39061666816e8819630004f30d64c55710e2d90d704c7109e506d9e963da1','gif.latex?%282022%29_%7B9%7D','九进制数2022']
].map(([sourceId,filename,sha256,oldAlt,alt])=>Object.freeze({sourceId,source:`_posts/csdn/${sourceId}.md`,filename,sha256,oldAlt,alt})));

function entriesForPost(post) {
 return allowlist.filter(entry=>post?.source_id===entry.sourceId&&post?.source===entry.source);
}
function escapeAttribute(value) {
 return value.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/'/g,'&#39;');
}
function replaceAlt(tag,alt) {
 const attributes=[...tag.matchAll(/\s+([^\s=/>]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g)];
 const existing=attributes.filter(match=>match[1].toLowerCase()==='alt');
 if(existing.length>1)return tag;
 const attribute=`alt="${escapeAttribute(alt)}"`;
 if(existing.length) {
  const match=existing[0];
  return tag.slice(0,match.index)+' '+attribute+tag.slice(match.index+match[0].length);
 }
 return tag.replace(/\s*\/?>$/,ending=>' '+attribute+ending);
}
function createArticleImageAltEnhancer({sourceDir,root='/'}={}) {
 const prefix='/atelier/images/posts/';
 const rooted='/'+String(root).replace(/^\/+|\/+$/g,'')+prefix;
 async function originalMatches(entry) {
  try {
   const source=await fs.realpath(sourceDir),directory=path.join(source,'atelier/images/posts');
   if(await fs.realpath(directory)!==directory)return false;
   const file=await fs.realpath(path.join(directory,entry.filename));
   if(path.dirname(file)!==directory)return false;
   return createHash('sha256').update(await fs.readFile(file)).digest('hex')===entry.sha256;
  } catch { return false; }
 }
 return async function enhance(content,post) {
  const entries=entriesForPost(post);
  if(!entries.length||typeof content!=='string'||!/<img\b/i.test(content))return content;
  let document;
  try { document=parseDocument(content,{withStartIndices:true,withEndIndices:true}); } catch { return content; }
  const images=[];
  function visit(node) {
   if(node.type==='tag'&&(node.name==='picture'||node.attribs?.['aria-hidden']==='true'||'hidden'in(node.attribs||{})))return;
   if(node.type==='tag'&&node.name==='img')images.push(node);
   for(const child of node.children||[])visit(child);
  }
  visit(document);
  const edits=[],verified=new Map();
  for(const node of images) {
   const attrs=node.attribs;
   if('srcset'in attrs||'data-src'in attrs||attrs.role==='presentation'||attrs.role==='none')continue;
   const entry=entries.find(item=>attrs.src===prefix+item.filename||(root!=='/'&&attrs.src===rooted+item.filename));
   if(!entry||(entry.oldAlt===null?attrs.alt!==undefined&&attrs.alt!=='':attrs.alt!==entry.oldAlt))continue;
   if(!verified.has(entry.filename))verified.set(entry.filename,originalMatches(entry));
   if(!await verified.get(entry.filename))continue;
   const start=node.startIndex,end=node.endIndex+1,tag=content.slice(start,end);
   if(!/^<img\b/i.test(tag)||!/>$/.test(tag))continue;
   edits.push({start,end,value:replaceAlt(tag,entry.alt)});
  }
  for(const edit of edits.reverse())content=content.slice(0,edit.start)+edit.value+content.slice(edit.end);
  return content;
 };
}
module.exports={allowlist,entriesForPost,escapeAttribute,createArticleImageAltEnhancer};
