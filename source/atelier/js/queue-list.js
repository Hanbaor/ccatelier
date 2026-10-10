import {$,$$,storage} from './ui.js';
import {queueAction,element,action} from './archive-store.js';
import {readShelf} from './reading-state.mjs';
export function createQueueList(list,dialog){
 return ({queue:q,error})=>{
  const focused=document.activeElement,focusedRow=focused?.closest('.queue-row'),focusState=focusedRow&&list.contains(focusedRow)?{path:focusedRow.dataset.queuePath,action:focused.dataset.queueAction,index:[...list.children].indexOf(focusedRow)}:null;list.replaceChildren();
  if(!q.length&&!error)list.append(element('p','live-status','在笔记目录或文章末尾的「阅读工具」中加入队列。'));
  q.forEach((p,i)=>{const row=element('div','queue-row'+(p.completed?' completed':'')),link=element('a','',p.title);row.dataset.queuePath=p.path;link.href=p.path;const recent=readShelf(storage.get('cc-recent')).find(n=>n.path===p.path);link.append(element('small','',p.completed?'已读 · '+new Date(p.completed).toLocaleDateString():recent?.progress?'读到 '+Math.round(recent.progress*100)+'%':'待阅读'));
   const buttons=element('div');for(const [label,delta] of [['↑',-1],['↓',1]]){const b=action(label,()=>queueAction({type:'move',path:p.path,delta}));b.dataset.queueAction=delta<0?'up':'down';b.setAttribute('aria-label',(delta<0?'上移：':'下移：')+p.title);b.disabled=delta<0?i===0:i===q.length-1;buttons.append(b);}const done=action(p.completed?'重读':'读完',()=>queueAction({type:p.completed?'undone':'done',path:p.path}));done.dataset.queueAction='done';const remove=action('×',()=>queueAction({type:'remove',path:p.path}));remove.dataset.queueAction='remove';remove.setAttribute('aria-label','从队列移除：'+p.title);buttons.append(done,remove);row.append(element('span','',String(i+1).padStart(2,'0')),link,buttons);list.append(row);
  });
  if(focusState){const rows=$$('.queue-row',list),row=rows.find(r=>r.dataset.queuePath===focusState.path)||rows[Math.min(focusState.index,rows.length-1)],control=row&&$$('[data-queue-action]',row).find(b=>b.dataset.queueAction===focusState.action&&!b.disabled);(control||(focusState.action?$('button:not(:disabled)',row||list):null)||$('a',row||list)||$('.live-dialog-head button',dialog))?.focus({preventScroll:true});}
 };
}
