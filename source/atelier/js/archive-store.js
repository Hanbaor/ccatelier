import {storage,toast} from './ui.js';
import {validateQueue,updateQueue} from './notebook-core.mjs';
import {safePath} from './reading-state.mjs';
let indexPromise;
export const root=document.body.dataset.root||'/';
export function loadArchive(){return indexPromise ||= fetch(root+'atelier/data/archive.json').then(r=>{if(!r.ok)throw Error('文章索引暂时无法加载');return r.json();}).then(data=>{if(data.version!==1||!Array.isArray(data.posts))throw Error('文章索引版本不匹配');return data.posts.filter(p=>safePath(p.path)&&p.path.startsWith(root));}).catch(error=>{indexPromise=null;throw error;});}
const protectedQueue='本机队列数据损坏或版本不支持，原文已保留；请先导出备份。';
const decodeQueue=raw=>raw===null?[]:validateQueue(JSON.parse(raw),root);
export function readQueue(){const {raw,available}=storage.snapshot('cc-queue');if(!available)return {raw,queue:[],unavailable:true,error:'浏览器暂时无法读取队列，请恢复存储权限后再导出。'};try{return {raw,queue:decodeQueue(raw),error:''};}catch{return {raw,queue:[],error:protectedQueue};}}
export function getQueue(){return readQueue().queue;}
function queueFailure(error,queue){toast(error);return {ok:false,queue,error};}
function writableQueue(){
 const state=readQueue();state.durable=true;if(state.unavailable){state.error='';state.durable=false;return state;}if(state.error)return state;
 let raw;try{raw=localStorage.getItem('cc-queue');}catch{state.durable=false;return state;}
 try{decodeQueue(raw);}catch{state.error=protectedQueue;}return state;
}
export function saveQueue(queue){
 const state=writableQueue();if(state.error)return queueFailure(state.error,state.queue);
 try{const valid=validateQueue({version:1,queue},root),raw=JSON.stringify({version:1,queue:valid}),persisted=state.durable?storage.set('cc-queue',raw):storage.setMemory('cc-queue',raw);
  if(!persisted)toast('存储不可用，队列仅在当前页面有效；可以导出备份');
  document.dispatchEvent(new CustomEvent('atelier:queue'));return {ok:true,queue:valid,persisted};
 }catch(error){return queueFailure(error.message,state.queue);}
}
export function queueAction(action){
 const state=writableQueue();if(state.error)return queueFailure(state.error,state.queue);
 if(action.type==='add'&&state.queue.length===200&&!state.queue.some(p=>p.path===action.item.path))return queueFailure('队列已满，请先移除一些文章',state.queue);
 return saveQueue(updateQueue(state.queue,action));
}
export function download(name,content,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;try{a.click();}catch(error){URL.revokeObjectURL(url);throw error;}setTimeout(()=>URL.revokeObjectURL(url),30000);}
export async function readImport(file,maxMB=5){if(!file||file.size>maxMB*1024*1024)throw Error('请选择小于 '+maxMB+' MB 的备份');try{return JSON.parse(await file.text());}catch{throw Error('无法解析备份文件');}}
export function element(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
export function action(label,fn,cls=''){const el=element('button',cls,label);el.type='button';el.addEventListener('click',fn);return el;}
