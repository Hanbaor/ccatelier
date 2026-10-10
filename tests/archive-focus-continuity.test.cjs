const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

async function fixture(t,{search='',delayedData=false,worker=false}={}){
 const dom=new JSDOM(fs.readFileSync(path.join(root,'public/notes/index.html'),'utf8'),{url:'https://atelier.test/notes/'+search,pretendToBeVisual:true}),{window}=dom,{document}=window;
 const posts=JSON.parse(fs.readFileSync(path.join(root,'public/atelier/data/archive.json'),'utf8')).posts;
 const data=deferred(),queue=[];let workerInstance;
 const $=(selector,within=document)=>within.querySelector(selector),$$=(selector,within=document)=>[...within.querySelectorAll(selector)];
 const element=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
 const action=(label,fn,cls)=>{const button=element('button',cls,label);button.type='button';button.addEventListener('click',fn);return button;};
 class WorkerMock{
  constructor(){workerInstance=this;this.requests=[];}
  postMessage(request){this.requests.push(request);}
  terminate(){this.terminated=true;}
  reply(paths){this.onmessage({data:{id:this.requests.at(-1).id,paths}});}
 }
 const core=await import('../source/atelier/js/archive-core.mjs');
 const source=fs.readFileSync(path.join(root,'source/atelier/js/archive.js'),'utf8').replace(/^import .*;\n/gm,'').replace('export async function','async function').replaceAll('import.meta.url',JSON.stringify('https://atelier.test/atelier/js/archive.js'));
 const context={window,document,location:window.location,history:window.history,URL,Worker:worker?WorkerMock:undefined,setTimeout,clearTimeout,queueMicrotask,$,$$,element,action,toast(){},...core,loadArchive:()=>delayedData?data.promise:Promise.resolve(posts),getQueue:()=>queue,queueAction(change){if(change.type==='add')queue.push(change.item);else queue.splice(queue.findIndex(item=>item.path===change.path),1);document.dispatchEvent(new window.Event('atelier:queue'));return {ok:true,persisted:true};}};
 const init=vm.runInNewContext(source+'\ninitArchive;',context);
 t.after(()=>{window.dispatchEvent(new window.Event('pagehide'));window.close();});
 return {window,document,$,$$,posts,data,init,queue,get worker(){return workerInstance;},app:$('.archive-app'),fallback:$('.archive-fallback'),more:$('[data-archive-more]'),results:$('[data-archive-results]')};
}

test('late data and worker results preserve a focused static link until focus naturally leaves',async t=>{
 const f=await fixture(t,{delayedData:true,worker:true}),loading=f.init(),links=f.$$('.archive-fallback a');
 links[1].focus();f.data.resolve(f.posts);await loading;
 assert.equal(f.app.hidden,true);assert.equal(f.fallback.hidden,false,'first worker result has not arrived');
 assert.equal(f.document.activeElement,links[1]);
 f.worker.reply(f.posts.filter(post=>post.group==='writing').map(post=>post.path));
 assert.equal(f.app.hidden,true);assert.equal(f.fallback.hidden,false,'ready results cannot hide a focused static link');
 links[2].focus();await settle();
 assert.equal(f.app.hidden,true,'Tab between fallback links does not replace them');
 assert.equal(f.document.activeElement,links[2]);
 const slash=new f.window.KeyboardEvent('keydown',{key:'/',bubbles:true,cancelable:true});links[2].dispatchEvent(slash);
 assert.equal(slash.defaultPrevented,false,'the enhanced shortcut cannot focus a hidden search field');
 const outside=f.$('.menu-open');outside.focus();await settle();
 assert.equal(f.app.hidden,false);assert.equal(f.fallback.hidden,true);
 assert.equal(f.document.activeElement,outside,'enhancement does not steal the natural destination');
});

test('leaving before first result keeps static content until ready and never reclaims focus',async t=>{
 const f=await fixture(t,{worker:true});await f.init();
 const link=f.$('.archive-fallback a'),outside=f.$('.menu-open');link.focus();outside.focus();await settle();
 assert.equal(f.fallback.hidden,false);assert.equal(f.app.hidden,true);
 f.worker.reply([]);
 assert.equal(f.app.hidden,false);assert.equal(f.fallback.hidden,true);assert.equal(f.document.activeElement,outside);
 assert.match(f.results.textContent,/没有符合条件/,'an empty first result is still a complete accessible state');
});

