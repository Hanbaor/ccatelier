// Explicit local-only integration smoke: run after starting wrangler.local.jsonc.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:4319';
const secret=fs.readFileSync('.dev.vars','utf8').match(/^ADMIN_SECRET=(.+)$/m)?.[1].trim();
assert.ok(secret?.length>=24,'Local admin secret is required');
let cookie='';
async function call(route,body){const r=await fetch(base+'/api/'+route,{method:body===undefined?'GET':'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});const c=r.headers.get('set-cookie');if(c){const next=c.split(';')[0],name=next.split('=')[0];cookie=cookie.split('; ').filter(v=>v&&!v.startsWith(name+'=')).concat(next).join('; ');}return {status:r.status,data:await r.json()};}
assert.equal((await call('admin/comments')).status,401);
assert.equal((await call('admin/login',{password:secret})).status,200);
if(process.argv.includes('--hide')){
  const items=(await call('admin/comments?status=approved')).data.items.filter(i=>i.nickname==='本地验收'&&i.message==='仅用于本地功能验收：愿下一拍也有回声。');
  for(const item of items)assert.equal((await call('admin/moderate',{id:item.id,status:'rejected',reply:''})).status,200);
  console.log('PASS: local QA messages returned to non-public status');
}else{
  const list=await call('admin/comments');
  const item=list.data.items.find(i=>i.nickname==='本地验收'&&i.message==='仅用于本地功能验收：愿下一拍也有回声。');
  assert.ok(item,'Submit the named local browser QA comment first');
  assert.ok(!(await call('comments?page=%2Fguestbook%2F')).data.items.some(i=>i.id===item.id));
  assert.equal((await call('admin/moderate',{id:item.id,status:'approved',reply:'本地验收回复：已经收到。'})).status,200);
  const publicItem=(await call('comments?page=%2Fguestbook%2F')).data.items.find(i=>i.id===item.id);
  assert.equal(publicItem?.reply,'本地验收回复：已经收到。');
  const first=await call('visit',{page:'/lounge/'}),again=await call('visit',{page:'/lounge/'});
  assert.equal(again.data.site.views,first.data.site.views);assert.equal(again.data.local,true);
  assert.equal((await call('admin/logout',{})).status,200);assert.equal((await call('admin/comments')).status,401);
  console.log('PASS: workerd + persistent local D1, private submit → approval → public reply; visit dedup; admin logout');
}
