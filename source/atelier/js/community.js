import {$, $$} from './ui.js';

const symbols={star:'✦',drum:'◉',ticket:'▤',ribbon:'⋈'};
const commentId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const count=value=>Number.isSafeInteger(value)&&value>=0;
function validFeedback(data,route,status) {
  if(status!==200||!record(data))return false;
  if(route==='reaction')return count(data.applause)&&data.reacted===true;
  return record(data.site)&&['views','visitors','applause'].every(key=>count(data.site[key]))&&
    record(data.page)&&count(data.page.views)&&count(data.page.applause)&&typeof data.reacted==='boolean';
}
function validComments(data, submitted, status) {
  if(!record(data))return false;
  if(submitted)return status===202&&typeof data.id==='string'&&commentId.test(data.id)&&['pending','approved','rejected'].includes(data.status);
  return status===200&&Array.isArray(data.items)&&Number.isSafeInteger(data.total)&&data.total>=data.items.length&&
    (data.next===null||(Number.isSafeInteger(data.next)&&data.next>0&&data.next<data.total))&&
    data.items.every(item=>record(item)&&typeof item.id==='string'&&commentId.test(item.id)&&
      ['nickname','message','reply','createdAt'].every(key=>typeof item[key]==='string')&&
      Object.hasOwn(symbols,item.stamp)&&Number.isFinite(Date.parse(item.createdAt)));
}

export async function communityAPI(route,body) {
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),9000);
  try {
    const response=await fetch('/api/'+route,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
    const endpoint=route.split('?')[0],comments=endpoint==='comments',feedback=['visit','reaction'].includes(endpoint);
    const protocolFailure=()=>new Error(feedback?'未能确认统计或掌声结果，请重试。':body===undefined?'留言服务返回了无法识别的结果，请重试。':'未能确认投递结果，请重试。');
    let data;
    try { data=await response.json(); } catch { if(comments||feedback)throw protocolFailure();data={message:'留言和统计服务暂未连接。'}; }
    if((comments||feedback)&&response.ok&&(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||'')||!(comments?validComments(data,body!==undefined,response.status):validFeedback(data,endpoint,response.status))))throw protocolFailure();
    if(!response.ok){const error=new Error(typeof data?.message==='string'?data.message:'请求没有成功，请稍后重试。');error.status=response.status;if(/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')||'')&&record(data)&&typeof data.code==='string'&&/^[a-z_]{1,64}$/.test(data.code))error.code=data.code;throw error;}
    return data;
  }catch(error){
    if(error.name==='AbortError')throw new Error('连接有点慢，请稍后再试。');
    if(error instanceof TypeError)throw new Error('暂时连不上留言服务；恢复连接后可以再试。');
    throw error;
  }finally{clearTimeout(timer);}
}
function element(tag,className,text) {const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function messageCard(item) {
  const card=element('article','encore-message');const stamp=element('span','encore-stamp stamp-'+item.stamp,symbols[item.stamp]||'✦');stamp.setAttribute('aria-hidden','true');
  const content=element('div','encore-message-content');const header=element('header');header.append(element('strong','',item.nickname));
  const date=new Date(item.createdAt),time=element('time','',date.toLocaleDateString('zh-CN'));time.dateTime=item.createdAt;header.append(time);content.append(header,element('p','encore-message-body',item.message));
  if(item.reply){const reply=element('div','encore-owner-reply');reply.append(element('span','','CC / 回复'),element('p','',item.reply));content.append(reply);}
  card.append(stamp,content);return card;
}
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

// Share the existing rendering helpers with the optional owner interface.
export { element, messageCard };
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
