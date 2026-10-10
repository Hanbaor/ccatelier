// Route enhancements are discovered from the rendered DOM, including prefixed deployments.
export const routeFeatures = [
 {id:'backstage',selector:'[data-backstage-scene]',label:'场景互动',load:()=>import('./backstage.js'),init:'initBackstage'},
 {id:'archive',selector:'[data-archive]',label:'笔记筛选',load:()=>import('./archive.js'),init:'initArchive',status:'.archive-fallback'},
 {id:'reader',selector:'.reading-studio .article-body',label:'阅读工具',load:()=>import('./reader.js'),init:'initReader',status:'.reader-options .reader-options-body',controls:'#reader-find,[data-find-prev],[data-find-next],[data-find-clear],[data-reader-size],[data-reader-size-cycle],[data-reader-leading],[data-reader-width],[data-speech-play],[data-speech-pause],[data-speech-stop],[data-speech-rate]'},
 {id:'notebook',selector:'.article-body',label:'页边札记',load:()=>import('./notebook.js'),init:'initNotebook',status:'.reader-options .reader-options-body',controls:'[data-notebook-open]'},
 {id:'code',selector:'.article-body .code-container',label:'代码工作台',load:()=>import('./code-studio.js'),init:'initCodeStudio',status:'.article-body'},
 {id:'algorithm-demo',selector:'[data-algorithm-demo]',label:'示例拆解',load:()=>import('./algorithm-demo.js'),init:'initAlgorithmDemo',status:'[data-algorithm-demo] .algorithm-demo-body'},
 {id:'studio',selector:'[data-studio]',label:'节奏实验室',load:()=>import('./studio.js'),init:'initStudio'}
];
const documents = new WeakMap();

export function initRouteFeatures({root=document,loaders={}}={}) {
 let records=documents.get(root);if(!records){records=new Map();documents.set(root,records);}
 return Promise.all(routeFeatures.filter(feature=>root.querySelector(feature.selector)).map(feature=>{
  if(records.has(feature.id))return records.get(feature.id).ready;
  const record=startFeature(feature,{root,load:loaders[feature.id]||feature.load});records.set(feature.id,record);return record.ready;
 }));
}

