import {withImportDeadline} from './ui.js';
import {readQueue,saveQueue,element,action,readImport,root} from './archive-store.js';
import {validateQueue} from './notebook-core.mjs';

// Loaded only after the user opens the queue. No global event bindings: the shell
// owns lifecycle events, so a partially initialized controller is never rebound.
export function createQueueDialog(host,dialog,active){
 const status=element('p','live-status queue-operation-status'),tools=element('div','live-dialog-tools'),history=element('div','queue-history'),list=element('div');
 const fileLabel=element('label','live-file-label','导入队列 '),file=element('input');file.type='file';file.accept='.json,application/json';fileLabel.append(file);
 let importRevision=0,feedbackRevision=0;
 const cancelImport=()=>{++importRevision;};
 const tasks=[];
 function operation(label,load,run){
  let attempt;
  const button=action(label,async()=>{
   if(!active()||attempt||button.disabled)return;
   const request={feedback:++feedbackRevision};attempt=request;button.disabled=true;let loaded=false;
   try{
    const module=await withImportDeadline(load());
    if(attempt!==request||!active())return;
    loaded=true;const message=run(module);
    if(request.feedback===feedbackRevision)status.textContent=message;
   }catch(error){if(attempt===request&&active()&&request.feedback===feedbackRevision)status.textContent=loaded?error.message:label+'暂时无法加载，请重试；若仍失败，请刷新页面。';}
   finally{if(attempt===request){attempt=null;button.disabled=!active();}}
  });
  tasks.push({retire(){attempt=null;button.disabled=true;},resume(){button.disabled=false;}});return button;
 }
 const backup=operation('导出队列',()=>import('./queue-backup.js'),module=>module.exportQueue());
 const merge=operation('加入旧收藏',()=>import('./queue-legacy.js'),module=>module.mergeSavedQueue());
 tools.append(backup,fileLabel,merge);
 function importSnapshot(){const state=readQueue();let raw,available=true;try{raw=localStorage.getItem('cc-queue');}catch{available=false;}return JSON.stringify([state.raw,!!state.unavailable,raw,available]);}
 file.addEventListener('change',async()=>{
  const selected=file.files[0];file.value='';const request=++importRevision;if(!selected||!active()||!dialog.open)return;
  const before=importSnapshot(),feedback=++feedbackRevision;
  function current(){if(request!==importRevision||!active()||!dialog.open)return false;if(importSnapshot()!==before){if(feedback===feedbackRevision)status.textContent='队列已变化，请重新选择备份。';return false;}return true;}
  try{
   const incoming=validateQueue(await readImport(selected),root);if(!current())return;
   const result=saveQueue(incoming);
   if(feedback===feedbackRevision)status.textContent=result.ok?(result.persisted?'队列已导入。':'队列仅在当前页面有效，请导出备份。'):result.error;
  }catch(error){if(current()&&feedback===feedbackRevision)status.textContent=error.message;}
 });
 function view(node,label,load,install){
  const feedback=element('p','live-status queue-'+label+'-status'),retry=action('重试'+(label==='list'?'队列列表':'阅读记录'),()=>{if(document.activeElement===retry)dialog.querySelector('.live-dialog-head button')?.focus();render(true);});
  let attempt,renderer,failed=false;
  const error=()=>{renderer=null;failed=true;node.replaceChildren();node.removeAttribute('role');node.removeAttribute('aria-label');feedback.textContent=(label==='list'?'队列列表':'阅读记录')+'暂时无法加载，请重试；若仍失败，请刷新页面。';retry.hidden=false;};
  retry.hidden=true;
  function paint(){
   if(!active()||!dialog.open||!renderer)return;
   try{renderer(readQueue());feedback.textContent='';retry.hidden=true;failed=false;}catch{error();}
  }
  async function render(explicit=false){
   if(!active()||!dialog.open)return;
   if(renderer){paint();return;}
   if(attempt||failed&&!explicit)return;
   const request={};attempt=request;failed=false;feedback.textContent=label==='list'?'正在加载队列列表…':'正在加载阅读记录…';retry.hidden=true;
   try{
    const module=await withImportDeadline(load());
    if(attempt!==request||!active())return;
    renderer=install(module);if(typeof renderer!=='function')throw Error('Invalid queue renderer');
    feedback.textContent='';paint();
   }catch{if(attempt===request&&active())error();}
   finally{if(attempt===request)attempt=null;}
  }
  tasks.push({render,retire(){if(attempt){feedback.textContent=(label==='list'?'队列列表':'阅读记录')+'加载已暂停，请重试。';retry.hidden=false;}attempt=null;failed=true;},resume(){}});
  return {feedback,retry};
 }
 const historyView=view(history,'history',()=>import('./queue-history.js'),module=>state=>module.renderQueueHistory(history,state.queue));
 const listView=view(list,'list',()=>import('./queue-list.js'),module=>module.createQueueList(list,dialog));
 host.append(status,historyView.feedback,historyView.retry,history,tools,listView.feedback,listView.retry,list);
 // Stale DOM controls cannot mutate a page after pagehide, even via dispatched clicks.
 host.addEventListener('click',event=>{if(!active()){event.preventDefault();event.stopImmediatePropagation();}},true);
 return {
  cancelImport,
  render(explicit=false){for(const task of tasks)task.render?.(explicit);},
  retire(){cancelImport();++feedbackRevision;file.disabled=true;for(const task of tasks)task.retire();},
  resume(){file.disabled=false;for(const task of tasks)task.resume();}
 };
}
