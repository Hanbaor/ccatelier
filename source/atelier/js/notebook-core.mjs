// Validated local reading data. UI renders all user strings as text.
import {safePath} from './reading-state.mjs';
export function anchorQuote(text,start,end){
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>text.length||end-start>3000)throw Error('请选择 1–3000 字正文');
  return {quote:text.slice(start,end),prefix:text.slice(Math.max(0,start-40),start),suffix:text.slice(end,end+40),start};
}
export function locateQuote(text,a){
  if(!a?.quote)return -1;
  const positions=[];let at=text.indexOf(a.quote);
  while(at!==-1){positions.push(at);at=text.indexOf(a.quote,at+1);}
  const contextual=positions.filter(i=>(!a.prefix||text.slice(0,i).endsWith(a.prefix))&&(!a.suffix||text.slice(i+a.quote.length).startsWith(a.suffix)));
  if(contextual.length===1)return contextual[0];
  return -1;
}
const string=(s,max,empty=true)=>typeof s==='string'&&s.length<=max&&(empty||s.length>0);
const validPath=(p,root)=>safePath(p)&&p.startsWith(root);
export function validateNotebook(data,root='/'){
  if(data?.version!==1||!Array.isArray(data.notes)||data.notes.length>2000)throw Error('不支持的批注备份');
  const ids=new Set();const notes=data.notes.map(n=>{
    if(!n||!string(n.id,80,false)||ids.has(n.id)||!validPath(n.path,root)||!string(n.title,300,false)||!string(n.quote,3000,false)||!string(n.prefix,40)||!string(n.suffix,40)||!string(n.note,5000)||!Number.isInteger(n.start)||n.start<0||!Number.isFinite(n.updated)||n.updated<0)throw Error('批注备份包含无效记录');
    ids.add(n.id);return {id:n.id,path:n.path,title:n.title,quote:n.quote,prefix:n.prefix,suffix:n.suffix,start:n.start,note:n.note,updated:n.updated};
  });return {version:1,notes};
}
export function validateQueue(data,root='/'){
  if(data?.version!==1||!Array.isArray(data.queue)||data.queue.length>200)throw Error('不支持的阅读队列');
  const seen=new Set();return data.queue.map(p=>{
    if(!p||!validPath(p.path,root)||!string(p.title,300,false)||seen.has(p.path)||(p.completed!==undefined&&(!Number.isFinite(p.completed)||p.completed<0)))throw Error('队列包含无效记录');
    seen.add(p.path);return {path:p.path,title:p.title,...(p.completed?{completed:p.completed}:{})};
  });
}
export function updateQueue(queue,action){
  const next=queue.map(p=>({...p})),index=next.findIndex(p=>p.path===action.path);
  if(action.type==='add'&&!next.some(p=>p.path===action.item.path)&&next.length<200)next.push({path:action.item.path,title:action.item.title});
  if(action.type==='remove'&&index>=0)next.splice(index,1);
  if(action.type==='move'&&index>=0){const to=Math.max(0,Math.min(next.length-1,index+action.delta));const [item]=next.splice(index,1);next.splice(to,0,item);}
  if(action.type==='done'&&index>=0)next[index].completed=action.at||Date.now();
  if(action.type==='undone'&&index>=0)delete next[index].completed;
  return next;
}
