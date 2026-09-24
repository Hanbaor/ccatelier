import {element,action} from './archive-store.js';
import {openDialog} from './ui.js';
export function makeDialog(id,title){
 const dialog=element('dialog','live-dialog');dialog.id=id;dialog.setAttribute('aria-labelledby',id+'-title');
 const header=element('header','live-dialog-head'),h=element('h2','',title);h.id=id+'-title';const close=action('×',()=>dialog.close());close.setAttribute('aria-label','关闭'+title);header.append(h,close);dialog.append(header);document.body.append(dialog);
 dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
 return {dialog,open:()=>openDialog(id)};
}
