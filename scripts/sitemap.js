'use strict';
const {escapeHTML}=require('hexo-util');
const {canonicalUrl,latestDate,contentDates}=require('../tools/site-metadata.cjs');

hexo.extend.generator.register('nijika-sitemap',async function(locals){
  const entries=new Map();
  const add=(path,lastmod)=>{
    if(!path&&path!=='')return;
    const url=canonicalUrl(this.config,path);
    const relative=url.slice(canonicalUrl(this.config).length);
    if(/^(?:admin(?:\/|$)|404(?:\.html|\/|$))/.test(relative))return;
    const previous=entries.get(url);
    entries.set(url,latestDate([previous,lastmod]));
  };
  locals.posts.forEach(post=>{if(post.published!==false)add(post.path,contentDates(post).updated);});
  locals.pages.forEach(page=>{if(page.published!==false&&page.nijika!=='admin')add(page.path);});
  // Reuse the actual generators, so disabled/empty taxonomy and archive periods
  // cannot turn into invented URLs. Paginated identities are omitted.
  const names=['index','archive','category','tag','nijika-cover','nijika-stage','nijika-after-hours','nijika-hot100','nijika-studio','nijika-practice'];
  for(const name of names){
    const generator=this.extend.generator.get(name);
    if(!generator)continue;
    const generated=await generator.call(this,locals);
    for(const route of (Array.isArray(generated)?generated:[generated]).filter(Boolean)){
      if(route.data?.current>1||route.data?.posts?.length===0)continue;
      add(route.path);
    }
  }
  const body=[...entries].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([url,date])=>'<url><loc>'+escapeHTML(url)+'</loc>'+(date?'<lastmod>'+date+'</lastmod>':'')+'</url>').join('');
  return {path:'sitemap.xml',data:'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+body+'</urlset>'};
});
