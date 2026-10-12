import {$, $$} from './ui.js';
import {communityAPI, element} from './community-shared.js';
export {communityAPI, element, messageCard} from './community-shared.js';

// One import/initialization per root. No input event or submission is replayed.
const commentRoots = new WeakMap();
// Resolves after this import attempt; hidden roots may still await initialization, and the initial GET may still be pending.
export function initCommentSection(root, load = () => import('./community-comments.js')) {
  const known=commentRoots.get(root);
  if(known)return known.start();
  const doc=root.ownerDocument,view=doc.defaultView,page=view.location.pathname;
  const form=$('form',root),guard=$('fieldset[data-form-guard]',form);
  const status=$('[data-comment-connection],[data-comment-status],.comment-status',root);
  let active=true,phase='idle',module,ready;
  const visible=()=>active&&!doc.hidden&&root.isConnected&&!root.closest('[hidden]')&&view.document===doc&&view.location.pathname===page;
  const retry=element('button','community-retry','重新加载留言');retry.type='button';
  retry.addEventListener('click',()=>start());
  // Also block synthetic submits if initialization failed after binding handlers.
  form.addEventListener('submit',event=>{if(phase!=='ready'){event.preventDefault();event.stopImmediatePropagation();}},true);
  const hide=()=>{active=false;};
  const wake=()=>{if(phase==='waiting')start();else if(phase==='failed')showFailure();};
  const resume=()=>{active=true;wake();};
  view.addEventListener('pagehide',hide);view.addEventListener('pageshow',resume);
  view.addEventListener('popstate',wake);doc.addEventListener('visibilitychange',wake);
  const observer=new view.MutationObserver(()=>{if(visible())wake();});
  observer.observe(doc,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  function cleanup(){observer.disconnect();view.removeEventListener('pagehide',hide);view.removeEventListener('pageshow',resume);view.removeEventListener('popstate',wake);doc.removeEventListener('visibilitychange',wake);}
  function initialize(){
    if(!visible()){phase='waiting';return;}
    phase='initializing';
    try{status.textContent='';module.initComments(root);phase='ready';retry.remove();cleanup();}
    catch{phase='broken';guard.disabled=true;status.textContent='留言功能未能启动，请刷新页面重试。';cleanup();}
  }
  function showFailure(){
    if(!visible()||root.contains(retry))return;
    status.textContent='留言功能未能加载，请重试。';$('[data-comment-list]',root).append(retry);
  }
  function start(){
    if(['loading','initializing','ready','broken'].includes(phase))return ready;
    if(module){initialize();return ready;}
    phase='loading';guard.disabled=true;retry.remove();status.textContent='正在加载留言功能……';
    ready=Promise.resolve().then(load).then(value=>{module=value;initialize();},()=>{
      phase='failed';guard.disabled=true;showFailure();
    });
    return ready;
  }
  commentRoots.set(root,{start});
  return start();
}
export function initCommunity() {
  const commentsReady=Promise.all($$('[data-comments]').map(root=>initCommentSection(root)));
  if(document.body.dataset.section==='admin')return commentsReady;
  const doc=document,view=doc.defaultView,page=location.pathname;
  const listeners=$$('[data-stat]',doc),contexts=$$('[data-stats-context]',doc),buttons=$$('[data-applause]',doc),status=$('[data-article-tool-status]',doc);
  let active=true,pending=false,reactionConfirmed=false;
  const current=()=>active&&view?.document===doc&&view.location.pathname===page;
  view.addEventListener('pagehide',()=>{active=false;});
  view.addEventListener('pageshow',()=>{active=true;});
  function showApplause(applause,reacted) {
    buttons.forEach(button=>{if(!button.isConnected)return;button.setAttribute('aria-pressed',String(reacted));$('[data-applause-count]',button).textContent=String(applause);});
  }
  communityAPI('visit',{page}).then(data=>{
    if(!current())return;
    listeners.forEach(node=>{const key=node.dataset.stat,value=key==='pageViews'?data.page.views:data.site[key];node.textContent=value.toLocaleString('zh-CN');});
    contexts.forEach(node=>node.textContent=data.local?'本地预览数据':'来访浏览器 / 半小时内同页访问合并');
    // A visit can have read its snapshot before the user's applause was saved.
    if(!reactionConfirmed)showApplause(data.page.applause,data.reacted);
  }).catch(()=>{
    if(!current())return;
    listeners.forEach(node=>node.textContent='—');contexts.forEach(node=>node.textContent='统计暂未连接');
  });
  buttons.forEach(button=>button.addEventListener('click',async()=>{
    if(!current()||!button.isConnected||pending||button.disabled||button.getAttribute('aria-pressed')==='true')return;
    pending=true;buttons.forEach(node=>node.disabled=true);
    try{
      const data=await communityAPI('reaction',{page});
      if(!current()||!button.isConnected)return;
      reactionConfirmed=true;showApplause(data.applause,true);if(status?.isConnected)status.textContent='掌声已送达。';
    }
    catch(error){if(current()&&status?.isConnected)status.textContent=error.message;}
    finally{pending=false;buttons.forEach(node=>node.disabled=false);}
  }));
  return commentsReady;
}

const moderationRoots = new WeakMap();
export function initModeration({root = document, load = () => import('./community-moderation.js')} = {}) {
  const login = $('[data-owner-login]', root);
  if (!login) return;
  if (moderationRoots.has(login)) return moderationRoots.get(login);
  const guard = $('fieldset[data-form-guard]', login), status = $('[data-owner-status]', login);
  guard.disabled = true;
  status.textContent = '正在加载管理功能……';
  const ready = Promise.resolve().then(load).then(module => {
    if (!login.isConnected) return;
    module.initModerationPanel(login);
    status.textContent = '';
  }).catch(() => {
    guard.disabled = true;
    status.textContent = '管理功能未能加载，请刷新页面重试。';
  });
  moderationRoots.set(login, ready);
  return ready;
}
