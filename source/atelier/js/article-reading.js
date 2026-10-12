import {$,$$} from './ui.js';
import {shelves} from './reading-shelves.js';
import {remember} from './reading-state.mjs';
import {readNotesContext} from './reading-context.mjs';

// Deliberate navigation only: opening an article or a deep link never moves it.
export function initArticleReading(){
 const body=$('.article-body'),tools=$('[data-article-tools]');
 if(!body||!tools||body.dataset.continuityReady)return;
 if(tools.dataset.readingPaused){window.addEventListener('pageshow',event=>{if(event.persisted)initArticleReading();},{once:true});return;}
 body.dataset.continuityReady='true';
 const path=location.pathname,root=document.body.dataset.root||'/',item={path,title:tools.dataset.title};
 const back=$('[data-notes-back]'),context=readNotesContext(location.search,root);
 if(back&&context){back.href=context.href;back.textContent='← '+context.label;}
 const resume=$('[data-reading-resume]'),restart=$('[data-reading-restart]');
 const initial=shelves.read('recent');
 let known=['missing','legacy'].includes(initial.status),lastRaw=initial.raw;
 let saved=initial.items.find(p=>p.path===path)?.progress||0;
 let protectedPosition=saved>.05,dirty=false,deliberate=false,intentAt=0,active=true,interval;
 const progress=()=>Math.max(0,Math.min(1,-body.getBoundingClientRect().top/Math.max(1,body.scrollHeight-innerHeight*.6)));
 function render(){
  if(resume){resume.hidden=!(protectedPosition&&saved>.05&&saved<.97);resume.textContent=`继续阅读 · ${Math.round(saved*100)}% ↓`;}
  if(restart)restart.hidden=saved<=.05;
 }
 function syncSaved(force=false){
  const state=shelves.read('recent');if(!['missing','legacy'].includes(state.status))return false;
  if(force||!known||state.raw!==lastRaw){known=true;lastRaw=state.raw;saved=state.items.find(p=>p.path===path)?.progress||0;protectedPosition=saved>.05;render();}
  return true;
 }
 function save(value){const result=shelves.update('recent',list=>remember(list,{...item,progress:value}));if(result.ok){saved=value;known=true;lastRaw=shelves.read('recent').raw;}}
 function focusReading(target){
  if(!target.hasAttribute('tabindex')){target.tabIndex=-1;target.addEventListener('blur',()=>target.removeAttribute('tabindex'),{once:true});}
  target.focus({preventScroll:true});
 }
 function jump(value){
  protectedPosition=false;dirty=false;deliberate=false;intentAt=0;
  const top=window.scrollY+body.getBoundingClientRect().top+value*Math.max(0,body.scrollHeight-innerHeight*.6);
  window.scrollTo({top,behavior:'instant'});save(value);render();
  const target=value?$$('h2[id],h3[id],p',body).find(node=>node.getBoundingClientRect().top>=0)||body:$('#article-title')||body;
  focusReading(target);
 }
 resume?.addEventListener('click',()=>{if(syncSaved())jump(saved);});
 restart?.addEventListener('click',()=>jump(0));
 function persist(){
  if(!dirty||!active)return;dirty=false;if(!syncSaved())return;const value=progress();
  // Incidental top-of-page movement, hash jumps and restoration cannot erase a
  // previous session. Reaching that point intentionally starts normal tracking.
  if(protectedPosition){const intentional=deliberate;deliberate=false;if(!intentional||value<saved)return;protectedPosition=false;}
  deliberate=false;save(value);render();
 }
 const cancelIntent=()=>{intentAt=0;deliberate=false;};
 window.addEventListener('scroll',()=>{dirty=true;if(intentAt&&Date.now()-intentAt<1200)deliberate=true;},{passive:true});
 const editing='input,textarea,select,button,a,[contenteditable],pre,code,.code-container,.cm-editor,dialog';
 const intend=event=>{if(!$('dialog[open]')&&!event.target.closest?.(editing))intentAt=Date.now();};
 document.addEventListener('pointerdown',event=>{if(event.target===document.documentElement)intend(event);});
 window.addEventListener('wheel',intend,{passive:true});window.addEventListener('touchmove',intend,{passive:true});
 document.addEventListener('keydown',event=>{if(!event.defaultPrevented&&!event.isComposing&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key))intend(event);});
 window.addEventListener('hashchange',cancelIntent);window.addEventListener('popstate',cancelIntent);
 document.addEventListener('atelier:dialog-open',cancelIntent);
 document.addEventListener('click',event=>{if(event.target.closest?.('a[href]'))cancelIntent();},true);
 const start=()=>{window.clearInterval(interval);interval=window.setInterval(persist,2000);};
 window.addEventListener('pagehide',()=>{persist();active=false;window.clearInterval(interval);});
 window.addEventListener('pageshow',event=>{if(!event.persisted)return;active=true;dirty=false;cancelIntent();syncSaved(true);start();});
 window.addEventListener('storage',event=>{if(event.key===null||event.key==='cc-recent'){cancelIntent();syncSaved(true);}});
 render();start();
}
