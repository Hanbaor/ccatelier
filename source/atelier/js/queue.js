import {$,$$,toast,storage,withImportDeadline} from './ui.js';
import {readQueue,queueAction,element,action} from './archive-store.js';
import {makeDialog} from './live-dialog.js';
export function initQueue(){
 const {dialog,open}=makeDialog('queue-dialog','阅读队列'),status=element('p','live-status'),content=element('div'),loading=element('p','live-status queue-controller-status'),retry=action('重试队列工具',()=>{if(document.activeElement===retry)dialog.querySelector('.live-dialog-head button')?.focus();load();});
 dialog.append(status,loading,retry,content);retry.hidden=true;
 let controller,factory,attempt,suspended=false,failed=false,broken=false;
 const active=()=>!suspended&&dialog.isConnected;
 async function load(){
  if(!active()||!dialog.open||attempt||controller||broken)return;
  const request={};attempt=request;failed=false;loading.textContent='正在加载队列工具…';retry.hidden=true;
  try{
   const createQueueDialog=factory||(await withImportDeadline(import('./queue-dialog.js'))).createQueueDialog;
   if(attempt!==request||!active())return;
   factory=createQueueDialog;loading.textContent='';if(!dialog.open)return;
   // Initialization can bind controls before throwing. Never initialize that DOM twice.
   try{controller=createQueueDialog(content,dialog,active);}catch(error){broken=true;content.inert=true;content.querySelectorAll('button,input').forEach(control=>{control.disabled=true;});throw error;}
   loading.textContent='';controller.render(true);
  }catch{
   if(attempt!==request||!active())return;
   failed=true;loading.textContent=broken?'队列工具初始化失败，请刷新页面后重试。':'队列工具暂时无法加载，请重试；若仍失败，请刷新页面。';retry.hidden=broken;
  }finally{if(attempt===request)attempt=null;}
 }
 function render(explicit=false,views=true){
  const state=readQueue(),q=state.queue;
  $$('[data-queue-count]').forEach(n=>{n.textContent=q.filter(p=>!p.completed).length;});
  const current=q.find(p=>p.path===location.pathname);
  $$('[data-queue-add]').forEach(button=>{button.textContent=current?'已加入队列':'加入队列';button.setAttribute('aria-disabled',String(Boolean(current)));});
  $$('[data-queue-done]').forEach(button=>{button.textContent=current?.completed?'已读':'标记已读';button.setAttribute('aria-disabled',String(Boolean(current?.completed)));});
  status.textContent=state.error||(!storage.persistent?'浏览器存储不可用，队列仅在当前页面有效。请导出后保留。':'仅保存在这台浏览器，可以导出备份。');
  const next=q.find(p=>!p.completed&&p.path!==location.pathname);$$('[data-queue-next]').forEach(a=>{a.hidden=!next;if(next){a.href=next.path;a.textContent='队列下一篇：'+next.title;}});
  if(!active()||!dialog.open||!views)return;
  if(controller)controller.render(explicit);else if(explicit||!failed)load();
 }
 const changed=()=>{controller?.cancelImport();if(active())render();};
 dialog.addEventListener('close',()=>controller?.cancelImport());
 document.addEventListener('atelier:queue',changed);window.addEventListener('storage',e=>{if(e.key==='cc-queue'||e.key===null)changed();});
 window.addEventListener('pagehide',()=>{suspended=true;attempt=null;failed=true;if(!broken)loading.textContent=controller?'':'队列工具已暂停，请重新打开重试。';retry.hidden=!!controller||broken;controller?.retire();});
 window.addEventListener('pageshow',()=>{suspended=false;controller?.resume();render(false,false);});
 document.addEventListener('click',e=>{
  if(!active())return;
  if(e.target.closest('.queue-open')){controller?.cancelImport();open();render(true);}
  const add=e.target.closest('[data-queue-add]'),done=e.target.closest('[data-queue-done]');if(!add&&!done)return;
  // Read current data rather than trusting a stale control after another tab changes it.
  render();const current=readQueue().queue.find(p=>p.path===location.pathname);
  if(done?current?.completed:current)return;
  let result=current?{ok:true}:queueAction({type:'add',item:{path:location.pathname,title:$('[data-article-tools]')?.dataset.title||document.title}});
  if(result.ok&&done)result=queueAction({type:'done',path:location.pathname});if(result.ok&&result.persisted)toast(done?'这一篇，读完了。':'已加入阅读队列');
 });render();
}
