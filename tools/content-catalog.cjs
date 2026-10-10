'use strict';
const {stripHTML,unescapeHTML,escapeHTML}=require('hexo-util');
const {parseDocument}=require('htmlparser2'); // Already used by Hexo's HTML helpers.
const plain=html=>unescapeHTML(stripHTML(String(html||'').replace(/<\/(?:p|h[1-6]|li|tr|pre)>/gi,'$& '))).replace(/\s+/g,' ').trim();
const CODE_PLACEHOLDER='```cpp\n// 在这里填写你的代码\n```';
const ANALYSIS_PLACEHOLDER='> 在这里补充：解题思路、关键推导、时间复杂度、空间复杂度、易错点与复盘记录。';
function sections(markdown,title){
  const pattern=new RegExp('^## '+title+'[ \\t]*\\n([\\s\\S]*?)(?=^#{1,2} |^\\[返回目录\\]|$(?![\\s\\S]))','gm');
  return [...String(markdown||'').replaceAll('\r\n','\n').matchAll(pattern)].map(match=>match[1].trim());
}
function section(markdown,title){return sections(markdown,title).join('\n\n');}
function exerciseState(post){
  if(post.series!=='hot100')return null;
  const raw=post._content||post.raw||'',codes=sections(raw,'代码实现'),analyses=sections(raw,'个人解析');
  const codePlaceholder=codes.length===1&&codes[0]===CODE_PLACEHOLDER,analysisPlaceholder=analyses.length===1&&analyses[0]===ANALYSIS_PLACEHOLDER;
  const hasCode=codes.some(code=>code!==CODE_PLACEHOLDER&&/```[^\n]*\n[\s\S]*?\S[\s\S]*?```/.test(code));
  return {hasCode,hasAnalysis:analyses.some(analysis=>Boolean(analysis&&analysis!==ANALYSIS_PLACEHOLDER)),codePlaceholder,analysisPlaceholder};
}
function problemSummary(post){
  const first=section(post._content||post.raw,'题目要求').split(/\n\s*\n/)[0]||'';
  const text=plain(first.replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/[`*_]/g,''));
  return text.length>110?text.slice(0,109)+'…':text;
}
function metadata(post,catalog={}){
  const entry=catalog[String(post.source_id)]||{},exercise=exerciseState(post);
  const original=[...(post.tags?.toArray?.()||[]).map(t=>t.name),...(post.categories?.toArray?.()||[]).map(t=>t.name)];
  const topics=exercise?[post.topic||'算法']:(entry.topics||original.slice(0,3));
  return {kind:exercise?'exercise':entry.summary?'technical':'writing',topics,tags:[...new Set([...topics,...original])],excerpt:exercise?problemSummary(post):entry.summary||plain(post.content).slice(0,125),exercise};
}
function removeRenderedSection(content,title){
  // Match just the known rendered template block, never everything to the next
  // heading or return link. Unrecognized renderer shapes are kept untouched.
  const body=title==='代码实现'
    ? '<div\\b[^>]*>\\s*<figure\\b[^>]*>[\\s\\S]*?<\\/figure>\\s*<\\/div>'
    : '<blockquote\\b[^>]*>\\s*<p\\b[^>]*>[\\s\\S]*?<\\/p>\\s*<\\/blockquote>';
  const pattern=new RegExp('(<h2\\b[^>]*>(?:(?!<\\/h2>)[\\s\\S])*<\\/h2>)\\s*('+body+')','gi');
  return content.replace(pattern,(all,heading,block)=>{
    const text=plain(block),expected=title==='代码实现'?'// 在这里填写你的代码':ANALYSIS_PLACEHOLDER.slice(2);
    return plain(heading)===title&&(text===expected||(title==='代码实现'&&text==='1 '+expected))?'':all;
  });
}
// Reading-only de-duplication. The catalog keeps its historical text unchanged.
// Normalize only a spaced Markdown em-dash and whitespace, never arbitrary punctuation.
const readerTitle=text=>String(text).replace(/\s+/g,' ').trim().replace(/(^| )---(?= |$)/g,'$1—');
function readerTitleAnchor(content,title){
  // Restrict this to a standard first heading; earlier elements/comments are preserved.
  return content.replace(/^(\s*)<h1\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/h1\s*>/i,(all,space,attributes,body)=>{
    const nodes=parseDocument('<h1'+attributes+'>'+body+'</h1>').children;
    if(nodes.length!==1||nodes[0].name!=='h1')return all;
    const heading=nodes[0];
    function textOf(node){
      if(node.type==='text')return node.data;
      if(node.type!=='tag')return null;
      // Only Hexo's empty generated permalink is disposable. Meaningful links,
      // media, controls and named descendants must survive untouched.
      if(node.name==='a'&&(node.attribs.class||'').split(/\s+/).includes('headerlink')&&node.attribs.href?.startsWith('#')&&!('id'in node.attribs)&&!('name'in node.attribs)&&node.children.every(child=>child.type==='text'&&!child.data.trim()))return '';
      if(!['em','strong','b','i','code','span','small','s','del','mark','sub','sup'].includes(node.name)||'id'in node.attribs||'name'in node.attribs)return null;
      const children=node.children.map(textOf);return children.includes(null)?null:children.join('');
    }
    const parts=heading.children.map(textOf);if(parts.includes(null))return all;
    const normalized=readerTitle(parts.join(''));
    if(!normalized||normalized!==readerTitle(title||''))return all;
    const id=heading.attribs.id;
    return space+'<span class="reader-title-anchor"'+(id?' id="'+escapeHTML(id)+'"':'')+' aria-hidden="true"></span>';
  });
}
function articleContent(page,{reading=false}={}){
  let content=String(page.content||'');const state=exerciseState(page);
  // The raw section must equal the known empty template. Never discard partial work.
  if(state?.codePlaceholder)content=removeRenderedSection(content,'代码实现');
  if(state?.analysisPlaceholder)content=removeRenderedSection(content,'个人解析');
  content=reading?readerTitleAnchor(content,page.title):content.replace(/^(\s*)<h1\b[^>]*>([\s\S]*?)<\/h1>/i,(all,space,title)=>plain(title)===plain(page.title)?space:all);
  return content.replace(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi,(all,level,body)=>plain(body)||/<(?:img|svg|video)\b/i.test(body)?all:'');
}
module.exports={plain,section,exerciseState,metadata,articleContent,CODE_PLACEHOLDER,ANALYSIS_PLACEHOLDER};
