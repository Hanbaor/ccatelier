import {$,$$,toast,storage} from './ui.js';
import {getQueue,saveQueue,queueAction,element,action,download,readImport,root} from './archive-store.js';
import {validateQueue} from './notebook-core.mjs';
import {readShelf} from './reading-state.mjs';
import {makeDialog} from './live-dialog.js';
export function initQueue(){
 const {dialog,open}=makeDialog('queue-dialog','阅读队列 / SETLIST'),list=element('div'),tools=element('div','live-dialog-tools'),status=element('p','live-status','仅保存在这台浏览器，可以导出备份。'),history=element('div','queue-history');
 const fileLabel=element('label','live-file-label','导入队列 '),file=element('input');file.type='file';file.accept='.json,application/json';fileLabel.append(file);
 tools.append(action('导出队列',()=>download('cc-reading-queue.json',JSON.stringify({version:1,queue:getQueue()},null,2))),fileLabel,action('加入旧收藏',()=>{const saved=readShelf(storage.get('cc-saved'));for(const item of saved)queueAction({type:'add',item});status.textContent='已合并 '+saved.length+' 条收藏；重复文章只保留一份。';}));
 dialog.append(status,history,tools,list);
 file.addEventListener('change',async()=>{try{saveQueue(validateQueue(await readImport(file.files[0]),root));status.textContent='队列已导入。';render();}catch(error){status.textContent=error.message;}file.value='';});
 function render(){const q=getQueue();list.replaceChildren();$$('[data-queue-count]').forEach(n=>{n.textContent=q.filter(p=>!p.completed).length;});
  if(!q.length)list.append(element('p','live-status','在唱片架或文章工作台点「加入队列」，排好接下来想读的文章。'));
  q.forEach((p,i)=>{const row=element('div','queue-row'+(p.completed?' completed':'')),link=element('a','',p.title);link.href=p.path;const recent=readShelf(storage.get('cc-recent')).find(n=>n.path===p.path);link.append(element('small','',p.completed?'已读 · '+new Date(p.completed).toLocaleDateString():recent?.progress?'读到 '+Math.round(recent.progress*100)+'%':'待阅读'));
   const buttons=element('div');for(const [label,delta] of [['↑',-1],['↓',1]]){const b=action(label,()=>queueAction({type:'move',path:p.path,delta}));b.setAttribute('aria-label',(delta<0?'上移：':'下移：')+p.title);b.disabled=delta<0?i===0:i===q.length-1;buttons.append(b);}const done=action(p.completed?'重读':'读完',()=>queueAction({type:p.completed?'undone':'done',path:p.path}));const remove=action('×',()=>queueAction({type:'remove',path:p.path}));remove.setAttribute('aria-label','从队列移除：'+p.title);buttons.append(done,remove);row.append(element('span','',String(i+1).padStart(2,'0')),link,buttons);list.append(row);
  });
  history.replaceChildren();let total=0;for(let i=13;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const date=d.toLocaleDateString(),count=q.filter(p=>p.completed&&new Date(p.completed).toLocaleDateString()===date).length;total+=count;const bar=element('i');bar.style.height=Math.max(3,Math.min(38,count*7))+'px';bar.title=date+'：完成 '+count+' 篇';history.append(bar);}history.setAttribute('role','img');history.setAttribute('aria-label','最近14天，队列中完成 '+total+' 篇文章');
  if(!storage.persistent)status.textContent='浏览器存储不可用，队列仅在当前页面有效。请导出后保留。';
  const next=q.find(p=>!p.completed&&p.path!==location.pathname);$$('[data-queue-next]').forEach(a=>{a.hidden=!next;if(next){a.href=next.path;a.textContent='队列下一篇：'+next.title+' ↗';}});
 }
 document.addEventListener('atelier:queue',render);window.addEventListener('storage',e=>{if(e.key==='cc-queue')render();});
 document.addEventListener('click',e=>{if(e.target.closest('.queue-open')){render();open();}const add=e.target.closest('[data-queue-add]');if(add){queueAction({type:'add',item:{path:location.pathname,title:$('[data-article-tools]')?.dataset.title||document.title}});toast('已加入阅读队列');}if(e.target.closest('[data-queue-done]')){queueAction({type:'add',item:{path:location.pathname,title:$('[data-article-tools]')?.dataset.title||document.title}});queueAction({type:'done',path:location.pathname});toast('这一篇，读完了。');}});render();
}
