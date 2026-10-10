const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const tick = () => new Promise(resolve => setImmediate(resolve));
const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers:{'Content-Type':'application/json'}});
const deferred = () => {let resolve, reject;const promise = new Promise((yes,no) => {resolve=yes;reject=no;});return {promise,resolve,reject};};
function setup(html = fs.readFileSync(require('node:path').join(__dirname,'../custom/redefine/nijika/admin.ejs'),'utf8')) {
  const dom = new JSDOM(html, {url:'https://ccatelier.test/admin/'});
  Object.assign(globalThis, {document:dom.window.document, window:dom.window, matchMedia:()=>({matches:false,addEventListener(){}})});
  const root = document;
  return {dom,root,login:root.querySelector('[data-owner-login]'),guard:root.querySelector('[data-form-guard]'),status:root.querySelector('[data-owner-status]')};
}
test('ordinary pages never request moderation, and pending imports keep the form guarded', async () => {
  const s = setup('<main>Reader page</main>');
  const {initModeration} = await import('../source/atelier/js/community.js');
  try {assert.equal(initModeration({root:s.root,load:()=>assert.fail('reader requested moderation')}),undefined);} finally {s.dom.window.close();}
  const admin = setup(), pending = deferred();let loads=0,initializations=0;
  try {
    const first = initModeration({root:admin.root,load:()=>{loads++;return pending.promise;}});
    const again = initModeration({root:admin.root,load:()=>assert.fail('duplicate load')});
    assert.equal(first,again);assert.equal(admin.guard.disabled,true);assert.match(admin.status.textContent,/加载/);
    await tick();assert.equal(loads,1);
    pending.resolve({initModerationPanel(login){assert.equal(login,admin.login);initializations++;admin.guard.disabled=false;}});
    await first;await initModeration({root:admin.root});
    assert.equal(initializations,1);assert.equal(admin.guard.disabled,false);assert.equal(admin.status.textContent,'');
  } finally {admin.dom.window.close();}
});
for (const failure of ['import','initialization']) test(`${failure} failure is handled, remains disabled and cannot double-bind on repeated boot`, async () => {
  const s=setup();const {initModeration}=await import('../source/atelier/js/community.js');let calls=0;
  try {
    await initModeration({root:s.root,load:()=>{calls++;if(failure==='import')throw Error('offline');return {initModerationPanel(){s.guard.disabled=false;throw Error('partial init');}};}});
    assert.equal(s.guard.disabled,true);assert.match(s.status.textContent,/未能加载.*刷新/);
    await initModeration({root:s.root,load:()=>assert.fail('unsafe repeat')});assert.equal(calls,1);
  } finally {s.dom.window.close();}
});
test('a detached login cannot initialize after its delayed import resolves',async()=>{
  const s=setup(),pending=deferred();const {initModeration}=await import('../source/atelier/js/community.js');
  try {const ready=initModeration({root:s.root,load:()=>pending.promise});s.login.remove();pending.resolve({initModerationPanel(){assert.fail('detached init');}});await ready;assert.equal(s.guard.disabled,true);}finally{s.dom.window.close();}
});
test('real dynamic import preserves login, list, filtering, pagination, moderation and logout contracts',async()=>{
  const s=setup(),calls=[];let signedIn=false;
  const item={id:'d24d459f-5c62-4a7d-a5ca-56f715380707',nickname:'听众',message:'<script>text</script>',reply:'',stamp:'star',page:'/notes/',createdAt:'2026-10-10T00:00:00Z'};
  globalThis.fetch=async(url,options)=>{
    assert.equal(options.credentials,'same-origin');const body=options.body?JSON.parse(options.body):undefined;calls.push([url,body]);
    if(url==='/api/admin/login'){assert.deepEqual(body,{password:'local-mock-only'});signedIn=true;return json({ok:true});}
    if(url==='/api/admin/logout'){signedIn=false;return json({ok:true});}
    if(url==='/api/admin/moderate')return json({ok:true});
    assert.match(url,/^\/api\/admin\/comments\?status=(pending|approved)&offset=(0|1)$/);
    return signedIn?json({items:[item],total:2,next:url.endsWith('offset=0')?1:null}):json({message:'请登录'},401);
  };
  const {initModeration}=await import('../source/atelier/js/community.js');
  try {
    await initModeration();await tick();assert.equal(s.guard.disabled,false);assert.equal(s.login.hidden,false);assert.equal(s.root.querySelector('[data-moderation]').hidden,true);
    await initModeration();s.login.elements.password.value='local-mock-only';s.login.dispatchEvent(new s.dom.window.Event('submit',{cancelable:true}));await tick();
    assert.equal(calls.filter(([url])=>url==='/api/admin/login').length,1);assert.equal(s.login.hidden,true);assert.equal(s.login.elements.password.value,'');
    assert.equal(s.root.querySelectorAll('[data-moderation-list] article').length,1);assert.equal(s.root.querySelector('[data-moderation-list] script'),null);
    s.root.querySelector('[data-moderation-more]').click();await tick();assert.equal(s.root.querySelectorAll('[data-moderation-list] article').length,2);assert.ok(calls.some(([url])=>url.endsWith('offset=1')));
    const filter=s.root.querySelector('[data-moderation-filter]');filter.value='approved';filter.dispatchEvent(new s.dom.window.Event('change'));await tick();assert.equal(calls.at(-1)[0],'/api/admin/comments?status=approved&offset=0');
    const reply=s.root.querySelector('.owner-reply-input');reply.value='回复';s.root.querySelector('.moderation-actions button').click();await tick();assert.deepEqual(calls.find(([url])=>url==='/api/admin/moderate')[1],{id:item.id,status:'approved',reply:'回复'});
    s.root.querySelectorAll('.moderation-actions button')[1].click();await tick();assert.equal(calls.filter(([url])=>url==='/api/admin/moderate').at(-1)[1].status,'rejected');
    s.root.querySelector('[data-owner-logout]').click();await tick();assert.equal(s.login.hidden,false);assert.equal(s.root.querySelector('[data-moderation]').hidden,true);
  } finally {s.dom.window.close();}
});

