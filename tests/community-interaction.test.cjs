const test=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const id='d24d459f-5c62-4a7d-a5ca-56f715380707';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8'}});
const receipt=(status='pending')=>json({id,status},202);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(deliver,loadComments=()=>json({items:[],total:0,next:null})) {
  const dom=new JSDOM(`<body data-section="guestbook"><section data-comments><span data-comment-total></span><form><fieldset data-form-guard disabled><input name="nickname" value="听众"><textarea name="message">尚未投递的留言</textarea><input name="stamp" value="star"><input name="website" value=""><span data-comment-length></span><button type="submit">投递留言</button><p class="comment-status" role="status"></p></fieldset></form><div data-comment-list><p class="community-empty">正在打开留言簿……</p></div><button data-comment-more hidden>更多</button></section></body>`,{url:'https://ccatelier.test/guestbook/'});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,location:dom.window.location,FormData:dom.window.FormData,matchMedia:()=>({matches:false,addEventListener(){}})});
  const bodies=[];
  globalThis.fetch=async(url,options)=>{
    if(url==='/api/comments'&&options.method==='POST'){const body=JSON.parse(options.body);bodies.push(body);return deliver(body,bodies.length);}
    if(url.startsWith('/api/comments?'))return loadComments();
    return json({site:{views:0,visitors:0,applause:0},page:{views:0,applause:0},reacted:false});
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

const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const visitData=(applause=0,reacted=false)=>({site:{views:27,visitors:12,applause},page:{views:7,applause},reacted});
async function setupApplause(deliver,visit=()=>json(visitData()),duplicate=false) {
  const dom=new JSDOM(`<body data-section="article"><span data-stat="views">—</span><span data-stat="pageViews">—</span><span data-stats-context></span><details open><summary>工具</summary><button data-applause aria-pressed="false"><span data-applause-count>0</span></button></details><p data-article-tool-status></p></body>`,{url:'https://ccatelier.test/notes/'});
  Object.assign(globalThis,{window:dom.window,document:dom.window.document,location:dom.window.location,matchMedia:()=>({matches:false,addEventListener(){}})});
  const calls=[];globalThis.fetch=async(url,options)=>{if(url==='/api/visit')return visit();assert.equal(url,'/api/reaction');calls.push(JSON.parse(options.body));return deliver(calls.length);};
  if(duplicate){const button=document.querySelector('[data-applause]');button.after(button.cloneNode(true));}
  const api=await import('../source/atelier/js/community.js');api.initCommunity();await tick();
  const doc=dom.window.document,button=doc.querySelector('[data-applause]'),status=doc.querySelector('[data-article-tool-status]');
  return {dom,doc,button,status,calls,count:button.querySelector('span'),close:()=>dom.window.close()};
}
for(const [name,response] of [
  ['HTML 200',()=>new Response('<html>fallback</html>',{headers:{'Content-Type':'text/html'}})],
  ['broken JSON',()=>new Response('{bad',{headers:{'Content-Type':'application/json'}})],
  ['wrong content type',()=>new Response('{"applause":1,"reacted":true}',{headers:{'Content-Type':'text/html'}})],
  ['wrong HTTP success',()=>json({applause:1,reacted:true},202)],
  ['null shape',()=>json(null)],['array shape',()=>json([])],['missing count',()=>json({reacted:true})],
  ['missing reacted',()=>json({applause:1})],['unconfirmed reacted',()=>json({applause:1,reacted:false})],
  ['string reacted',()=>json({applause:1,reacted:'true'})],
  ...[-1,1.5,'1',null,Number.MAX_SAFE_INTEGER+1].map(value=>[`invalid count ${value}`,()=>json({applause:value,reacted:true})]),
  ['HTTP failure',()=>json({message:'稍后重试'},503)],
  ['network failure',()=>{throw new TypeError('offline');}],
  ['timeout',()=>{throw new DOMException('Timeout','AbortError');}]
])test(`applause ${name} remains retryable and never reports success`,async()=>{
  const s=await setupApplause(n=>n===1?response():json({applause:1,reacted:true}));
  try{
    s.button.click();await tick();assert.equal(s.button.getAttribute('aria-pressed'),'false');assert.equal(s.count.textContent,'0');assert.equal(s.button.disabled,false);assert.doesNotMatch(s.status.textContent,/掌声已送达/);assert.match(s.status.textContent,/重试|再试/);
    s.button.click();await tick();assert.equal(s.calls.length,2);assert.deepEqual(s.calls,[{page:'/notes/'},{page:'/notes/'}]);assert.equal(s.button.getAttribute('aria-pressed'),'true');assert.equal(s.count.textContent,'1');assert.match(s.status.textContent,/掌声已送达/);
  }finally{s.close();}
});
for(const order of ['reaction first','visit first'])test(`applause survives delayed initialization: ${order}`,async()=>{
  const v=deferred(),r=deferred(),s=await setupApplause(()=>r.promise,()=>v.promise);
  try{
    s.button.click();s.button.click();s.button.dispatchEvent(new s.dom.window.Event('click'));assert.equal(s.calls.length,1);assert.equal(s.button.disabled,true);
    if(order==='reaction first'){r.resolve(json({applause:1,reacted:true}));await tick();v.resolve(json(visitData()));}
    else{v.resolve(json(visitData()));await tick();r.resolve(json({applause:1,reacted:true}));}
    await tick();assert.equal(s.button.getAttribute('aria-pressed'),'true');assert.equal(s.count.textContent,'1');assert.equal(s.doc.querySelector('[data-stat="views"]').textContent,'27');assert.equal(s.doc.querySelector('[data-stat="pageViews"]').textContent,'7');assert.match(s.status.textContent,/掌声已送达/);assert.equal(s.button.disabled,false);
    s.button.click();assert.equal(s.calls.length,1);
  }finally{s.close();}
});
test('failed reaction before delayed visit permits a real retry',async()=>{
  const v=deferred(),s=await setupApplause(n=>n===1?Promise.reject(new TypeError('offline')):json({applause:1,reacted:true}),()=>v.promise);
  try{s.button.click();await tick();v.resolve(json(visitData()));await tick();s.button.click();await tick();assert.equal(s.calls.length,2);assert.equal(s.count.textContent,'1');assert.equal(s.button.getAttribute('aria-pressed'),'true');}finally{s.close();}
});
test('existing applause prevents sending again',async()=>{
  const s=await setupApplause(()=>assert.fail('must not send'),()=>json(visitData(3,true)));
  try{s.button.click();assert.equal(s.count.textContent,'3');assert.equal(s.button.getAttribute('aria-pressed'),'true');assert.equal(s.calls.length,0);}finally{s.close();}
});
test('confirmed visit is not undone by a concurrent failed reaction',async()=>{
  const v=deferred(),r=deferred(),s=await setupApplause(()=>r.promise,()=>v.promise);
  try{s.button.click();v.resolve(json(visitData(3,true)));await tick();r.reject(new TypeError('offline'));await tick();assert.equal(s.count.textContent,'3');assert.equal(s.button.getAttribute('aria-pressed'),'true');s.button.click();assert.equal(s.calls.length,1);}finally{s.close();}
});
test('broken visit data fails closed without undoing confirmed applause',async()=>{
  const v=deferred(),s=await setupApplause(()=>json({applause:1,reacted:true}),()=>v.promise);
  try{s.button.click();await tick();v.resolve(json({page:{applause:-1},reacted:false}));await tick();assert.equal(s.count.textContent,'1');assert.equal(s.button.getAttribute('aria-pressed'),'true');assert.match(s.doc.querySelector('[data-stats-context]').textContent,/统计暂未连接/);}finally{s.close();}
});
test('closing article tools preserves an in-flight applause receipt when reopened',async()=>{
  const r=deferred(),s=await setupApplause(()=>r.promise);
  try{s.button.click();const details=s.doc.querySelector('details');details.open=false;r.resolve(json({applause:1,reacted:true}));await tick();details.open=true;assert.equal(s.count.textContent,'1');assert.equal(s.button.getAttribute('aria-pressed'),'true');s.button.click();assert.equal(s.calls.length,1);}finally{s.close();}
});
for(const leave of ['pathname','pagehide','detached','closed'])test(`late responses after ${leave} do not update applause or another page`,async()=>{
  const v=deferred(),r=deferred(),s=await setupApplause(()=>r.promise,()=>v.promise);
  try{
    s.button.click();
    if(leave==='pathname')s.dom.window.history.pushState({},'','/other/');
    if(leave==='pagehide')s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));
    if(leave==='detached')s.button.remove();
    if(leave==='closed')s.close();
    r.resolve(json({applause:1,reacted:true}));v.resolve(json(visitData(2,true)));await tick();
    assert.equal(s.button.getAttribute('aria-pressed'),'false');assert.equal(s.count.textContent,'0');assert.doesNotMatch(s.status.textContent,/掌声已送达/);assert.equal(s.button.disabled,false);
  }finally{s.close();}
});
test('return from page cache re-enables safe retry after response arrived away',async()=>{
  const r=deferred(),s=await setupApplause(n=>n===1?r.promise:json({applause:1,reacted:true}));
  try{s.button.click();s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));r.resolve(json({applause:1,reacted:true}));await tick();s.dom.window.dispatchEvent(new s.dom.window.Event('pageshow'));s.button.click();await tick();assert.equal(s.calls.length,2);assert.equal(s.count.textContent,'1');assert.equal(s.button.getAttribute('aria-pressed'),'true');}finally{s.close();}
});
for(const applause of [0,Number.MAX_SAFE_INTEGER])test(`valid applause boundary ${applause} is accepted`,async()=>{
  const s=await setupApplause(()=>json({applause,reacted:true}));
  try{s.button.click();await tick();assert.equal(s.count.textContent,String(applause));assert.equal(s.button.getAttribute('aria-pressed'),'true');assert.match(s.status.textContent,/掌声已送达/);}finally{s.close();}
});
test('multiple applause controls share the pending and confirmed state',async()=>{
  const r=deferred(),s=await setupApplause(()=>r.promise,undefined,true);
  try{
    const buttons=[...s.doc.querySelectorAll('[data-applause]')];s.button.click();buttons[1].click();buttons[1].dispatchEvent(new s.dom.window.Event('click'));assert.equal(s.calls.length,1);assert.ok(buttons.every(button=>button.disabled));
    r.resolve(json({applause:1,reacted:true}));await tick();assert.ok(buttons.every(button=>!button.disabled&&button.getAttribute('aria-pressed')==='true'&&button.querySelector('span').textContent==='1'));buttons[1].click();assert.equal(s.calls.length,1);
  }finally{s.close();}
});


