import {$,$$,toast} from './ui.js';
import {readQuery,writeQuery,queryArchive} from './archive-core.mjs';
import {loadArchive,getQueue,queueAction,element,action} from './archive-store.js';

export async function initArchive({loadConstellation=()=>import('./constellation.js')}={}){
 const host=$('[data-archive]');if(!host)return;
 const status=$('[data-archive-count]',host),results=$('[data-archive-results]',host),more=$('[data-archive-more]',host);
 let posts,query=readQuery(location.search),matches=[],limit=18,worker,requestId=0,pendingTimer,graph,graphPromise,pageActive=true;
 const graphHost=$('.constellation',host),graphControls=$$('button,select',graphHost);
 let graphNotice;
 function graphStatus(message,retry=false){
  graphNotice ||= element('p','live-status');graphNotice.setAttribute('role','status');graphNotice.dataset.readerExclude='';
  graphNotice.replaceChildren(document.createTextNode(message));if(retry)graphNotice.append(action('重新加载',showGraph));
  if(!graphNotice.isConnected)graphHost.prepend(graphNotice);
 }
 function graphBusy(busy){graphHost.setAttribute('aria-busy',String(busy));graphControls.forEach(control=>{control.disabled=busy;});}
 function showGraph(){
  if(graph){if(pageActive&&query.view==='graph')graph.setPosts(matches);return;}
  if(graphPromise)return;
  graphBusy(true);graphStatus('主题星图正在加载…');
  graphPromise=Promise.resolve().then(loadConstellation).then(module=>{
   // A late import may be cached, but must not start a hidden or abandoned graph.
   if(!pageActive||query.view!=='graph')return;
   graph=module.createConstellation(graphHost,tag=>change({tag,view:'grid'}));
   graphNotice?.remove();graphBusy(false);graph.setPosts(matches);
  }).catch(()=>{graphBusy(true);graphHost.setAttribute('aria-busy','false');graphStatus('主题星图暂未载入，可以继续使用卡片或列表。 ',true);}).finally(()=>{graphPromise=null;});
 }
 try{posts=await loadArchive();}catch(error){const p=element('p','live-status',error.message+'，仍可使用下方目录。');p.append(action('重新加载',()=>location.reload()));$('.archive-fallback',host).prepend(p);return;}
 const byPath=new Map(posts.map(p=>[p.path,p]));
 try{worker=new Worker(new URL('./archive-worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{if(data.id!==requestId)return;clearTimeout(pendingTimer);if(data.error){fallback();return;}matches=data.paths.map(path=>byPath.get(path)).filter(Boolean);render();};worker.onerror=()=>{worker.terminate();worker=null;fallback();};}catch{}
 const tagSelect=$('[data-tag]',host),options=$('.archive-options',host);let tagScope;
 // Reveal incoming advanced state once; later searches must respect manual collapse.
 if(options&&(query.tag||query.duration!=='all'||query.sort!=='newest'||query.view!=='list'))options.open=true;
 function syncTags(){
  if(tagScope===query.group){
   if(query.tag&&![...tagSelect.options].some(o=>o.value===query.tag)){const option=element('option','',query.tag+' · 0');option.value=query.tag;tagSelect.append(option);}
   return;
  }
  tagScope=query.group;const tags=new Map();
  posts.filter(p=>query.group==='all'||p.group===query.group).forEach(p=>p.tags.forEach(tag=>tags.set(tag,(tags.get(tag)||0)+1)));
  tagSelect.replaceChildren(element('option','','所有主题'));tagSelect.firstElementChild.value='';
  const shortcuts=$('.archive-filter-tags',host);shortcuts.replaceChildren();
  [...tags].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh-CN')).forEach(([tag,count],i)=>{
   const option=element('option','',tag+' · '+count);option.value=tag;tagSelect.append(option);
   if(i<10){const button=action(tag,()=>change({tag:query.tag===tag?'':tag}));button.dataset.filterTag=tag;shortcuts.append(button);}
  });
  if(query.tag&&!tags.has(query.tag)){const option=element('option','',query.tag+' · 0');option.value=query.tag;tagSelect.append(option);}
 }
 function fallback(){clearTimeout(pendingTimer);matches=queryArchive(posts,query);render();}
 function search(){
  clearTimeout(pendingTimer);requestId++;status.textContent='正在筛选…';status.classList.remove('sr-only');
  if(worker){worker.postMessage({id:requestId,posts,query});pendingTimer=setTimeout(()=>{worker?.terminate();worker=null;fallback();},1500);}else fallback();
 }
 function change(values,replace=false){query={...query,...values};limit=18;const url=location.pathname+writeQuery(query);if(url!==location.pathname+location.search)history[replace?'replaceState':'pushState']({},'',url);sync();search();}
 function sync(){
  syncTags();
  const hasFilters=Boolean(query.q.trim()||query.tag||query.duration!=='all');
  $('.archive-search [type=reset]',host).hidden=!hasFilters;
  $('#archive-q').value=query.q;tagSelect.value=query.tag;$('[data-duration]').value=query.duration;$('#archive-sort').value=query.sort;
  $$('[data-group]',host).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.group===query.group)));
  $$('[data-view]',host).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===query.view)));
  $$('[data-filter-tag]',host).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filterTag===query.tag)));
 }
 function syncQueue(){const queued=new Set(getQueue().map(p=>p.path));$$('[data-queue-path]',results).forEach(button=>{const added=queued.has(button.dataset.queuePath);button.textContent=added?'✓':'+';button.setAttribute('aria-pressed',String(added));});}
 function render(){
  const total=posts.filter(p=>query.group==='all'||p.group===query.group).length;
  const hasFilters=Boolean(query.q.trim()||query.tag||query.duration!=='all');
  status.classList.toggle('sr-only',!hasFilters&&matches.length>0);
  status.textContent=matches.length+' / '+total+(query.group==='hot100'?' 道题':query.group==='writing'?' 篇笔记':' 条内容');results.hidden=query.view==='graph';$('.constellation',host).hidden=query.view!=='graph';more.hidden=query.view==='graph'||matches.length<=limit;
  if(query.view==='graph'){showGraph();return;}
  graph?.pause();results.dataset.mode=query.view;results.replaceChildren();const queue=new Set(getQueue().map(p=>p.path));
  if(!matches.length){const empty=element('div','archive-empty','没有符合条件的内容。换个关键词，或清空筛选。');empty.append(action('清空筛选',()=>change(readQuery())));results.append(empty);return;}
  matches.slice(0,limit).forEach((p,i)=>{
   const card=element('article','archive-record');card.dataset.group=p.group;card.style.setProperty('--record-color',p.group==='hot100'?'#caa06a':'#efc66c');
   const top=p.group==='hot100'?element('div','record-top',String(p.order||i+1).padStart(3,'0')):null;
   const h=element('h2'),a=element('a','',p.title);a.href=p.path;h.append(a);
   const bottom=element('div','record-bottom');const date=element('time','',p.date.slice(0,10).replaceAll('-','.'));date.dateTime=p.date.slice(0,10);bottom.append(date);
   const add=action(queue.has(p.path)?'✓':'+',()=>{const exists=getQueue().some(n=>n.path===p.path);queueAction(exists?{type:'remove',path:p.path}:{type:'add',item:p});toast(exists?'已移出队列':'已加入阅读队列');});add.dataset.queuePath=p.path;add.setAttribute('aria-label','阅读队列：'+p.title);add.setAttribute('aria-pressed',String(queue.has(p.path)));bottom.append(add);
   const context=element('div','record-context');
   if(p.exercise){context.append(element('span','record-state',p.exercise.hasCode?'已有代码':'题面'));if(!p.exercise.hasAnalysis)context.append(element('span','','解析待补'));}
   (p.topics||p.tags||[]).slice(0,2).forEach(topic=>context.append(element('span','',topic)));
   if(p.difficulty)context.append(element('span','',p.difficulty));
   if(top)card.append(top);card.append(h,element('p','',p.excerpt),context,bottom);results.append(card);
  });
 }
 const input=$('#archive-q');let composing=false,debounce;
 input.addEventListener('compositionstart',()=>{composing=true;clearTimeout(debounce);});input.addEventListener('compositionend',()=>{composing=false;change({q:input.value},true);});input.addEventListener('input',()=>{if(composing)return;clearTimeout(debounce);debounce=setTimeout(()=>change({q:input.value},true),160);});
 $('.archive-search').addEventListener('submit',e=>{e.preventDefault();clearTimeout(debounce);change({q:input.value});});$('.archive-search').addEventListener('reset',e=>{e.preventDefault();clearTimeout(debounce);change(readQuery());});
 $$('[data-group]',host).forEach(b=>b.addEventListener('click',()=>change({group:b.dataset.group,tag:''})));
 $$('[data-view]',host).forEach(b=>b.addEventListener('click',()=>change({view:b.dataset.view})));
 tagSelect.addEventListener('change',()=>change({tag:tagSelect.value}));$('[data-duration]').addEventListener('change',e=>change({duration:e.target.value}));$('#archive-sort').addEventListener('change',e=>change({sort:e.target.value}));
 more.addEventListener('click',()=>{limit+=18;render();});
 const invite=$('[data-graph-invite]');if(invite){invite.hidden=false;invite.addEventListener('click',()=>{change({view:'graph'});$('.archive-toolbar').scrollIntoView({block:'start'});});}
 document.addEventListener('atelier:queue',syncQueue);window.addEventListener('storage',e=>{if(e.key==='cc-queue'||e.key===null)syncQueue();});
 window.addEventListener('popstate',()=>{query=readQuery(location.search);limit=18;sync();search();});
 document.addEventListener('keydown',e=>{if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.target.closest('input,textarea,select,[contenteditable]')&&!$('dialog[open]')){e.preventDefault();input.focus();}});
 window.addEventListener('pagehide',()=>{pageActive=false;worker?.terminate();worker=null;clearTimeout(debounce);clearTimeout(pendingTimer);graph?.pause();});
 window.addEventListener('pageshow',e=>{pageActive=true;if(e.persisted){query=readQuery(location.search);sync();search();}});
 $('.archive-app').hidden=false;$('.archive-fallback').hidden=true;sync();search();
}