test('management API failures preserve login feedback, release buttons, and sign out on expired authorization',async()=>{
  const s=setup();let mode='initial';
  const item={id:'d24d459f-5c62-4a7d-a5ca-56f715380707',nickname:'听众',message:'留言',reply:'',stamp:'star',page:'/notes/',createdAt:'2026-10-10T00:00:00Z'};
  globalThis.fetch=async(url)=>{
    if(url==='/api/admin/login')return mode==='bad-login'?json({message:'口令不正确'},401):json({ok:true});
    if(url==='/api/admin/moderate')return json({message:'登录已过期'},401);
    if(url==='/api/admin/logout')return json({message:'退出未完成'},503);
    return mode==='initial'?json({message:'请登录'},401):json({items:[item],total:1,next:null});
  };
  const {initModeration}=await import('../source/atelier/js/community.js');
  try {
    await initModeration();await tick();mode='bad-login';s.login.elements.password.value='local-mock-only';s.login.dispatchEvent(new s.dom.window.Event('submit',{cancelable:true}));await tick();
    assert.match(s.status.textContent,/口令不正确/);assert.equal(s.login.hidden,false);assert.equal(s.login.querySelector('button').disabled,false);
    mode='ready';s.login.dispatchEvent(new s.dom.window.Event('submit',{cancelable:true}));await tick();assert.equal(s.login.hidden,true);
    s.root.querySelector('[data-owner-logout]').click();await tick();assert.match(s.root.querySelector('[data-moderation-status]').textContent,/退出未完成/);assert.equal(s.login.hidden,true);
    const button=s.root.querySelector('.moderation-actions button');button.click();await tick();assert.equal(s.login.hidden,false);assert.equal(s.root.querySelector('[data-moderation]').hidden,true);assert.equal(button.disabled,false);assert.match(s.root.querySelector('.moderation-item-status').textContent,/登录已过期/);
  }finally{s.dom.window.close();}
});
