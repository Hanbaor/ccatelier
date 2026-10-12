const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),ejs=require('ejs');
const loader=()=>import('../source/atelier/js/project-retrieval-loader.mjs');
const template=fs.readFileSync(path.join(__dirname,'../custom/redefine/nijika/projects.ejs'),'utf8');
const render=()=>ejs.render(template,{url_for:route=>'/lab/'+route.replace(/^\//,''),partial:name=>fs.readFileSync(path.join(__dirname,'../custom/redefine',name+'.ejs'),'utf8')});
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function timers(win){
  let now=0,id=0;const pending=new Map(),history=new Map();
  win.setTimeout=(callback,ms)=>{const task={id:++id,callback,ms,due:now+ms};pending.set(task.id,task);history.set(task.id,task);return task.id;};
  win.clearTimeout=id=>pending.delete(id);
  return {pending,history,advance(ms){now+=ms;for(const task of [...pending.values()])if(task.due<=now){pending.delete(task.id);task.callback();}},late(id){history.get(id).callback();}};
}
function setup({parent=false,opened=false,parentOpened=true}={}){
  const d=new JSDOM(render(),{url:'https://atelier.test/lab/projects/',pretendToBeVisual:true});
  const win=d.window,doc=win.document,host=doc.querySelector('[data-project-retrieval]');
  let outer;
  if(parent){outer=doc.createElement('details');host.before(outer);outer.append(host);outer.open=parentOpened;}
  host.open=opened;
  const clock=timers(win),status=host.querySelector('[data-retrieval-status]'),form=host.querySelector('form');
  const counts={initialized:0,destroyed:0};
  const module={initRetrieval(){counts.initialized++;form.hidden=false;status.textContent='点击「检索」后载入公开文章索引。';return {destroy(){counts.destroyed++;}};}};
  let dispose=()=>{};
  return {d,win,doc,host,outer,clock,status,form,counts,module,
    mount(attach,options){dispose=attach(host,options);return dispose;},
    toggle(open,node=host){node.open=open;node.dispatchEvent(new win.Event('toggle'));},
    page(type){win.dispatchEvent(new win.Event(type));},
    close(){dispose();win.close();}
  };
}
function loading(h){assert.match(h.status.textContent,/正在载入检索工具/);assert.equal(h.status.getAttribute('aria-busy'),'true');assert.equal(h.form.hidden,true);assert.equal(h.clock.pending.size,1);}
function settled(h){assert.equal(h.status.hasAttribute('aria-busy'),false);assert.equal(h.clock.pending.size,0);}

test('loader has no collapsed import; an unsettled import gets one eight-second deadline and an honest failure',async()=>{
  const {attachRetrieval}=await loader(),h=setup();
  try{
    let calls=0,requests=0;
    h.mount(attachRetrieval,{load:()=>{calls++;return new Promise(()=>{});},fetchIndex:()=>{requests++;}});
    await flush();assert.equal(calls,0);assert.equal(h.clock.pending.size,0);assert.equal(h.form.hidden,true);
    h.host.querySelector('summary').focus();const focus=h.doc.activeElement;
    h.toggle(true);loading(h);assert.equal(calls,1);assert.equal([...h.clock.pending.values()][0].ms,8000);
    h.clock.advance(7999);loading(h);assert.equal(h.doc.activeElement,focus);
    h.clock.advance(1);settled(h);assert.match(h.status.textContent,/载入超时.*收起后重新打开.*刷新页面/);assert.equal(h.form.hidden,true);
    for(let i=0;i<3;i++){h.toggle(true);h.page('pageshow');h.clock.advance(8000);await flush();}
    assert.equal(calls,1);assert.equal(requests,0);assert.equal(h.counts.initialized,0);assert.equal(h.doc.activeElement,focus);
    h.toggle(false);h.toggle(true);assert.equal(calls,2);loading(h);
    h.clock.advance(8000);settled(h);assert.match(h.status.textContent,/载入超时/);assert.equal(calls,2);
  }finally{h.close();}
});

for(const kind of ['resolve','reject'])for(const interruption of ['timeout','close','pagehide']){
  test(`loader ignores late ${kind} after ${interruption} without clearing a newer pending attempt`,async()=>{
    const {attachRetrieval}=await loader(),h=setup();
    try{
      const old=deferred(),next=deferred();let calls=0;
      h.mount(attachRetrieval,{load:()=>++calls===1?old.promise:next.promise});h.toggle(true);
      const oldTimer=[...h.clock.pending.keys()][0];
      if(interruption==='timeout'){h.clock.advance(8000);h.toggle(false);h.toggle(true);}
      if(interruption==='close'){h.toggle(false);settled(h);assert.match(h.status.textContent,/重新打开后/);h.toggle(true);}
      if(interruption==='pagehide'){h.page('pagehide');settled(h);assert.match(h.status.textContent,/返回页面后/);h.page('pageshow');}
      assert.equal(calls,2,'a new attempt starts without waiting for the old promise');loading(h);
      const newTimer=[...h.clock.pending.keys()][0];assert.notEqual(newTimer,oldTimer);
      if(kind==='resolve')old.resolve(h.module);else old.reject(Error('Late rejection'));
      await flush();h.clock.late(oldTimer);loading(h);
      assert.equal([...h.clock.pending.keys()][0],newTimer);assert.equal(h.counts.initialized,0);assert.equal(calls,2);
      h.toggle(true);h.page('pageshow');assert.equal(calls,2);
      next.resolve(h.module);await flush();settled(h);assert.equal(h.counts.initialized,1);assert.equal(h.form.hidden,false);
      h.clock.late(newTimer);assert.equal(h.counts.initialized,1);assert.doesNotMatch(h.status.textContent,/超时|暂未载入/);
    }finally{h.close();}
  });
}

for(const kind of ['resolve','reject']){
  test(`a late ${kind} after the import timeout cannot replace its failure or silently retry`,async()=>{
    const {attachRetrieval}=await loader(),h=setup();
    try{
      const request=deferred();let calls=0;
      h.mount(attachRetrieval,{load:()=>{calls++;return request.promise;}});h.toggle(true);h.clock.advance(8000);
      const failure=h.status.textContent;
      if(kind==='resolve')request.resolve(h.module);else request.reject(null);
      await flush();settled(h);assert.equal(h.status.textContent,failure);assert.equal(h.counts.initialized,0);assert.equal(calls,1);assert.equal(h.form.hidden,true);
    }finally{h.close();}
  });
}

for(const [label,load] of [
  ['synchronous throw',()=>{throw Error('Offline');}],
  ['null rejection',()=>Promise.reject(null)],
  ['undefined rejection',()=>Promise.reject(undefined)],
  ['string rejection',()=>Promise.reject('Offline')],
  ['object rejection',()=>Promise.reject({message:12})]
]){
  test(`loader handles ${label} with cleared timer, hidden form and deliberate retry`,async()=>{
    const {attachRetrieval}=await loader(),h=setup();
    try{
      let calls=0;
      h.mount(attachRetrieval,{load:()=>++calls===1?load():Promise.resolve(h.module)});h.toggle(true);await flush();
      settled(h);assert.match(h.status.textContent,/暂未载入.*收起后重新打开.*刷新页面/);assert.equal(h.form.hidden,true);
      h.toggle(true);h.page('pageshow');await flush();assert.equal(calls,1);
      h.toggle(false);h.toggle(true);await flush();settled(h);assert.equal(calls,2);assert.equal(h.counts.initialized,1);
    }finally{h.close();}
  });
}

test('rapid close/reopen starts one attempt per opening and only the latest import may initialize',async()=>{
  const {attachRetrieval}=await loader(),h=setup();
  try{
    const requests=[];
    h.mount(attachRetrieval,{load:()=>{const request=deferred();requests.push(request);return request.promise;}});
    for(let i=0;i<5;i++){h.toggle(true);loading(h);assert.equal(requests.length,i+1);h.toggle(true);assert.equal(requests.length,i+1);if(i<4){h.toggle(false);settled(h);}}
    for(const request of requests.slice(0,-1).reverse()){request.resolve(h.module);await flush();loading(h);assert.equal(h.counts.initialized,0);}
    requests.at(-1).resolve(h.module);await flush();settled(h);assert.equal(h.counts.initialized,1);
    h.toggle(false);h.toggle(true);h.page('pagehide');h.page('pageshow');await flush();assert.equal(requests.length,5);assert.equal(h.counts.initialized,1);
  }finally{h.close();}
});

test('native summary clicks retry after timeout or an unsettled import without synthetic toggle dispatch',async()=>{
  const {attachRetrieval}=await loader(),h=setup();
  try{
    const requests=[],summary=h.host.querySelector('summary');
    h.mount(attachRetrieval,{load:()=>{const request=deferred();requests.push(request);return request.promise;}});
    summary.click();await flush();assert.equal(h.host.open,true);assert.equal(requests.length,1);loading(h);
    h.clock.advance(8000);settled(h);assert.match(h.status.textContent,/超时/);
    summary.click();await flush();assert.equal(h.host.open,false);assert.equal(requests.length,1);
    summary.click();await flush();assert.equal(h.host.open,true);assert.equal(requests.length,2);loading(h);
    summary.click();await flush();settled(h);
    summary.click();await flush();assert.equal(requests.length,3);loading(h);
    requests[0].resolve(h.module);requests[1].reject(Error('Old request'));await flush();loading(h);assert.equal(h.counts.initialized,0);
    requests[2].resolve(h.module);await flush();settled(h);assert.equal(h.counts.initialized,1);
  }finally{h.close();}
});

test('closed disclosure ancestor blocks import; closing it releases an unsettled attempt for its next opening',async()=>{
  const {attachRetrieval}=await loader(),h=setup({parent:true,opened:true,parentOpened:false});
  try{
    const requests=[];
    h.mount(attachRetrieval,{load:()=>{const request=deferred();requests.push(request);return request.promise;}});
    await flush();h.page('pagehide');h.page('pageshow');assert.equal(requests.length,0);assert.equal(h.clock.pending.size,0);
    h.toggle(true,h.outer);assert.equal(requests.length,1);loading(h);
    h.toggle(false,h.outer);settled(h);h.page('pagehide');h.page('pageshow');assert.equal(requests.length,1);
    h.toggle(true,h.outer);assert.equal(requests.length,2);loading(h);
    requests[0].resolve(h.module);await flush();loading(h);assert.equal(h.counts.initialized,0);
    requests[1].resolve(h.module);await flush();settled(h);assert.equal(h.counts.initialized,1);
    h.toggle(false,h.outer);h.toggle(true,h.outer);assert.equal(requests.length,2);
  }finally{h.close();}
});

test('pagehide releases a never-settling import; pageshow starts exactly one bounded attempt only while visible',async()=>{
  const {attachRetrieval}=await loader(),h=setup();
  try{
    let calls=0;
    h.mount(attachRetrieval,{load:()=>{calls++;return new Promise(()=>{});}});h.toggle(true);
    h.page('pagehide');settled(h);h.toggle(true);assert.equal(calls,1);
    h.page('pageshow');h.page('pageshow');loading(h);assert.equal(calls,2);
    h.clock.advance(8000);settled(h);assert.match(h.status.textContent,/超时/);
    h.page('pagehide');h.toggle(false);h.page('pageshow');assert.equal(calls,2);settled(h);
    h.toggle(true);loading(h);assert.equal(calls,3);
  }finally{h.close();}
});

test('returning after an import settled while away still waits for the new attempt without an implicit index request',async()=>{
  const {attachRetrieval}=await loader(),h=setup();
  try{
    const old=deferred(),next=deferred();let calls=0,requests=0;
    h.mount(attachRetrieval,{load:()=>++calls===1?old.promise:next.promise,fetchIndex:()=>{requests++;}});h.toggle(true);h.page('pagehide');
    old.resolve(h.module);await flush();settled(h);assert.equal(h.counts.initialized,0);
    h.page('pageshow');loading(h);assert.equal(calls,2);assert.equal(requests,0);
    next.resolve(h.module);await flush();settled(h);assert.equal(h.counts.initialized,1);assert.equal(requests,0);
  }finally{h.close();}
});

for(const kind of ['resolve','reject']){
  test(`dispose releases pending timer and listeners; late ${kind} and lifecycle events remain inert`,async()=>{
    const {attachRetrieval}=await loader(),h=setup({parent:true});
    try{
      const request=deferred();let calls=0;
      const dispose=h.mount(attachRetrieval,{load:()=>{calls++;return request.promise;}});h.toggle(true);const timer=[...h.clock.pending.keys()][0];
      dispose();dispose();settled(h);assert.match(h.status.textContent,/已停止.*刷新页面/);const status=h.status.textContent;
      if(kind==='resolve')request.resolve(h.module);else request.reject(Error('Late rejection'));
      await flush();h.clock.late(timer);h.toggle(false);h.toggle(true);h.toggle(false,h.outer);h.toggle(true,h.outer);h.page('pagehide');h.page('pageshow');await flush();
      settled(h);assert.equal(calls,1);assert.equal(h.counts.initialized,0);assert.equal(h.status.textContent,status);assert.equal(h.form.hidden,true);
    }finally{h.close();}
  });
}

test('a disconnected host cannot initialize from a late import',async()=>{
  const {attachRetrieval}=await loader(),h=setup();
  try{
    const request=deferred();h.mount(attachRetrieval,{load:()=>request.promise});h.toggle(true);h.host.remove();request.resolve(h.module);await flush();
    settled(h);assert.equal(h.counts.initialized,0);h.page('pageshow');assert.equal(h.clock.pending.size,0);
  }finally{h.close();}
});

test('initialization failure clears import deadline before init and permanently requires refresh rather than duplicate bindings',async()=>{
  const {attachRetrieval}=await loader(),h=setup({parent:true});
  try{
    let calls=0,bindings=0;
    h.mount(attachRetrieval,{load:()=>{calls++;return Promise.resolve({initRetrieval(){settled(h);bindings++;h.form.hidden=false;throw Error('Partial initialization');}});}});
    h.toggle(true);await flush();settled(h);assert.equal(bindings,1);assert.equal(h.form.hidden,true);assert.match(h.status.textContent,/未能完成初始化.*刷新页面/);assert.doesNotMatch(h.status.textContent,/收起后/);
    const status=h.status.textContent;
    for(let i=0;i<3;i++){h.toggle(false);h.toggle(true);h.toggle(false,h.outer);h.toggle(true,h.outer);h.page('pagehide');h.page('pageshow');h.clock.advance(8000);await flush();}
    assert.equal(calls,1);assert.equal(bindings,1);assert.equal(h.status.textContent,status);settled(h);
  }finally{h.close();}
});

test('native-style retry can share the same unresolved promise; only its current attempt may initialize',async()=>{
  const {attachRetrieval}=await loader(),h=setup();
  try{
    const shared=deferred();let calls=0;
    h.mount(attachRetrieval,{load:()=>{calls++;return shared.promise;}});h.toggle(true);h.clock.advance(8000);
    assert.match(h.status.textContent,/刷新页面/);h.toggle(false);h.toggle(true);assert.equal(calls,2);loading(h);
    shared.resolve(h.module);await flush();settled(h);assert.equal(h.counts.initialized,1);
    h.toggle(false);h.toggle(true);assert.equal(calls,2);
  }finally{h.close();}
});

test('native-style cached rejection fails each deliberate retry honestly and never loops',async()=>{
  const {attachRetrieval}=await loader(),h=setup();
  try{
    const shared=deferred();let calls=0;
    h.mount(attachRetrieval,{load:()=>{calls++;return shared.promise;}});h.toggle(true);shared.reject(Error('Cached import failure'));await flush();settled(h);
    h.toggle(false);h.toggle(true);await flush();settled(h);assert.equal(calls,2);assert.match(h.status.textContent,/刷新页面/);assert.equal(h.counts.initialized,0);
    h.toggle(true);h.page('pageshow');h.clock.advance(8000);await flush();assert.equal(calls,2);
  }finally{h.close();}
});

test('successful real panel keeps focus, initializes once, and fetches the index only on an explicit submit',async()=>{
  const {attachRetrieval}=await loader(),panel=await import('../source/atelier/js/project-retrieval-panel.mjs'),h=setup();
  try{
    let imports=0,initializations=0,requests=[];
    const dispose=h.mount(attachRetrieval,{
      load:()=>{imports++;return Promise.resolve({...panel,initRetrieval(...args){initializations++;return panel.initRetrieval(...args);}});},
      fetchIndex:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({version:1,posts:[{group:'writing',title:'STL',text:'递归',path:'/lab/writing/example/'}]})};}
    });
    h.host.querySelector('summary').focus();const focus=h.doc.activeElement;
    h.toggle(true);await flush();settled(h);assert.equal(imports,1);assert.equal(initializations,1);assert.equal(h.form.hidden,false);assert.equal(requests.length,0);assert.equal(h.doc.activeElement,focus);
    h.toggle(false);h.toggle(true);h.page('pagehide');h.page('pageshow');await flush();assert.equal(imports,1);assert.equal(initializations,1);assert.equal(requests.length,0);assert.equal(h.doc.activeElement,focus);
    h.form.dispatchEvent(new h.win.Event('submit',{cancelable:true}));await flush();
    assert.equal(requests.length,1);assert.equal(requests[0].url,'https://atelier.test/lab/atelier/data/archive.json');assert.equal(requests[0].options.credentials,'same-origin');assert.equal(requests[0].options.body,undefined);assert.equal(h.host.querySelectorAll('[data-retrieval-results] li').length,1);
    h.form.dispatchEvent(new h.win.Event('submit',{cancelable:true}));await flush();assert.equal(requests.length,1);assert.equal(h.doc.activeElement,focus);
    dispose();dispose();h.form.dispatchEvent(new h.win.Event('submit',{cancelable:true}));await flush();assert.equal(requests.length,1);
  }finally{h.close();}
});

test('disposing a successfully initialized loader destroys its instance once',async()=>{
  const {attachRetrieval}=await loader(),h=setup({opened:true});
  try{
    let calls=0;const dispose=h.mount(attachRetrieval,{load:()=>{calls++;return Promise.resolve(h.module);}});await flush();assert.equal(h.counts.initialized,1);settled(h);
    dispose();dispose();h.toggle(false);h.toggle(true);h.page('pagehide');h.page('pageshow');await flush();assert.equal(h.counts.destroyed,1);assert.equal(calls,1);
  }finally{h.close();}
});

test('loader retains one literal import and adds no cachebuster, storage, export or network route',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../source/atelier/js/project-retrieval-loader.mjs'),'utf8');
  assert.deepEqual([...source.matchAll(/import\(([^)]+)\)/g)].map(match=>match[1]),["'./project-retrieval-panel.mjs'"]);
  assert.deepEqual([...source.matchAll(/export function (\w+)/g)].map(match=>match[1]),['attachRetrieval','initProjectRetrieval']);
  assert.doesNotMatch(source,/^import\s|localStorage|sessionStorage|sendBeacon|URLSearchParams|location\.reload|setInterval|Date\.now|Math\.random/m);
  assert.equal((source.match(/await fetchIndex\(/g)||[]).length,1);
});