test('only a confirmed conflict rotates the nonce on the next explicit submit, retaining the form',async()=>{
  const s=await setup((body,n)=>n===1?json({code:'submission_conflict',message:'请重新提交留言。'},409):receipt());
  try{
    s.submit();await tick();assert.equal(s.bodies.length,1);assert.equal(s.input.value,'尚未投递的留言');assert.equal(s.button.disabled,false);
    await tick();assert.equal(s.bodies.length,1,'never resend automatically');
    s.submit();await tick();assert.equal(s.bodies.length,2);assert.notEqual(s.bodies[0].submissionId,s.bodies[1].submissionId);assert.equal(s.input.value,'');
  }finally{s.close();}
});

for(const [name,failure] of [
  ['lost response',()=>{throw new TypeError('Response lost after commit');}],
  ['timeout',()=>{throw new DOMException('Timeout','AbortError');}],
  ['5xx conflict-shaped response',()=>json({code:'submission_conflict',message:'Unavailable'},503)],
  ['general 409',()=>json({code:'other_conflict',message:'Conflict'},409)],
  ['409 without code',()=>json({message:'Conflict'},409)],
  ['bad JSON',()=>new Response('{bad',{status:409,headers:{'Content-Type':'application/json'}})],
  ['wrong media type',()=>new Response(JSON.stringify({code:'submission_conflict'}),{status:409,headers:{'Content-Type':'text/html'}})],
  ['JSON array',()=>json([{code:'submission_conflict'}],409)],
  ['JSON null',()=>json(null,409)],
  ['non-string code',()=>json({code:['submission_conflict']},409)]
])test(`uncertain or unrelated failure retains nonce: ${name}`,async()=>{
  const s=await setup((body,n)=>n===1?failure():receipt());
  try{s.submit();await tick();assert.equal(s.input.value,'尚未投递的留言');assert.equal(s.bodies.length,1);s.submit();await tick();assert.equal(s.bodies.length,2);assert.equal(s.bodies[0].submissionId,s.bodies[1].submissionId);assert.equal(s.input.value,'');}finally{s.close();}
});

