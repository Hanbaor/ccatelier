import {storage} from './ui.js';
import {getQueue,saveQueue} from './archive-store.js';
import {updateQueue} from './notebook-core.mjs';
import {readShelf} from './reading-state.mjs';
export function mergeSavedQueue(){
 const saved=readShelf(storage.get('cc-saved')),before=getQueue();
 const result=saveQueue(saved.reduce((q,item)=>updateQueue(q,{type:'add',item}),before));
 if(!result.ok)return result.error;const queue=result.queue;
 const skipped=saved.filter(p=>!queue.some(q=>q.path===p.path)).length;
 return '已合并 '+(queue.length-before.length)+' 条新收藏；'+(skipped?'队列上限 200 篇，另有 '+skipped+' 条未加入。':'重复文章只保留一份。')+(result.persisted?'':'浏览器存储不可用，队列仅在当前页面有效。请导出后保留。');
}
