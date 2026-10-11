const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const core=import('../source/atelier/js/research-sql-core.mjs'),snapshot=import('../source/atelier/js/research-sql-snapshot.mjs'),share=import('../source/atelier/js/research-sql-share.mjs');
const raw=value=>'#sql=v1.'+Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve))};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
async function setup(hash=''){
 const html=require('ejs').render(fs.readFileSync(path.join(__dirname,'../custom/redefine/nijika/research.ejs'),'utf8'),{url_for:v=>'/'+v,partial:()=>''});
 const dom=new JSDOM(html,{url:'https://ccatelier.test/prefix/research/?private=strip'+hash,pretendToBeVisual:true});
 const {initResearchSql}=await import('../source/atelier/js/research-sql.js'),calls=[],requests=[];let stops=0;
 const controller=initResearchSql(dom.window.document,{runnerFactory:()=>({run(...args){calls.push(args);const req=deferred();requests.push(req);return req.promise},stop(){stops++}})});
 const doc=dom.window.document,$=selector=>doc.querySelector(selector),editor=()=> $('[data-sql-case]:not([hidden]) [data-sql-editor]');
 return{dom,doc,$,controller,editor,calls,requests,get stops(){return stops},async hash(value){dom.window.history.replaceState(null,'',value);dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));await flush()},close(){controller.stop();dom.window.close()}};
}
async function sample(sql='SELECT draft',caseId='top-ties',datasetId='unique'){return(await snapshot).createSqlSnapshot(caseId,datasetId,sql)}

test('nine fixture snapshots round trip exact Unicode, whitespace, empty and incomplete SQL without runnable validation',async()=>{
 const {SQL_CASES,listSqlDatasets}=await core,{encodeSqlShare,decodeSqlShare}=await share;
 let count=0;
 for(const item of SQL_CASES)for(const data of listSqlDatasets(item.id)){
  count++;
  for(const sql of ['', '  SELECT 未完成\n\t🪕 ; <script> & # ?', 'x'.repeat(4000),'\ud800']){
   const value=await sample(sql,item.id,data.id),hash=encodeSqlShare(value);
   assert.deepEqual(decodeSqlShare(hash),value);assert.equal(encodeSqlShare(decodeSqlShare(hash)),hash);
  }
 }
 assert.equal(count,9);
});

test('codec rejects malformed base64, invalid UTF8, unknown schema, fixture and revision, oversized input and prototype keys',async()=>{
 const {encodeSqlShare,decodeSqlShare,SQL_SHARE_MAX_BYTES}=await share,value=await sample();
 for(const hash of ['#sql=v2.x','#sql=v1.','#sql=v1.A','#sql=v1.Zg=','#sql=v1.Zh','#sql=v1.!!!!','#sql=v1.%41', '#sql=v1.'+Buffer.from([0xc3,0x28]).toString('base64url'),raw('not json'),raw('[]'),raw('null'),'#sql=v1.'+'A'.repeat(22000),raw(' '.repeat(SQL_SHARE_MAX_BYTES+1))])assert.throws(()=>decodeSqlShare(hash),hash.slice(0,40));
 for(const patch of [{version:2},{format:'other'},{engine:'evil'},{caseId:'__proto__'},{caseRevision:2},{datasetId:'missing'},{datasetRevision:2},{sql:'\0'},{sql:'a'.repeat(4001)},{expected:[]}])assert.throws(()=>decodeSqlShare(raw({...value,...patch})));
 for(const key of ['__proto__','constructor','prototype'])assert.throws(()=>decodeSqlShare(raw(JSON.stringify(value).slice(0,-1)+',"'+key+'":{}}')));
 for(const hash of ['', '#elsewhere', '#rhythm=v1.a',null,undefined])assert.equal(decodeSqlShare(hash),null);
 assert.throws(()=>encodeSqlShare({...value,sql:'\u0001'.repeat(4000)}),/容量/);
});

