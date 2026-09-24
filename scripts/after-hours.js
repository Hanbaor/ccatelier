'use strict';
const {stripHTML,escapeHTML} = require('hexo-util');

hexo.extend.helper.register('after_hours_counts',function(){
  const posts=this.site.posts.toArray();return {posts:posts.length,writing:posts.filter(p=>p.series!=='hot100').length,series:posts.filter(p=>p.series==='hot100').length,tags:this.site.tags.length};
});
hexo.extend.helper.register('after_hours_minutes',function(content){return Math.max(1,Math.ceil(stripHTML(content||'').length/500));});
hexo.extend.generator.register('after-hours-discovery',function(locals){
  const root=this.config.root||'/';
  const posts=locals.posts.sort('date',-1).toArray();
  const entries=posts.map(post=>({title:post.title,path:root+post.path.replace(/^\//,''),group:post.series==='hot100'?'hot100':'writing',date:post.date.toISOString().slice(0,10),minutes:Math.max(1,Math.ceil(stripHTML(post.content||'').length/500))}));
  const base=this.config.url.replace(/\/$/,'')+'/';
  const absolute=post=>base+post.path.replace(/^\//,'');
  const writing=posts.filter(p=>p.series!=='hot100').slice(0,20);
  const atom='<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><title>'+escapeHTML(this.config.title)+'</title><id>'+escapeHTML(base)+'</id><link href="'+escapeHTML(base)+'"/><link rel="self" href="'+escapeHTML(base+'atom.xml')+'"/><updated>'+(writing[0]?.date.toISOString()||new Date().toISOString())+'</updated><author><name>'+escapeHTML(this.config.author)+'</name></author>'+writing.map(post=>'<entry><title>'+escapeHTML(post.title)+'</title><id>'+escapeHTML(absolute(post))+'</id><link href="'+escapeHTML(absolute(post))+'"/><published>'+post.date.toISOString()+'</published><updated>'+(post.updated||post.date).toISOString()+'</updated><summary>'+escapeHTML(stripHTML(post.content||'').slice(0,220))+'</summary></entry>').join('')+'</feed>';
  return [{path:'atelier/data/discovery.json',data:JSON.stringify(entries)},{path:'atom.xml',data:atom}];
});
