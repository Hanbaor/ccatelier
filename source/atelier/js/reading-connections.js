import {element,action,root} from './archive-store.js';
import {safeResultURL} from './search-core.mjs';
import {validateConnections,connectedArticles} from './reading-trail-core.mjs';

export function createReadingConnections(host,{load=async signal=>{
 const response=await fetch(root+'atelier/data/connections.json',{signal});
 if(!response.ok)throw Error();return response.json();
},articleHref=path=>path,resolveURL}={}){
 const panel=element('details','reading-connections'),summary=element('summary','','循文而读'),body=element('div','reading-connections-body');
 panel.hidden=true;panel.append(summary,body);host.append(panel);
 let posts=[],selected='',active=true,index=null,pending=null,controller,revision=0,selectionKey='',completedKey=null,links=[];
 // Snapshot the fields that affect ranking or visible evidence, including order.
 // A copied array or an in-place metadata edit must not fool the resume check.
 const keyFor=(next,path)=>JSON.stringify([path,next.map(p=>[p.path,p.title,p.minutes,!!p.exercise,p.exercise?.hasCode,p.exercise?.hasAnalysis])]);
 function validURL(path,anchor=''){
  // Trusted adapters may resolve exact packaged paths without an HTTP origin.
  if(resolveURL)return resolveURL(path,anchor);
  const url=safeResultURL(path+(anchor?'#'+encodeURIComponent(anchor):''),location.origin+root);
  return url&&url.startsWith(root)?articleHref(url):null;
 }
 function setLink(link,path,anchor=''){
  const url=validURL(path,anchor);if(url)link.href=url;else link.removeAttribute('href');
 }
 function refreshLinks(){for(const {link,path,anchor} of links)setLink(link,path,anchor);}
 function source(label,path,evidence){
  const section=element('div','connection-source'),link=element('a','',label+' · '+(evidence.kind==='code'?'代码':'正文'));
  setLink(link,path,evidence.anchor);links.push({link,path,anchor:evidence.anchor});
  const quote=element('p','connection-excerpt',(evidence.before?'…':'')+evidence.excerpt+(evidence.after?'…':''));
  section.append(link,quote);return section;
 }
 function render(){
  completedKey=null;links=[];
  body.replaceChildren(element('p','connection-note','按当前筛选内的共同术语排列；只表示原文出现同一术语，不代表先修关系或推荐学习顺序。较少见的术语权重更高。'));
  const matches=connectedArticles(index,posts,selected);
  if(!matches.length){body.append(element('p','connection-empty','当前筛选内还没有足够的共同术语证据。可以换一篇文章或放宽筛选。'));completedKey=selectionKey;return;}
  const list=element('ol','connection-list');
  for(const {post,shared} of matches){
   const row=element('li'),title=element('a','connection-title',post.title),url=validURL(post.path);if(!url)continue;title.href=url;links.push({link:title,path:post.path,anchor:''});row.append(title);
   const labels=[post.minutes+' 分钟'];if(post.exercise){labels.push(post.exercise.hasCode?'已有代码':'题面');if(!post.exercise.hasAnalysis)labels.push('解析待补');}
   row.append(element('small','connection-state',labels.join(' · ')));
   row.append(element('p','connection-concepts','共同出现：'+shared.map(e=>e.concept).join('、')));
   // Show the two strongest witnesses; retain all shared concepts in the explanation.
   for(const item of shared.slice(0,2)){
    const pair=element('div','connection-pair');pair.append(element('strong','',item.concept),source('所选文章',selected,item.from),source('这篇文章',post.path,item.to));row.append(pair);
   }
   list.append(row);
  }
  body.append(list);completedKey=selectionKey;
 }
 async function show(){
  if(!active||!panel.open||panel.hidden||!selected)return;
  const ticket=++revision;
  if(!document.querySelector('link[data-reading-connections],style[data-reading-connections]')){const style=document.createElement('link');style.rel='stylesheet';style.href=root+'atelier/css/reading-connections.css';style.dataset.readingConnections='';style.addEventListener('error',()=>style.remove(),{once:true});document.head.append(style);}
  if(completedKey===selectionKey){refreshLinks();return;}
  if(index){render();return;}
  // A focused retry is about to be removed. Preserve keyboard ownership now,
  // never after an asynchronous response when the visitor may have moved on.
  if(body.contains(document.activeElement))summary.focus({preventScroll:true});
  body.replaceChildren(element('p','connection-status','正在寻找原文中的共同术语…'));body.firstChild.setAttribute('role','status');
  if(!pending||controller?.signal.aborted){
   controller=new AbortController();const own=controller,timeout=setTimeout(()=>own.abort(),8000);
   const work=Promise.resolve().then(()=>load(own.signal)).then(data=>validateConnections(data,root));pending=work;
   work.finally(()=>{clearTimeout(timeout);if(pending===work)pending=null;}).catch(()=>{});
  }
  try{const result=await pending;if(ticket!==revision||!active||!panel.open||panel.hidden)return;index=result;render();}
  catch{if(ticket!==revision||!active||!panel.open||panel.hidden)return;const status=element('p','connection-status','原文关联暂时无法载入。');status.setAttribute('role','status');status.append(action('重试',show));body.replaceChildren(status);}
 }
 panel.addEventListener('toggle',()=>{revision++;if(panel.open)show();});
 return {select(next,path){revision++;posts=next;selected=path;selectionKey=keyFor(next,path);active=true;panel.hidden=!path;
  if(completedKey===selectionKey)refreshLinks();else{completedKey=null;links=[];body.replaceChildren();}
  if(path&&panel.open)show();},pause(){active=false;revision++;controller?.abort();pending=null;}};
}
