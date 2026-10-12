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

export {element, messageCard};
