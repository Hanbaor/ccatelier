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
function friendlyFailure(container,message,retry) {
  container.replaceChildren();const box=element('div','community-empty');box.append(element('p','',message));const button=element('button','community-retry','再试一次 ↻');button.addEventListener('click',retry);box.append(button);container.append(box);
}
function initComments(root) {
  const form=$('form',root),list=$('[data-comment-list]',root),more=$('[data-comment-more]',root),status=$('.comment-status',root),submit=$('button[type=submit]',form);
  const initialPlaceholder=$(':scope > p.community-empty',list);
  const page=location.pathname,doc=root.ownerDocument,view=doc.defaultView;
  let next=null,loading=null,loadRecoveryNeeded=false,unavailable=false,requestSequence=0,availabilitySequence=0,statusOwner='',submissionId=crypto.randomUUID(),draft='',navigationEpoch=0,active=true,inFlight=null,recoveryNeeded=false;
  const visibleView=()=>active&&root.isConnected&&!root.closest('[hidden]')&&view?.document===doc&&view.location.pathname===page;
  const syncSubmit=()=>{submit.disabled=!!inFlight||unavailable;};
  const notConfigured=error=>error.status===503&&error.code==='not_configured';
  const availabilityNote=element('span','',' 留言暂未开放。');
  const listFailure=element('p','community-empty','留言列表读取未完成。');
  const listRetry=element('button','community-retry','重新读取');listRetry.type='button';
  listRetry.addEventListener('click',()=>load());listFailure.append(listRetry);
  const recheck=element('button','community-retry','重新检查');recheck.type='button';
  recheck.addEventListener('click',()=>load());
  function syncAvailabilityStatus(){
    if(unavailable){
      if(!inFlight&&statusOwner!=='receipt'){
        status.textContent='留言暂未开放。内容仍在当前表单中。';statusOwner='availability';
      }else status.append(availabilityNote);
      status.append(recheck);recheck.disabled=!!loading;
    }else{
      availabilityNote.remove();recheck.remove();
      if(statusOwner==='availability'){status.textContent='';statusOwner='';}
    }
  }
  function setStatus(message,owner){status.textContent=message;statusOwner=owner;syncAvailabilityStatus();}
  function recordAvailability(sequence,value){
    // Only explicit, validated evidence changes availability. Newer requests win.
    if(sequence<availabilitySequence)return false;
    availabilitySequence=sequence;unavailable=value;syncSubmit();syncAvailabilityStatus();return true;
  }
  function restoreInterruptedStatus(){
    if(recoveryNeeded&&!inFlight&&visibleView()){
      setStatus('投递结果尚未确认。内容仍在当前表单中，可手动重试。','failure');
      recoveryNeeded=false;
    }
  }
  view.addEventListener('pagehide',()=>{
    active=false;navigationEpoch++;if(inFlight)recoveryNeeded=true;
    if(loading){loading=null;loadRecoveryNeeded=true;}
  });
  view.addEventListener('pageshow',()=>{
    active=true;restoreInterruptedStatus();
    if(loadRecoveryNeeded&&visibleView()){loadRecoveryNeeded=false;load();}
  });
  const input=$('[name=message]',form);input.addEventListener('input',()=>{$('[data-comment-length]',form).textContent=[...input.value.trim()].length+' / 1200';});
  async function load(append=false) {
    if(loading||!visibleView())return;
    const attempt={},epoch=navigationEpoch,sequence=++requestSequence;
    loading=attempt;more.disabled=true;recheck.disabled=true;listRetry.disabled=true;list.setAttribute('aria-busy','true');
    const currentView=()=>loading===attempt&&navigationEpoch===epoch&&visibleView();
    try {
      const data=await communityAPI('comments?page='+encodeURIComponent(page)+'&offset='+(append?next||0:0));
      if(!currentView())return;
      initialPlaceholder?.remove();
      recordAvailability(sequence,false);listFailure.remove();
      if(!append)list.replaceChildren();for(const item of data.items)list.append(messageCard(item));
      if(!data.total)list.append(element('p','community-empty','还没有公开的留言。第一道回声，留给你。'));
      $('[data-comment-total]',root).textContent=String(data.total).padStart(2,'0');next=data.next;more.hidden=next===null;
    }catch(error){
      if(!currentView())return;
      initialPlaceholder?.remove();
      if(notConfigured(error)){
        if(!recordAvailability(sequence,true)&&!unavailable)list.append(listFailure);else listFailure.remove();
      }else if(!append)friendlyFailure(list,error.message,()=>load());
      else if(!inFlight&&statusOwner!=='receipt'&&!unavailable)setStatus(error.message,'load');
    }finally{
      if(loading===attempt){loading=null;more.disabled=false;recheck.disabled=false;listRetry.disabled=false;list.removeAttribute('aria-busy');}
    }
  }
  more.addEventListener('click',()=>load(true));
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(unavailable||submit.disabled||inFlight)return;
    const readDraft=()=>{const data=new FormData(form);return {page,nickname:String(data.get('nickname')).trim(),message:String(data.get('message')).trim(),stamp:data.get('stamp'),website:data.get('website')};};
    const snapshot=JSON.stringify([...new FormData(form)]);
    const body=readDraft();
    if([...body.nickname].length>24||[...body.message].length>1200){setStatus('昵称最多 24 个字，留言最多 1200 个字。','validation');return;}
    const current=JSON.stringify(body);if(current!==draft){submissionId=crypto.randomUUID();draft=current;}
    const sentId=submissionId,epoch=navigationEpoch,attempt={},sequence=++requestSequence;
    inFlight=attempt;recoveryNeeded=false;
    const currentView=()=>inFlight===attempt&&navigationEpoch===epoch&&visibleView();
    syncSubmit();setStatus('正在投递……','submission');
    try{
      const receipt=await communityAPI('comments',{...body,submissionId:sentId});
      if(!currentView())return;
      recordAvailability(sequence,false);
      if(receipt.status==='rejected'){setStatus('这条留言已被收起，未公开。内容仍在当前表单中。','receipt');return;}
      let message=receipt.status==='approved'?'这条留言已公开。':'已收到，审核后会出现在这里。谢谢你留下回声。';
      // Typing remains possible during delivery. Never erase a newer draft.
      if(JSON.stringify([...new FormData(form)])===snapshot){input.value='';$('[data-comment-length]',form).textContent='0 / 1200';}
      else message+=' 当前修改的草稿已保留，尚未投递。';
      setStatus(message,'receipt');draft='';
    }
    catch(error){
      if(!currentView())return;
      // A confirmed conflict permits a new explicit submission, never an automatic
      // resend. Uncertain outcomes retain the nonce so retries cannot double-write.
      if(error.status===409&&error.code==='submission_conflict'&&submissionId===sentId&&draft===current&&JSON.stringify(readDraft())===current)draft='';
      if(notConfigured(error)){
        recordAvailability(sequence,true);
        setStatus('此次投递未完成。内容仍在当前表单中。','failure');
      }else setStatus(error.message+' 内容仍在当前表单中，可再次投递。','failure');
    }finally{
      // Navigation never unlocks a still-running request. Only its own completion
      // can release the form, then restore honest feedback in the returned view.
      if(inFlight===attempt){inFlight=null;syncSubmit();if(visibleView())syncAvailabilityStatus();restoreInterruptedStatus();}
    }
  });
  $('fieldset[data-form-guard]',form).disabled=false;
  load();
}
export function initCommunity() {
  $$('[data-comments]').forEach(initComments);
  if(document.body.dataset.section==='admin')return;
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
