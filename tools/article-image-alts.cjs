'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {parseDocument}=require('htmlparser2');

// Descriptions were checked against these exact original image bytes.
// This is deliberately not a generic missing-alt generator.
const allowlist=Object.freeze([
 // Further originals individually inspected; captions stay brief, alt retains detail.
 ["124338392", "77cc1d8465cef4c8a61f.png", "de4ced62393de9b8adf5470828d7d06fadf0545485078920d4fa6cde75136389", "gif.latex?1%5Cleqslant%20a%2Cb%2Cn%5Cleqslant10%5E%7B6%7D", "1≤a、b、n≤10⁶。", "1≤a、b、n≤10⁶"],
 ["124338392", "d2e965efae4f0a8b982f.png", "838fc7cc288c5be111bc6a195bcdb62a4154f82428c5a62916ba8da83842be22", "gif.latex?1%5Cleqslant%20a%2Cb%2Cn%5Cleqslant%2010%5E%7B18%7D", "1≤a、b、n≤10¹⁸。", "1≤a、b、n≤10¹⁸"],
 ["124338392", "67cbf50d1c37709e5605.png", "329c637ef624b01bd37c8138bd71732683acb27e3b3a58cc6bba6dc1f3bbf482", "gif.latex?N%5Cleqslant%2010%2CM_%7Ba%7D%2CM_%7Bb%7D%5Cleqslant%208%3B", "N≤10，M下标a、M下标b≤8。", "N≤10，M下标a、b≤8"],
 ["124338392", "f11c1132e0fff5f800ea.png", "69b25e15db1818ddf630931d016b48f6ce36fdd4093fbad4c3d5c9e7aa94b38f", "gif.latex?2%5Cleqslant%20N%5Cleqslant%201000%2C1%5Cleqslant%20M_%7Ba%7D%2CM_%7Bb%7D%5Cleqslant%20100000%2CA%5Cgeqslant%20B", "2≤N≤1000，1≤M下标a、M下标b≤100000，A≥B。", "N、M与A、B的范围"],
 ["124338392", "b8914d54fdf83557b2d2.png", "ecc0a1b96b19020e4e0937da4f030e50d1d8fc47761fabbcb332ff6d0a286c45", "gif.latex?A_%7Bi%2Cj%7D", "A下标i,j。", "A下标i,j"],
 ["124338392", "59c7b837bd8215165592.png", "6db3ead15108aab708c8c6054e589a8d52c149e57b79255414db0c8b6fcc0d2a", "85912053b10d4aac90ea1f4a136ace89.png", "状态00转移到11：上下各横放一个I型积木，覆盖第i列和第i+1列。", "状态00 → 11"],
 ["124338392", "e0e26fb9b0ef61696a89.png", "8903af068abbff1a6d03c88f59c64f0c676d094ca8fe9909026ce22115b78bf2", "c497ea6d89b34cab82923dfddd389314.png", "状态10转移到11：L型积木覆盖第i列下格和第i+1列上下两格。", "状态10 → 11"],
 ["124338392", "570628ae7180456cb9a1.png", "0647d638c6eec5e45d228a8239d1c2a094165c230d20f99b0b4ba8f997126789", "149bd816398247cd852ba6bbcbf0d1c8.png", "状态10转移到01：横放I型积木，覆盖第i列与第i+1列的下格。", "状态10 → 01"],
 ["124338392", "065458a9eff427616248.png", "4b9e1d0fd0863867ce6ad80da7a6bea994b6d8ab531f429fc074bd23351e7d97", "e3c7c6ba9d75493b9ccb8f38c196f132.png", "状态01转移到10：横放I型积木，覆盖第i列与第i+1列的上格。", "状态01 → 10"],
 ["124338392", "bae4c612caa15847002b.png", "ed931937daf42009eebd1f24eb5ccf4bdf165fc799a5b21871c42d91e68c986f", "70dcfd961ebe417f8c8d746764567aba.png", "状态01转移到11：L型积木覆盖第i列上格和第i+1列上下两格。", "状态01 → 11"],
 ["124338392", "7fef14c25e6886f06b0a.png", "ad01042e6a32b53f0ff365405fec7047e4050ca639d2bd9386b9acc03471fd1e", "1c424f6e35a747c994c7562fcb5ecd00.png", "积木状态转移表：行列顺序均为00、01、10、11，四行依次为1111、0011、0101、1000。", "积木·状态转移表"],
 ["124338392", "eada8f2ab0df1151a87c.png", "2cbf4efdcecf6e24ddeaec007ec29fdc9a53461791b375fbc8bb1749ee7a609a", "b4323c5add2742398f9f5dacbb8a9373.png", "扫雷题面：排雷火箭及炸雷会引爆各自圆形范围内的炸雷，包含边界，求连锁引爆的炸雷总数。", "扫雷·题目"],
 ["124338392", "2176f00efb997f34efef.png", "5781956653a611c1eed05a75a035c9ccf9aeb839e50aab5bddf92677854bd845", "c9969ce90bcf4408bb40820f89e0f78a.png", "扫雷输入格式：先输入炸雷数n和排雷火箭数m，再分别输入各自的横坐标、纵坐标和爆炸半径。", "扫雷·输入格式"],
 ["124338392", "8f8f4e26e6b19e6a7ca9.png", "f68972a29f1690cb07d736effe2681e9de02d53484ceea33a9cb68cbb2b35310", "c88773dafa104938a8c071e18e9528b2.png", "扫雷样例示意：排雷火箭1覆盖炸雷1，炸雷1再覆盖炸雷2，两颗炸雷均被引爆。", "扫雷·连锁引爆示例"],
 ["124338392", "c6295ff2560b8eec93ec.png", "d1a0c0f118da8004ee3bb2f522230852ea40099f293b0361da47ab0f5ab7bd80", "ec193803493142a5867402930e2e64ea.png", "扫雷数据范围：坐标在0至10⁹之间，爆炸半径在1至10之间；40%用例n、m不超过10³，全部用例不超过5×10⁴。", "扫雷·数据范围"],
 ["124338392", "8198fee5ab08f9872dcc.png", "ab900b6e4fab07efc363d22d2666fa37e9b04d2b63e8ba8ca00f5ad9da44a5ce", "5f94aed5442c4dcdb35199f8277938f4.png", "李白打酒题面：初始有2斗酒，遇店酒量翻倍，遇花喝1斗；共遇店N次、花M次，最后遇花且酒恰好喝完，求顺序数量。无酒时遇店合法、遇花不合法。", "李白打酒·题目"],
 ["124338392", "adf05685eb0468e1995e.png", "496dad45fa65c12dfea42484f6c23667ff9f912abd6ea38bd77eb1b55fa4e600", "b7214ef1481d423db75cb59fe416845b.png", "李白打酒输入格式：第一行输入两个整数N和M。", "李白打酒·输入格式"],
 ["124338392", "96492652ca10a6568276.png", "76d9618cde89868fc944a3b2250d44f60f5ba846248ebe3e660f5a90ee38b911", "029efbb15ac44f7ab91ba6d7f832cc79.png", "李白打酒数据范围：40%用例满足1≤N、M≤10，全部用例满足1≤N、M≤100。", "李白打酒·数据范围"],
 ["124338392", "2d4f29d4f98cf718e8b5.png", "cad846534b9178257f1a3e30282401970b30b65bc60c330c70d7a6f3986536aa", "05dd69a140144eab9f7035c31fa8942f.png", "砍竹子题面：每次对连续且等高的一段竹子使用魔法，将高度H变为对“⌊H/2⌋＋1”的平方根向下取整，求全部高度变为1的最少次数。", "砍竹子·题目"],
 ["124338392", "6a6615bf54b822d990dd.png", "2b391dc62fdd76e38fb27260def461552e8d9e227b0b40bef42d306494eb856f", "8305853c52104f539b0c9766a207d2a8.png", "砍竹子输入格式：第一行输入竹子棵数n，第二行输入n个正整数，表示各棵竹子的高度。", "砍竹子·输入格式"],
 ["124338392", "4c9caee2542d81ccb208.png", "6b19f6d7a652b7eb9f2a407b09845fe0abdbecab614859361e9ffb4e78cfc70f", "af3d3943371444c3b97bb566f07073f1.png", "砍竹子数据范围：20%数据满足n≤1000、高度≤10⁶；全部数据满足n≤2×10⁵、高度≤10¹⁸。", "砍竹子·数据范围"],
 ["124338392", "75241a83f62b63f58200.png", "f5d66cce6e7c707bfd5d34e63f3185164d56fb7400c977eecafbffffb739c73e", "4822524e729b456c88508c8ade15c318.png", "高度变化公式：先对H/2向下取整，加1后开平方，再向下取整。", "砍竹子·高度变化公式"],
 // Additional originals visually reviewed for the migrated caption cleanup.
 ['124338392','c1139fa1d237927bb567.png','2e804dacb8cd563e2a04e6a77c632b6d0d671756c38cb626910e892b30d03205','gif.latex?2*%289%29%5E%7B3%7D+0*%289%29%5E%7B2%7D+2*%289%29%5E%7B1%7D+2%3D1478','九进制2022转为十进制：2×9³＋0×9²＋2×9＋2＝1478。',"九进制2022 → 十进制1478"],
 ['124338392','639ad0fb7015911e0003.jpg','f723bb0ce87b557e93a11f1988d61d165dc78c264f8bdce1c0a6985aead0ad8f','49b5a1042d764b71bdef29b44e3c732d.jpg','草叶间牵手回望的两位少女。',"草叶间牵手回望"],
 ['124338541','0d10b4b4cfb687c1b8e6.png','108fb2790632f9f9d18a17934a1f83f5ab0ff7027e0c906af2d74ed9e8a4e09d',null,'全排列的深度优先搜索示意：首位选1，跳过已用数字，依次得到123与132，并沿箭头回溯。'],
 ['124514677','63738c13849aabe4f477.png','32b647a8bedd5c2d21f65c890359563ada04c6d62f52b4d4f3d69d0294009904',null,'轨道内车号从左到右为2、4、8时可按要求出站；2、8、4的排列会使4挡住8。'],
 ['124514677','b19c58f2b634f5b5dafb.png','e144860542af0226bad29c4c8eec335f845e958ab25914bd8ec55e12681b087b',null,'四条调度轨道示意：从上到下分别停放1、2、4、8；3、5；6、9；7号列车。'],
 ['131792879','989ef65b22020321ceab.png','48354140b67972a8bdefc8a0d7dc1207690e1bc02e7986a3547d3127cafe8898',null,'以1为根的树中，节点5与6用红框标出，它们的最近公共祖先节点2用蓝框标出。'],
 ['149880710','4ae2d76d016b3caff5ed.png','1cae8e688756e780a3c246a750838a629ef8d45328f31167fc4539dea8aa1c53',null,'逻辑回归训练结果：训练集与测试集损失随轮次下降，准确率曲线保持水平，测试集略高于训练集。'],
 ['124338392','2f10f404a35b05f8422b.png','60a39061666816e8819630004f30d64c55710e2d90d704c7109e506d9e963da1','gif.latex?%282022%29_%7B9%7D','九进制数2022',"九进制数2022"],
 ['131792879','35c9fcd092bb03e24dfa.png','23bbcbddeb17ea560146fe4bbe55f9667ca964564071472f7a20543bfef0d4fe',null,'树上边差分初始化：路径5—2—4—6的两端节点5、6各标记1，最近公共祖先节点2标记−2。'],
 ['131792879','78842c5fb58aa6fa97b2.png','a8bd181b161bfe58361f69b0e605d363b62ce45a4b9b5f9e365dd660bebc7aee',null,'边差分从节点6向上回溯到节点2：节点6、4、5的标记为1，节点2由−2累加为−1。'],
 ['131792879','6724ba0a1ceb5cfa9c64.png','d6611c556c6848d11d413d8b147647d36061cf30bcf36f5b5745dbe9757d46bf',null,'边差分回溯完成：节点5、4、6各标记1，对应路径5—2—4—6上的三条边权值各增加1。'],
 ['149880710','259258c6a6bc207bb7ab.png','3fd13a6a187b50e6d2c88c5665fd7c28061fbc2bf794fb0b2401efee17ba09f5',null,'torch.nn逻辑回归训练曲线：训练与测试损失持续下降，准确率分别升至约97.8%和99.3%。'],
 ['149880710','d3d9809ce24ebe68f572.png','fc7f5cea3601c1f53ccb05647a02cdac2e1d5d4508559d620ee88d52a6813c15',null,'从零实现Softmax回归：训练损失持续下降，训练准确率升至约85%，测试准确率中途略有回落，最终约83.5%。'],
 ['149880710','c781d35710ae402c159e.png','57b62a132e24ddbcb6169f7960d56b514e3b2185e94546fe56f1eb400fe2488d',null,'torch.nn实现Softmax回归：训练损失持续下降，训练准确率升至约85%，测试准确率波动上升至约83.4%。'],
 ['124338392','b7c8a264574ee1e7195d.jpg','5b8ba69295d66e78c1e69c0bcb866dd38e2d5687401d3dadcfebf686abfc8da7','99969f0c00f9ccc0fb511c7a1f088408.jpeg','两种积木：I型由两个相邻单位方格组成，L型由三个单位方格组成直角形。',"I型与L型积木"],
 ['124338392','b2047bea65401717ce8a.png','d99a79788cd00f99fa5f9cdca5a33261e3413c0dbb2cc1d6f30ceaf307281cf6','da5e594b0c5ce4cd9d004f772a03591f.png','2×3画布的五种铺法：三个竖I型一种，两个横I型加一个竖I型两种，两个L型两种。',"2×3画布的五种铺法"],
 ['124338392','c7068c3e28122b3ccc72.png','fb51b9fcbbc7f87796ea89c85309e0d24693e662750361492e190b568d02a3ad','b99a41708010461785712a8fe749beed.png','积木画状态00：前i−1列已铺满，第i列上下两格均未被覆盖。',"积木·状态00"],
 ['124338392','9f5799f2574234db7263.png','d9c9c30fd8d33bf783e03e4f25787908d228dccd39e6c7b1b3eda103b276dacc','ae3d8f8df3774c9782351c24a0bb257b.png','状态00转移到00：在第i列竖放一个I型积木，第i+1列上下两格仍为空。',"状态00 → 00"],
 ['124338392','22e8b1306db0807a0b58.png','6a8960cd59ade6ca034da36a1aad32298510267c36a74bce21926335e7774d87','2a3a90ea512c4ee9a3824b23bb287225.png','状态00转移到10：L型积木铺满第i列，并覆盖第i+1列上格，下格仍为空。',"状态00 → 10"],
 ['124338392','3d222547bd0b8dd376ca.png','bc2ce9bbc0f9eb670ad077baa219bd6b767c4852600ca1f1cd253ede8da3c489','17c5f5284fb643c88aefa0375d4779a8.png','状态00转移到01：L型积木铺满第i列，并覆盖第i+1列下格，上格仍为空。',"状态00 → 01"],
 // Informational originals visually checked; add alt only, without visible captions.
 ['124338541','be60532e3a158247397d.png','ee6459596e748b0b92c1737c590e64644a651e2fefb6eaefb045529de90418b1',null,'全排列题面：输入自然数N（1≤N≤9），从小到大输出1到N的所有排列，每行一个。输入2时依次输出12、21；输入3时依次输出123、132、213、231、312、321。'],
 ['131792879','e1df2de5eca5ecc16f09.png','521f410a75d93198309c56ece387f24eaef9dda863251cee30fcc89d76368a77',null,'熵公式：H(S)＝−∑（i从1到n）p(xᵢ)log₂(p(xᵢ))。'],
 ['124460411','ba63f2a7c086e0536048.png','e9d9ea9a86ddc032142565d559c816034f34b1ced65aa81343b812fd51aeed3c',null,'集合{1,2,3,4}与{2,3,4,5}的运算结果：并集{1,2,3,4,5}，交集{2,3,4}，差集{1}，对称差集{1,5}。'],
 ['149880710','8ee68f08799aa1321e8a.png','844892b6f2de91f6655aff546ebb5519140eb3850a185c92deecc82c6569e717',null,'10张服饰灰度样例，从左到右标注为：包、凉鞋、套头衫、凉鞋、凉鞋、连衣裙、衬衫、连衣裙、衬衫、套头衫。']
].map(([sourceId,filename,sha256,oldAlt,alt,caption])=>Object.freeze({sourceId,source:`_posts/csdn/${sourceId}.md`,filename,sha256,oldAlt,alt,caption})));

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
   edits.push({start:text.startIndex,end:text.endIndex+1,value:escapeAttribute(entry.caption??entry.alt)});
  }
  for(const edit of edits.sort((a,b)=>b.start-a.start))content=content.slice(0,edit.start)+edit.value+content.slice(edit.end);
  return content;
 };
}
module.exports={allowlist,entriesForPost,escapeAttribute,createArticleImageAltEnhancer};
