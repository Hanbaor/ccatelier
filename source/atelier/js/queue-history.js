import {element} from './archive-store.js';
export function renderQueueHistory(history,q){
 history.replaceChildren();let total=0;for(let i=13;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const date=d.toLocaleDateString(),count=q.filter(p=>p.completed&&new Date(p.completed).toLocaleDateString()===date).length;total+=count;const bar=element('i');bar.style.height=Math.max(3,Math.min(38,count*7))+'px';bar.title=date+'：完成 '+count+' 篇';history.append(bar);}history.setAttribute('role','img');history.setAttribute('aria-label','最近14天，队列中完成 '+total+' 篇文章');
}
