const test = require('node:test');
const assert = require('node:assert/strict');
const {DatabaseSync} = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

async function setup(hooks={}) {
  const {default:worker} = await import('../worker/index.mjs');
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname,'../worker/migrations/0001-community.sql'),'utf8'));
  function statement(sql, values=[]) {
    return {
      bind(...parameters) { return statement(sql,parameters); },
      async first() { const row=db.prepare(sql).get(...values) || null; if(hooks.afterFirst)await hooks.afterFirst(sql,row); return hooks.transformFirst?hooks.transformFirst(sql,row):row; },
      async all() { return {results:db.prepare(sql).all(...values)}; },
      async run() { if(hooks.beforeRun)await hooks.beforeRun(sql); const info=db.prepare(sql).run(...values); if(hooks.afterRun)await hooks.afterRun(sql); return {success:true,meta:{changes:Number(info.changes)}}; }
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


const commentBody=(extra={})=>({page:'/guestbook/',nickname:'听众',message:'下一拍。',stamp:'star',submissionId:crypto.randomUUID(),...extra});
const countComments=s=>s.db.prepare('SELECT COUNT(*) AS n FROM comments').get().n;
const rateHits=s=>s.db.prepare('SELECT COALESCE(SUM(hits),0) AS n FROM rate_limits').get().n;

test('lost first response and disabled cookies return the same minimal receipt without changing ownership',async()=>{
  const s=await setup();try{
    const body=commentBody();
    const first=await s.request('comments',body,{cookie:false});
    const owner=s.db.prepare('SELECT visitor_id FROM comments').get().visitor_id;
    for(let i=0;i<5;i++){
      const retry=await s.request('comments',body,{cookie:false});
      assert.equal(retry.status,202);assert.deepEqual(retry.data,first.data);
      assert.deepEqual(Object.keys(retry.data).sort(),['id','status']);
      assert.notEqual(retry.headers.get('set-cookie'),first.headers.get('set-cookie'));
    }
    assert.equal(countComments(s),1);assert.equal(rateHits(s),1);
    assert.equal(s.db.prepare('SELECT visitor_id FROM comments').get().visitor_id,owner);
  }finally{s.close();}
});

test('page and text normalization match retries, but every different payload conflicts',async()=>{
  const s=await setup();try{
    // Explicit decomposed Unicode is normalized before storage and comparison.
    const body=commentBody({page:'/caf%C3%A9/index.html',nickname:' Cafe\u0301 ',message:' 下一拍。\n'});
    const first=await s.request('comments',body);
    const normalized={...body,page:'/café/',nickname:'Café',message:'下一拍。'};
    assert.equal(first.status,202);
    assert.deepEqual((await s.request('comments',normalized,{cookie:false})).data,first.data);
    for(const delta of [{nickname:'另一人'},{message:'不同正文'},{stamp:'drum'}]){
      const result=await s.request('comments',{...normalized,...delta},{cookie:false});
      assert.equal(result.status,409);assert.equal(result.data.code,'submission_conflict');
      assert.deepEqual(Object.keys(result.data).sort(),['code','message']);
    }
    assert.equal(countComments(s),1);assert.equal(rateHits(s),1);
  }finally{s.close();}
});

test('different visitors can reuse a nonce on different pages; legacy same-visitor cross-page uniqueness conflicts',async()=>{
  const s=await setup();try{
    const body=commentBody();const first=await s.request('comments',body);
    const conflict=await s.request('comments',{...body,page:'/notes/'});
    assert.equal(conflict.status,409);assert.ok(!('id' in conflict.data));assert.equal(countComments(s),1);
    const other=await s.request('comments',{...body,page:'/notes/'},{cookie:false});
    assert.equal(other.status,202);assert.notEqual(other.data.id,first.data.id);assert.equal(countComments(s),2);
  }finally{s.close();}
});

test('legacy random IDs and moderation status are retained; historical duplicates have a stable first receipt',async()=>{
  const s=await setup();try{
    const body=commentBody(),id='11111111-1111-4111-8111-111111111111';
    const insert=s.db.prepare('INSERT INTO comments(id,page,visitor_id,submission_id,nickname,message,stamp,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)');
    insert.run(id,body.page,'legacy-owner',body.submissionId,body.nickname,body.message,body.stamp,'rejected',100);
    insert.run('22222222-2222-4222-8222-222222222222',body.page,'other-legacy-owner',body.submissionId,body.nickname,body.message,body.stamp,'pending',100);
    const retry=await s.request('comments',body,{cookie:false});
    assert.equal(retry.status,202);assert.deepEqual(retry.data,{id,status:'rejected'});
    assert.equal(countComments(s),2);assert.equal(rateHits(s),0);
  }finally{s.close();}
});

for(const differentPayload of [false,true])test(`racing anonymous tabs share a page nonce (${differentPayload?'conflicting':'identical'} payload)`,async()=>{
  let reads=0,release;const ready=new Promise(resolve=>{release=resolve;});
  const s=await setup({async afterFirst(sql,row){
    if(sql.startsWith('SELECT id,status,nickname')&&!row){if(++reads===2)release();await ready;}
  }});try{
    const body=commentBody();
    const responses=await Promise.all([
      s.request('comments',body,{cookie:false,ip:'192.0.2.1'}),
      s.request('comments',{...body,...(differentPayload?{message:'另一标签页内容'}:{})},{cookie:false,ip:'192.0.2.2'})
    ]);
    assert.deepEqual(responses.map(r=>r.status).sort(),differentPayload?[202,409]:[202,202]);
    if(!differentPayload)assert.deepEqual(responses[0].data,responses[1].data);
    assert.equal(countComments(s),1);assert.equal(rateHits(s),2);
  }finally{s.close();}
});

test('independent tab nonces remain independent and existing receipts bypass an exhausted new-write limit',async()=>{
  const s=await setup();try{
    const body=commentBody();const first=await s.request('comments',body);
    for(let i=0;i<2;i++)assert.equal((await s.request('comments',commentBody())).status,202);
    assert.equal((await s.request('comments',commentBody(),{cookie:false})).status,429);
    const hits=rateHits(s);
    assert.deepEqual((await s.request('comments',body,{cookie:false})).data,first.data);
    assert.equal(rateHits(s),hits);assert.equal(countComments(s),3);
  }finally{s.close();}
});

for(const phase of ['beforeRun','afterRun'])test(`retry after a database error ${phase==='beforeRun'?'before':'after'} committing inserts only once`,async()=>{
  let armed=true;
  const s=await setup({[phase](sql){if(armed&&sql.startsWith('INSERT OR IGNORE INTO comments')){armed=false;throw new Error('Injected local database failure');}}});
  try{
    const body=commentBody();const failed=await s.request('comments',body,{cookie:false});
    assert.equal(failed.status,503);assert.equal(countComments(s),phase==='beforeRun'?0:1);
    const retried=await s.request('comments',body,{cookie:false});assert.equal(retried.status,202);
    assert.equal(countComments(s),1);assert.equal(rateHits(s),phase==='beforeRun'?2:1);
  }finally{s.close();}
});

test('the actual conditional insert is atomic across separate local SQLite connections (not a D1 concurrency test)',async()=>{
  const {Worker}=require('node:worker_threads'),os=require('node:os');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'community-atomic-')),file=path.join(dir,'comments.sqlite');
  const source=fs.readFileSync(path.join(__dirname,'../worker/index.mjs'),'utf8');
  // Read the real production statement rather than maintaining a second SQL implementation.
  const actual=source.match(/prepare\('(INSERT OR IGNORE INTO comments[^']*)'\)/)?.[1];
  assert.ok(actual,'production insert statement exists');
  const db=new DatabaseSync(file);db.exec(fs.readFileSync(path.join(__dirname,'../worker/migrations/0001-community.sql'),'utf8'));
  const barrier=new SharedArrayBuffer(4),nonce=crypto.randomUUID(),workers=[];
  try{
    const code=`const {parentPort,workerData}=require('node:worker_threads');
      const {DatabaseSync}=require('node:sqlite');
      const db=new DatabaseSync(workerData.file);db.exec('PRAGMA busy_timeout=5000');
      const flag=new Int32Array(workerData.barrier);parentPort.postMessage('ready');Atomics.wait(flag,0,0);
      const result=db.prepare(workerData.sql).run(...workerData.values);db.close();parentPort.postMessage(Number(result.changes));`;
    let ready=0;
    const results=[0,1].map(i=>new Promise((resolve,reject)=>{
      const w=new Worker(code,{eval:true,workerData:{file,barrier,sql:actual,values:[crypto.randomUUID(),'/guestbook/','visitor-'+i,nonce,'听众','下一拍。','star',100,'/guestbook/',nonce]}});
      workers.push(w);w.on('error',reject);w.on('message',message=>{if(message==='ready'){if(++ready===2){Atomics.store(new Int32Array(barrier),0,1);Atomics.notify(new Int32Array(barrier),0);}}else resolve(message);});
    }));
    assert.deepEqual((await Promise.all(results)).sort(),[0,1]);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM comments').get().n,1);
  }finally{await Promise.all(workers.map(w=>w.terminate()));db.close();fs.rmSync(dir,{recursive:true,force:true});}
});


test('a missing post-insert receipt is uncertain (503), never permission to rotate the nonce',async()=>{
  let hideOnce=true;
  const s=await setup({transformFirst(sql,row){if(hideOnce&&row&&sql.startsWith('SELECT id,status,nickname')){hideOnce=false;return null;}return row;}});
  try{
    const body=commentBody(),failed=await s.request('comments',body,{cookie:false});
    assert.equal(failed.status,503);assert.equal(failed.data.code,'service_unavailable');assert.equal(countComments(s),1);
    const retried=await s.request('comments',body,{cookie:false});assert.equal(retried.status,202);assert.equal(countComments(s),1);assert.equal(rateHits(s),1);
  }finally{s.close();}
});