test('deterministic fuzz stays bounded and canonical; URLs strip query and preserve only same HTTP origin/path',async()=>{
 const {encodeSqlShare,decodeSqlShare,createSqlShareURL}=await share;
 let seed=123;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed};
 for(let n=0;n<200;n++){
  let sql='';for(let i=0;i<n;i++)sql+=String.fromCharCode(1+rand()%65535);
  const value=await sample(sql),hash=encodeSqlShare(value);assert.deepEqual(decodeSqlShare(hash),value);
  const garbage='#sql=v1.'+Array.from({length:rand()%150},()=>String.fromCharCode(32+rand()%95)).join('');
  try{const parsed=decodeSqlShare(garbage);assert.deepEqual(decodeSqlShare(encodeSqlShare(parsed)),parsed)}catch(error){assert.ok(error instanceof Error)}
 }
 const value=await sample(),base='https://ccatelier.test/prefix/research/?secret=1#old';
 assert.equal(createSqlShareURL(value,base,base),'https://ccatelier.test/prefix/research/'+encodeSqlShare(value));
 for(const source of ['javascript:alert(1)','file:///prefix/research/','https://evil.test/prefix/research/','https://ccatelier.test/research/','https://user@ccatelier.test/prefix/research/','http://ccatelier.test/prefix/research/'])assert.throws(()=>createSqlShareURL(value,source,base));
});

test('incoming input stays staged without focus, mutation or execution; explicit load restores every draft and supports recovery toggling',async()=>{
 const {encodeSqlShare}=await share,value=await sample('  broken SQL\n<script>alert(1)</script>');const s=await setup(encodeSqlShare(value));
 try{
  const original=s.editor().value,focus=s.doc.activeElement;await flush();
  assert.equal(s.doc.activeElement,focus);assert.equal(s.editor().value,original);assert.equal(s.calls.length,0);
  assert.equal(s.$('[data-sql-incoming]').hidden,false);assert.match(s.$('[data-sql-incoming-info]').textContent,/唯一/);
  assert.equal(s.$('[data-sql-incoming-sql]').textContent,value.sql);assert.equal(s.$('[data-sql-incoming-sql] script'),null);
  const drafts=Array.from(s.doc.querySelectorAll('[data-sql-editor]'));drafts.forEach((field,i)=>field.value='local '+i);
  s.$('[data-sql-incoming-load]').click();assert.equal(s.editor().value,value.sql);assert.equal(s.calls.length,0);assert.equal(s.$('[data-sql-dataset]').value,'unique');
  s.$('[data-sql-restore-draft]').click();assert.deepEqual(drafts.map(field=>field.value),['local 0','local 1','local 2']);assert.equal(s.calls.length,0);
  s.$('[data-sql-restore-draft]').click();assert.equal(s.editor().value,value.sql);assert.equal(s.calls.length,0);
 }finally{s.close()}
});

test('ignored or malformed link leaves existing result and drafts untouched; repeated initialization adds no handlers',async()=>{
 const {encodeSqlShare}=await share,s=await setup();
 try{
  s.controller.run();s.requests[0].resolve({...((await core).SQL_CASES[0].expected),truncated:false});await flush();
  const result=s.$('[data-sql-actual]').innerHTML,status=s.$('[data-sql-status]').textContent,sql=s.editor().value;
  await s.hash(encodeSqlShare(await sample()));s.$('[data-sql-incoming-ignore]').click();
  assert.equal(s.$('[data-sql-actual]').innerHTML,result);assert.equal(s.$('[data-sql-status]').textContent,status);assert.equal(s.editor().value,sql);
  s.dom.window.dispatchEvent(new s.dom.window.PageTransitionEvent('pageshow',{persisted:true}));await flush();assert.equal(s.$('[data-sql-incoming]').hidden,true);
  await s.hash('#sql=v2.bad');assert.equal(s.$('[data-sql-incoming-load]').hidden,true);assert.equal(s.editor().value,sql);assert.equal(s.$('[data-sql-actual]').innerHTML,result);
  assert.equal((await import('../source/atelier/js/research-sql.js')).initResearchSql(s.doc),s.controller);
  s.$('[data-sql-run]').click();assert.equal(s.calls.length,2);
 }finally{s.close()}
});