test('communityAPI preserves status and only bounded JSON error codes',async()=>{
  const s=await setup(()=>receipt());try{
    for(const [code,expected] of [['submission_conflict','submission_conflict'],['x'.repeat(65),undefined],['bad-code',undefined],[123,undefined]]){
      globalThis.fetch=async()=>json({code,message:'Conflict'},409);
      await assert.rejects(()=>s.api.communityAPI('comments',{}),error=>error.status===409&&error.code===expected);
    }
  }finally{s.close();}
});

test('a delayed conflict preserves edits and only the next explicit submit sends the newer draft',async()=>{
  const r=deferred(),s=await setup((body,n)=>n===1?r.promise:receipt());
  try{s.submit();s.input.value='请求中编辑的新草稿';r.resolve(json({code:'submission_conflict'},409));await tick();assert.equal(s.bodies.length,1);assert.equal(s.input.value,'请求中编辑的新草稿');s.submit();await tick();assert.equal(s.bodies[1].message,'请求中编辑的新草稿');assert.notEqual(s.bodies[0].submissionId,s.bodies[1].submissionId);}finally{s.close();}
});

for(const leave of ['pathname','pagehide','detached','closed'])test(`a late conflict after ${leave} does not update the old comment view`,async()=>{
  const r=deferred(),s=await setup(()=>r.promise);
  try{
    s.submit();const previous=s.status.textContent;
    if(leave==='pathname')s.dom.window.history.pushState({},'','/other/');
    if(leave==='pagehide')s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));
    if(leave==='detached')s.form.closest('[data-comments]').remove();
    if(leave==='closed')s.close();
    r.resolve(json({code:'submission_conflict',message:'Conflict'},409));await tick();assert.equal(s.status.textContent,previous);assert.equal(s.input.value,'尚未投递的留言');assert.equal(s.bodies.length,1);
  }finally{s.close();}
});