// Keep only the latest intentional action and field values while a module is arriving.
// Audio always requires a new gesture; no delayed playback can follow a menu or page exit.
export function startFeature(feature,{root=document,load=feature.load}={}) {
 const doc=root.ownerDocument||root,win=doc.defaultView,host=root.querySelector(feature.selector);
 const place=(feature.status&&root.querySelector(feature.status))||host;
 const notice=doc.createElement('p');notice.className='sr-only';notice.dataset.featureStatus=feature.id;notice.dataset.readerExclude='';notice.setAttribute('role','status');notice.textContent=feature.label+'正在加载…';place.prepend(notice);
 let state='loading',intent=null,gesture=false,selection=false,initializing=false,codeReferenceAllowed=true;
 const values=new Map(),composing=new Set(),cleanups=[];
 function listen(target,type,handler,capture=false){target.addEventListener(type,handler,capture);cleanups.push(()=>target.removeEventListener(type,handler,capture));}
 function cancelIntent(){intent=null;gesture=false;selection=false;codeReferenceAllowed=false;}
 function capture(event){
  if(state==='ready')return;
  const target=event.target.closest?.(feature.controls||'[data-no-route-control]');
  const shortcut=feature.id==='studio'&&event.type==='keydown'&&!event.repeat&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.target.closest?.('input,textarea,select,button,[contenteditable]')&&!doc.querySelector('dialog[open]')&&(event.code==='Space'||'asdfgh'.includes(event.key?.toLowerCase())&&event.key?.length===1);
  if(!target&&!shortcut)return;
  if(event.type==='click'&&!target?.matches('button'))return;
  if(event.type==='keydown'&&(event.isComposing||composing.has(target)))return;
  if(event.type==='keydown'&&!shortcut&&!(target?.id==='reader-find'&&event.key==='Enter'))return;
  if(event.type==='compositionstart'){composing.add(target);cancelIntent();return;}
  if(event.type==='input'||event.type==='change'||event.type==='compositionend'){
   if(event.type==='compositionend')composing.delete(target);
   else if(event.isComposing)composing.add(target);
   values.set(target,{value:target.value,type:event.type});cancelIntent();return;
  }
  event.preventDefault();event.stopImmediatePropagation();
  if(shortcut||target?.matches('[data-speech-play],[data-speech-pause],[data-speech-stop]')){gesture=true;intent=null;}
  else{gesture=false;intent={target,type:event.type,key:event.key,shiftKey:event.shiftKey};}
  notice.className='live-status';if(state==='loading')notice.textContent=feature.label+'正在加载，请稍候…';
 }
 for(const type of ['click','keydown','input','change','compositionstart','compositionend'])listen(doc,type,capture,true);
 if(feature.id==='notebook')listen(doc,'selectionchange',()=>{selection=true;});
 listen(win,'pagehide',cancelIntent);listen(doc,'atelier:dialog-open',cancelIntent);listen(doc,'visibilitychange',()=>{if(doc.hidden)cancelIntent();});
 const codeCleanups=[];
 function clearCodeGuards(){codeCleanups.splice(0).forEach(fn=>fn());}
 function guardCodeReference(){
  if(feature.id!=='code')return;clearCodeGuards();
  function on(target,type,fn,capture=false){target.addEventListener(type,fn,capture);codeCleanups.push(()=>target.removeEventListener(type,fn,capture));}
  for(const type of ['pointerdown','touchstart','wheel','keydown'])on(doc,type,()=>{codeReferenceAllowed=false;},true);
  on(win,'scroll',()=>{codeReferenceAllowed=false;});
  on(win,'popstate',()=>{codeReferenceAllowed=false;});
  on(win,'hashchange',()=>{codeReferenceAllowed=true;});
  on(win,'pagehide',()=>{codeReferenceAllowed=false;clearCodeGuards();});
 }
 function cleanup(){clearCodeGuards();cleanups.splice(0).forEach(fn=>fn());}
 const record={ready:null};
 function run(){
  guardCodeReference();
  state='loading';notice.replaceChildren(doc.createTextNode(feature.label+'正在加载…'));notice.setAttribute('aria-busy','true');
  record.ready=Promise.resolve().then(load).then(module=>{
   initializing=true;return feature.id==='code'?module[feature.init]({initialReference:codeReferenceAllowed}):module[feature.init]();
  }).then(()=>{
   state='ready';notice.removeAttribute('aria-busy');cleanup();
   for(const [target,{value,type}] of values){if(target.isConnected){target.value=value;if(!composing.has(target))target.dispatchEvent(new win.Event(type,{bubbles:true}));}}
   values.clear();
   const latest=intent;intent=null;
   if(!doc.hidden&&!doc.querySelector('dialog[open]')){
    if(selection)doc.dispatchEvent(new win.Event('selectionchange'));
    if(latest?.target.isConnected){if(latest.type==='click')latest.target.click();else latest.target.dispatchEvent(new win.KeyboardEvent('keydown',{key:latest.key,shiftKey:latest.shiftKey,bubbles:true,cancelable:true}));}
   }
   if(gesture){notice.className='live-status';notice.textContent=feature.label+'已就绪，请再次按下播放或演奏快捷键。';}else notice.remove();
   return {id:feature.id,status:'ready'};
  }).catch(()=>{
   clearCodeGuards();
   state='failed';intent=null;gesture=false;selection=false;notice.className='live-status';notice.removeAttribute('aria-busy');notice.replaceChildren(doc.createTextNode(feature.label+'暂未载入，正文和导航仍可使用。 '));
   const retry=doc.createElement('button');retry.type='button';retry.textContent=initializing?'刷新页面':'重新加载';retry.addEventListener('click',()=>{if(initializing)win.location.reload();else run();});notice.append(retry);
   return {id:feature.id,status:'failed'};
  });
  return record.ready;
 }
 run();return record;
}