test('share generation does not cancel an in-flight query; copying requires its own click and late completion cannot replace new intent',async()=>{
 const s=await setup(),writes=[],copy=deferred();
 try{
  Object.defineProperty(s.dom.window.navigator,'clipboard',{value:{writeText:value=>{writes.push(value);return copy.promise}}});
  s.controller.run();const stops=s.stops;s.$('[data-sql-share]').click();await flush();
  assert.equal(s.stops,stops);assert.equal(writes.length,0);assert.equal(s.$('[data-sql-share-url]').readOnly,true);assert.match(s.$('[data-sql-share-url]').value,/^https:\/\/ccatelier.test\/prefix\/research\/#sql=v1\./);
  s.requests[0].resolve({...((await core).SQL_CASES[0].expected),truncated:false});await flush();assert.match(s.$('[data-sql-status]').textContent,/一致/);
  s.$('[data-sql-share-copy]').click();assert.equal(writes.length,1);
  s.editor().value='new draft';s.editor().dispatchEvent(new s.dom.window.Event('input'));copy.resolve();await flush();
  assert.equal(s.$('[data-sql-share-panel]').hidden,true);assert.equal(s.$('[data-sql-share-status]').textContent,'');assert.match(s.$('[data-sql-status]').textContent,/修改/);
 }finally{s.close()}
});

test('link apply cancels pending run and file read; hidden, pagehide and hash changes invalidate stale share work',async()=>{
 const s=await setup(),{encodeSqlShare}=await share;
 try{
  s.controller.run();const pending=deferred(),filePromise=s.controller.importFile({size:100,text:()=>pending.promise});
  const target=await sample('SELECT exact');await s.hash(encodeSqlShare(target));s.$('[data-sql-incoming-load]').click();
  pending.resolve(JSON.stringify(await sample('old file')));await filePromise;
  s.requests[0].resolve({...((await core).SQL_CASES[0].expected),truncated:false});await flush();assert.equal(s.editor().value,'SELECT exact');assert.match(s.$('[data-sql-status]').textContent,/尚未运行/);assert.ok(s.stops>0);
  s.$('[data-sql-share]').click();s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));await flush();assert.equal(s.$('[data-sql-share-panel]').hidden,true);
  s.$('[data-sql-share]').click();await s.hash('#other');assert.equal(s.$('[data-sql-share-panel]').hidden,true);assert.equal(s.$('[data-sql-incoming]').hidden,true);
  Object.defineProperty(s.doc,'hidden',{configurable:true,value:true});s.doc.dispatchEvent(new s.dom.window.Event('visibilitychange'));s.$('[data-sql-share]').click();await flush();assert.equal(s.$('[data-sql-share-panel]').hidden,true);
 }finally{s.close()}
});

test('all nine arrival previews name the exact dataset and preserve current experiments',async()=>{
 const {SQL_CASES,listSqlDatasets}=await core,{encodeSqlShare}=await share,s=await setup();
 try{
  const sql=s.editor().value;let count=0;
  for(const item of SQL_CASES)for(const dataset of listSqlDatasets(item.id)){
   await s.hash(encodeSqlShare(await sample('not executable',item.id,dataset.id)));count++;
   assert.ok(s.$('[data-sql-incoming-info]').textContent.includes(`${item.label} · ${dataset.label}`));
   assert.equal(s.editor().value,sql);assert.equal(s.calls.length,0);
  }
  assert.equal(count,9);
 }finally{s.close()}
});

test('loading a staged link invalidates late plan, suite and minimizer replies without adding history entries',async()=>{
 const {encodeSqlShare}=await share;
 for(const operation of ['plan','suite','minimize']){
  const s=await setup();
  try{
   s.controller.run();s.requests[0].resolve({...((await core).SQL_CASES[0].expected),truncated:false});await flush();
   const history=s.$('[data-sql-history] summary').textContent;
   if(operation==='plan'){const detail=s.$('[data-sql-plan]');detail.open=true;detail.dispatchEvent(new s.dom.window.Event('toggle'))}
   if(operation==='suite'){s.$('[data-sql-suite-run]').click();await flush()}
   if(operation==='minimize')s.$('[data-sql-minimize-run]').click();
   assert.equal(s.calls.length,2,operation);const stops=s.stops;
   await s.hash(encodeSqlShare(await sample('pending replacement','empty-count','empty')));
   s.$('[data-sql-incoming-load]').click();assert.ok(s.stops>stops);
   s.requests[1].resolve({columns:['late'],rows:[['late']],truncated:false,state:'no-witness',tested:64});await flush();
   assert.equal(s.editor().value,'pending replacement');assert.match(s.$('[data-sql-status]').textContent,/尚未运行/);
   assert.equal(s.$('[data-sql-history] summary').textContent,history);assert.equal(s.calls.length,2);
   assert.equal(s.$('[data-sql-plan]').hidden,true);assert.equal(s.$('[data-sql-suite-output]').textContent,'');
  }finally{s.close()}
 }
});

