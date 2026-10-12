// Small route bootstrap only. No module or index is requested while collapsed.
export function attachRetrieval(host,{load=()=>import('./project-retrieval-panel.mjs'),indexURL=host.dataset.retrievalIndex,fetchIndex=host.ownerDocument.defaultView.fetch?.bind(host.ownerDocument.defaultView),timeoutMs=8000}={}) {
  const win=host.ownerDocument.defaultView,status=host.querySelector('[data-retrieval-status]');
  const parents=[];for(let node=host.parentElement;node;node=node.parentElement)if(node.matches('details'))parents.push(node);
  const visible=()=>host.open&&parents.every(node=>node.open);
  let pending=null,active=true,disposed=false,failed=false,started=false,instance;
  const usable=()=>visible()&&active&&!disposed&&host.isConnected;
  function release(attempt){
    if(!attempt||pending!==attempt)return false;
    pending=null;win.clearTimeout(attempt.timer);status.removeAttribute('aria-busy');return true;
  }
  function fail(attempt,message){
    if(!release(attempt))return;failed=true;
    if(usable())status.textContent=message;
  }
  function open(){
    if(!usable()||started||pending||failed)return;
    const attempt={timer:null};pending=attempt;
    status.textContent='正在载入检索工具…';status.setAttribute('aria-busy','true');
    // Native imports cannot be aborted; abandon only this wait and its right to initialize.
    attempt.timer=win.setTimeout(()=>fail(attempt,'检索工具载入超时，请收起后重新打开重试；若仍无法载入，请刷新页面。'),timeoutMs);
    try{
      Promise.resolve(load()).then(module=>{
        if(pending!==attempt)return;
        if(!usable()){release(attempt);return;}
        release(attempt);started=true;
        try{
          instance=module.initRetrieval(host,{loadIndex:async signal=>{
            const url=new URL(indexURL,host.ownerDocument.baseURI);
            if(url.origin!==new URL(host.ownerDocument.baseURI).origin)throw Error('Index must be same-origin');
            const response=await fetchIndex(url.href,{signal,credentials:'same-origin'});
            if(!response.ok)throw Error('Index unavailable');return module.publishedWriting(await response.json());
          }});
        }catch{
          // Initialization may have installed listeners before throwing. Never bind them again.
          host.querySelector('form').hidden=true;status.textContent='检索工具未能完成初始化，请刷新页面后再试。';
        }
      },()=>fail(attempt,'检索工具暂未载入，请收起后重新打开重试；若仍无法载入，请刷新页面。'));
    }catch{fail(attempt,'检索工具暂未载入，请收起后重新打开重试；若仍无法载入，请刷新页面。');}
  }
  function cancel(message){release(pending);failed=false;if(!started)status.textContent=message;}
  function toggle(){if(!visible())cancel('重新打开后载入检索工具。');else open();}
  function leave(){active=false;cancel('返回页面后载入检索工具。');}
  function resume(){active=true;if(visible())open();}
  host.addEventListener('toggle',toggle);parents.forEach(node=>node.addEventListener('toggle',toggle));win.addEventListener('pagehide',leave);win.addEventListener('pageshow',resume);
  if(visible())open();
  return ()=>{if(disposed)return;disposed=true;cancel('检索工具已停止，请刷新页面后再试。');instance?.destroy();host.removeEventListener('toggle',toggle);parents.forEach(node=>node.removeEventListener('toggle',toggle));win.removeEventListener('pagehide',leave);win.removeEventListener('pageshow',resume);};
}

const mounted=new WeakMap();
export function initProjectRetrieval({root=document}={}) {
  for(const host of root.querySelectorAll('[data-project-retrieval]')) {
    if(!mounted.has(host))mounted.set(host,attachRetrieval(host));
    // A visitor may open details while the tiny route bootstrap is arriving.
    if(host.open)host.dispatchEvent(new host.ownerDocument.defaultView.Event('toggle'));
  }
}
