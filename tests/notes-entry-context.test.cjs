const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ejs=require('ejs'),yaml=require('js-yaml'),{JSDOM}=require('jsdom');
const rootDir=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(rootDir,p),'utf8'),flush=()=>new Promise(resolve=>setImmediate(resolve));
const basePosts=[{path:'writing/a/',title:'Set 的边界',group:'writing',tags:['STL'],minutes:3,date:'2026-01-02',excerpt:'边界与实现',text:'set 边界'},{path:'writing/b/',title:'Set 的另一种写法',group:'writing',tags:['STL'],minutes:3,date:'2026-01-01',excerpt:'另一个实现',text:'set 边界'},{path:'hot100/001/',title:'两数之和',group:'hot100',tags:['算法'],minutes:8,date:'2026-01-03',excerpt:'哈希',text:'two sum'}];

async function fixture(t,{root='/',search='',recent='[]',failIndex=false,worker=false}={}){
 const posts=basePosts.map(p=>({...p,path:root+p.path})),url_for=p=>root+p;
 const html=ejs.render(read('custom/redefine/nijika/notes.ejs'),{theme:yaml.load(read('_config.redefine.yml')),url_for,nijika_art_srcset:()=>'',page:{posts:{each:fn=>posts.forEach(fn)}},partial:(name,{post}={})=>post?'<article class="archive-record"><h2><a href="'+post.path+'">'+post.title+'</a></h2></article>':''});
 const dom=new JSDOM('<body data-root="'+root+'">'+html+'<button id="outside">Elsewhere</button></body>',{url:'https://atelier.test'+root+'notes/'+search,pretendToBeVisual:true}),{window}=dom,{document}=window;
 const core=await import('../source/atelier/js/archive-core.mjs'),contextModule=await import('../source/atelier/js/reading-context.mjs'),state=await import('../source/atelier/js/reading-state.mjs');
 const $=(s,within=document)=>within.querySelector(s),$$=(s,within=document)=>[...within.querySelectorAll(s)];
 const element=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;},action=(text,fn)=>{const button=element('button','',text);button.type='button';button.addEventListener('click',fn);return button;};
 let raw=recent,unavailable=false,workerInstance,scrolls=0,focusCalls=0;
 window.scrollTo=()=>scrolls++;window.HTMLElement.prototype.scrollIntoView=()=>scrolls++;
 const originalFocus=window.HTMLElement.prototype.focus;window.HTMLElement.prototype.focus=function(...args){focusCalls++;return originalFocus.apply(this,args);};
 class WorkerMock{constructor(){workerInstance=this;}postMessage(data){this.data=data;}terminate(){}reply(){this.onmessage({data:{id:this.data.id,paths:core.queryArchive(posts,this.data.query).map(p=>p.path)}});}}
 const source=read('source/atelier/js/archive.js').replace(/^import .*;\n/gm,'').replace('export async function','async function').replaceAll('import.meta.url',JSON.stringify('https://atelier.test'+root+'atelier/js/archive.js'));
 const {withImportDeadline}=await import('../source/atelier/js/ui.js');
 const context={withImportDeadline,window,document,location:window.location,history:window.history,URL,Worker:worker?WorkerMock:undefined,setTimeout,clearTimeout,queueMicrotask,$,$$,element,action,toast(){},...core,...contextModule,shelves:{read:()=>unavailable?{status:'unavailable',items:[]}:state.readShelfState(raw)},loadArchive:()=>failIndex?Promise.reject(Error('offline')):Promise.resolve(posts),getQueue:()=>[],queueAction:()=>({ok:true,persisted:true})};
 const init=vm.runInNewContext(source+'\ninitArchive;',context);
 t.after(()=>{window.dispatchEvent(new window.Event('pagehide'));window.close();});
 return {window,document,$,$$,posts,init,root,...contextModule,get worker(){return workerInstance;},get scrolls(){return scrolls;},get focusCalls(){return focusCalls;},setRecent(value){raw=value;window.dispatchEvent(new window.StorageEvent('storage',{key:'cc-recent'}));},denyStorage(){unavailable=true;window.dispatchEvent(new window.StorageEvent('storage',{key:'cc-recent'}));},returnOf(link){return contextModule.readNotesContext(new URL(link.href).search,root);}};
}

for(const root of ['/','/lab/'])test(`native Notes links carry exact filters before click and stay current through history (${root})`,async t=>{
 const search='?q=set&group=all&tag=STL&duration=short&sort=oldest&view=grid',f=await fixture(t,{root,search});await f.init();
 const links=f.$$('[data-archive-results] h2 a');assert.equal(links.length,2);
 for(const link of links)assert.equal(f.returnOf(link).href,root+'notes/'+search+'#notes-catalog');
 const current=links[0];let intercepted=false;
 current.addEventListener('click',event=>{intercepted=event.defaultPrevented;event.preventDefault();});
 current.dispatchEvent(new f.window.MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true}));assert.equal(intercepted,false);
 const path=f.$('[data-notes-path-link]');assert.equal(f.returnOf(path).href,root+'notes/'+search+'#reading-paths');
 assert.equal(f.$('.notes-path a[href*="series/hot100"]').search,'','room links are not disguised as article journeys');
 f.window.history.pushState({},'','?q=set&sort=title');f.window.dispatchEvent(new f.window.PopStateEvent('popstate'));
 for(const link of f.$$('[data-archive-results] h2 a'))assert.equal(f.returnOf(link).href,root+'notes/?q=set&sort=title#notes-catalog');
 assert.equal(f.returnOf(path).href,root+'notes/?q=set&sort=title#reading-paths');
 f.$('.archive-search').dispatchEvent(new f.window.Event('reset',{cancelable:true}));
 assert.equal(f.returnOf(f.$('[data-archive-results] h2 a')).href,root+'notes/#notes-catalog');assert.equal(f.returnOf(path).href,root+'notes/#reading-paths');
 assert.equal(f.scrolls,0);assert.equal(f.focusCalls,0);
});

