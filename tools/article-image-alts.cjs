'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {parseDocument}=require('htmlparser2');

// Descriptions were checked against these exact original image bytes.
// This is deliberately not a generic missing-alt generator.
const allowlist=Object.freeze([
 // Additional originals visually reviewed for the migrated caption cleanup.
 ['124338392','c1139fa1d237927bb567.png','2e804dacb8cd563e2a04e6a77c632b6d0d671756c38cb626910e892b30d03205','gif.latex?2*%289%29%5E%7B3%7D+0*%289%29%5E%7B2%7D+2*%289%29%5E%7B1%7D+2%3D1478','九进制2022转为十进制：2×9³＋0×9²＋2×9＋2＝1478。'],
 ['124338392','639ad0fb7015911e0003.jpg','f723bb0ce87b557e93a11f1988d61d165dc78c264f8bdce1c0a6985aead0ad8f','49b5a1042d764b71bdef29b44e3c732d.jpg','草叶间牵手回望的两位少女。'],
 ['124338541','0d10b4b4cfb687c1b8e6.png','108fb2790632f9f9d18a17934a1f83f5ab0ff7027e0c906af2d74ed9e8a4e09d',null,'全排列的深度优先搜索示意：首位选1，跳过已用数字，依次得到123与132，并沿箭头回溯。'],
 ['124514677','63738c13849aabe4f477.png','32b647a8bedd5c2d21f65c890359563ada04c6d62f52b4d4f3d69d0294009904',null,'轨道内车号从左到右为2、4、8时可按要求出站；2、8、4的排列会使4挡住8。'],
 ['124514677','b19c58f2b634f5b5dafb.png','e144860542af0226bad29c4c8eec335f845e958ab25914bd8ec55e12681b087b',null,'四条调度轨道示意：从上到下分别停放1、2、4、8；3、5；6、9；7号列车。'],
 ['131792879','989ef65b22020321ceab.png','48354140b67972a8bdefc8a0d7dc1207690e1bc02e7986a3547d3127cafe8898',null,'以1为根的树中，节点5与6用红框标出，它们的最近公共祖先节点2用蓝框标出。'],
 ['149880710','4ae2d76d016b3caff5ed.png','1cae8e688756e780a3c246a750838a629ef8d45328f31167fc4539dea8aa1c53',null,'逻辑回归训练结果：训练集与测试集损失随轮次下降，准确率曲线保持水平，测试集略高于训练集。'],
 ['124338392','2f10f404a35b05f8422b.png','60a39061666816e8819630004f30d64c55710e2d90d704c7109e506d9e963da1','gif.latex?%282022%29_%7B9%7D','九进制数2022'],
 ['131792879','35c9fcd092bb03e24dfa.png','23bbcbddeb17ea560146fe4bbe55f9667ca964564071472f7a20543bfef0d4fe',null,'树上边差分初始化：路径5—2—4—6的两端节点5、6各标记1，最近公共祖先节点2标记−2。'],
 ['131792879','78842c5fb58aa6fa97b2.png','a8bd181b161bfe58361f69b0e605d363b62ce45a4b9b5f9e365dd660bebc7aee',null,'边差分从节点6向上回溯到节点2：节点6、4、5的标记为1，节点2由−2累加为−1。'],
 ['131792879','6724ba0a1ceb5cfa9c64.png','d6611c556c6848d11d413d8b147647d36061cf30bcf36f5b5745dbe9757d46bf',null,'边差分回溯完成：节点5、4、6各标记1，对应路径5—2—4—6上的三条边权值各增加1。'],
 ['149880710','259258c6a6bc207bb7ab.png','3fd13a6a187b50e6d2c88c5665fd7c28061fbc2bf794fb0b2401efee17ba09f5',null,'torch.nn逻辑回归训练曲线：训练与测试损失持续下降，准确率分别升至约97.8%和99.3%。'],
 ['149880710','d3d9809ce24ebe68f572.png','fc7f5cea3601c1f53ccb05647a02cdac2e1d5d4508559d620ee88d52a6813c15',null,'从零实现Softmax回归：训练损失持续下降，训练准确率升至约85%，测试准确率中途略有回落，最终约83.5%。'],
 ['149880710','c781d35710ae402c159e.png','57b62a132e24ddbcb6169f7960d56b514e3b2185e94546fe56f1eb400fe2488d',null,'torch.nn实现Softmax回归：训练损失持续下降，训练准确率升至约85%，测试准确率波动上升至约83.4%。'],
 ['124338392','b7c8a264574ee1e7195d.jpg','5b8ba69295d66e78c1e69c0bcb866dd38e2d5687401d3dadcfebf686abfc8da7','99969f0c00f9ccc0fb511c7a1f088408.jpeg','两种积木：I型由两个相邻单位方格组成，L型由三个单位方格组成直角形。'],
 ['124338392','b2047bea65401717ce8a.png','d99a79788cd00f99fa5f9cdca5a33261e3413c0dbb2cc1d6f30ceaf307281cf6','da5e594b0c5ce4cd9d004f772a03591f.png','2×3画布的五种铺法：三个竖I型一种，两个横I型加一个竖I型两种，两个L型两种。'],
 ['124338392','c7068c3e28122b3ccc72.png','fb51b9fcbbc7f87796ea89c85309e0d24693e662750361492e190b568d02a3ad','b99a41708010461785712a8fe749beed.png','积木画状态00：前i−1列已铺满，第i列上下两格均未被覆盖。'],
 ['124338392','9f5799f2574234db7263.png','d9c9c30fd8d33bf783e03e4f25787908d228dccd39e6c7b1b3eda103b276dacc','ae3d8f8df3774c9782351c24a0bb257b.png','状态00转移到00：在第i列竖放一个I型积木，第i+1列上下两格仍为空。'],
 ['124338392','22e8b1306db0807a0b58.png','6a8960cd59ade6ca034da36a1aad32298510267c36a74bce21926335e7774d87','2a3a90ea512c4ee9a3824b23bb287225.png','状态00转移到10：L型积木铺满第i列，并覆盖第i+1列上格，下格仍为空。'],
 ['124338392','3d222547bd0b8dd376ca.png','bc2ce9bbc0f9eb670ad077baa219bd6b767c4852600ca1f1cd253ede8da3c489','17c5f5284fb643c88aefa0375d4779a8.png','状态00转移到01：L型积木铺满第i列，并覆盖第i+1列下格，上格仍为空。']
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
   if(!entry)continue;
   const originalAlt=entry.oldAlt===null?attrs.alt===undefined||attrs.alt==='':attrs.alt===entry.oldAlt;
   if(!originalAlt&&attrs.alt!==entry.alt)continue;
   if(!verified.has(entry.filename))verified.set(entry.filename,originalMatches(entry));
   if(!await verified.get(entry.filename))continue;
   const start=node.startIndex,end=node.endIndex+1,tag=content.slice(start,end);
   if(!/^<img\b/i.test(tag)||!/>$/.test(tag))continue;
   if(originalAlt)edits.push({start,end,value:replaceAlt(tag,entry.alt)});
   // Redefine copies the old alt into a caption at priority 10, before this
   // priority-21 filter. Repair only its exact, plain-text generated shape.
   // Never infer descriptions or replace meaningful/custom author captions.
   const visibleChildren=parent=>(parent?.children||[]).filter(child=>child.type!=='text'||child.data.trim()!=='');
   const container=node.parent;
   let figure=container;
   // HTML parsing can repair an inline formula's surrounding emphasis into
   // the figure. Accept only exclusive, attribute-free emphasis wrappers.
   while(figure&&['strong','em'].includes(figure.name)&&!Object.keys(figure.attribs).length) {
    const parent=figure.parent;
    if(visibleChildren(parent).length!==1||visibleChildren(parent)[0]!==figure)break;
    figure=parent;
   }
   if(entry.oldAlt===null||figure?.name!=='figure'||figure.attribs?.class!=='image-caption'||Object.keys(figure.attribs).length!==1)continue;
   const children=visibleChildren(container);
   const caption=children[1];
   if(children.length!==2||children[0]!==node||caption?.name!=='figcaption'||Object.keys(caption.attribs).length||caption.children.length!==1||caption.children[0].type!=='text'||caption.children[0].data!==entry.oldAlt)continue;
   const text=caption.children[0];
   edits.push({start:text.startIndex,end:text.endIndex+1,value:escapeAttribute(entry.alt)});
  }
  for(const edit of edits.sort((a,b)=>b.start-a.start))content=content.slice(0,edit.start)+edit.value+content.slice(edit.end);
  return content;
 };
}
module.exports={allowlist,entriesForPost,escapeAttribute,createArticleImageAltEnhancer};
