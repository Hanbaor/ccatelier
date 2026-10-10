import {toast} from './ui.js';
import {element,action} from './archive-store.js';
import {makeDialog} from './live-dialog.js';
import {offlineMessage as message} from './offline-client.js';
export function initOffline(){
 const shelf=makeDialog('offline-dialog','离线书架'),status=element('p','live-status','主动保存的文章，可以在断网时继续读。评论与管理数据不会缓存。'),list=element('div'),tools=element('div','live-dialog-tools');
 const saveButtons=[...document.querySelectorAll('[data-offline-save]')].map(button=>({button,label:button.innerHTML}));
 let revision=0,saved=false,saving=false;
 function renderButtons(){for(const {button,label} of saveButtons){button.disabled=saving;if(saving)button.textContent='保存中…';else if(saved)button.textContent='✓ 已离线保存';else button.innerHTML=label;}}
 async function mutate(type,path,button){
  if(button.disabled)return;
  ++revision;button.disabled=true;status.textContent=type==='save'?'正在更新资源…':'正在移除…';
  try{await message({type,...(path?{path}:{})});await render();if(type==='clear')toast('已释放离线副本，原文章仍在网站中');}
  catch(error){status.textContent=error.message;}
  finally{button.disabled=false;}
 }
 tools.append(action('释放全部离线空间',e=>mutate('clear',null,e.currentTarget)));shelf.dialog.append(status,list,tools);
 async function render(){
  const request=++revision;
  try{
   const result=await message({type:'list',...(!shelf.dialog.open?{metadataOnly:true}:{})});if(request!==revision)return;
   saved=result.rows.some(p=>p.path===location.pathname);renderButtons();
   if(!shelf.dialog.open)return;
   status.textContent=(navigator.onLine?'当前在线':'当前离线')+' · '+result.rows.length+' 篇 · '+(result.bytes/1024/1024).toFixed(1)+' MB';list.replaceChildren();
   if(!result.rows.length)list.append(element('p','live-status','还没有离线文章。打开任意文章，在文末展开「阅读工具」，选择「离线保存」。'));
   for(const p of result.rows){
    const row=element('div','queue-row'),link=element('a','',p.title);link.href=p.path;link.append(element('small','','保存于 '+new Date(p.updated).toLocaleString()));const controls=element('div');
    for(const [type,label] of [['save','更新'],['remove','移除']])controls.append(action(label,e=>mutate(type,p.path,e.currentTarget)));
    row.append(element('span','','▤'),link,controls);list.append(row);
   }
  }catch(error){if(request===revision&&shelf.dialog.open)status.textContent=error.message;}
 }
 document.addEventListener('click',async e=>{
  if(e.target.closest('.offline-open')){shelf.open();render();}
  const button=e.target.closest('[data-offline-save]');if(!button||button.disabled||saving)return;
  ++revision;saving=true;renderButtons();
  try{await message({type:'save',path:location.pathname});toast('文章和阅读资源已保存，可以断网阅读');}
  catch(error){toast(error.message);}
  finally{await render();saving=false;renderButtons();}
 });
 const refresh=()=>{if(saveButtons.length||shelf.dialog.open)render();};
 document.addEventListener('atelier:offline',refresh);
 window.addEventListener('online',refresh);window.addEventListener('offline',refresh);
 window.addEventListener('focus',refresh);window.addEventListener('pageshow',refresh);
 if(saveButtons.length)render();
}
