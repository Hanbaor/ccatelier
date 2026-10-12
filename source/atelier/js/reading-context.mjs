import {readQuery,writeQuery} from './archive-core.mjs';
import {safePath} from './reading-state.mjs';

// Entry context travels with this one native link, never with a browser-wide
// session. Only the Notes route and its bounded, known filters can be returned to.
const origin='https://reading.invalid',maxReturnLength=4096,maxSearchLength=16384;
const choices={group:['all','writing','hot100'],duration:['all','short','medium','long'],sort:['newest','oldest','minutes','title'],view:['list','grid','graph']};
const validRoot=root=>safePath(root)&&root.endsWith('/');
function localURL(href,root,maxLength=maxReturnLength){
 if(!validRoot(root)||typeof href!=='string'||href.length>maxLength||/[\\\u0000-\u0020\u007f]/.test(href))return null;
 const path=href.split(/[?#]/,1)[0];
 if(!safePath(path)||!path.startsWith(root))return null;
 try{const url=new URL(href,origin);return url.origin===origin&&url.pathname===path?url:null;}catch{return null;}
}
function notesContext(href,root){
 const url=localURL(href,root);if(!url||url.pathname!==root+'notes/'||!['','#notes-catalog','#reading-paths'].includes(url.hash))return null;
 try{decodeURIComponent(url.search);}catch{return null;}
 const seen=new Set();
 for(const [key,value] of url.searchParams){
  if(seen.has(key)||/[\u0000-\u001f\u007f]/.test(value))return null;seen.add(key);
  if(key==='q'||key==='tag'){if(value.length>(key==='q'?200:80))return null;}
  else if(!Object.hasOwn(choices,key)||!choices[key].includes(value))return null;
 }
 const query=writeQuery(readQuery(url.search)),section=url.hash==='#reading-paths'?'paths':'catalog';
 return {href:root+'notes/'+query+(section==='paths'?'#reading-paths':'#notes-catalog'),label:section==='paths'?'返回选读路径':query?'返回筛选结果':'返回笔记目录',section};
}

export function readNotesContext(search='',root='/'){
 if(typeof search!=='string'||search.length>maxSearchLength)return null;
 const values=new URLSearchParams(search).getAll('notes');
 return values.length===1?notesContext(values[0],root):null;
}

// Returns null for an unsafe destination. Existing article fragments are kept;
// unrelated query parameters are not propagated into a new reading journey.
export function notesEntryHref(articleHref,returnHref,root='/'){
 const article=localURL(articleHref,root,maxSearchLength);if(!article)return null;
 const context=notesContext(returnHref,root),query=new URLSearchParams();
 if(context)query.set('notes',context.href);
 return article.pathname+(query.size?'?'+query.toString():'')+article.hash;
}