test('clipboard rejection has an accessible manual-copy fallback; hidden/pagehide/new share suppress late clipboard feedback',async()=>{
 for(const action of ['reject','hidden','pagehide','new-share','hash']){
  const s=await setup(),pending=deferred();
  try{
   Object.defineProperty(s.dom.window.navigator,'clipboard',{value:{writeText:()=>pending.promise}});
   s.$('[data-sql-share]').click();await flush();s.$('[data-sql-share-copy]').click();
   if(action==='hidden'){Object.defineProperty(s.doc,'hidden',{configurable:true,value:true});s.doc.dispatchEvent(new s.dom.window.Event('visibilitychange'))}
   if(action==='pagehide')s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));
   if(action==='new-share'){s.$('[data-sql-share]').click();await flush()}
   if(action==='hash')await s.hash('#other');
   pending.reject(Error('permission denied'));await flush();
   if(action==='reject'){assert.match(s.$('[data-sql-share-status]').textContent,/手动复制/);assert.equal(s.doc.activeElement,s.$('[data-sql-share-url]'))}
   else assert.doesNotMatch(s.$('[data-sql-share-status]').textContent,/手动复制|已复制/);
   assert.equal(s.calls.length,0);
  }finally{s.close()}
 }
});

test('BFCache and hidden arrival re-stage the latest URL only, with no focus or execution',async()=>{
 const s=await setup(),{encodeSqlShare}=await share;
 try{
  Object.defineProperty(s.doc,'hidden',{configurable:true,value:true});s.doc.dispatchEvent(new s.dom.window.Event('visibilitychange'));
  await s.hash(encodeSqlShare(await sample('first')));assert.equal(s.$('[data-sql-incoming]').hidden,true);
  await s.hash(encodeSqlShare(await sample('latest')));
  Object.defineProperty(s.doc,'hidden',{configurable:true,value:false});s.doc.dispatchEvent(new s.dom.window.Event('visibilitychange'));
  s.dom.window.dispatchEvent(new s.dom.window.PageTransitionEvent('pageshow',{persisted:true}));await flush();
  assert.equal(s.$('[data-sql-incoming-sql]').textContent,'latest');assert.equal(s.calls.length,0);assert.equal(s.doc.activeElement,s.doc.body);
  s.$('[data-sql-incoming-ignore]').click();assert.equal(s.$('[data-sql-incoming]').hidden,true);
 }finally{s.close()}
});

test('actual SQL stylesheet cascade keeps actionable disclosures and experiment feedback readable',async()=>{
 const s=await setup();
 try{
  const style=s.doc.createElement('style');style.textContent=fs.readFileSync(path.join(__dirname,'../source/atelier/css/research-sql.css'),'utf8');s.doc.head.append(style);
  s.controller.run();s.requests[0].resolve({...((await core).SQL_CASES[0].expected),truncated:false});await flush();
  for(const selector of ['[data-sql-suite]>summary','[data-sql-history]>summary','.sql-boundaries>summary','[data-sql-suite-status]','[data-sql-history] p','.sql-history-controls label','.sql-history-controls select','[data-sql-share-status]','[data-sql-status]']){
   assert.ok(parseFloat(s.dom.window.getComputedStyle(s.$(selector)).fontSize)>=13,selector);
  }
  for(const selector of ['.sql-history-controls select','[data-sql-dataset]','[data-sql-share]','[data-sql-history-restore]','[data-sql-share-copy]','[data-sql-suite-run]']){
   assert.ok(parseFloat(s.dom.window.getComputedStyle(s.$(selector)).minHeight)>=44,selector);
  }
 }finally{s.close()}
});

