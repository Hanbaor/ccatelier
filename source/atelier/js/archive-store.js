import {storage,toast} from './ui.js';
import {validateQueue,updateQueue} from './notebook-core.mjs';
import {safePath} from './reading-state.mjs';
let indexPromise;
export const root=document.body.dataset.root||'/';
export function loadArchive(){return indexPromise ||= fetch(root+'atelier/data/archive.json').then(r=>{if(!r.ok)throw Error('文章索引暂时无法加载');return r.json();}).then(data=>{if(data.version!==1||!Array.isArray(data.posts))throw Error('文章索引版本不匹配');return data.posts.filter(p=>safePath(p.path)&&p.path.startsWith(root));}).catch(error=>{indexPromise=null;throw error;});}
export function getQueue(){try{return validateQueue(JSON.parse(storage.get('cc-queue')),root);}catch{return [];}}
export function saveQueue(queue){const valid=validateQueue({version:1,queue},root);const saved=storage.set('cc-queue',JSON.stringify({version:1,queue:valid}));if(!saved)toast('存储不可用，队列仅在当前页面有效；可以导出备份');document.dispatchEvent(new CustomEvent('atelier:queue'));return valid;}
export function queueAction(action){return saveQueue(updateQueue(getQueue(),action));}
export function download(name,content,type='application/json'){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export async function readImport(file,maxMB=5){if(!file||file.size>maxMB*1024*1024)throw Error('请选择小于 '+maxMB+' MB 的备份');try{return JSON.parse(await file.text());}catch{throw Error('无法解析备份文件');}}
export function element(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
export function action(label,fn,cls=''){const el=element('button',cls,label);el.type='button';el.addEventListener('click',fn);return el;}
