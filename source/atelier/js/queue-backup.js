import {storage} from './ui.js';
import {readQueue,download} from './archive-store.js';
export function exportQueue(){
 const state=readQueue();if(state.unavailable)throw Error(state.error);
 download(state.error?'cc-reading-queue-unreadable.txt':'cc-reading-queue.json',state.error?state.raw:JSON.stringify({version:1,queue:state.queue},null,2),state.error?'text/plain':'application/json');
 return state.error?'已发起原文备份下载；队列仍受保护，尚未恢复。':storage.persistent?'':'队列仅在当前页面有效，请保留导出备份。';
}