test('recovery restores all three dataset selections, exact SQL and active case without extra runs',async()=>{
 const s=await setup(),{SQL_CASES,listSqlDatasets}=await core,{encodeSqlShare}=await share,expected=[];
 try{
  for(const item of SQL_CASES){
   s.controller.select(item.id);const id=listSqlDatasets(item.id).at(-1).id;
   s.$('[data-sql-dataset]').value=id;s.$('[data-sql-dataset]').dispatchEvent(new s.dom.window.Event('change'));
   const sql=`  ${item.id} 🪕\n`;s.editor().value=sql;s.editor().dispatchEvent(new s.dom.window.Event('input'));
   expected.push({caseId:item.id,datasetId:id,sql});
  }
  await s.hash(encodeSqlShare(await sample('replacement')));s.$('[data-sql-incoming-load]').click();s.$('[data-sql-restore-draft]').click();
  assert.equal(s.$('[data-sql-case]:not([hidden])').dataset.sqlCase,SQL_CASES.at(-1).id);
  for(const saved of expected){s.controller.select(saved.caseId);assert.equal(s.editor().value,saved.sql);assert.equal(s.$('[data-sql-dataset]').value,saved.datasetId)}
  assert.equal(s.calls.length,0);
 }finally{s.close()}
});

test('invalid current SQL cannot create a partial share or perform clipboard writes',async()=>{
 const s=await setup();let writes=0;
 try{
  Object.defineProperty(s.dom.window.navigator,'clipboard',{value:{writeText:async()=>writes++}});
  for(const sql of ['x'.repeat(4001),'\u0001'.repeat(4000),'\0']){
   s.editor().value=sql;s.$('[data-sql-share]').click();await flush();
   assert.equal(s.$('[data-sql-share-url]').value,'');assert.equal(s.$('[data-sql-share-copy]').disabled,true);assert.ok(s.$('[data-sql-share-status]').textContent);s.$('[data-sql-share-copy]').click();
  }
  assert.equal(writes,0);assert.equal(s.calls.length,0);
 }finally{s.close()}
});

