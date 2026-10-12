const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),ejs=require('ejs');
const template=fs.readFileSync(path.join(__dirname,'../custom/redefine/nijika/comments.ejs'),'utf8');
const markup=ejs.render(template,{page:{nijika:'guestbook'}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const json=body=>new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
async function setup(html=markup){
 const dom=new JSDOM(`<body>${html}</body>`,{pretendToBeVisual:true,url:'https://ccatelier.test/guestbook/'}),doc=dom.window.document,calls=[];
 Object.assign(globalThis,{window:dom.window,document:doc,location:dom.window.location,FormData:dom.window.FormData,matchMedia:()=>({matches:false,addEventListener(){}})});
 globalThis.fetch=async(url,options)=>{calls.push({url,...options});return json(url.startsWith('/api/comments?')?{items:[],total:0,next:null}:{site:{views:0,visitors:0,applause:0},page:{views:0,applause:0},reacted:false});};
 const api=await import('../source/atelier/js/community.js');
 const root=doc.querySelector('[data-comments]'),form=root?.querySelector('form');
 return {dom,doc,root,form,guard:form?.querySelector('fieldset[data-form-guard]'),status:root?.querySelector('[data-comment-connection]'),calls,api,close:()=>dom.window.close(),submit:()=>form.dispatchEvent(new dom.window.Event('submit',{cancelable:true,bubbles:true}))};
}
const comments=()=>import('../source/atelier/js/community-comments.js');
const reads=s=>s.calls.filter(call=>call.url.startsWith('/api/comments?'));
const posts=s=>s.calls.filter(call=>call.url==='/api/comments');
test('no comments means no dynamic comment edge or GET; visit starts immediately',async()=>{
 const s=await setup('<main>Home</main>');
 try{
  const ready=s.api.initCommunity();assert.equal(s.calls.length,1);assert.equal(s.calls[0].url,'/api/visit');await ready;
  assert.equal(reads(s).length,0);
  const source=fs.readFileSync(path.join(__dirname,'../source/atelier/js/community.js'),'utf8');
  assert.match(source,/Promise\.all\(\$\$\('\[data-comments\]'\)\.map\(root=>initCommentSection\(root\)\)\)/);
  assert.doesNotMatch(source,/^import .*community-comments/m);
 }finally{s.close();}
});
test('pending import is deduplicated, guards the form and does not delay visit or replay submit',async()=>{
 const s=await setup(),pending=deferred();let imports=0;
 try{
  s.form.elements.message.value='保留草稿';
  const first=s.api.initCommentSection(s.root,()=>{imports++;return pending.promise;});
  assert.equal(s.api.initCommentSection(s.root,()=>assert.fail('duplicate')),first);
  const communityReady=s.api.initCommunity();assert.equal(s.calls[0].url,'/api/visit');assert.equal(s.guard.disabled,true);
  assert.equal(s.submit(),false);await tick();assert.equal(imports,1);assert.equal(reads(s).length,0);
  pending.resolve(await comments());await first;await communityReady;await tick();
  assert.equal(s.guard.disabled,false);assert.equal(s.form.elements.message.value,'保留草稿');assert.equal(reads(s).length,1);assert.equal(posts(s).length,0);
  await s.api.initCommentSection(s.root);assert.equal(reads(s).length,1);
 }finally{s.close();}
});
test('import failure offers explicit retry without replacing inputs or replaying POST',async()=>{
 const s=await setup();let attempts=0;
 try{
  s.form.elements.message.value='失败时的草稿';
  const load=()=>++attempts===1?Promise.reject(Error('offline')):comments();
  await s.api.initCommentSection(s.root,load);assert.equal(s.guard.disabled,true);assert.match(s.status.textContent,/未能加载/);assert.equal(s.submit(),false);
  s.root.querySelector('[data-comment-list] button').click();await s.api.initCommentSection(s.root);await tick();
  assert.equal(attempts,2);assert.equal(s.guard.disabled,false);assert.equal(s.form.elements.message.value,'失败时的草稿');assert.equal(reads(s).length,1);assert.equal(posts(s).length,0);
 }finally{s.close();}
});
test('partial initialization failure is terminal, disabled and blocks already-bound submit handlers',async()=>{
 const s=await setup();let initializations=0,submits=0;
 try{
  await s.api.initCommentSection(s.root,()=>({initComments(){initializations++;s.form.addEventListener('submit',()=>submits++);s.guard.disabled=false;throw Error('partial');}}));
  assert.equal(s.guard.disabled,true);assert.match(s.status.textContent,/刷新/);s.submit();assert.equal(submits,0);
  await s.api.initCommentSection(s.root,()=>assert.fail('must not double bind'));assert.equal(initializations,1);assert.equal(reads(s).length,0);
 }finally{s.close();}
});
for(const away of ['pagehide','pathname','detached','hidden'])test(`import resolving after ${away} cannot enable old form or read wrong page; returning can recover once`,async()=>{
 const s=await setup(),pending=deferred();
 try{
  s.form.elements.message.value='返回时保留';const first=s.api.initCommentSection(s.root,()=>pending.promise);
  if(away==='pagehide')s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));
  if(away==='pathname')s.dom.window.history.pushState({},'','/other/');
  if(away==='detached')s.root.remove();if(away==='hidden')s.root.hidden=true;
  pending.resolve(await comments());await first;assert.equal(s.guard.disabled,true);assert.equal(reads(s).length,0);s.submit();assert.equal(posts(s).length,0);
  if(away==='pathname')s.dom.window.history.replaceState({},'','/guestbook/');
  if(away==='detached')s.doc.body.append(s.root);if(away==='hidden')s.root.hidden=false;
  s.dom.window.dispatchEvent(new s.dom.window.Event('pageshow'));await s.api.initCommentSection(s.root);await tick();
  assert.equal(s.guard.disabled,false);assert.equal(reads(s).length,1);assert.equal(new URL(reads(s)[0].url,'https://ccatelier.test').searchParams.get('page'),'/guestbook/');assert.equal(s.form.elements.message.value,'返回时保留');assert.equal(posts(s).length,0);
  s.dom.window.dispatchEvent(new s.dom.window.Event('pageshow'));await s.api.initCommentSection(s.root);assert.equal(reads(s).length,1);
 }finally{s.close();}
});
test('hidden and reattached roots recover through DOM changes without replaying a gesture',async()=>{
 for(const change of ['hidden','detached']){
  const s=await setup(),pending=deferred();
  try{
   const first=s.api.initCommentSection(s.root,()=>pending.promise);
   if(change==='hidden')s.root.hidden=true;else s.root.remove();
   pending.resolve(await comments());await first;assert.equal(s.guard.disabled,true);
   if(change==='hidden')s.root.hidden=false;else s.doc.body.append(s.root);
   await tick();assert.equal(s.guard.disabled,false);assert.equal(reads(s).length,1);assert.equal(posts(s).length,0);
  }finally{s.close();}
 }
});
test('a replacement root initializes once while the detached old root stays guarded',async()=>{
 const s=await setup(),pending=deferred();
 try{
  const oldReady=s.api.initCommentSection(s.root,()=>pending.promise),replacement=s.root.cloneNode(true);
  s.root.replaceWith(replacement);await s.api.initCommentSection(replacement);pending.resolve(await comments());await oldReady;await tick();
  assert.equal(s.guard.disabled,true);assert.equal(replacement.querySelector('[data-form-guard]').disabled,false);assert.equal(reads(s).length,1);assert.equal(posts(s).length,0);
 }finally{s.close();}
});
test('closed details do not postpone comments, and BFCache before import completion initializes once',async()=>{
 const s=await setup(`<details><summary>评论</summary>${markup}</details>`),pending=deferred();
 try{
  const ready=s.api.initCommentSection(s.root,()=>pending.promise);
  s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));s.dom.window.dispatchEvent(new s.dom.window.Event('pageshow'));
  pending.resolve(await comments());await ready;await tick();assert.equal(s.guard.disabled,false);assert.equal(reads(s).length,1);assert.equal(posts(s).length,0);
 }finally{s.close();}
});
for(const outcome of ['success','failure'])test(`background document defers import ${outcome} UI until visibility returns`,async()=>{
 const s=await setup(),pending=deferred();let hidden=false,imports=0;
 Object.defineProperty(s.doc,'hidden',{configurable:true,get:()=>hidden});
 try{
  s.form.elements.message.value='后台保留草稿';
  const ready=s.api.initCommentSection(s.root,()=>{imports++;return pending.promise;});
  hidden=true;s.doc.dispatchEvent(new s.dom.window.Event('visibilitychange'));
  const before=s.status.textContent;
  if(outcome==='success')pending.resolve(await comments());else pending.reject(Error('offline'));
  await ready;assert.equal(s.guard.disabled,true);assert.equal(s.status.textContent,before);assert.equal(reads(s).length,0);assert.equal(s.root.querySelector('[data-comment-list] button'),null);
  hidden=false;s.doc.dispatchEvent(new s.dom.window.Event('visibilitychange'));await tick();
  if(outcome==='success'){assert.equal(s.guard.disabled,false);assert.equal(reads(s).length,1);}
  else{assert.equal(s.guard.disabled,true);assert.match(s.status.textContent,/未能加载/);assert.ok(s.root.querySelector('[data-comment-list] button'));}
  assert.equal(imports,1);assert.equal(posts(s).length,0);assert.equal(s.form.elements.message.value,'后台保留草稿');
 }finally{s.close();}
});
for(const away of ['pagehide','pathname','detached','hidden'])test(`import failure after ${away} leaves old UI untouched until return, with no automatic retry`,async()=>{
 const s=await setup(),pending=deferred();let imports=0;
 try{
  const ready=s.api.initCommentSection(s.root,()=>{imports++;return pending.promise;}),before=s.status.textContent;
  if(away==='pagehide')s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));
  if(away==='pathname')s.dom.window.history.pushState({},'','/other/');
  if(away==='detached')s.root.remove();if(away==='hidden')s.root.hidden=true;
  pending.reject(Error('offline'));await ready;assert.equal(s.status.textContent,before);assert.equal(s.root.querySelector('[data-comment-list] button'),null);assert.equal(s.guard.disabled,true);
  if(away==='pathname')s.dom.window.history.replaceState({},'','/guestbook/');
  if(away==='detached')s.doc.body.append(s.root);if(away==='hidden')s.root.hidden=false;
  s.dom.window.dispatchEvent(new s.dom.window.Event('pageshow'));await tick();assert.match(s.status.textContent,/未能加载/);assert.ok(s.root.querySelector('[data-comment-list] button'));assert.equal(imports,1);assert.equal(reads(s).length,0);assert.equal(posts(s).length,0);
 }finally{s.close();}
});