test('server-rendered curated articles are contextual before JavaScript and room links stay ordinary',async t=>{
 const f=await fixture(t,{root:'/lab/'});assert.equal(f.$('[data-notes-resume]').hidden,true);assert.equal(f.$('[data-notes-resume]').hasAttribute('href'),false);
 for(const link of f.$$('[data-notes-path-link]'))assert.equal(f.returnOf(link).href,'/lab/notes/#reading-paths');
 assert.equal(f.$('.notes-path a[href*="projects/"]').getAttribute('href'),'/lab/projects/#project-transformer');
});

test('index failure still leaves contextual static links usable without shifting focus',async t=>{
 const f=await fixture(t,{search:'?q=set&sort=oldest',failIndex:true}),link=f.$('.archive-fallback h2 a');link.focus();await f.init();
 assert.equal(f.returnOf(link).href,'/notes/?q=set&sort=oldest#notes-catalog');assert.equal(f.document.activeElement,link);assert.equal(f.$('.archive-fallback').hidden,false);assert.equal(f.$('[data-notes-resume]').hidden,true);assert.equal(f.scrolls,0);
});

test('existing result links receive latest context even while the worker is filtering',async t=>{
 const f=await fixture(t,{worker:true});await f.init();f.worker.reply();const link=f.$('[data-archive-results] h2 a');
 f.window.history.pushState({},'','?q=set&view=grid');f.window.dispatchEvent(new f.window.PopStateEvent('popstate'));
 assert.equal(f.returnOf(link).href,'/notes/?q=set&view=grid#notes-catalog');f.worker.reply();assert.equal(f.returnOf(f.$('[data-archive-results] h2 a')).href,'/notes/?q=set&view=grid#notes-catalog');
});

for(const root of ['/','/lab/'])test(`resume uses latest genuine partial article, real title and current query without auto-scrolling (${root})`,async t=>{
 const records=[{path:root+'missing/',title:'Missing',progress:.3},{path:root+'writing/a/',title:'Completed',progress:.99},{path:'/outside/writing/a/',title:'Outside',progress:.5},{path:root+'writing/b/',title:'<img src=x onerror=alert(1)>',progress:.4},{path:root+'hot100/001/',title:'Older partial',progress:.6}];
 const f=await fixture(t,{root,search:'?q=set',recent:JSON.stringify(records)});await f.init();const resume=f.$('[data-notes-resume]');
 assert.equal(resume.hidden,false);assert.equal(new URL(resume.href).pathname,root+'writing/b/');assert.equal(resume.textContent,'继续阅读 · Set 的另一种写法 · 40%');assert.equal(resume.title,resume.textContent);assert.equal(resume.getAttribute('aria-label'),resume.textContent);assert.equal(resume.querySelector('img'),null);
 assert.equal(f.returnOf(resume).href,root+'notes/?q=set#notes-catalog');assert.equal(new URL(resume.href).hash,'');
 f.$('[data-view=grid]').click();assert.equal(f.returnOf(resume).href,root+'notes/?q=set&view=grid#notes-catalog');
 f.setRecent(JSON.stringify([{path:root+'writing/a/',title:'Old title',progress:.6}]));assert.equal(new URL(resume.href).pathname,root+'writing/a/');
 f.window.history.replaceState({},'','?sort=oldest');f.window.dispatchEvent(new f.window.PageTransitionEvent('pageshow',{persisted:true}));assert.equal(f.returnOf(resume).href,root+'notes/?sort=oldest#notes-catalog');
 assert.equal(f.scrolls,0);assert.equal(f.focusCalls,0);
});

test('resume stays hidden for missing, corrupt, unsupported, completed, barely-started or blocked storage',async t=>{
 const f=await fixture(t,{recent:null});await f.init();const resume=f.$('[data-notes-resume]');assert.equal(resume.hidden,true);
 for(const raw of ['{broken','{}',JSON.stringify([{path:'/writing/a/',title:'A',progress:.05}]),JSON.stringify([{path:'/writing/a/',title:'A',progress:.97}]),JSON.stringify([{path:'/writing/a/',title:'A'}]),JSON.stringify([{path:'//evil.test/',title:'A',progress:.5}])]){
  f.setRecent(raw);assert.equal(resume.hidden,true,raw);assert.equal(resume.hasAttribute('href'),false);
 }
 f.setRecent(JSON.stringify([{path:'/writing/a/',title:'A',progress:.5}]));assert.equal(resume.hidden,false);
 f.denyStorage();assert.equal(resume.hidden,true);assert.equal(resume.hasAttribute('href'),false);assert.equal(f.scrolls,0);
});

test('graph callback reads current archive state without storing or overwriting native article paths',async t=>{
 const f=await fixture(t,{search:'?q=set&view=graph'});let articleHref;
 await f.init({loadConstellation:async()=>({createConstellation:(host,onTag,options)=>{articleHref=options.articleHref;return {setPosts(){},pause(){}};}})});await flush();
 const href=articleHref('/writing/a/#source'),url=new URL(href,'https://atelier.test');assert.equal(url.hash,'#source');assert.equal(f.readNotesContext(url.search).href,'/notes/?q=set&view=graph#notes-catalog');
 f.window.history.pushState({},'','?tag=STL&view=graph');f.window.dispatchEvent(new f.window.PopStateEvent('popstate'));
 assert.equal(f.readNotesContext(new URL(articleHref('/writing/a/'),'https://atelier.test').search).href,'/notes/?tag=STL&view=graph#notes-catalog');assert.equal(f.posts[0].path,'/writing/a/');
});
