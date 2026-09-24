import {$,$$,toast} from './ui.js';
import {readQuery,writeQuery,queryArchive} from './archive-core.mjs';
import {loadArchive,getQueue,queueAction,element,action} from './archive-store.js';
import {createConstellation} from './constellation.js';

export async function initArchive(){
 const host=$('[data-archive]');if(!host)return;
 const status=$('[data-archive-count]',host),results=$('[data-archive-results]',host),more=$('[data-archive-more]',host);
 let posts,query=readQuery(location.search),matches=[],limit=18,worker,requestId=0,pendingTimer,graph;
 try{posts=await loadArchive();}catch(error){const p=element('p','live-status',error.message+'，仍可使用下方目录。');p.append(action('重新加载',()=>location.reload()));$('.archive-fallback',host).prepend(p);return;}
 const byPath=new Map(posts.map(p=>[p.path,p]));
 try{worker=new Worker(new URL('./archive-worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{if(data.id!==requestId)return;clearTimeout(pendingTimer);if(data.error){fallback();return;}matches=data.paths.map(path=>byPath.get(path)).filter(Boolean);render();};worker.onerror=()=>{worker.terminate();worker=null;fallback();};}catch{}
 const tags=new Map();posts.forEach(p=>p.tags.forEach(tag=>tags.set(tag,(tags.get(tag)||0)+1)));
 const tagSelect=$('[data-tag]',host);
 [...tags].sort((a,b)=>b[1]-a[1]).forEach(([tag,count],i)=>{const o=element('option','',tag+' · '+count);o.value=tag;tagSelect.append(o);if(i<10){const b=action(tag,()=>change({tag:query.tag===tag?'':tag}));b.dataset.filterTag=tag;$('.archive-filter-tags',host).append(b);}});
 if(query.tag&&!tags.has(query.tag)){const o=element('option','',query.tag);o.value=query.tag;tagSelect.append(o);}
 function fallback(){matches=queryArchive(posts,query);render();}
 function search(){
  clearTimeout(pendingTimer);requestId++;status.textContent='正在调频…';
  if(worker){worker.postMessage({id:requestId,posts,query});pendingTimer=setTimeout(()=>{worker?.terminate();worker=null;fallback();},1500);}else fallback();
 }
 function change(values,replace=false){query={...query,...values};limit=18;const url=location.pathname+writeQuery(query);if(url!==location.pathname+location.search)history[replace?'replaceState':'pushState']({},'',url);sync();search();}
 function sync(){
  $('#archive-q').value=query.q;tagSelect.value=query.tag;$('[data-duration]').value=query.duration;$('#archive-sort').value=query.sort;
  $$('[data-group]',host).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.group===query.group)));
  $$('[data-view]',host).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===query.view)));
  $$('[data-filter-tag]',host).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filterTag===query.tag)));
 }
 function render(){
  status.textContent=matches.length+' / '+posts.length+' 篇记录';results.hidden=query.view==='graph';$('.constellation',host).hidden=query.view!=='graph';more.hidden=query.view==='graph'||matches.length<=limit;
  if(query.view==='graph'){graph ||= createConstellation($('.constellation',host),tag=>change({tag,view:'grid'}));graph.setPosts(matches);return;}
  graph?.pause();results.dataset.mode=query.view;results.replaceChildren();const queue=new Set(getQueue().map(p=>p.path));
  if(!matches.length){const empty=element('div','archive-empty','没有找到这个频率。换个关键词，或清空筛选。');empty.append(action('清空筛选',()=>change(readQuery())));results.append(empty);return;}
  matches.slice(0,limit).forEach((p,i)=>{
   const card=element('article','archive-record');card.style.setProperty('--record-color',p.group==='hot100'?'#caa06a':'#efc66c');
   const top=element('div','record-top');top.append(element('b','',String(i+1).padStart(2,'0')),element('span','',p.group==='hot100'?'SIDE B / STUDY':'SIDE A / NOTES'));
   const h=element('h2'),a=element('a','',p.title);a.href=p.path;h.append(a);
   const bottom=element('div','record-bottom');bottom.append(element('span','',p.minutes+' MIN · '+p.date.slice(2).replaceAll('-','.')));
   const add=action(queue.has(p.path)?'✓':'+',()=>{const exists=getQueue().some(n=>n.path===p.path);queueAction(exists?{type:'remove',path:p.path}:{type:'add',item:p});add.textContent=exists?'+':'✓';add.setAttribute('aria-pressed',String(!exists));toast(exists?'已移出队列':'已加入阅读队列');});add.setAttribute('aria-label','阅读队列：'+p.title);add.setAttribute('aria-pressed',String(queue.has(p.path)));bottom.append(add,element('i','','↗'));
   card.append(top,h,element('p','',p.excerpt),bottom);results.append(card);
  });
 }
 const input=$('#archive-q');let composing=false,debounce;
 input.addEventListener('compositionstart',()=>{composing=true;clearTimeout(debounce);});input.addEventListener('compositionend',()=>{composing=false;change({q:input.value},true);});input.addEventListener('input',()=>{if(composing)return;clearTimeout(debounce);debounce=setTimeout(()=>change({q:input.value},true),160);});
 $('.archive-search').addEventListener('submit',e=>{e.preventDefault();clearTimeout(debounce);change({q:input.value});});$('.archive-search').addEventListener('reset',e=>{e.preventDefault();clearTimeout(debounce);change(readQuery());});
 $$('[data-group]',host).forEach(b=>b.addEventListener('click',()=>change({group:b.dataset.group})));
 $$('[data-view]',host).forEach(b=>b.addEventListener('click',()=>change({view:b.dataset.view})));
 tagSelect.addEventListener('change',()=>change({tag:tagSelect.value}));$('[data-duration]').addEventListener('change',e=>change({duration:e.target.value}));$('#archive-sort').addEventListener('change',e=>change({sort:e.target.value}));
 more.addEventListener('click',()=>{limit+=18;render();});
 const invite=$('[data-graph-invite]');invite.hidden=false;invite.addEventListener('click',()=>{change({view:'graph'});$('.archive-toolbar').scrollIntoView({block:'start'});});
 window.addEventListener('popstate',()=>{query=readQuery(location.search);limit=18;sync();search();});
 document.addEventListener('keydown',e=>{if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.target.closest('input,textarea,select,[contenteditable]')&&!$('dialog[open]')){e.preventDefault();input.focus();}});
 window.addEventListener('pagehide',()=>{worker?.terminate();worker=null;clearTimeout(debounce);clearTimeout(pendingTimer);graph?.pause();});
 window.addEventListener('pageshow',e=>{if(e.persisted){query=readQuery(location.search);sync();search();}});
 $('.archive-app').hidden=false;$('.archive-fallback').hidden=true;sync();search();
}
