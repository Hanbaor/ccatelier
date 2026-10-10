import {$,$$,toast,storage} from './ui.js';
import {getQueue,readQueue,saveQueue,queueAction,element,action,readImport,root} from './archive-store.js';
import {validateQueue} from './notebook-core.mjs';
import {makeDialog} from './live-dialog.js';
export function initQueue(){
 const {dialog,open}=makeDialog('queue-dialog','阅读队列'),list=element('div'),tools=element('div','live-dialog-tools'),status=element('p','live-status','仅保存在这台浏览器，可以导出备份。'),history=element('div','queue-history');
 const fileLabel=element('label','live-file-label','导入队列 '),file=element('input');file.type='file';file.accept='.json,application/json';fileLabel.append(file);
 const merge=action('加入旧收藏',async()=>{if(merge.disabled)return;merge.disabled=true;try{const {mergeSavedQueue}=await import('./queue-legacy.js');status.textContent=mergeSavedQueue();}catch(error){status.textContent=error.message;}finally{merge.disabled=false;}});
 tools.append(action('导出队列',async()=>{try{const {exportQueue}=await import('./queue-backup.js');const message=exportQueue();status.textContent=message;}catch(error){status.textContent=error.message;}}),fileLabel,merge);
 dialog.append(status,history,tools,list);
 file.addEventListener('change',async()=>{try{const result=saveQueue(validateQueue(await readImport(file.files[0]),root));render();status.textContent=result.ok?(result.persisted?'队列已导入。':'队列仅在当前页面有效，请导出备份。'):result.error;}catch(error){status.textContent=error.message;}file.value='';});
 const listError='队列列表暂时无法加载，请重新打开重试。';
 let renderList,loading=false,readError='';
 async function loadList(){if(loading)return;loading=true;try{const {createQueueList}=await import('./queue-list.js');renderList=createQueueList(list,dialog);if(status.textContent===listError)status.textContent='';if(dialog.open)renderList(readQueue());}catch{if(dialog.open)status.textContent=listError;}finally{loading=false;}}
 async function renderHistory(){if(!dialog.open)return;try{const {renderQueueHistory}=await import('./queue-history.js');if(dialog.open)renderQueueHistory(history,getQueue());}catch{if(dialog.open)history.textContent='阅读记录暂时无法加载';}}
 function render(){const state=readQueue(),q=state.queue;$$('[data-queue-count]').forEach(n=>{n.textContent=q.filter(p=>!p.completed).length;});
  if(state.error||readError)status.textContent=state.error||'仅保存在这台浏览器，可以导出备份。';readError=state.error;if(!state.error&&!storage.persistent)status.textContent='浏览器存储不可用，队列仅在当前页面有效。请导出后保留。';
  const next=q.find(p=>!p.completed&&p.path!==location.pathname);$$('[data-queue-next]').forEach(a=>{a.hidden=!next;if(next){a.href=next.path;a.textContent='队列下一篇：'+next.title;}});
  if(!dialog.open)return;
  if(renderList)renderList(state);else loadList();
  renderHistory();

 }
 document.addEventListener('atelier:queue',render);window.addEventListener('storage',e=>{if(e.key==='cc-queue'||e.key===null)render();});
 document.addEventListener('click',e=>{if(e.target.closest('.queue-open')){open();render();}const add=e.target.closest('[data-queue-add]'),done=e.target.closest('[data-queue-done]');if(add||done){let result=queueAction({type:'add',item:{path:location.pathname,title:$('[data-article-tools]')?.dataset.title||document.title}});if(result.ok&&done)result=queueAction({type:'done',path:location.pathname});if(result.ok&&result.persisted)toast(done?'这一篇，读完了。':'已加入阅读队列');}});render();
}
