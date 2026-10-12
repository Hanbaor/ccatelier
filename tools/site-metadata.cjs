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
// Existing on-page artwork only; unknown/custom assets must not inherit its dimensions or alt.
const defaultCover='/atelier/images/v3/hero.webp';
const defaultReadingArt='/atelier/images/v2/notes.webp';
const artwork={
  [defaultCover]:{width:1916,height:821,alt:'舞台追光下演奏鼓组的伊地知虹夏，本站主题同人插画'},
  '/atelier/images/v3/projects.webp':{width:1672,height:941,alt:'虹夏在电子制作桌前创作的项目主题插画'},
  '/atelier/images/v3/about.webp':{width:1024,height:1536,alt:'舞台灯光中的虹夏主题肖像插画'},
  '/atelier/images/v2/notes.webp':{width:1536,height:1024,alt:'日光窗边写笔记的虹夏主题插画'},
  '/atelier/images/v2/research.webp':{width:1536,height:1024,alt:'虹夏抱着笔记本，在星图与暖灯之间沉思的研究室主题插画'},
  '/atelier/images/v5/practice-room.webp':{width:1536,height:1024,alt:'虹夏在日光排练室练习深蓝鼓组的主题插画'}
};
const sceneMetadata={
  cover:{image:defaultCover,description:'CC 的个人网站：阅读代码与学习笔记，探索课程实践、网站工程和声音实验。'},
  projects:{image:'/atelier/images/v3/projects.webp',description:'CC Atelier、EduRAG 与 Transformer 课程实践：个人网站工程、课程材料检索问答和德英翻译实验。'},
  about:{image:defaultCover,description:'关于 CC：关注 AI Agent、Database 与 Text-to-SQL，记录学习笔记和动手做的小实验。'},
  notes:{image:defaultCover,description:'CC 的学习手记：数据结构、算法与机器学习笔记，沿主题路径阅读，也可按分类查找文章。'},
  research:{image:'/atelier/images/v2/research.webp',description:'Database 与 Text-to-SQL 的关注与练习：通过 SQL 教学实验，对照查询意图、边界数据与执行结果。'},
  studio:{image:defaultCover,description:'在浏览器里编排鼓点与试听节奏，导出 MIDI 或 WAV，探索互动鼓组和现场灯光。'},
  atelier:{image:defaultCover,description:'CC 的创作室：从鼓谱排练和节奏编排，到个人网站工程与写作足迹，打开作品，也动手试试。'}
};
function shareImageUrl(config,value){
  if(typeof value!=='string'||!value.trim())return null;
  value=value.trim();
  if(/[\\\u0000-\u001f\u007f]/.test(value)||/^[?#]/.test(value))return null;
  try {
    if(/^(?:https?:)?\/\/[^/]/i.test(value)){
      const url=new URL(value,config.url);
      return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;
    }
    // Do not reinterpret broken absolute URLs or unsupported schemes as local image paths.
    if(/^[a-z][a-z\d+.-]*:|^\/\//i.test(value))return null;
    const suffix=value.match(/[?#].*$/)?.[0]||'';
    return canonicalUrl(config,value)+suffix;
  } catch {return null;}
}
function shareMetadata(context,kind){
  const {page,config}=context,theme=context.theme?.nijika||{};
  // The writing index has no nijika marker; Hot100 reuses "notes" but is a separate series.
  const scene=kind==='post'||page.seriesPosts?null:sceneMetadata[page.nijika||(kind==='home'?'notes':'')];
  const fallback=canonicalUrl(config,defaultCover);
  const cover=shareImageUrl(config,theme.cover)||fallback;
  const customCover=cover!==fallback;
  // Keep the wide stage fallback for portrait/top-aligned artwork that a share card may crop.
  // A genuinely custom reading illustration remains an explicit override.
  const readingImage=shareImageUrl(config,theme.reading_art);
  const sceneImage=page.nijika==='studio'?shareImageUrl(config,theme.studio_art)
    :(kind==='home'||page.nijika==='notes')&&readingImage!==canonicalUrl(config,defaultReadingArt)?readingImage:null;
  const url=shareImageUrl(config,page.cover)||(customCover?cover
    :scene?(sceneImage||shareImageUrl(config,scene.image)):cover)||fallback;
  const known=Object.entries(artwork).find(([path])=>canonicalUrl(config,path)===url)?.[1];
  return {description:scene?.description,image:{url,...known}};
}
function pageMetadata(context) {
  const {page,config}=context;
  const kind=context.is_category()?'category':context.is_tag()?'tag':context.is_archive()?'archive':context.is_home()?'home':context.is_post()?'post':'page';
  const share=shareMetadata(context,kind);
  let title=page.title||context.nijika_list_title();
  let description=page.description||share.description;
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
  return {title,description,image:share.image,url:canonicalUrl(config,page.path||''),documentTitle:page.nijika==='cover'?config.title:title+' · '+config.title};
}
module.exports={canonicalUrl,validDate,latestDate,contentDates,summary,pageMetadata};