test('a conflict from before page-cache navigation cannot rotate the returned view nonce',async()=>{
  const r=deferred(),s=await setup((body,n)=>n===1?r.promise:receipt());
  try{s.submit();s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));s.dom.window.dispatchEvent(new s.dom.window.Event('pageshow'));r.resolve(json({code:'submission_conflict'},409));await tick();s.submit();await tick();assert.equal(s.bodies.length,2);assert.equal(s.bodies[0].submissionId,s.bodies[1].submissionId);}finally{s.close();}
});


for(const leave of ['pathname','pagehide','detached','closed'])test(`a late success after ${leave} does not clear the old comment draft`,async()=>{
  const r=deferred(),s=await setup(()=>r.promise);
  try{
    s.submit();const previous=s.status.textContent;
    if(leave==='pathname')s.dom.window.history.pushState({},'','/other/');
    if(leave==='pagehide')s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));
    if(leave==='detached')s.form.closest('[data-comments]').remove();
    if(leave==='closed')s.close();
    r.resolve(receipt());await tick();assert.equal(s.status.textContent,previous);assert.equal(s.input.value,'尚未投递的留言');assert.equal(s.bodies.length,1);
  }finally{s.close();}
});


for(const order of ['response while away','response after return'])for(const edited of [false,true])test(`interrupted comment restores honest feedback: ${order}, ${edited?'edited':'unchanged'} draft`,async()=>{
  const first=deferred(),second=deferred(),s=await setup((body,n)=>n===1?first.promise:second.promise);
  try{
    s.submit();const original=s.input.value;
    s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));
    if(edited)s.input.value='返回时的新草稿';
    if(order==='response while away'){
      first.resolve(receipt());await tick();assert.equal(s.status.textContent,'正在投递……');
      s.dom.window.dispatchEvent(new s.dom.window.Event('pageshow'));
    }else{
      s.dom.window.dispatchEvent(new s.dom.window.Event('pageshow'));
      assert.equal(s.button.disabled,true);s.submit();assert.equal(s.bodies.length,1,'return must not unlock an active request');
      first.resolve(receipt());await tick();
    }
    assert.equal(s.button.disabled,false);assert.match(s.status.textContent,/结果尚未确认/);assert.match(s.status.textContent,/内容仍在.*手动重试/);assert.doesNotMatch(s.status.textContent,/正在投递|已收到/);
    assert.equal(s.input.value,edited?'返回时的新草稿':original);assert.equal(s.bodies.length,1,'recovery never submits');
    s.submit();assert.equal(s.bodies.length,2);assert.equal(s.button.disabled,true);
    if(edited){assert.notEqual(s.bodies[1].submissionId,s.bodies[0].submissionId);assert.equal(s.bodies[1].message,'返回时的新草稿');}
    else assert.equal(s.bodies[1].submissionId,s.bodies[0].submissionId,'recovery itself never rotates nonce');
    await tick();assert.equal(s.button.disabled,true,'old finally cannot unlock the next attempt');
    second.resolve(receipt());await tick();assert.equal(s.button.disabled,false);assert.equal(s.input.value,'');
  }finally{s.close();}
});

