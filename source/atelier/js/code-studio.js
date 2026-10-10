import {$,$$,toast} from './ui.js';
import {element,action,download} from './archive-store.js';
import {makeDialog} from './live-dialog.js';
import {extractCode,digestCode,parseCodeReference,codeReferenceURL,resolveCodeReference,validRange} from './code-reference-core.mjs';
const controllers=new WeakMap();
export function initCodeStudio({initialReference=true,digest=digestCode}={}){
 const doc=document,win=doc.defaultView,containers=$$('.article-body .code-container');if(!containers.length)return;
 if(controllers.has(doc))return controllers.get(doc);
 const {dialog,open}=makeDialog('code-studio-dialog','代码工作台'),tools=element('div','live-dialog-tools'),lines=element('div','code-lines'),status=element('p','live-status');
 status.setAttribute('role','status');dialog.classList.add('code-studio');
 const notice=element('p','code-reference-status');notice.hidden=true;notice.dataset.readerExclude='';notice.setAttribute('role','status');containers[0].closest('.article-body').prepend(notice);
 let code='',language='text',active=null,selection=null,anchor=0,extend=false,navigation=0,copyTicket=0;
 const cache=new Map();
 function clearMarks(){doc.querySelectorAll('.code-reference-line,.code-reference-gutter').forEach(node=>node.classList.remove('code-reference-line','code-reference-gutter'));notice.hidden=true;}
 function cancelNavigation(){navigation++;}
 function lineTargets(container,text,{start,end}){
  const source=$$('.code .line',container),gutter=$$('.gutter .line',container);
  if(extractCode(container)!==text)throw new Error('代码已变化或无法唯一定位。');
  if(source.length!==text.split('\n').length)throw new Error('这段代码暂不支持精确行定位。');
  if(source.slice(start-1,end).some((line,i)=>!line.textContent.trim()&&(!gutter[start-1+i]?.textContent.trim()||gutter.length!==source.length)))throw new Error('这段代码的空白行暂不支持精确定位。');
  return source;
 }
 async function blocks(){return Promise.all(containers.map(async container=>{const text=extractCode(container);let result=cache.get(text);if(!result){result=Promise.resolve().then(()=>digest(text));cache.set(text,result);result.catch(()=>cache.delete(text));}return {container,code:text,digest:await result};}));}
 function showSelection(start,end){
  copyTicket++;selection=validRange(start,end,lines.children.length)?{start,end}:null;
  [...lines.children].forEach((row,i)=>{const selected=!!selection&&i+1>=start&&i+1<=end;row.classList.toggle('line-focused',selected);row.querySelector('button').setAttribute('aria-pressed',String(selected));});
  copy.hidden=!selection;copy.disabled=false;extendButton.hidden=!selection;extend=false;extendButton.setAttribute('aria-pressed','false');
  status.textContent=selection?`第 ${start}${end===start?'':'–'+end} 行 / 共 ${lines.children.length} 行`:`${language.toUpperCase()} · ${lines.children.length} 行 · 点击行号聚焦`;
 }
 const copy=action('复制这段链接',async()=>{
  if(!selection||!active)return;const selected={...selection},container=active,current=++copyTicket;copy.disabled=true;
  try{const all=await blocks();if(current!==copyTicket||!dialog.open)return;const block=all.find(item=>item.container===container);resolveCodeReference({...selected,block:block.digest},all);lineTargets(container,block.code,selected);if(block.code!==code)throw new Error('代码已变化或无法唯一定位。');const url=codeReferenceURL(win.location.href,{...selected,block:block.digest});await win.navigator.clipboard.writeText(url);if(current===copyTicket)status.textContent='这段代码的链接已复制。';}
  catch(error){if(current===copyTicket)status.textContent=error.message==='代码已变化或无法唯一定位。'?error.message:/^当前浏览器不支持|^这段代码/.test(error.message)?error.message:'无法复制引用链接，请重试。';}
  finally{if(current===copyTicket)copy.disabled=false;}
 });copy.hidden=true;copy.dataset.codeReferenceCopy='';
 const extendButton=action('选择终点',()=>{extend=!extend;extendButton.setAttribute('aria-pressed',String(extend));status.textContent=extend?'点击一个行号作为终点。':`第 ${selection.start}–${selection.end} 行`;});extendButton.hidden=true;extendButton.setAttribute('aria-pressed','false');extendButton.dataset.codeReferenceExtend='';
 const wrap=action('自动换行',()=>{const value=lines.classList.toggle('wrapped');wrap.setAttribute('aria-pressed',String(value));});wrap.setAttribute('aria-pressed','false');
 const jump=element('input','code-line-jump');jump.type='number';jump.min='1';jump.placeholder='行号';jump.setAttribute('aria-label','跳转行号');
 function focus(number){if(!validRange(number,number,lines.children.length))return;anchor=number;showSelection(number,number);lines.children[number-1].scrollIntoView({block:'center'});}
 tools.append(wrap,action('复制全部',async()=>{try{await win.navigator.clipboard.writeText(code);toast('代码已复制');}catch{toast('复制失败，请选中代码复制');}}),action('下载源码',()=>{const ext={javascript:'js',js:'js',typescript:'ts',python:'py',cpp:'cpp',c:'c',java:'java',html:'html',css:'css',json:'json',bash:'sh',shell:'sh',sql:'sql'}[language.toLowerCase()]||'txt';download('cc-code.'+ext,code,'text/plain;charset=utf-8');}),jump,action('跳转',()=>focus(Number(jump.value))),extendButton,copy);dialog.append(tools,status,lines);
 containers.forEach(container=>{const button=action('工作台 ↗',()=>{
  cancelNavigation();active=container;code=extractCode(container);language=$('[data-rel]',container)?.dataset.rel||container.dataset.rel||'text';lines.replaceChildren();anchor=0;
  code.split('\n').forEach((text,i)=>{const row=element('div'),number=action(String(i+1),event=>{const at=i+1;if(anchor&&(extend||event.shiftKey)){showSelection(Math.min(anchor,at),Math.max(anchor,at));}else if(selection?.start===at&&selection.end===at){anchor=0;showSelection(0,0);}else{anchor=at;showSelection(at,at);}});number.addEventListener('keydown',event=>{if(event.shiftKey&&(event.key==='Enter'||event.key===' ')){event.preventDefault();if(anchor)showSelection(Math.min(anchor,i+1),Math.max(anchor,i+1));else{anchor=i+1;showSelection(anchor,anchor);}}});number.setAttribute('aria-label','选择第 '+(i+1)+' 行');number.setAttribute('aria-pressed','false');row.append(number,element('code','',text||' '));lines.append(row);});
  jump.max=String(lines.children.length);showSelection(0,0);open();
 },'code-workbench-open');button.dataset.readerExclude='';container.append(button);});
 async function locate(){
  const current=++navigation,hash=win.location.hash;clearMarks();
  try{
   const reference=parseCodeReference(hash);if(!reference)return;
   const all=await blocks();if(current!==navigation||win.location.hash!==hash||doc.hidden||doc.querySelector('dialog[open]'))return;
   const block=resolveCodeReference(reference,all),source=lineTargets(block.container,block.code,reference);
   source.slice(reference.start-1,reference.end).forEach(line=>line.classList.add('code-reference-line'));
   $$('.gutter .line',block.container).slice(reference.start-1,reference.end).forEach(line=>line.classList.add('code-reference-gutter'));
   let parent=block.container;while(parent){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}
   source[reference.start-1].scrollIntoView({block:'center',behavior:'instant'});
  }catch(error){if(current!==navigation||win.location.hash!==hash)return;notice.textContent=error.message;notice.hidden=false;}
 }
 win.addEventListener('hashchange',locate);win.addEventListener('pagehide',cancelNavigation);
 // Cancel unfinished navigation only. Our completed scroll keeps its highlights.
 win.addEventListener('scroll',cancelNavigation,{passive:true});win.addEventListener('popstate',cancelNavigation);
 doc.addEventListener('visibilitychange',()=>{if(doc.hidden)cancelNavigation();});doc.addEventListener('atelier:dialog-open',cancelNavigation);
 for(const event of ['pointerdown','touchstart','wheel','keydown'])doc.addEventListener(event,cancelNavigation,{passive:true});
 dialog.addEventListener('close',()=>{copyTicket++;cancelNavigation();});
 const controller={locate};controllers.set(doc,controller);if(initialReference)locate();return controller;
}
