'use strict';
const {stripHTML,escapeHTML} = require('hexo-util');
const {articleContent}=require('../tools/content-catalog.cjs');
const {canonicalUrl,validDate,latestDate,contentDates,summary}=require('../tools/site-metadata.cjs');

hexo.extend.helper.register('after_hours_counts',function(){
  const posts=this.site.posts.toArray();return {posts:posts.length,writing:posts.filter(p=>p.series!=='hot100').length,series:posts.filter(p=>p.series==='hot100').length,tags:this.site.tags.length};
});
hexo.extend.helper.register('after_hours_minutes',function(content){return Math.max(1,Math.ceil(stripHTML(content||'').length/500));});
hexo.extend.generator.register('after-hours-discovery',function(locals){
  const root=this.config.root||'/';
  const posts=locals.posts.sort('date',-1).toArray();
  const entries=posts.map(post=>({title:post.title,path:root+post.path.replace(/^\//,''),group:post.series==='hot100'?'hot100':'writing',date:(validDate(post.date)||validDate(post.updated)||'').slice(0,10),minutes:Math.max(1,Math.ceil(stripHTML(post.content||'').length/500))}));
  const base=canonicalUrl(this.config);
  const absolute=post=>canonicalUrl(this.config,post.path);
  const writing=posts.filter(p=>p.series!=='hot100').slice(0,20);
  // A stable epoch is used only when no emitted entry has any valid date.
  const dates=new Map(writing.map(post=>[post,contentDates(post)]));
  const updated=latestDate(writing.map(post=>dates.get(post).updated))||'1970-01-01T00:00:00.000Z';
  const published=post=>dates.get(post).published||dates.get(post).updated||updated;
  const modified=post=>dates.get(post).updated||updated;
  const atom='<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><title>'+escapeHTML(this.config.title)+'</title><id>'+escapeHTML(base)+'</id><link href="'+escapeHTML(base)+'"/><link rel="self" href="'+escapeHTML(base+'atom.xml')+'"/><updated>'+updated+'</updated><author><name>'+escapeHTML(this.config.author)+'</name></author>'+writing.map(post=>'<entry><title>'+escapeHTML(post.title)+'</title><id>'+escapeHTML(absolute(post))+'</id><link href="'+escapeHTML(absolute(post))+'"/><published>'+published(post)+'</published><updated>'+modified(post)+'</updated><summary>'+escapeHTML(summary(articleContent(post)))+'</summary></entry>').join('')+'</feed>';
  return [{path:'atelier/data/discovery.json',data:JSON.stringify(entries)},{path:'atom.xml',data:atom}];
});
