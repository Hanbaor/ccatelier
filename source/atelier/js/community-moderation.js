import { $ as query, $$ } from './ui.js';
import { communityAPI, element, messageCard } from './community.js';

// Loaded only after community.js has evaluated; imported helpers are used at init.
export function initModerationPanel(login) {
  const $ = (selector, root = login.ownerDocument) => query(selector, root);
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