for(const invalidView of ['different route','detached','hidden'])test(`page-cache recovery does not update an invalid comment view: ${invalidView}`,async()=>{
  const r=deferred(),s=await setup(()=>r.promise);
  try{
    s.submit();s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));
    if(invalidView==='different route')s.dom.window.history.pushState({},'','/elsewhere/');
    if(invalidView==='detached')s.form.closest('[data-comments]').remove();
    if(invalidView==='hidden')s.form.closest('[data-comments]').hidden=true;
    r.resolve(receipt());await tick();s.dom.window.dispatchEvent(new s.dom.window.Event('pageshow'));
    assert.equal(s.status.textContent,'正在投递……');assert.equal(s.input.value,'尚未投递的留言');assert.equal(s.bodies.length,1);
  }finally{s.close();}
});

const unavailableResponse=()=>json({code:'not_configured',message:'Service unavailable'},503);
const emptyComments=()=>json({items:[],total:0,next:null});
const recheck=s=>s.status.querySelector('button');
const moreComments=s=>s.dom.window.document.querySelector('[data-comment-more]');
const commentList=s=>s.dom.window.document.querySelector('[data-comment-list]');
test('confirmed unavailable GET locks only submission, preserves editable fields and recovers through a read',async()=>{
  let reads=0;const s=await setup(()=>receipt(),()=>++reads===1?unavailableResponse():emptyComments());
  try{
    assert.equal(s.button.disabled,true);assert.match(s.status.textContent,/暂未开放/);assert.doesNotMatch(s.status.textContent,/再次投递|重试/);
    assert.equal(recheck(s).type,'button');assert.equal(recheck(s).textContent,'重新检查');
    for(const field of [...s.form.elements].filter(node=>['INPUT','TEXTAREA','FIELDSET'].includes(node.tagName)))assert.equal(field.disabled,false);
    const before=JSON.stringify([...new s.dom.window.FormData(s.form)]);s.submit();assert.equal(s.bodies.length,0);assert.equal(JSON.stringify([...new s.dom.window.FormData(s.form)]),before);
    s.button.disabled=false;s.submit();assert.equal(s.bodies.length,0,'handler guards even a programmatically enabled button');
    s.input.value='服务恢复前仍能修改';s.form.elements.nickname.value='新的昵称';recheck(s).click();await tick();
    assert.equal(reads,2);assert.equal(s.bodies.length,0);assert.equal(s.button.disabled,false);assert.equal(s.status.textContent,'');assert.equal(s.input.value,'服务恢复前仍能修改');assert.equal(s.form.elements.nickname.value,'新的昵称');
    s.submit();await tick();assert.equal(s.bodies.length,1);assert.equal(s.bodies[0].message,'服务恢复前仍能修改');
  }finally{s.close();}
});
test('POST-only unavailability offers a read-only recovery and retains its nonce and edited draft',async()=>{
  const post=deferred();let reads=0;const s=await setup((body,n)=>n===1?post.promise:receipt(),()=>{reads++;return emptyComments();});
  try{
    s.submit();const originalNonce=s.bodies[0].submissionId;s.input.value+='\n';s.form.elements.nickname.value+=' ';
    post.resolve(unavailableResponse());await tick();assert.equal(s.button.disabled,true);assert.match(s.status.textContent,/暂未开放/);assert.equal(s.input.value,'尚未投递的留言\n');assert.equal(s.form.elements.nickname.value,'听众 ');
    s.submit();assert.equal(s.bodies.length,1);recheck(s).click();await tick();assert.equal(reads,2);assert.equal(s.bodies.length,1);assert.equal(s.button.disabled,false);
    s.submit();await tick();assert.equal(s.bodies[1].submissionId,originalNonce,'read recovery does not rotate unchanged normalized payload');
  }finally{s.close();}
});
for(const [name,failure] of [
  ['network',()=>{throw new TypeError('offline');}],['timeout',()=>{throw new DOMException('Timeout','AbortError');}],
  ['other 503',()=>json({code:'unavailable'},503)],['missing code',()=>json({message:'not_configured'},503)],
  ['wrong status',()=>json({code:'not_configured'},500)],['invalid success',()=>json({code:'not_configured'})],
  ['wrong type',()=>new Response('{"code":"not_configured"}',{status:503,headers:{'Content-Type':'text/html'}})],
  ['bad JSON',()=>new Response('{bad',{status:503,headers:{'Content-Type':'application/json'}})],
  ['array',()=>json([{code:'not_configured'}],503)],['null',()=>json(null,503)],
  ['nonstring code',()=>json({code:['not_configured']},503)],['misleading code',()=>json({code:'not_configured_again'},503)]
])for(const method of ['GET','POST'])test(`${method} ${name} cannot declare configuration unavailable`,async()=>{
  const s=await setup(method==='POST'?failure:()=>receipt(),method==='GET'?failure:emptyComments);
  try{if(method==='POST'){s.submit();await tick();}assert.equal(s.button.disabled,false);assert.equal(recheck(s),null);assert.equal(s.input.value,'尚未投递的留言');assert.doesNotMatch(s.status.textContent,/暂未开放/);}finally{s.close();}
});
test('failed rechecks keep the unavailable gate and recovery entry until a validated success',async()=>{
  let reads=0;const s=await setup(()=>receipt(),()=>{
    reads++;if(reads===1)return unavailableResponse();if(reads===2)throw new TypeError('offline');if(reads===3)return json({items:null});return emptyComments();
  });
  try{
    for(let n=2;n<=3;n++){recheck(s).click();await tick();assert.equal(reads,n);assert.equal(s.button.disabled,true);assert.equal(recheck(s).disabled,false);assert.match(s.status.textContent,/暂未开放/);s.submit();assert.equal(s.bodies.length,0);}
    recheck(s).click();await tick();assert.equal(s.button.disabled,false);assert.equal(recheck(s),null);assert.equal(s.input.value,'尚未投递的留言');
  }finally{s.close();}
});
for(const getUnavailable of [false,true])test(`older GET evidence cannot reverse newer POST ${getUnavailable?'receipt':'unavailability'}`,async()=>{
  const get=deferred(),post=deferred(),s=await setup(()=>post.promise,()=>get.promise);
  try{
    s.submit();post.resolve(getUnavailable?receipt():unavailableResponse());await tick();const feedback=s.status.textContent;
    get.resolve(getUnavailable?unavailableResponse():emptyComments());await tick();assert.equal(s.status.textContent,feedback);assert.equal(s.button.disabled,!getUnavailable);assert.equal(s.bodies.length,1);
  }finally{s.close();}
});
for(const getUnavailable of [false,true])for(const first of ['GET','POST'])test(`newer GET ${getUnavailable?'unavailability':'success'} wins configuration evidence, ${first} completes first`,async()=>{
  const get=deferred(),post=deferred();let reads=0;
  const s=await setup(()=>post.promise,()=>++reads===1?emptyComments():get.promise);
  try{
    s.submit();moreComments(s).dispatchEvent(new s.dom.window.Event('click'));
    const finishGet=()=>get.resolve(getUnavailable?unavailableResponse():emptyComments());
    const finishPost=()=>post.resolve(getUnavailable?receipt():unavailableResponse());
    if(first==='GET'){
      finishGet();await tick();assert.equal(s.button.disabled,true,'a successful read cannot unlock an active POST');assert.match(s.status.textContent,/正在投递/);s.submit();assert.equal(s.bodies.length,1);finishPost();
    }else{finishPost();await tick();finishGet();}
    await tick();assert.equal(s.button.disabled,getUnavailable);
    if(getUnavailable){assert.match(s.status.textContent,/已收到/);assert.match(s.status.textContent,/暂未开放/);assert.ok(recheck(s),'receipt remains with a recovery entry');}
    else{assert.doesNotMatch(s.status.textContent,/暂未开放/);assert.equal(recheck(s),null);assert.equal(s.input.value,'尚未投递的留言');}
    assert.equal(s.bodies.length,1);
  }finally{s.close();}
});
for(const phase of ['in flight','receipt'])test(`background GET failures do not overwrite ${phase} delivery feedback`,async()=>{
  const get=deferred(),post=deferred();let reads=0;const s=await setup(()=>post.promise,()=>++reads===1?emptyComments():get.promise);
  try{
    s.submit();moreComments(s).dispatchEvent(new s.dom.window.Event('click'));
    if(phase==='receipt'){post.resolve(receipt());await tick();}
    const text=s.status.textContent;get.reject(new TypeError('offline'));await tick();assert.equal(s.status.textContent,text);
    if(phase==='in flight'){post.resolve(receipt());await tick();}
  }finally{s.close();}
});
test('successful recovery only removes its own unavailable message and retains a confirmed receipt',async()=>{
  const get=deferred(),post=deferred();let reads=0;const s=await setup(()=>post.promise,()=>++reads===1?emptyComments():reads===2?get.promise:emptyComments());
  try{
    s.submit();moreComments(s).dispatchEvent(new s.dom.window.Event('click'));post.resolve(receipt('approved'));await tick();get.resolve(unavailableResponse());await tick();
    assert.match(s.status.textContent,/^这条留言已公开。.*留言暂未开放。/);assert.equal(s.button.disabled,true);assert.equal(s.status.querySelector('span').textContent,' 留言暂未开放。');
    recheck(s).click();await tick();assert.equal(s.status.textContent,'这条留言已公开。');assert.equal(s.status.querySelector('span'),null);assert.equal(s.button.disabled,false);assert.equal(s.bodies.length,1);
  }finally{s.close();}
});
for(const leave of ['pathname','pagehide','detached','hidden','closed'])for(const result of ['success','unavailable'])test(`late GET ${result} after ${leave} cannot update the old comment view`,async()=>{
  const get=deferred(),s=await setup(()=>receipt(),()=>get.promise);
  try{
    const list=commentList(s),root=s.form.closest('[data-comments]'),previous=list.textContent;
    if(leave==='pathname')s.dom.window.history.pushState({},'','/other/');
    if(leave==='pagehide')s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));
    if(leave==='detached')root.remove();if(leave==='hidden')root.hidden=true;if(leave==='closed')s.close();
    get.resolve(result==='success'?emptyComments():unavailableResponse());await tick();assert.equal(list.textContent,previous);assert.equal(s.status.textContent,'');assert.equal(s.button.disabled,false);assert.equal(s.input.value,'尚未投递的留言');
  }finally{s.close();}
});
for(const order of ['old while away','old before new','old after new'])test(`BFCache read recovery discards old GET and remains usable: ${order}`,async()=>{
  const old=deferred(),fresh=deferred();let reads=0;const s=await setup(()=>receipt(),()=>++reads===1?old.promise:reads===2?fresh.promise:emptyComments());
  try{
    s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));
    if(order==='old while away'){old.resolve(unavailableResponse());await tick();}
    s.dom.window.dispatchEvent(new s.dom.window.Event('pageshow'));assert.equal(reads,2,'return starts a read even if the old one is unresolved');
    if(order==='old before new'){old.resolve(unavailableResponse());await tick();assert.equal(commentList(s).getAttribute('aria-busy'),'true');assert.equal(moreComments(s).disabled,true);}
    fresh.resolve(emptyComments());await tick();
    if(order==='old after new'){old.resolve(unavailableResponse());await tick();}
    assert.equal(s.button.disabled,false);assert.equal(s.status.textContent,'');assert.equal(commentList(s).hasAttribute('aria-busy'),false);assert.equal(moreComments(s).disabled,false);assert.match(commentList(s).textContent,/还没有公开/);assert.equal(s.bodies.length,0);
    moreComments(s).dispatchEvent(new s.dom.window.Event('click'));await tick();assert.equal(reads,3);assert.equal(commentList(s).hasAttribute('aria-busy'),false);
  }finally{s.close();}
});
test('BFCache recheck recovery keeps unavailable state until the new read succeeds',async()=>{
  const old=deferred(),fresh=deferred();let reads=0;const s=await setup(()=>receipt(),()=>++reads===1?unavailableResponse():reads===2?old.promise:fresh.promise);
  try{
    recheck(s).click();s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));s.dom.window.dispatchEvent(new s.dom.window.Event('pageshow'));
    old.resolve(emptyComments());await tick();assert.equal(s.button.disabled,true);assert.equal(recheck(s).disabled,true);
    fresh.resolve(emptyComments());await tick();assert.equal(s.button.disabled,false);assert.equal(recheck(s),null);assert.equal(s.input.value,'尚未投递的留言');assert.equal(s.bodies.length,0);
  }finally{s.close();}
});

