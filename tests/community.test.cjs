const test = require('node:test');
const assert = require('node:assert/strict');
const {DatabaseSync} = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

async function setup() {
  const {default:worker} = await import('../worker/index.mjs');
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname,'../worker/migrations/0001-community.sql'),'utf8'));
  function statement(sql, values=[]) {
    return {
      bind(...parameters) { return statement(sql,parameters); },
      async first() { return db.prepare(sql).get(...values) || null; },
      async all() { return {results:db.prepare(sql).all(...values)}; },
      async run() { const info=db.prepare(sql).run(...values); return {success:true,meta:{changes:Number(info.changes)}}; }
    };
  }
  const env = {DB:{prepare:statement,async batch(statements){db.exec('BEGIN');try {const out=[];for(const s of statements)out.push(await s.run());db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}},ADMIN_SECRET:'test-owner-secret-at-least-32-characters',LOCAL_PREVIEW:'true',ASSETS:{fetch:async request=>new Response(request.url.includes('missing')?'missing':'<html></html>',{status:request.url.includes('missing')?404:200,headers:{'Content-Type':'text/html'}})}};
  let cookie='';
  async function request(route,body,options={}) {
    const headers = {'Origin':'http://localhost','Content-Type':'application/json','CF-Connecting-IP':options.ip || '127.0.0.1'};
    if (options.cookie!==false && cookie) headers.Cookie=cookie;
    if (options.origin) headers.Origin=options.origin;
    const req=new Request('http://localhost/api/'+route,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
    const response=await worker.fetch(req,env,{});
    const cookies=response.headers.get('set-cookie');
    if(cookies) { const next=cookies.split(';')[0]; const name=next.split('=')[0]; cookie=cookie.split('; ').filter(x=>x&&!x.startsWith(name+'=')).concat(next).join('; '); }
    return {status:response.status,data:await response.json(),headers:response.headers};
  }
  return {request,db,env,worker,close:()=>db.close()};
}

test('visits deduplicate browser refreshes, distinguish pages and browser cookies',async()=>{
  const s=await setup();try{
    const first=await s.request('visit',{page:'/notes/'});
    assert.equal(first.status,200);assert.equal(first.data.site.visitors,1);assert.equal(first.data.site.views,1);
    assert.match(first.headers.get('set-cookie'),/HttpOnly/);
    const repeated=await s.request('visit',{page:'/notes/'});assert.equal(repeated.data.site.views,1);
    const another=await s.request('visit',{page:'/about/'});assert.equal(another.data.site.views,2);assert.equal(another.data.site.visitors,1);
    const otherBrowser=await s.request('visit',{page:'/notes/'},{cookie:false});assert.equal(otherBrowser.data.site.visitors,2);assert.equal(otherBrowser.data.site.views,3);
    assert.equal((await s.request('visit',{page:'https://evil.example/'})).status,400);
    assert.equal((await s.request('visit',{page:'/missing/'})).status,404);
  }finally{s.close();}
});

test('comments persist privately until owner approval, then expose only public fields',async()=>{
  const s=await setup();try{
    const pending=await s.request('comments',{page:'/guestbook/',nickname:'虹夏听众🎵',message:'<script>alert(1)</script> 你好！',stamp:'star',submissionId:'d24d459f-5c62-4a7d-a5ca-56f715380707'});
    assert.equal(pending.status,202);assert.equal(pending.data.status,'pending');
    assert.equal((await s.request('comments?page=%2Fguestbook%2F')).data.items.length,0);
    assert.equal((await s.request('admin/comments')).status,401);
    assert.equal((await s.request('admin/login',{password:s.env.ADMIN_SECRET})).status,200);
    const list=await s.request('admin/comments');assert.equal(list.data.items.length,1);
    const id=list.data.items[0].id;
    assert.equal((await s.request('admin/moderate',{id,status:'approved',reply:'谢谢来访。'})).status,200);
    const visible=(await s.request('comments?page=%2Fguestbook%2F')).data.items[0];
    assert.equal(visible.message,'<script>alert(1)</script> 你好！');assert.equal(visible.reply,'谢谢来访。');
    assert.equal(visible.nickname,'虹夏听众🎵');assert.ok(!('visitor_id' in visible));assert.ok(!('submission_id' in visible));
    assert.equal((await s.request('comments?page=%2Fnotes%2F')).data.items.length,0);
    await s.request('admin/logout',{});assert.equal((await s.request('admin/comments')).status,401);
  }finally{s.close();}
});

test('duplicate submission is idempotent and invalid or cross-origin writes are rejected',async()=>{
  const s=await setup();try{
    const body={page:'/guestbook/',nickname:'CC',message:'你好，下一拍。',stamp:'drum',submissionId:'fd8432e9-a374-4617-9b6e-3f1742d43650'};
    assert.equal((await s.request('comments',body)).status,202);
    assert.equal((await s.request('comments',body)).status,202);
    assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM comments').get().n,1);
    assert.equal((await s.request('comments',{...body,message:'x'.repeat(1201)})).status,400);
    assert.equal((await s.request('comments',{...body,website:'spam.example'})).status,400);
    assert.equal((await s.request('comments',body,{origin:'https://evil.example'})).status,403);
    assert.equal((await s.request('admin/login',{password:'wrong'})).status,401);
  }finally{s.close();}
});

test('applause cannot be multiplied by refreshes and moderation can reject a published message',async()=>{
  const s=await setup();try{
    assert.equal((await s.request('reaction',{page:'/notes/'})).data.applause,1);
    assert.equal((await s.request('reaction',{page:'/notes/'})).data.applause,1);
    assert.equal((await s.request('reaction',{page:'/notes/'},{cookie:false})).data.applause,2);
    const comment=await s.request('comments',{page:'/notes/',nickname:'听众',message:'掌声。',stamp:'star',submissionId:crypto.randomUUID()});
    await s.request('admin/login',{password:s.env.ADMIN_SECRET});
    const id=(await s.request('admin/comments')).data.items[0].id;
    await s.request('admin/moderate',{id,status:'approved',reply:''});
    await s.request('admin/moderate',{id,status:'rejected',reply:''});
    assert.equal((await s.request('comments?page=%2Fnotes%2F')).data.total,0);
  }finally{s.close();}
});

test('comment and owner-login rate limits enforce a shared server-side bound',async()=>{
  const s=await setup();try{
    for(let i=0;i<3;i++)assert.equal((await s.request('comments',{page:'/notes/',nickname:'听众',message:'第'+i+'条',stamp:'star',submissionId:crypto.randomUUID()})).status,202);
    assert.equal((await s.request('comments',{page:'/notes/',nickname:'听众',message:'过量',stamp:'star',submissionId:crypto.randomUUID()},{cookie:false})).status,429);
    for(let i=0;i<5;i++)assert.equal((await s.request('admin/login',{password:'wrong'})).status,401);
    assert.equal((await s.request('admin/login',{password:s.env.ADMIN_SECRET})).status,429);
  }finally{s.close();}
});

test('missing service configuration fails explicitly rather than returning fabricated statistics',async()=>{
  const {default:worker}=await import('../worker/index.mjs');
  const response=await worker.fetch(new Request('https://ccatelier.top/api/stats'),{},{});
  assert.equal(response.status,503);assert.equal((await response.json()).code,'not_configured');
});

test('approved comment pagination is disjoint and pending records stay private',async()=>{
  const s=await setup();try{
    const insert=s.db.prepare('INSERT INTO comments(id,page,visitor_id,submission_id,nickname,message,stamp,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)');
    for(let i=0;i<15;i++)insert.run(crypto.randomUUID(),'/guestbook/','v',crypto.randomUUID(),'听众'+i,'hello '+i,'star',i===14?'pending':'approved',100000+i);
    const first=(await s.request('comments?page=%2Fguestbook%2F')).data;
    const second=(await s.request('comments?page=%2Fguestbook%2F&offset='+first.next)).data;
    assert.equal(first.total,14);assert.equal(first.items.length,12);assert.equal(second.items.length,2);assert.equal(second.next,null);
    assert.equal(new Set([...first.items,...second.items].map(i=>i.id)).size,14);
    assert.ok(!first.items.some(i=>i.nickname==='听众14'));
  }finally{s.close();}
});

test('forged owner cookies and oversized JSON streams are rejected',async()=>{
  const s=await setup();try{
    const forged=new Request('https://site.test/api/admin/comments',{headers:{Cookie:'cc_owner='+Math.floor(Date.now()/1000+3600)+'.'+crypto.randomUUID()+'.'+'0'.repeat(64)}});
    assert.equal((await s.worker.fetch(forged,s.env,{})).status,401);
    const huge=new Request('https://site.test/api/comments',{method:'POST',headers:{Origin:'https://site.test','Content-Type':'application/json'},body:JSON.stringify({message:'x'.repeat(9000)})});
    assert.equal((await s.worker.fetch(huge,s.env,{})).status,413);
    assert.equal((await s.request('visit',{page:'/%2e%2e/admin/'})).status,400);
    assert.equal((await s.request('visit',{page:'/%2f%2fevil/'})).status,400);
  }finally{s.close();}
});
