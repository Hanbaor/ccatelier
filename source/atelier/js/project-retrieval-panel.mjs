export {publishedWriting} from './project-retrieval-core.mjs';
import {inspectRetrieval} from './project-retrieval-core.mjs';
import {searchResultText} from './search-context.mjs';
const instances=new WeakMap();
export function initRetrieval(host,{loadIndex,timeoutMs=8000,base=host.ownerDocument.baseURI}={}) {
  if(instances.has(host))return instances.get(host);
  const doc=host.ownerDocument,win=doc.defaultView,form=host.querySelector('form'),input=form.elements.query,status=host.querySelector('[data-retrieval-status]'),list=host.querySelector('[data-retrieval-results]');
  const parents=[];for(let node=host.parentElement;node;node=node.parentElement)if(node.matches('details'))parents.push(node);
  const visible=()=>host.open&&parents.every(node=>node.open);
  let entries=null,controller=null,epoch=0,active=true,timer,composing=false;
  function cancel(){clearTimeout(timer);epoch++;controller?.abort();controller=null;form.removeAttribute('aria-busy');}
  function parts(parent,items){for(const item of items){const node=doc.createElement(item.match?'mark':'span');node.textContent=item.text;parent.append(node);}}
  function render(){
    const result=inspectRetrieval(entries,input.value,{mode:form.elements.mode.value,base});list.replaceChildren();
    status.textContent=result.terms.length ? `找到 ${result.total} 篇，显示前 ${result.results.length} 篇。标题命中计 5，正文命中计 1；分数不是置信度。` : '请输入关键词。';
    if(result.terms.length&&!result.total)status.textContent+=' 试试减少关键词，或改为「至少一个」。';
    result.results.forEach((item,index)=>{
      const li=doc.createElement('li'),link=doc.createElement('a'),excerpt=doc.createElement('p'),why=doc.createElement('small');
      const presentation=searchResultText(item.entry,result.terms.join(' '));
      link.href=item.href;parts(link,presentation.title);parts(excerpt,presentation.excerpt);
      why.textContent=`${item.score} 分 · `+item.evidence.map(e=>`${e.term}：${e.where==='title'?'标题 +5':e.where==='body'?'正文 +1':'未命中'}`).join('；');
      if(!presentation.excerpt.length)excerpt.textContent='没有可安全显示的短摘录，请打开原文。';
      li.append(link,excerpt,why);list.append(li);
    });
  }
  async function run(event){
    event?.preventDefault();if(event?.isComposing||composing||!visible()||!active)return;
    cancel();const id=epoch;list.replaceChildren();
    try{
      if(!input.value.trim()){status.textContent='请输入关键词。';return;}
      // Validate before any request and keep search terms inside the browser.
      inspectRetrieval([],input.value);
      if(!entries){
        controller=new win.AbortController();form.setAttribute('aria-busy','true');status.textContent='正在载入公开文章索引…';
        const request=loadIndex(controller.signal);
        const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller?.abort();reject(Error('Index timeout'));},timeoutMs);});
        const data=await Promise.race([request,timeout]);
        if(id!==epoch||!visible()||!active)return;
        if(!Array.isArray(data))throw Error('索引格式无效');entries=data;
      }
      if(id===epoch&&visible()&&active)render();
    }catch(error){const message=typeof error?.message==='string'?error.message:'';if(id===epoch&&visible()&&active)status.textContent=message.startsWith('请')||message.startsWith('最多')?message:'文章索引暂未载入，请再次点击「检索」。';}
    finally{if(id===epoch){clearTimeout(timer);controller=null;form.removeAttribute('aria-busy');}}
  }
  function toggle(){if(!visible()){cancel();status.textContent=entries?'输入关键词后点击「检索」。':'点击「检索」后载入公开文章索引。';}}
  function leave(){active=false;cancel();status.textContent='点击「检索」查看当前条件。';}
  function resume(){active=true;}
  function compositionStart(){composing=true;cancel();}
  function compositionEnd(){composing=false;}
  function protectIME(event){if(event.key==='Enter'&&(composing||event.isComposing||event.keyCode===229))event.preventDefault();}
  function invalidate(){cancel();list.replaceChildren();status.textContent='点击「检索」查看当前条件。';}
  form.hidden=false;status.textContent='点击「检索」后载入公开文章索引。';
  form.addEventListener('compositionstart',compositionStart);form.addEventListener('compositionend',compositionEnd);form.addEventListener('keydown',protectIME);
  form.addEventListener('submit',run);form.addEventListener('input',invalidate);form.addEventListener('change',invalidate);host.addEventListener('toggle',toggle);parents.forEach(node=>node.addEventListener('toggle',toggle));win.addEventListener('pagehide',leave);win.addEventListener('pageshow',resume);
  const api={destroy(){cancel();form.removeEventListener('compositionstart',compositionStart);form.removeEventListener('compositionend',compositionEnd);form.removeEventListener('keydown',protectIME);form.removeEventListener('submit',run);form.removeEventListener('input',invalidate);form.removeEventListener('change',invalidate);host.removeEventListener('toggle',toggle);parents.forEach(node=>node.removeEventListener('toggle',toggle));win.removeEventListener('pagehide',leave);win.removeEventListener('pageshow',resume);instances.delete(host);}};
  instances.set(host,api);return api;
}
