const encoder = new TextEncoder();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAMPS = new Set(['star','drum','ticket','ribbon']);
const ADMIN_AGE = 6 * 60 * 60;

class ApiError extends Error {
  constructor(status,code,message) { super(message);this.status=status;this.code=code; }
}
const fail = (status,code,message) => { throw new ApiError(status,code,message); };
function json(data,status=200,headers={}) {
  return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
}
function cookies(request) {
  return Object.fromEntries((request.headers.get('Cookie')||'').split(';').map(item=>{
    const separator=item.indexOf('=');return separator<0?['','']:[item.slice(0,separator).trim(),item.slice(separator+1).trim()];
  }));
}
function cookie(request,name,value,age) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
}
async function digest(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function hmac(secret,message) {
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  return {key,signature:new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(message)))};
}
async function ownerSession(request,secret) {
  const parts=(cookies(request).cc_owner||'').split('.');
  if(parts.length!==3 || !/^\d{10}$/.test(parts[0]) || !UUID.test(parts[1]) || !/^[0-9a-f]{64}$/.test(parts[2]))return false;
  const expires=Number(parts[0]),now=Math.floor(Date.now()/1000);
  if(expires<=now || expires>now+ADMIN_AGE)return false;
  const message=parts[0]+'.'+parts[1];const {key}=await hmac(secret,message);
  return crypto.subtle.verify('HMAC',key,Uint8Array.from(parts[2].match(/../g),x=>parseInt(x,16)),encoder.encode(message));
}
async function requireOwner(request,env) {
  if(!await ownerSession(request,env.ADMIN_SECRET))fail(401,'unauthorized','请先登录管理后台。');
}
function sameOrigin(request) {
  const url=new URL(request.url);
  if(request.headers.get('Origin')!==url.origin || request.headers.get('Sec-Fetch-Site')==='cross-site')fail(403,'origin','请从本站页面提交。');
}
async function bodyJSON(request) {
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail(415,'content_type','请使用 JSON 提交。');
  if(Number(request.headers.get('Content-Length'))>8192)fail(413,'too_large','内容太长了。');
  const reader=request.body?.getReader();if(!reader)fail(400,'invalid_body','提交内容为空。');
  const chunks=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8192){await reader.cancel();fail(413,'too_large','内容太长了。');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{fail(400,'invalid_json','提交格式不正确。');}
  if(!body||Array.isArray(body)||typeof body!=='object')fail(400,'invalid_body','提交格式不正确。');
  return body;
}
function textField(value,min,max,label) {
  if(typeof value!=='string')fail(400,'validation',`${label}格式不正确。`);
  const clean=value.normalize('NFC').trim();
  if([...clean].length<min||[...clean].length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(clean))fail(400,'validation',`${label}需要 ${min}–${max} 个字符。`);
  return clean;
}
function pageKey(value) {
  if(typeof value!=='string'||value.length>400||!value.startsWith('/')||value.startsWith('//')||/[?#\\\s\u0000-\u001f]/.test(value))fail(400,'page','页面地址不正确。');
  let decoded;try{decoded=decodeURIComponent(value);}catch{fail(400,'page','页面地址不正确。');}
  if(decoded.includes('..')||decoded.includes('//')||/[?#\\\u0000-\u001f]/.test(decoded)||/^\/(?:api|admin)(?:\/|$)/.test(decoded))fail(400,'page','页面地址不正确。');
  return encodeURI(decoded).replace(/\/index\.html$/,'/').replace(/\/?$/,'/');
}
async function requirePage(page,env,request) {
  const response=await env.ASSETS.fetch(new Request(new URL(page,request.url),{method:'GET'}));
  if(response.body)await response.body.cancel();
  if(response.status!==200||!response.headers.get('Content-Type')?.includes('text/html'))fail(404,'page_missing','这篇内容不存在。');
}
async function identity(request,env) {
  const previous=cookies(request).cc_visitor;const value=UUID.test(previous||'')?previous:crypto.randomUUID();
  return {id:await digest(env.ADMIN_SECRET+'|visitor|'+value),header:cookie(request,'cc_visitor',value,31536000)};
}
async function rateLimit(request,env,action,limit,seconds) {
  const now=Math.floor(Date.now()/1000),bucket=Math.floor(now/seconds);
  const address=request.headers.get('CF-Connecting-IP')||'local';
  const key=await digest(env.ADMIN_SECRET+'|rate|'+action+'|'+address+'|'+bucket);
  const row=await env.DB.prepare('INSERT INTO rate_limits(key,hits,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=hits+1 RETURNING hits').bind(key,(bucket+1)*seconds).first();
  if(row.hits>limit)fail(429,'rate_limited','慢一点，稍后再试。');
}
async function statistics(env,page,visitor) {
  const site=await env.DB.prepare('SELECT views,visitors,applause FROM site_stats WHERE id=1').first();
  const current=page?await env.DB.prepare('SELECT views,applause FROM page_stats WHERE page=?').bind(page).first():null;
  const reacted=page&&visitor?Boolean(await env.DB.prepare('SELECT 1 FROM reactions WHERE page=? AND visitor_id=?').bind(page,visitor).first()):false;
  return {site,page:current||{views:0,applause:0},reacted,local:env.LOCAL_PREVIEW==='true'};
}
function publicComment(row) {
  return {id:row.id,nickname:row.nickname,message:row.message,stamp:row.stamp,reply:row.reply,createdAt:new Date(row.created_at).toISOString()};
}
async function handle(request,env) {
  const url=new URL(request.url),route=url.pathname.slice(5);
  if(!env.DB||typeof env.ADMIN_SECRET!=='string'||env.ADMIN_SECRET.length<24)fail(503,'not_configured','留言和统计服务尚未连接。');
  if(!['GET','POST'].includes(request.method))fail(405,'method','不支持此请求方式。');
  if(request.method==='POST')sameOrigin(request);
  if(request.method==='GET') {
    if(route==='stats'){
      const page=url.searchParams.has('page')?pageKey(url.searchParams.get('page')):null;
      const visitor=await identity(request,env);
      return json(await statistics(env,page,visitor.id));
    }
    if(route==='comments'){
      const page=pageKey(url.searchParams.get('page'));const offset=Math.min(10000,Math.max(0,parseInt(url.searchParams.get('offset'),10)||0));
      const {results}=await env.DB.prepare("SELECT id,nickname,message,stamp,reply,created_at FROM comments WHERE page=? AND status='approved' ORDER BY created_at DESC,id DESC LIMIT 12 OFFSET ?").bind(page,offset).all();
      const {total}=await env.DB.prepare("SELECT COUNT(*) AS total FROM comments WHERE page=? AND status='approved'").bind(page).first();
      return json({items:results.map(publicComment),total,next:offset+results.length<total?offset+results.length:null});
    }
    if(route==='admin/session'){await requireOwner(request,env);return json({authenticated:true});}
    if(route==='admin/comments'){
      await requireOwner(request,env);const status=url.searchParams.get('status')||'pending';
      if(!['pending','approved','rejected'].includes(status))fail(400,'validation','审核状态不正确。');
      const offset=Math.min(10000,Math.max(0,parseInt(url.searchParams.get('offset'),10)||0));
      const {results}=await env.DB.prepare('SELECT id,page,nickname,message,stamp,status,reply,created_at FROM comments WHERE status=? ORDER BY created_at DESC,id DESC LIMIT 30 OFFSET ?').bind(status,offset).all();
      const {total}=await env.DB.prepare('SELECT COUNT(*) AS total FROM comments WHERE status=?').bind(status).first();
      return json({items:results.map(row=>({...publicComment(row),page:row.page,status:row.status})),total,next:offset+results.length<total?offset+results.length:null});
    }
    fail(404,'not_found','没有这个接口。');
  }
  const body=await bodyJSON(request);
  if(route==='admin/login'){
    await rateLimit(request,env,'login',5,600);
    if(typeof body.password!=='string'||body.password.length>512)fail(401,'unauthorized','口令不正确。');
    const supplied=await digest(body.password),expected=await digest(env.ADMIN_SECRET);
    let difference=0;for(let i=0;i<expected.length;i++)difference|=supplied.charCodeAt(i)^expected.charCodeAt(i);
    if(difference)fail(401,'unauthorized','口令不正确。');
    const payload=Math.floor(Date.now()/1000+ADMIN_AGE)+'.'+crypto.randomUUID();
    const {signature}=await hmac(env.ADMIN_SECRET,payload);
    return json({authenticated:true},200,{'Set-Cookie':cookie(request,'cc_owner',payload+'.'+[...signature].map(x=>x.toString(16).padStart(2,'0')).join(''),ADMIN_AGE)});
  }
  if(route==='admin/logout')return json({authenticated:false},200,{'Set-Cookie':cookie(request,'cc_owner','',0)});
  if(route==='admin/moderate'){
    await requireOwner(request,env);
    if(!UUID.test(body.id||'')||!['approved','rejected'].includes(body.status))fail(400,'validation','审核内容不正确。');
    const reply=textField(body.reply??'',0,1200,'回复');
    const changed=await env.DB.prepare('UPDATE comments SET status=?,reply=?,moderated_at=? WHERE id=?').bind(body.status,reply,Date.now(),body.id).run();
    if(!changed.meta.changes)fail(404,'not_found','这条留言不存在。');
    return json({updated:true});
  }
  if(!['visit','comments','reaction'].includes(route))fail(404,'not_found','没有这个接口。');
  const page=pageKey(body.page);await requirePage(page,env,request);
  const visitor=await identity(request,env),headers={'Set-Cookie':visitor.header};
  if(route==='visit'){
    await rateLimit(request,env,'visit',180,600);
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO visitors(id,first_seen) VALUES (?,?)').bind(visitor.id,Date.now()),
      env.DB.prepare('INSERT OR IGNORE INTO visits(visitor_id,page,window) VALUES (?,?,?)').bind(visitor.id,page,Math.floor(Date.now()/1800000))
    ]);
    return json(await statistics(env,page,visitor.id),200,headers);
  }
  if(route==='reaction'){
    await rateLimit(request,env,'reaction',30,600);
    await env.DB.prepare('INSERT OR IGNORE INTO reactions(visitor_id,page,created_at) VALUES (?,?,?)').bind(visitor.id,page,Date.now()).run();
    const {applause}=await env.DB.prepare('SELECT applause FROM page_stats WHERE page=?').bind(page).first();
    return json({applause,reacted:true},200,headers);
  }
  const nickname=textField(body.nickname,1,24,'昵称'),message=textField(body.message,1,1200,'留言');
  if(body.website||!STAMPS.has(body.stamp)||!UUID.test(body.submissionId||''))fail(400,'validation','请检查留言内容。');
  const existing=await env.DB.prepare('SELECT id,status FROM comments WHERE visitor_id=? AND submission_id=?').bind(visitor.id,body.submissionId).first();
  if(existing)return json({id:existing.id,status:existing.status},202,headers);
  await rateLimit(request,env,'comment',3,600);
  const id=crypto.randomUUID();
  await env.DB.prepare('INSERT OR IGNORE INTO comments(id,page,visitor_id,submission_id,nickname,message,stamp,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,page,visitor.id,body.submissionId,nickname,message,body.stamp,Date.now()).run();
  // Re-read the key in case an identical retry raced the initial insert.
  const stored=await env.DB.prepare('SELECT id,status FROM comments WHERE visitor_id=? AND submission_id=?').bind(visitor.id,body.submissionId).first();
  return json({id:stored.id,status:stored.status},202,headers);
}

export default {
  async fetch(request,env,ctx) {
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
    try{return await handle(request,env);}catch(error){
      if(error instanceof ApiError)return json({code:error.code,message:error.message},error.status,error.status===429?{'Retry-After':'600'}:{});
      console.error('Community request failed:',error?.name||'Error');
      return json({code:'service_unavailable',message:'服务暂时忙碌，请稍后重试。'},503);
    }
  },
  async scheduled(event,env) {
    if(!env.DB)return;
    await env.DB.batch([
      env.DB.prepare('DELETE FROM rate_limits WHERE expires<?').bind(Math.floor(Date.now()/1000)),
      env.DB.prepare('DELETE FROM visits WHERE window<?').bind(Math.floor(Date.now()/1800000)-336)
    ]);
  }
};