test('incoming experiments have a first-screen notice; only explicit View scrolls and it never changes the snapshot fragment',async()=>{
 const s=await setup(),{encodeSqlShare}=await share;
 try{
  const arrival=s.$('[data-sql-arrival]'),intro=s.$('.personal-research-opening'),incoming=s.$('[data-sql-incoming]');
  assert.ok(arrival.compareDocumentPosition(intro)&s.dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(arrival.hidden,true);let scrolls=0;incoming.scrollIntoView=()=>scrolls++;
  const hash=encodeSqlShare(await sample());await s.hash(hash);
  assert.equal(arrival.hidden,false);assert.equal(scrolls,0);assert.equal(s.doc.activeElement,s.doc.body);assert.equal(s.calls.length,0);
  s.$('[data-sql-arrival-view]').click();assert.equal(scrolls,1);assert.equal(s.dom.window.location.hash,hash);assert.equal(s.doc.activeElement,incoming);assert.equal(s.calls.length,0);
  s.$('[data-sql-incoming-ignore]').click();assert.equal(arrival.hidden,true);assert.equal(incoming.hidden,true);
  s.dom.window.dispatchEvent(new s.dom.window.PageTransitionEvent('pageshow',{persisted:true}));await flush();assert.equal(arrival.hidden,true);
  await s.hash(encodeSqlShare(await sample('another')));s.$('[data-sql-incoming-load]').click();assert.equal(arrival.hidden,true);assert.equal(incoming.hidden,true);
  await s.hash('#sql=v2.invalid');assert.equal(arrival.hidden,false);assert.match(s.$('[data-sql-arrival-info]').textContent,/无法读取/);assert.equal(incoming.hidden,false);
  await s.hash('#ordinary-anchor');assert.equal(arrival.hidden,true);assert.equal(incoming.hidden,true);
  Object.defineProperty(s.doc,'hidden',{configurable:true,value:true});s.doc.dispatchEvent(new s.dom.window.Event('visibilitychange'));
  await s.hash(hash);assert.equal(arrival.hidden,true);assert.equal(incoming.hidden,true);
  Object.defineProperty(s.doc,'hidden',{configurable:true,value:false});s.doc.dispatchEvent(new s.dom.window.Event('visibilitychange'));await flush();
  assert.equal(arrival.hidden,false);assert.equal(incoming.hidden,false);assert.equal(scrolls,1);assert.equal(s.calls.length,0);
 }finally{s.close()}
});

test('share URL and SQL preview use actual day/night theme surfaces with readable computed contrast',async()=>{
 const foundation=fs.readFileSync(path.join(__dirname,'../source/atelier/css/immersive.css'),'utf8');
 const css=fs.readFileSync(path.join(__dirname,'../source/atelier/css/research-sql.css'),'utf8');
 const palettes=[...foundation.matchAll(/--bg:(#[\da-f]{6});--surface:(#[\da-f]{6});--ink:(#[\da-f]{6});/gi)];assert.equal(palettes.length,2);
 const luminance=color=>{const rgb=color.startsWith('#')?color.slice(1).match(/../g).map(v=>parseInt(v,16)):color.match(/\d+/g).slice(0,3).map(Number);return rgb.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)};
 for(let theme=0;theme<2;theme++){
  const s=await setup();
  try{
   s.doc.body.className=theme?'nijika':'nijika light';
   const [,bg,surface,ink]=palettes[theme],variables={'--bg':bg,'--surface':surface,'--ink':ink};
   // jsdom does not resolve inherited CSS variables. Resolve only real palette
   // tokens, then evaluate the unmodified selector/declaration cascade in DOM.
   const style=s.doc.createElement('style');style.textContent=css.replace(/var\((--(?:bg|surface|ink))\)/g,(_,name)=>variables[name]);s.doc.head.append(style);
   for(const selector of ['[data-sql-share-url]','[data-sql-incoming-sql]']){
    const computed=s.dom.window.getComputedStyle(s.$(selector));
    const expected=surface.slice(1).match(/../g).map(v=>parseInt(v,16));assert.equal(computed.backgroundColor,`rgb(${expected.join(', ')})`,selector);
    const [hi,lo]=[luminance(computed.color),luminance(computed.backgroundColor)].sort((a,b)=>b-a);
    assert.ok((hi+.05)/(lo+.05)>=7,`${theme?'night':'day'} ${selector} contrast`);
   }
   const soft=s.dom.window.getComputedStyle(s.$('[data-sql-lab]')).getPropertyValue('--sql-soft').trim();
   assert.equal(soft,theme?'#17302d':'#e7eeea','actual nijika theme selector controls panel palette');
   const [hi,lo]=[luminance(ink),luminance(soft)].sort((a,b)=>b-a);assert.ok((hi+.05)/(lo+.05)>=7);
  }finally{s.close()}
 }
});

test('explicit Close and Ignore restore keyboard focus without scroll; passive dismissal never steals it',async()=>{
 const s=await setup(),{encodeSqlShare}=await share;
 try{
  const shareButton=s.$('[data-sql-share]'),dataset=s.$('[data-sql-dataset]');
  const focusOptions=[];
  for(const node of [shareButton,dataset]){const focus=node.focus.bind(node);node.focus=options=>{focusOptions.push(options);focus(options)}}
  shareButton.click();await flush();s.$('[data-sql-share-close]').focus();s.$('[data-sql-share-close]').click();
  assert.equal(s.doc.activeElement,shareButton);assert.deepEqual(focusOptions.at(-1),{preventScroll:true});
  await s.hash(encodeSqlShare(await sample()));s.$('[data-sql-incoming-ignore]').focus();s.$('[data-sql-incoming-ignore]').click();
  assert.equal(s.doc.activeElement,dataset);assert.deepEqual(focusOptions.at(-1),{preventScroll:true});
  shareButton.click();await flush();s.editor().focus();const field=s.editor();field.value='new';field.dispatchEvent(new s.dom.window.Event('input'));
  assert.equal(s.doc.activeElement,field);assert.equal(s.$('[data-sql-share-panel]').hidden,true);
  await s.hash(encodeSqlShare(await sample('new arrival')));await s.hash('#plain');assert.equal(s.doc.activeElement,field);
  s.dom.window.dispatchEvent(new s.dom.window.Event('pagehide'));assert.equal(s.doc.activeElement,field);
  assert.equal(focusOptions.length,2);
 }finally{s.close()}
});

test('Escape dismisses only the focused inline share panel and returns focus without stealing global keyboard intent',async()=>{
 const s=await setup();
 try{
  const panel=s.$('[data-sql-share-panel]'),trigger=s.$('[data-sql-share]');let options,globalEscapes=0;
  const focus=trigger.focus.bind(trigger);trigger.focus=value=>{options=value;focus(value)};
  s.doc.addEventListener('keydown',event=>{if(event.key==='Escape')globalEscapes++});
  const key=(node,extra={})=>{const event=new s.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true,...extra});node.dispatchEvent(event);return event};
  trigger.click();await flush();assert.equal(s.doc.activeElement,s.$('[data-sql-share-url]'));
  assert.equal(key(s.doc.activeElement,{isComposing:true}).defaultPrevented,false);assert.equal(panel.hidden,false);
  const ignored=new s.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});ignored.preventDefault();panel.dispatchEvent(ignored);assert.equal(panel.hidden,false);
  const baseline=globalEscapes;
  assert.equal(key(s.doc.activeElement).defaultPrevented,true);assert.equal(panel.hidden,true);assert.equal(s.doc.activeElement,trigger);assert.deepEqual(options,{preventScroll:true});assert.equal(globalEscapes,baseline);
  trigger.click();await flush();s.editor().focus();
  assert.equal(key(s.editor()).defaultPrevented,false);assert.equal(panel.hidden,false);assert.equal(s.doc.activeElement,s.editor());assert.equal(globalEscapes,baseline+1);
  assert.equal(key(panel).defaultPrevented,false);assert.equal(panel.hidden,false);assert.equal(s.doc.activeElement,s.editor());
  s.$('[data-sql-share-close]').focus();assert.equal(key(s.doc.activeElement).defaultPrevented,true);assert.equal(panel.hidden,true);assert.equal(s.doc.activeElement,trigger);
  assert.equal(key(panel).defaultPrevented,false);assert.equal(s.doc.activeElement,trigger);
 }finally{s.close()}
});

