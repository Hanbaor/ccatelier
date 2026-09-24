import {$,toast} from './ui.js';
import {element,action,root} from './archive-store.js';
import {makeDialog} from './live-dialog.js';
let registration;
async function worker(){
 if(!('serviceWorker'in navigator)||!window.isSecureContext)throw Error('离线保存需要 HTTPS 或本地 localhost，并支持 Service Worker');
 registration ||= navigator.serviceWorker.register(root+'live-sw.js',{scope:root,type:'module'}).catch(error=>{registration=null;throw error;});
 const reg=await registration;if(reg.active)return reg.active;
 return new Promise((resolve,reject)=>{const sw=reg.installing||reg.waiting;if(!sw){reject(Error('离线服务尚未就绪'));return;}const timeout=setTimeout(()=>reject(Error('离线服务启动超时')),15000);sw.addEventListener('statechange',()=>{if(sw.state==='activated'){clearTimeout(timeout);resolve(sw);}else if(sw.state==='redundant'){clearTimeout(timeout);reject(Error('离线服务安装失败'));}});});
}
async function message(data){const sw=await worker();return new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('离线操作超时，请保持页面打开并稍后检查书架'));},120000);channel.port1.onmessage=({data})=>{clearTimeout(timer);channel.port1.close();data.ok?resolve(data):reject(Error(data.error));};sw.postMessage(data,[channel.port2]);});}
export function initOffline(){
 const shelf=makeDialog('offline-dialog','离线书架'),status=element('p','live-status','主动保存的文章，可以在断网时继续读。评论与管理数据不会缓存。'),list=element('div'),tools=element('div','live-dialog-tools');
 tools.append(action('释放全部离线空间',async()=>{try{await message({type:'clear'});await render();toast('已释放离线副本，原文章仍在网站中');}catch(error){status.textContent=error.message;}}));shelf.dialog.append(status,list,tools);
 async function render(){try{const result=await message({type:'list'});status.textContent=(navigator.onLine?'当前在线':'当前离线')+' · '+result.rows.length+' 篇 · '+(result.bytes/1024/1024).toFixed(1)+' MB';list.replaceChildren();if(!result.rows.length)list.append(element('p','live-status','还没有离线文章。打开任意文章，在工作台选择「离线保存」。'));for(const p of result.rows){const row=element('div','queue-row'),link=element('a','',p.title);link.href=p.path;link.append(element('small','','保存于 '+new Date(p.updated).toLocaleString()));const controls=element('div');for(const [type,label] of [['save','更新'],['remove','移除']])controls.append(action(label,async e=>{const button=e.currentTarget;button.disabled=true;status.textContent=type==='save'?'正在更新资源…':'正在移除…';try{await message({type,path:p.path});await render();}catch(error){status.textContent=error.message;button.disabled=false;}}));row.append(element('span','','▤'),link,controls);list.append(row);}}catch(error){status.textContent=error.message;}}
 document.addEventListener('click',async e=>{if(e.target.closest('.offline-open')){shelf.open();render();}const button=e.target.closest('[data-offline-save]');if(!button)return;button.disabled=true;const old=button.textContent;button.textContent='保存中…';try{await message({type:'save',path:location.pathname});toast('文章和阅读资源已保存，可以断网阅读');button.textContent='✓ 已离线保存';}catch(error){toast(error.message);button.textContent=old;}finally{button.disabled=false;}});
 window.addEventListener('online',()=>{if(shelf.dialog.open)render();});window.addEventListener('offline',()=>{if(shelf.dialog.open)render();});
}
