const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),ejs=require('ejs');
const markup=ejs.render(fs.readFileSync(path.join(__dirname,'../custom/redefine/nijika/comments.ejs'),'utf8'),{page:{nijika:'guestbook'}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const ready=(items=[])=>json({items,total:items.length,next:null});
const offline=()=>{throw new TypeError('offline');};
async function setup(load){
 const dom=new JSDOM(markup,{url:'https://ccatelier.test/guestbook/',pretendToBeVisual:true}),doc=dom.window.document;
 Object.assign(globalThis,{window:dom.window,document:doc,location:dom.window.location,FormData:dom.window.FormData,matchMedia:()=>({matches:false,addEventListener(){}})});
 let reads=0;globalThis.fetch=async(url,options)=>{assert.equal(options.method,'GET');assert.ok(url.startsWith('/api/comments?'));return load(++reads);};
 await (await import('../source/atelier/js/community.js')).initCommentSection(doc.querySelector('[data-comments]'));await tick();
 return {dom,doc,list:doc.querySelector('[data-comment-list]'),input:doc.querySelector('[name=message]'),status:doc.querySelector('[data-comment-status]'),reads:()=>reads,close:()=>dom.window.close()};
}
test('keyboard list retry retains focus through repeated offline failures and deduplicates clicks',async()=>{
 const s=await setup(offline);try{
  for(let attempt=0;attempt<3;attempt++){
   const retry=s.list.querySelector('button');retry.focus();retry.click();retry.click();await tick();
   assert.equal(s.reads(),attempt+2);assert.equal(s.doc.activeElement,s.list.querySelector('button'));assert.equal(s.doc.activeElement.type,'button');
  }
 }finally{s.close();}
});
for(const populated of [false,true])test(`successful list recovery focuses its ${populated?'public comment':'empty state'} without an extra tab stop`,async()=>{
 const item={id:'d24d459f-5c62-4a7d-a5ca-56f715380707',nickname:'听众',message:'公开留言',reply:'',stamp:'star',createdAt:'2026-10-10T00:00:00Z'};
 const s=await setup(n=>n===1?offline():ready(populated?[item]:[]));try{
  const retry=s.list.querySelector('button');retry.focus();retry.click();await tick();
  assert.equal(s.doc.activeElement,s.list);assert.equal(s.doc.activeElement.tabIndex,-1);assert.equal(s.list.getAttribute('role'),'region');assert.equal(s.list.getAttribute('aria-label'),'公开留言');assert.match(s.doc.activeElement.textContent,populated?/公开留言/:/还没有公开/);
 }finally{s.close();}
});
for(const result of ['failure','success'])test(`a late retry ${result} never steals focus from a resumed draft`,async()=>{
 let resolve,reject;const s=await setup(n=>n===1?offline():new Promise((yes,no)=>{resolve=yes;reject=no;}));try{
  const retry=s.list.querySelector('button');retry.focus();retry.click();s.input.focus();s.input.value='继续编辑';
  if(result==='success')resolve(ready());else reject(new TypeError('offline'));await tick();
  assert.equal(s.doc.activeElement,s.input);assert.equal(s.input.value,'继续编辑');
 }finally{s.close();}
});
for(const away of ['hidden','detached','pagehide'])test(`list recovery after ${away} does not move focus into the old view`,async()=>{
 let resolve;const s=await setup(n=>n===1?offline():new Promise(yes=>{resolve=yes;}));try{
  const retry=s.list.querySelector('button');retry.focus();retry.click();const root=s.list.closest('[data-comments]');
  if(away==='hidden')root.hidden=true;if(away==='detached')root.remove();if(away==='pagehide')s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));
  const focus=s.doc.activeElement;resolve(ready());await tick();assert.equal(s.doc.activeElement,focus);assert.equal(s.list.querySelector('button'),retry);
 }finally{s.close();}
});

for(const result of ['failure','success'])test(`a programmatic list retry ${result} does not take focus`,async()=>{
 const s=await setup(n=>n===1||result==='failure'?offline():ready());try{
  const before=s.doc.activeElement;s.list.querySelector('button').click();await tick();
  assert.equal(s.doc.activeElement,before);
 }finally{s.close();}
});