test('SQL action fonts and URL stay readable on desktop and mobile, with mobile editable SQL at 16px',async()=>{
 const css=fs.readFileSync(path.join(__dirname,'../source/atelier/css/research-sql.css'),'utf8');
 for(const width of [1280,390]){
  const s=await setup();
  try{
   const sheet=s.doc.createElement('style');sheet.textContent=css;s.doc.head.append(sheet);
   // jsdom lacks viewport media evaluation. Flatten matching real media rules
   // in their original position, preserving the stylesheet's selector cascade.
   const flatten=rules=>Array.from(rules).map(rule=>{
    if(rule.type!==s.dom.window.CSSRule.MEDIA_RULE)return rule.cssText.replace(/font:\s*([^;]+);/g,(declaration,value)=>{
     // jsdom incorrectly lets a font shorthand beat a later font-size. Expand
     // valid shorthands to equivalent longhands before the real DOM cascade.
     const probe=s.doc.createElement('span');probe.style.font=value;
     if(!probe.style.fontSize)return declaration;
     return ['font-style','font-variant','font-weight','font-stretch','font-size','line-height','font-family'].map(name=>probe.style.getPropertyValue(name)?`${name}:${probe.style.getPropertyValue(name)};`:'').join('');
    });
    const max=rule.conditionText.match(/^\(max-width:\s*(\d+)px\)$/);
    return max&&width<=Number(max[1])?flatten(rule.cssRules):'';
   }).join('\n');
   const resolved=flatten(sheet.sheet.cssRules);sheet.textContent=resolved;
   s.controller.run();s.requests[0].resolve({...((await core).SQL_CASES[0].expected),truncated:false});await flush();
   for(const node of s.doc.querySelectorAll('[data-sql-lab] button'))assert.ok(parseFloat(s.dom.window.getComputedStyle(node).fontSize)>=13,`${width}px: ${node.textContent}`);
   assert.ok(parseFloat(s.dom.window.getComputedStyle(s.$('[data-sql-share-url]')).fontSize)>=(width<=650?16:13),`${width}px URL font: ${s.dom.window.getComputedStyle(s.$('[data-sql-share-url]')).fontSize}`);
   assert.equal(parseFloat(s.dom.window.getComputedStyle(s.editor()).fontSize),width<=650?16:13);
  }finally{s.close()}
 }
});
