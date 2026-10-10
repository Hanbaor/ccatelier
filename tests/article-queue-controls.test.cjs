const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),{build}=require('esbuild'),path=require('node:path');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
let moduleSource;
async function setup(t,root='/',queue=[]){
 const article=root+'writing/example/',dom=new JSDOM(`<title>测试文章</title><body data-root="${root}"><div id="toast"></div><div data-article-tools data-title="测试文章"><button data-queue-add>加入队列</button><button data-queue-done>标记已读</button><span data-queue-count></span><a data-queue-next></a></div></body>`,{url:'https://ccatelier.test'+article}),{window}=dom;
 Object.assign(globalThis,{window,document:window.document,location:window.location,localStorage:window.localStorage,CustomEvent:window.CustomEvent,matchMedia:()=>({matches:false,addEventListener(){}})});
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 localStorage.setItem('cc-queue',JSON.stringify({version:1,queue:queue.map(p=>({path:article,title:'测试文章',...p}))}));
 moduleSource ||= build({stdin:{contents:"export {initQueue} from './queue.js';export {queueAction,saveQueue,readQueue} from './archive-store.js';export {storage} from './ui.js';",resolveDir:path.resolve(__dirname,'../source/atelier/js')},bundle:true,write:false,format:'esm',platform:'browser'}).then(r=>r.outputFiles[0].text);
 const api=await import('data:text/javascript;base64,'+Buffer.from(await moduleSource+'\n// '+Math.random()).toString('base64'));
 const timeout=globalThis.setTimeout,timers=[];globalThis.setTimeout=(fn,ms,...args)=>{const timer=timeout(fn,ms,...args);timers.push(timer);return timer;};
 t.after(()=>{timers.forEach(clearTimeout);globalThis.setTimeout=timeout;dom.window.close();});
 api.initQueue();
 return {...api,window,article,add:document.querySelector('[data-queue-add]'),done:document.querySelector('[data-queue-done]'),toast:document.querySelector('#toast'),status:document.querySelector('#queue-dialog>.live-status')};
}
function check(s,added,done){
 assert.equal(s.add.textContent,added?'已加入队列':'加入队列');assert.equal(s.done.textContent,done?'已读':'标记已读');
 for(const [button,disabled] of [[s.add,added],[s.done,done]]){assert.equal(button.getAttribute('aria-disabled'),String(disabled));assert.equal(button.hasAttribute('aria-pressed'),false);assert.equal(button.disabled,false);}
}
for(const root of ['/','/lab/']){
 test(`${root} initial queued and completed controls render without storage writes`,async t=>{
  const s=await setup(t,root,[{completed:1234}]);check(s,true,true);assert.equal(s.readQueue().queue[0].completed,1234);assert.equal(s.toast.textContent,'');
 });
 test(`${root} add and done are idempotent and retain keyboard focus`,async t=>{
  const s=await setup(t,root);check(s,false,false);let writes=0,events=0;
  const set=s.window.Storage.prototype.setItem;s.window.Storage.prototype.setItem=function(...args){writes++;return set.apply(this,args);};document.addEventListener('atelier:queue',()=>events++);
  s.add.focus();s.add.click();check(s,true,false);assert.equal(document.activeElement,s.add);assert.equal(writes,1);
  s.toast.textContent='unchanged';s.add.click();s.add.dispatchEvent(new s.window.MouseEvent('click',{bubbles:true}));assert.equal(writes,1);assert.equal(events,1);assert.equal(s.toast.textContent,'unchanged');
  s.done.focus();s.done.click();check(s,true,true);assert.equal(document.activeElement,s.done);assert.equal(writes,2);const timestamp=s.readQueue().queue[0].completed;
  s.toast.textContent='unchanged';s.done.click();assert.equal(writes,2);assert.equal(events,2);assert.equal(s.readQueue().queue[0].completed,timestamp);assert.equal(s.toast.textContent,'unchanged');assert.equal(document.activeElement,s.done);
 });
 test(`${root} removal, undo, import and cross-tab replacement restore controls`,async t=>{
  const s=await setup(t,root,[{}]);check(s,true,false);s.add.focus();
  s.queueAction({type:'done',path:s.article,at:1000});check(s,true,true);s.queueAction({type:'undone',path:s.article});check(s,true,false);s.queueAction({type:'remove',path:s.article});check(s,false,false);assert.equal(document.activeElement,s.add);
  const file=document.querySelector('#queue-dialog input');Object.defineProperty(file,'files',{value:[{size:100,text:async()=>JSON.stringify({version:1,queue:[{path:s.article,title:'导入文章',completed:2000}]})}]});file.dispatchEvent(new s.window.Event('change'));await flush();check(s,true,true);assert.equal(document.activeElement,s.add);
  localStorage.setItem('cc-queue',JSON.stringify({version:1,queue:[{path:s.article,title:'文章'}]}));s.window.dispatchEvent(new s.window.StorageEvent('storage',{key:'cc-queue'}));check(s,true,false);
  localStorage.clear();s.window.dispatchEvent(new s.window.StorageEvent('storage',{key:null}));check(s,false,false);assert.equal(document.activeElement,s.add);
 });
 test(`${root} pageshow and stale clicks read the newest queue state`,async t=>{
  const s=await setup(t,root),raw=JSON.stringify({version:1,queue:[{path:s.article,title:'文章',completed:7890}]});
  localStorage.setItem('cc-queue',raw);s.window.dispatchEvent(new s.window.PageTransitionEvent('pageshow',{persisted:true}));check(s,true,true);
  localStorage.removeItem('cc-queue');s.add.click();check(s,true,false);
  localStorage.setItem('cc-queue',raw);s.toast.textContent='unchanged';s.done.click();check(s,true,true);assert.equal(localStorage.getItem('cc-queue'),raw);assert.equal(s.toast.textContent,'unchanged');
 });
}
test('unreadable queue stays protected, then external repair restores article controls',async t=>{
 const s=await setup(t,'/',[{}]);const raw='{"version":2,"queue":[]}';localStorage.setItem('cc-queue',raw);s.window.dispatchEvent(new s.window.StorageEvent('storage',{key:'cc-queue'}));check(s,false,false);
 for(const button of [s.add,s.done]){button.focus();button.click();assert.equal(localStorage.getItem('cc-queue'),raw);assert.match(s.toast.textContent,/原文已保留/);assert.equal(document.activeElement,button);}
 localStorage.setItem('cc-queue',JSON.stringify({version:1,queue:[{path:s.article,title:'已恢复',completed:42}]}));s.window.dispatchEvent(new s.window.StorageEvent('storage',{key:'cc-queue'}));check(s,true,true);assert.doesNotMatch(s.status.textContent,/原文已保留/);
});
for(const mode of ['quota','unavailable'])test(`${mode} memory-only controls remain accurate without duplicate actions`,async t=>{
 const s=await setup(t);const get=s.window.Storage.prototype.getItem;
 if(mode==='unavailable')s.window.Storage.prototype.getItem=()=>{throw Error('SecurityError');};
 s.window.Storage.prototype.setItem=()=>{throw Error('QuotaExceededError');};
 s.done.focus();s.done.click();check(s,true,true);assert.equal(document.activeElement,s.done);assert.match(s.toast.textContent,/存储不可用/);const raw=s.storage.get('cc-queue');
 s.toast.textContent='unchanged';s.done.click();s.add.click();assert.equal(s.storage.get('cc-queue'),raw);assert.equal(s.toast.textContent,'unchanged');assert.deepEqual(JSON.parse(get.call(localStorage,'cc-queue')).queue,[]);
 s.queueAction({type:'undone',path:s.article});check(s,true,false);s.queueAction({type:'remove',path:s.article});check(s,false,false);
});
