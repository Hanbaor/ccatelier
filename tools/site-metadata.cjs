'use strict';
const {parseDocument}=require('htmlparser2');
const {parse}=require('hexo-front-matter');
const {articleContent}=require('./content-catalog.cjs');

// Always resolve against the configured publication URL, never a request/preview host.
function canonicalUrl(config, path='') {
  const base=new URL(config.url);
  const root=String(config.root||base.pathname||'/').replace(/^\/*|\/*$/g,'');
  let route=String(path).split(/[?#]/,1)[0].replace(/^\/+/, '');
  if(root&&(route===root||route.startsWith(root+'/')))route=route.slice(root.length).replace(/^\/+/, '');
  route=route.replace(/(?:^|\/)index\.html$/, '/').replace(/^\/+/, '');
  if(route&&!/\.[^/]+$/.test(route)&&!route.endsWith('/'))route+='/';
  return new URL('/'+(root?root+'/':'')+route,base.origin).href;
}
function validDate(value) {
  if(value===null||value===undefined||value==='')return null;
  const date=new Date(typeof value?.toISOString==='function'?value.valueOf():value);
  return Number.isFinite(date.valueOf())?date.toISOString():null;
}
function latestDate(values) {return values.map(validDate).filter(Boolean).sort().at(-1)||null;}
// Post.raw retains frontmatter; Post.updated can instead be checkout mtime.
// Only trust a valid explicit source field, then use Hexo's timezone-adjusted value.
function contentDates(post) {
  let source={};
  try {if(typeof post.raw==='string')source=parse(post.raw);} catch {}
  const published=validDate(source.date)?validDate(post.date):null;
  const updated=validDate(source.updated)?validDate(post.updated):null;
  return {published,updated:latestDate([published,updated])};
}
function summary(html) {
  const skip=new Set(['script','style','template','noscript','pre','figcaption','svg','button']);
  function text(node) {
    if(node.type==='text')return node.data;
    if(skip.has(node.name))return '';
    const classes=(node.attribs?.class||'').split(/\s+/);
    if(node.name==='a'&&node.attribs?.href?.startsWith('#'))return '';
    if(node.name==='p'&&(node.children||[]).length===1&&node.children[0].name==='strong'&&node.children[0].children?.[0]?.data==='目录')return '';
    if(classes.some(c=>['headerlink','code-copy','copy-button','gutter'].includes(c)))return '';
    return (node.children||[]).map(text).join('')+(/^(p|div|h[1-6]|li|tr|br|blockquote)$/.test(node.name||'')?' ':'');
  }
  const plain=text(parseDocument(String(html||'').replace(/\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}|<%[\s\S]*?%>/g,'')))
    .replace(/\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\}|<%[\s\S]*?%>/g,'')
    .replace(/\s+/g,' ').trim();
  return [...plain].length>155?[...plain].slice(0,154).join('')+'…':plain;
}
function pageMetadata(context) {
  const {page,config}=context;
  const kind=context.is_category()?'category':context.is_tag()?'tag':context.is_archive()?'archive':context.is_home()?'home':context.is_post()?'post':'page';
  let title=page.title||context.nijika_list_title();
  let description=page.description;
  if(!description){
    if(kind==='category')description=`${config.title} 的「${page.category}」分类文章。`;
    else if(kind==='tag')description=`${config.title} 中标记为「${page.tag}」的文章。`;
    else if(kind==='archive')description=`${config.title} 的${page.year?`${page.year} 年${page.month?` ${page.month} 月`:''}`:'全部'}文章归档。`;
    else if(kind==='home')description=`${config.title} 的笔记：代码、研究与生活的文章。`;
    else if(kind==='post'){
      let content=articleContent(page);
      if(page.series==='hot100'){
        const heading=[...content.matchAll(/<h2\b[^>]*>[\s\S]*?<\/h2>/gi)].find(match=>summary(match[0])==='题目要求');
        if(heading)content=content.slice(heading.index+heading[0].length).split(/<h2\b/i)[0];
      }
      description=summary(content);
    }
    description=description||config.description;
  }
  if(page.current>1){title+=` · 第 ${page.current} 页`;description+=` 第 ${page.current} 页。`;}
  return {title,description,url:canonicalUrl(config,page.path||''),documentTitle:page.nijika==='cover'?config.title:title+' · '+config.title};
}
module.exports={canonicalUrl,validDate,latestDate,contentDates,summary,pageMetadata};
