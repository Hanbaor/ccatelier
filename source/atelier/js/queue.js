import {$,$$,toast,storage} from './ui.js';
import {getQueue,saveQueue,queueAction,element,action,download,readImport,root} from './archive-store.js';
import {validateQueue} from './notebook-core.mjs';
import {readShelf} from './reading-state.mjs';
import {makeDialog} from './live-dialog.js';
export function initQueue(){
 const {dialog,open}=makeDialog('queue-dialog','阅读队列'),list=element('div'),tools=element('div','live-dialog-tools'),status=element('p','live-status','仅保存在这台浏览器，可以导出备份。'),history=element('div','queue-history');
 const fileLabel=element('label','live-file-label','导入队列 '),file=element('input');file.type='file';file.accept='.json,application/json';fileLabel.append(file);
 const merge=action('加入旧收藏',async()=>{if(merge.disabled)return;merge.disabled=true;try{const {mergeSavedQueue}=await import('./queue-legacy.js');status.textContent=mergeSavedQueue();}catch(error){status.textContent=error.message;}finally{merge.disabled=false;}});
 tools.append(action('导出队列',()=>{try{download('cc-reading-queue.json',JSON.stringify({version:1,queue:getQueue()},null,2));}catch(error){status.textContent=error.message;}}),fileLabel,merge);
 dialog.append(status,history,tools,list);
 file.addEventListener('change',async()=>{try{saveQueue(validateQueue(await readImport(file.files[0]),root));status.textContent='队列已导入。';render();}catch(error){status.textContent=error.message;}file.value='';});
 async function renderHistory(){if(!dialog.open)return;try{const {renderQueueHistory}=await import('./queue-history.js');if(dialog.open)renderQueueHistory(history,getQueue());}catch{if(dialog.open)history.textContent='阅读记录暂时无法加载';}}
 function render(){const q=getQueue();$$('[data-queue-count]').forEach(n=>{n.textContent=q.filter(p=>!p.completed).length;});
  if(!storage.persistent)status.textContent='浏览器存储不可用，队列仅在当前页面有效。请导出后保留。';
  const next=q.find(p=>!p.completed&&p.path!==location.pathname);$$('[data-queue-next]').forEach(a=>{a.hidden=!next;if(next){a.href=next.path;a.textContent='队列下一篇：'+next.title;}});
  if(!dialog.open)return;
  const focused=document.activeElement,focusedRow=focused?.closest('.queue-row'),focusState=focusedRow&&list.contains(focusedRow)?{path:focusedRow.dataset.queuePath,action:focused.dataset.queueAction,index:[...list.children].indexOf(focusedRow)}:null;list.replaceChildren();
  if(!q.length)list.append(element('p','live-status','在笔记目录或文章末尾的「阅读工具」中加入队列。'));
  q.forEach((p,i)=>{const row=element('div','queue-row'+(p.completed?' completed':'')),link=element('a','',p.title);row.dataset.queuePath=p.path;link.href=p.path;const recent=readShelf(storage.get('cc-recent')).find(n=>n.path===p.path);link.append(element('small','',p.completed?'已读 · '+new Date(p.completed).toLocaleDateString():recent?.progress?'读到 '+Math.round(recent.progress*100)+'%':'待阅读'));
   const buttons=element('div');for(const [label,delta] of [['↑',-1],['↓',1]]){const b=action(label,()=>queueAction({type:'move',path:p.path,delta}));b.dataset.queueAction=delta<0?'up':'down';b.setAttribute('aria-label',(delta<0?'上移：':'下移：')+p.title);b.disabled=delta<0?i===0:i===q.length-1;buttons.append(b);}const done=action(p.completed?'重读':'读完',()=>queueAction({type:p.completed?'undone':'done',path:p.path}));done.dataset.queueAction='done';const remove=action('×',()=>queueAction({type:'remove',path:p.path}));remove.dataset.queueAction='remove';remove.setAttribute('aria-label','从队列移除：'+p.title);buttons.append(done,remove);row.append(element('span','',String(i+1).padStart(2,'0')),link,buttons);list.append(row);
  });
  if(focusState){const rows=$$('.queue-row',list),row=rows.find(r=>r.dataset.queuePath===focusState.path)||rows[Math.min(focusState.index,rows.length-1)],control=row&&$$('[data-queue-action]',row).find(b=>b.dataset.queueAction===focusState.action&&!b.disabled);(control||(focusState.action?$('button:not(:disabled)',row||list):null)||$('a',row||list)||$('.live-dialog-head button',dialog))?.focus({preventScroll:true});}
  renderHistory();

 }
 document.addEventListener('atelier:queue',render);window.addEventListener('storage',e=>{if(e.key==='cc-queue'||e.key===null)render();});
 document.addEventListener('click',e=>{if(e.target.closest('.queue-open')){open();render();}const add=e.target.closest('[data-queue-add]');if(add){const queue=queueAction({type:'add',item:{path:location.pathname,title:$('[data-article-tools]')?.dataset.title||document.title}});if(!queue.some(p=>p.path===location.pathname))toast('队列已满，请先移除一些文章');else if(storage.persistent)toast('已加入阅读队列');}if(e.target.closest('[data-queue-done]')){queueAction({type:'add',item:{path:location.pathname,title:$('[data-article-tools]')?.dataset.title||document.title}});const queue=queueAction({type:'done',path:location.pathname});if(!queue.some(p=>p.path===location.pathname&&p.completed))toast('队列已满，请先移除一些文章');else if(storage.persistent)toast('这一篇，读完了。');}});render();
}
