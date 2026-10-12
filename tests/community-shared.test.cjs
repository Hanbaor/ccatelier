const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {staticImports}=require('../tools/module-graph.cjs');
const directory=path.resolve(__dirname,'../source/atelier/js');
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const id='d24d459f-5c62-4a7d-a5ca-56f715380707';
test('community compatibility exports retain the exact shared function bindings without requests on evaluation',async()=>{
 const dom=new JSDOM('<body></body>',{url:'https://ccatelier.test/guestbook/'}),calls=[];
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,location:dom.window.location,matchMedia:()=>({matches:false,addEventListener(){}})});
 globalThis.fetch=async(...args)=>{calls.push(args);throw Error('unexpected request');};
 try{
  const boot=await import('../source/atelier/js/community.js'),shared=await import('../source/atelier/js/community-shared.js');
  assert.deepEqual(Object.keys(boot).sort(),['communityAPI','element','initCommentSection','initCommunity','initModeration','messageCard'].sort());
  assert.deepEqual(Object.keys(shared).sort(),['communityAPI','element','messageCard']);
  for(const key of Object.keys(shared))assert.equal(boot[key],shared[key],key+' is the same live binding');
  await import('../source/atelier/js/community-comments.js');await import('../source/atelier/js/community-moderation.js');
  assert.equal(calls.length,0,'module evaluation does not initialize features or send requests');
  for(const file of ['community-comments.js','community-moderation.js']){
   const imports=staticImports(fs.readFileSync(path.join(directory,file),'utf8'));
   assert.ok(imports.includes('./community-shared.js'));assert.ok(!imports.includes('./community.js'));
  }
  const text='<img src=x onerror=alert(1)>',node=boot.element('p','sample',text);
  assert.equal(node.ownerDocument,document);assert.equal(node.className,'sample');assert.equal(node.textContent,text);assert.equal(node.children.length,0);
  const card=shared.messageCard({id,nickname:text,message:text,reply:text,stamp:'ribbon',createdAt:'2026-10-10T00:00:00Z'});
  assert.equal(card.querySelectorAll('img,script').length,0);assert.equal(card.querySelector('.encore-stamp').textContent,'⋈');assert.equal(card.querySelector('.encore-stamp').getAttribute('aria-hidden'),'true');assert.equal(card.querySelector('.encore-message-body').textContent,text);assert.equal(card.querySelector('.encore-owner-reply p').textContent,text);assert.equal(card.querySelector('time').dateTime,'2026-10-10T00:00:00Z');
 }finally{dom.window.close();}
});
test('shared API preserves request ordering, credentials, payload, receipts and recoverable errors through both exports',async()=>{
 const boot=await import('../source/atelier/js/community.js'),shared=await import('../source/atelier/js/community-shared.js'),calls=[];
 let response=json({items:[],total:0,next:null});
 globalThis.fetch=async(url,options)=>{calls.push({url,...options});return response;};
 assert.deepEqual(await boot.communityAPI('comments?page=%2Fguestbook%2F'),{items:[],total:0,next:null});
 assert.equal(calls[0].url,'/api/comments?page=%2Fguestbook%2F');assert.equal(calls[0].method,'GET');assert.equal(calls[0].body,undefined);assert.equal(calls[0].credentials,'same-origin');assert.ok(calls[0].signal instanceof AbortSignal);
 response=json({id,status:'pending'},202);const body={page:'/guestbook/',message:'保留留言'};
 assert.deepEqual(await shared.communityAPI('comments',body),{id,status:'pending'});
 assert.equal(calls[1].url,'/api/comments');assert.equal(calls[1].method,'POST');assert.equal(calls[1].credentials,'same-origin');assert.equal(calls[1].headers['Content-Type'],'application/json');assert.deepEqual(JSON.parse(calls[1].body),body);
 response=json({message:'请登录',code:'session_expired'},401);
 await assert.rejects(()=>boot.communityAPI('admin/comments?status=pending&offset=0'),error=>error.status===401&&error.code==='session_expired'&&error.message==='请登录');
 response=new Response('<html>fallback</html>');await assert.rejects(()=>shared.communityAPI('comments?page=%2Fguestbook%2F'),/无法识别/);
 response=json({items:[],total:0,next:null});assert.deepEqual(await boot.communityAPI('comments?page=%2Fguestbook%2F'),{items:[],total:0,next:null});
 assert.equal(calls.length,5,'each explicit request executes once; no automatic retry');
});