for(const existing of [false,true])test(`stale unavailable list read stays recoverable without undoing a newer receipt: ${existing?'existing list':'initial load'}`,async()=>{
  const get=deferred();let reads=0;
  const item={id,nickname:'公开听众',message:'已有的公开留言',stamp:'star',reply:'',createdAt:'2026-10-10T00:00:00Z'};
  const populated=()=>json({items:[item],total:1,next:null});
  const s=await setup(()=>receipt('approved'),()=>{
    reads++;if(existing&&reads===1)return populated();if(reads===(existing?2:1))return get.promise;return populated();
  });
  try{
    if(existing)moreComments(s).dispatchEvent(new s.dom.window.Event('click'));
    s.submit();await tick();assert.equal(s.status.textContent,'这条留言已公开。');get.resolve(unavailableResponse());await tick();
    assert.equal(s.status.textContent,'这条留言已公开。');assert.equal(s.button.disabled,false);assert.equal(recheck(s),null);
    const list=commentList(s);assert.match(list.textContent,/列表读取未完成/);assert.doesNotMatch(list.textContent,/暂未开放|正在打开/);
    if(existing)assert.match(list.textContent,/已有的公开留言/);
    const retry=list.querySelector('button');assert.ok(retry);assert.equal(retry.type,'button');retry.click();retry.click();await tick();
    assert.equal(reads,existing?3:2);assert.equal(s.bodies.length,1);assert.equal(s.status.textContent,'这条留言已公开。');assert.equal(s.button.disabled,false);
    assert.match(list.textContent,/已有的公开留言/);assert.doesNotMatch(list.textContent,/读取未完成/);assert.equal(list.querySelector('button'),null);
  }finally{s.close();}
});
test('confirmed unavailable refresh preserves already rendered public comments',async()=>{
  let reads=0;const s=await setup(()=>receipt(),()=>++reads===1?json({items:[{id,nickname:'听众',message:'已公开内容',stamp:'star',reply:'',createdAt:'2026-10-10T00:00:00Z'}],total:1,next:null}):unavailableResponse());
  try{
    moreComments(s).dispatchEvent(new s.dom.window.Event('click'));await tick();assert.match(commentList(s).textContent,/已公开内容/);assert.match(s.status.textContent,/暂未开放/);assert.equal(s.button.disabled,true);assert.ok(recheck(s));assert.equal(s.bodies.length,0);
  }finally{s.close();}
});