test('empty first results wait for fallback focus to leave, including a blur to body',async t=>{
 const f=await fixture(t,{worker:true});await f.init();const link=f.$('.archive-fallback a');link.focus();f.worker.reply([]);
 assert.equal(f.app.hidden,true);link.blur();await settle();assert.equal(f.app.hidden,false);assert.match(f.results.textContent,/清空筛选/);
});

for(const failure of ['response','worker'])test(failure+' failure computes usable first results without hiding a focused fallback',async t=>{
 const f=await fixture(t,{worker:true});await f.init();const link=f.$('.archive-fallback a');link.focus();
 if(failure==='response')f.worker.onmessage({data:{id:f.worker.requests.at(-1).id,error:true}});else f.worker.onerror();
 assert.ok(f.results.children.length>0);assert.equal(f.app.hidden,true);assert.equal(f.document.activeElement,link);
 f.$('.menu-open').focus();await settle();assert.equal(f.app.hidden,false);assert.equal(f.fallback.hidden,true);
});

test('index failure retains the static directory and current focus',async t=>{
 const f=await fixture(t,{delayedData:true}),loading=f.init(),link=f.$('.archive-fallback a');link.focus();
 f.data.reject(new Error('文章索引暂时无法加载'));await loading;
 assert.equal(f.app.hidden,true);assert.equal(f.fallback.hidden,false);assert.equal(f.document.activeElement,link);assert.match(f.fallback.textContent,/仍可使用下方目录/);
});

test('keyboard load-more appends 18→36 and 90→100, preserving cards and queue state',async t=>{
 const f=await fixture(t,{search:'?group=hot100'});await f.init();
 const first=f.results.firstElementChild,queueButton=first.querySelector('[data-queue-path]');queueButton.click();
 assert.equal(queueButton.getAttribute('aria-pressed'),'true');
 f.more.focus();f.more.dispatchEvent(new f.window.MouseEvent('click',{bubbles:true,detail:0}));
 assert.equal(f.results.children.length,36);assert.equal(f.results.firstElementChild,first);assert.equal(f.document.activeElement,f.results.children[18].querySelector('h2 a'));assert.equal(queueButton.getAttribute('aria-pressed'),'true');
 for(let i=0;i<3;i++)f.more.dispatchEvent(new f.window.MouseEvent('click',{bubbles:true,detail:1}));
 assert.equal(f.results.children.length,90);f.more.focus();f.more.dispatchEvent(new f.window.MouseEvent('click',{bubbles:true,detail:0}));
 assert.equal(f.results.children.length,100);assert.equal(f.more.hidden,true);assert.equal(f.document.activeElement,f.results.children[90].querySelector('h2 a'));
 assert.equal(f.results.firstElementChild,first);assert.equal(first.querySelector('[data-queue-path]'),queueButton);assert.equal(queueButton.getAttribute('aria-pressed'),'true');
});

test('pointer load-more never calls focus or scrolling, and ordinary filtering does not steal focus',async t=>{
 const f=await fixture(t,{search:'?group=hot100'});await f.init();f.more.focus();let focusCalls=0,scrollCalls=0;
 const focus=f.window.HTMLElement.prototype.focus;f.window.HTMLElement.prototype.focus=function(...args){focusCalls++;return focus.apply(this,args);};f.window.HTMLElement.prototype.scrollIntoView=()=>{scrollCalls++;};
 const first=f.results.firstElementChild;f.more.dispatchEvent(new f.window.MouseEvent('click',{bubbles:true,detail:1}));
 assert.equal(f.results.children.length,36);assert.equal(f.results.firstElementChild,first);assert.equal(f.document.activeElement,f.more);assert.equal(focusCalls,0);assert.equal(scrollCalls,0);
 for(let i=0;i<4;i++)f.more.dispatchEvent(new f.window.MouseEvent('click',{bubbles:true,detail:1}));
 assert.equal(f.results.children.length,100);assert.equal(f.more.hidden,true);assert.equal(focusCalls,0);assert.equal(scrollCalls,0);
 const group=f.$('[data-group=writing]');focus.call(group);group.click();assert.equal(f.document.activeElement,group);assert.equal(focusCalls,0);
});
