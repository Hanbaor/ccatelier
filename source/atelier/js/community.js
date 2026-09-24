import {$, $$} from './ui.js';

const symbols={star:'✦',drum:'◉',ticket:'▤',ribbon:'⋈'};
export async function communityAPI(route,body) {
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),9000);
  try {
    const response=await fetch('/api/'+route,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
    const data=await response.json().catch(()=>({message:'留言和统计服务暂未连接。'}));
    if(!response.ok){const error=new Error(data.message||'请求没有成功，请稍后重试。');error.status=response.status;throw error;}
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
  const page=location.pathname;let next=null,loading=false,submissionId=crypto.randomUUID(),draft='';
  const input=$('[name=message]',form);input.addEventListener('input',()=>{$('[data-comment-length]',form).textContent=[...input.value.trim()].length+' / 1200';});
  async function load(append=false) {
    if(loading)return;loading=true;more.disabled=true;list.setAttribute('aria-busy','true');
    try {
      const data=await communityAPI('comments?page='+encodeURIComponent(page)+'&offset='+(append?next||0:0));
      if(!append)list.replaceChildren();for(const item of data.items)list.append(messageCard(item));
      if(!data.total)list.append(element('p','community-empty','还没有公开的留言。第一道回声，留给你。'));
      $('[data-comment-total]',root).textContent=String(data.total).padStart(2,'0');next=data.next;more.hidden=next===null;
    }catch(error){if(!append)friendlyFailure(list,error.message,()=>load());else status.textContent=error.message;}
    finally{loading=false;more.disabled=false;list.removeAttribute('aria-busy');}
  }
  more.addEventListener('click',()=>load(true));
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(submit.disabled)return;
    const data=new FormData(form);const body={page,nickname:String(data.get('nickname')).trim(),message:String(data.get('message')).trim(),stamp:data.get('stamp'),website:data.get('website')};
    if([...body.nickname].length>24||[...body.message].length>1200){status.textContent='昵称最多 24 个字，留言最多 1200 个字。';return;}
    const current=JSON.stringify(body);if(current!==draft){submissionId=crypto.randomUUID();draft=current;}
    submit.disabled=true;status.textContent='正在投递……';
    try{await communityAPI('comments',{...body,submissionId});status.textContent='已收到，审核后会出现在这里。谢谢你留下回声。';input.value='';$('[data-comment-length]',form).textContent='0 / 1200';draft='';}
    catch(error){status.textContent=error.message;}finally{submit.disabled=false;}
  });
  $('fieldset[data-form-guard]',form).disabled=false;
  load();
}
export function initCommunity() {
  $$('[data-comments]').forEach(initComments);
  if(document.body.dataset.section==='admin')return;
  const listeners=$$('[data-stat]');const page=location.pathname;
  communityAPI('visit',{page}).then(data=>{
    listeners.forEach(node=>{const key=node.dataset.stat,value=key==='pageViews'?data.page.views:data.site[key];node.textContent=Number(value||0).toLocaleString('zh-CN');});
    $$('[data-stats-context]').forEach(node=>node.textContent=data.local?'本地预览数据':'来访浏览器 / 半小时内同页访问合并');
    $$('[data-applause]').forEach(button=>{button.setAttribute('aria-pressed',String(data.reacted));$('[data-applause-count]',button).textContent=data.page.applause;});
  }).catch(()=>{
    listeners.forEach(node=>node.textContent='—');$$('[data-stats-context]').forEach(node=>node.textContent='统计暂未连接');
  });
  $$('[data-applause]').forEach(button=>button.addEventListener('click',async()=>{
    if(button.disabled||button.getAttribute('aria-pressed')==='true')return;
    button.disabled=true;const status=$('[data-article-tool-status]');
    try{const data=await communityAPI('reaction',{page});button.setAttribute('aria-pressed','true');$('[data-applause-count]',button).textContent=data.applause;if(status)status.textContent='掌声已送达。';}
    catch(error){if(status)status.textContent=error.message;}finally{button.disabled=false;}
  }));
}

export function initModeration() {
  const login=$('[data-owner-login]');if(!login)return;
  const panel=$('[data-moderation]'),list=$('[data-moderation-list]'),filter=$('[data-moderation-filter]'),more=$('[data-moderation-more]');let next=null,loading=false;
  function signedOut(){panel.hidden=true;login.hidden=false;$('[name=password]',login).value='';}
  async function load(append=false) {
    if(loading)return;loading=true;more.disabled=true;
    try {
      const data=await communityAPI('admin/comments?status='+filter.value+'&offset='+(append?next||0:0));
      login.hidden=true;panel.hidden=false;if(!append)list.replaceChildren();
      for(const item of data.items){
        const card=messageCard(item);const path=element('a','moderation-page-link',item.page);path.href=item.page;path.target='_blank';path.rel='noopener';
        const reply=element('textarea','owner-reply-input');reply.value=item.reply;reply.maxLength=2400;reply.rows=2;reply.setAttribute('aria-label','回复 '+item.nickname);
        const controls=element('div','moderation-actions'),feedback=element('p','moderation-item-status');feedback.setAttribute('role','status');
        for(const [action,label] of [['approved','公开 / 保存回复'],['rejected','收起这条']]){
          const button=element('button','',label);button.addEventListener('click',async()=>{
            const buttons=$$('button',controls);buttons.forEach(b=>b.disabled=true);
            try{await communityAPI('admin/moderate',{id:item.id,status:action,reply:reply.value});await load();}
            catch(error){feedback.textContent=error.message;if(error.status===401)signedOut();}finally{buttons.forEach(b=>b.disabled=false);}
          });controls.append(button);
        }
        const editing=element('div','moderation-editor');editing.append(path,reply,controls,feedback);card.append(editing);list.append(card);
      }
      if(!data.total)list.append(element('p','community-empty','这一栏没有留言。'));
      $('[data-moderation-total]').textContent=data.total+' 条';next=data.next;more.hidden=next===null;
    }catch(error){if(error.status===401)signedOut();else $('[data-moderation-status]').textContent=error.message;}
    finally{loading=false;more.disabled=false;}
  }
  login.addEventListener('submit',async event=>{
    event.preventDefault();const button=$('button',login);button.disabled=true;
    try{await communityAPI('admin/login',{password:$('[name=password]',login).value});$('[name=password]',login).value='';$('[data-owner-status]').textContent='';await load();}
    catch(error){$('[data-owner-status]').textContent=error.message;}finally{button.disabled=false;}
  });
  $('fieldset[data-form-guard]',login).disabled=false;
  filter.addEventListener('change',()=>load());more.addEventListener('click',()=>load(true));
  $('[data-owner-logout]').addEventListener('click',async()=>{try{await communityAPI('admin/logout',{});signedOut();}catch(error){$('[data-moderation-status]').textContent=error.message;}});
  load();
}