test('unavailable evidence uses only the status recovery entry even after a stale list failure',async()=>{
  const get=deferred();let reads=0;const s=await setup(()=>receipt(),()=>++reads===1?get.promise:unavailableResponse());
  try{
    s.submit();await tick();get.resolve(unavailableResponse());await tick();assert.ok(commentList(s).querySelector('button'));
    commentList(s).querySelector('button').click();await tick();assert.equal(s.button.disabled,true);assert.equal(commentList(s).querySelector('button'),null);assert.ok(recheck(s));assert.match(s.status.textContent,/已收到.*暂未开放/);assert.equal(s.bodies.length,1);
  }finally{s.close();}
});
for(const [name,response] of [
  ['confirmed unavailable',unavailableResponse],['ordinary failure',()=>{throw new TypeError('offline');}],['success',emptyComments]
])test(`real initial loading placeholder is removed on ${name}`,async()=>{
  const get=deferred(),s=await setup(()=>receipt(),()=>get.promise);
  try{
    const list=commentList(s),placeholder=list.querySelector('p.community-empty');assert.equal(placeholder.textContent,'正在打开留言簿……');
    get.resolve(Promise.resolve().then(response));await tick();assert.equal(placeholder.isConnected,false);assert.doesNotMatch(list.textContent,/正在打开/);
    if(name==='confirmed unavailable'){assert.match(s.status.textContent,/暂未开放/);assert.ok(recheck(s));}
    if(name==='ordinary failure')assert.ok(list.querySelector('button'));
    if(name==='success')assert.match(list.textContent,/还没有公开/);
  }finally{s.close();}
});
test('unavailable response removes only the captured loading node and preserves newer list content',async()=>{
  const get=deferred(),s=await setup(()=>receipt(),()=>get.promise);
  try{
    const list=commentList(s),placeholder=list.querySelector('p'),card=s.dom.window.document.createElement('article'),newState=s.dom.window.document.createElement('p');
    card.className='encore-message';card.textContent='已渲染的留言';newState.className='community-empty';newState.textContent='较新的状态';list.append(card,newState);
    get.resolve(unavailableResponse());await tick();assert.equal(placeholder.isConnected,false);assert.equal(card.parentNode,list);assert.equal(newState.parentNode,list);assert.match(list.textContent,/已渲染的留言.*较新的状态/);assert.doesNotMatch(list.textContent,/正在打开/);
  }finally{s.close();}
});
