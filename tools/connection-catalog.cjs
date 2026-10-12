'use strict';
const {parseDocument}=require('htmlparser2');
const GENERIC=new Set(['算法','算法学习','LeetCode','CC Atelier','随笔','技巧','普通数组']);
const compare=(a,b)=>a<b?-1:a>b?1:0;
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function conceptPattern(term){return new RegExp((/^[\x00-\x7f]+$/.test(term)?'(?<![A-Za-z0-9_])':'')+escape(term)+(/^[\x00-\x7f]+$/.test(term)?'(?![A-Za-z0-9_])':''),'iu');}
function sourceBlocks(html){
 const blocks=[];let anchor='';
 function text(node){if(node.type==='text')return node.data;if(['script','style','template'].includes(node.name)||(node.attribs?.class||'').split(/\s+/).includes('gutter'))return '';if(node.name==='br')return '\n';return (node.children||[]).map(text).join('');}
 function visit(node){
  if(blocks.length>=4000||['script','style','template','table','nav'].includes(node.name))return;
  if(/^h[1-6]$/.test(node.name||'')){if(node.attribs?.id)anchor=node.attribs.id;return;}
  if(node.name==='figure'&&(node.attribs?.class||'').split(/\s+/).includes('highlight')){const value=text(node);if(value.trim())blocks.push({text:value,anchor,kind:'code'});return;}
  const containsCode=n=>(n.children||[]).some(child=>child.name==='pre'||child.name==='figure'||containsCode(child));
  if(node.name==='pre'||node.name==='p'||(node.name==='li'&&!containsCode(node))){
   const value=text(node);
   if(value.trim()&&!/^\s*(?:LeetCode #\d+|返回目录\s*$)/.test(value))blocks.push({text:value,anchor,kind:node.name==='pre'?'code':'prose'});
   return;
  }
  for(const child of node.children||[])visit(child);
 }
 visit(parseDocument(String(html||''),{decodeEntities:true}));return blocks;
}
function evidenceFor(blocks,concept){
 const pattern=conceptPattern(concept);
 for(const kind of ['prose','code'])for(const block of blocks){
  if(block.kind!==kind)continue;const hit=pattern.exec(block.text);if(!hit)continue;
  // Bound by Unicode code points, preserving an exact substring of decoded source.
  const before=Array.from(block.text.slice(0,hit.index)),after=Array.from(block.text.slice(hit.index));
  const left=before.slice(-40).join(''),right=after.slice(0,120).join('');
  return {concept,kind,anchor:block.anchor,excerpt:left+right,before:before.length>40,after:after.length>120};
 }
 return null;
}
function connectionCatalog(entries){
 const concepts=[...new Set(entries.flatMap(entry=>entry.topics||[]).concat(['lower_bound','upper_bound']))].filter(term=>typeof term==='string'&&term.length>=2&&term.length<=60&&!GENERIC.has(term)).sort(compare).slice(0,128);
 const posts=entries.map(entry=>{const blocks=sourceBlocks(entry.html);return {path:entry.path,evidence:concepts.map(term=>evidenceFor(blocks,term)).filter(Boolean)};}).sort((a,b)=>compare(a.path,b.path));
 return {version:1,posts};
}
module.exports={connectionCatalog,sourceBlocks,evidenceFor,conceptPattern};
