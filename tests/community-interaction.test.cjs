const test=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const id='d24d459f-5c62-4a7d-a5ca-56f715380707';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8'}});
const receipt=(status='pending')=>json({id,status},202);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(deliver,loadComments=()=>json({items:[],total:0,next:null})) {
  const dom=new JSDOM(`<body data-section="guestbook"><section data-comments><span data-comment-total></span><form><fieldset data-form-guard disabled><input name="nickname" value="听众"><textarea name="message">尚未投递的留言</textarea><input name="stamp" value="star"><input name="website" value=""><span data-comment-length></span><button type="submit">投递留言</button><p class="comment-status" role="status"></p></fieldset></form><div data-comment-list></div><button data-comment-more hidden>更多</button></section></body>`,{url:'https://ccatelier.test/guestbook/'});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,location:dom.window.location,FormData:dom.window.FormData,matchMedia:()=>({matches:false,addEventListener(){}})});
  const bodies=[];
  globalThis.fetch=async(url,options)=>{
    if(url==='/api/comments'&&options.method==='POST'){const body=JSON.parse(options.body);bodies.push(body);return deliver(body,bodies.length);}
    if(url.startsWith('/api/comments?'))return loadComments();
    return json({site:{},page:{},reacted:false});
  };
  const api=await import('../source/atelier/js/community.js');api.initCommunity();await tick();
  const form=document.querySelector('form'),input=form.elements.message,status=document.querySelector('.comment-status'),button=form.querySelector('[type=submit]');
  return {dom,bodies,form,input,status,button,api,submit:()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})),close:()=>dom.window.close()};
}
for(const [name,response] of [
  ['HTML 200',()=>new Response('<html>fallback</html>',{headers:{'Content-Type':'text/html'}})],
  ['malformed JSON',()=>new Response('{bad',{status:202,headers:{'Content-Type':'application/json'}})],
  ['missing id',()=>json({status:'pending'},202)],
  ['missing status',()=>json({id},202)],
  ['invalid id',()=>json({id:'not-a-receipt',status:'pending'},202)],
  ['unknown moderation status',()=>receipt('unknown')],
  ['wrong HTTP status',()=>json({id,status:'pending'},200)],
  ['wrong media type',()=>new Response(JSON.stringify({id,status:'pending'}),{status:202,headers:{'Content-Type':'text/html'}})],
  ['network failure',()=>{throw new TypeError('Failed to fetch');}],
  ['timeout',()=>{throw new DOMException('Timeout','AbortError');}],
  ['unavailable service',()=>json({message:'留言和统计服务尚未连接。'},503)]
])test(`${name} never acknowledges or clears a comment`,async()=>{
  const s=await setup(response);try{s.submit();await tick();assert.equal(s.input.value,'尚未投递的留言');assert.doesNotMatch(s.status.textContent,/已收到|已公开/);assert.match(s.status.textContent,/内容仍在/);assert.equal(s.button.disabled,false);assert.equal(s.bodies.length,1);}finally{s.close();}
});
test('duplicate gestures send once; retry retains the idempotency key and valid receipt clears',async()=>{
  let reject;const s=await setup((body,n)=>n===1?new Promise((_,r)=>{reject=r;}):receipt());
  try{s.submit();s.submit();assert.equal(s.bodies.length,1);assert.equal(s.button.disabled,true);reject(new TypeError('Offline'));await tick();s.submit();await tick();assert.equal(s.bodies.length,2);assert.equal(s.bodies[0].submissionId,s.bodies[1].submissionId);assert.equal(s.input.value,'');assert.match(s.status.textContent,/已收到/);assert.equal(s.button.disabled,false);}finally{s.close();}
});
test('editing the failed draft creates a new submission key',async()=>{
  const s=await setup((body,n)=>n===1?Promise.reject(new TypeError('Offline')):receipt());
  try{s.submit();await tick();s.input.value='修改之后的新留言';s.submit();await tick();assert.notEqual(s.bodies[0].submissionId,s.bodies[1].submissionId);assert.equal(s.input.value,'');}finally{s.close();}
});
test('late success keeps edits made while submission was pending',async()=>{
  let resolve;const s=await setup(()=>new Promise(r=>{resolve=r;}));
  try{s.submit();s.input.value='正在写的下一条';resolve(receipt());await tick();assert.equal(s.input.value,'正在写的下一条');assert.match(s.status.textContent,/当前修改的草稿已保留，尚未投递/);}finally{s.close();}
});
for(const state of ['pending','approved','rejected'])test(`Worker-compatible mocked idempotent ${state} receipt has accurate feedback`,async()=>{
  const s=await setup(()=>receipt(state));try{s.submit();await tick();assert.match(s.status.textContent,state==='pending'?/审核后/:state==='approved'?/已公开/:/已被收起，未公开/);assert.equal(s.input.value,state==='rejected'?'尚未投递的留言':'');}finally{s.close();}
});
test('bad comment lists show a recoverable message, not an internal TypeError',async()=>{
  const s=await setup(()=>receipt());try{
    globalThis.fetch=async()=>json({items:null,total:0,next:null});
    await assert.rejects(()=>s.api.communityAPI('comments?page=%2Fguestbook%2F'),/无法识别/);
    for(const data of [{items:[],total:0},{items:[],total:-1,next:null},{items:[{id}],total:1,next:null},null]){
      globalThis.fetch=async()=>json(data);await assert.rejects(()=>s.api.communityAPI('comments?page=%2Fguestbook%2F'),/无法识别/);
    }
    globalThis.fetch=async()=>json({items:[{id,nickname:'听众',message:'留言',stamp:'star',reply:'',createdAt:new Date().toISOString()}],total:1,next:null});
    assert.equal((await s.api.communityAPI('comments?page=%2Fguestbook%2F')).items.length,1);
  }finally{s.close();}
});

test('comment-list failure has a working retry and clears its busy state',async()=>{
  let attempts=0;const s=await setup(()=>receipt(),()=>++attempts===1?json({items:null}):json({items:[],total:0,next:null}));
  try{const list=document.querySelector('[data-comment-list]');assert.match(list.textContent,/无法识别/);assert.doesNotMatch(list.textContent,/TypeError|iterable/);assert.equal(list.hasAttribute('aria-busy'),false);list.querySelector('button').click();await tick();assert.equal(attempts,2);assert.match(list.textContent,/还没有公开/);assert.equal(document.querySelector('[data-comment-total]').textContent,'00');}finally{s.close();}
});
test('even whitespace edits made during delivery are not erased',async()=>{
  let resolve;const s=await setup(()=>new Promise(r=>{resolve=r;}));
  try{s.submit();s.input.value+='\n';resolve(receipt());await tick();assert.equal(s.input.value,'尚未投递的留言\n');assert.match(s.status.textContent,/草稿已保留/);}finally{s.close();}
});
