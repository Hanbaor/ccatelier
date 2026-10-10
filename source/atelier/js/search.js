import {$, $$, openDialog} from './ui.js';
import {offlineMessage} from './offline-client.js';
import {findEntries, safeResultURL, searchInputAction} from './search-core.mjs';

export function initSearch({loadOffline=()=>offlineMessage({type:'search-index'}),loadContext=()=>import('./search-context.mjs')}={}) {
  const input = $('#search-input'), box = $('#search-results');
  const dialog=$('#search-dialog'),scope=$('#search-scope'),status=$('#search-status');
  const states={site:{entries:null,pending:false,error:'',id:0},offline:{entries:null,pending:false,error:'',id:0,unavailable:0}};
  const current=()=>scope?.value==='offline'?'offline':'site';
  const root = document.body.dataset.root;
  const sections = [['笔记','notes/'],['项目','projects/'],['研究','research/'],['生活','life/'],['关于 CC','about/'],['节奏实验室','studio/'],['原创鼓谱排练室','studio/practice/']].map(([title,url]) => ({title,content:'',url:root+url,section:true}));
  function appendParts(element, parts) {
    for (const part of parts) {
      if (!part.match) { element.append(document.createTextNode(part.text)); continue; }
      const mark=document.createElement('mark');mark.textContent=part.text;element.append(mark);
    }
  }
  let formatResult,contextPending,copies=[];
  function enhance(copy,item,query) {
    if(!formatResult){copy.textContent=item.title || '未命名文章';return;}
    const parts=formatResult(item,query);copy.replaceChildren();appendParts(copy,parts.title);
    if(parts.excerpt.length){const excerpt=document.createElement('small');appendParts(excerpt,parts.excerpt);copy.append(excerpt);}
  }
  function loadPresentation() {
    if(formatResult || contextPending)return;
    contextPending=Promise.resolve().then(loadContext).then(module=>{
      if(typeof module.searchResultText!=='function')throw Error('Invalid search context');
      formatResult=module.searchResultText;
      // Enrich current copies in place: never replace a focused result link or
      // restore a stale query/scope when this optional module arrives late.
      if(dialog.open)for(const copy of copies)enhance(...copy);
    }).catch(()=>{}).finally(()=>{contextPending=null;});
  }
  function render() {
    const mode=current(),state=states[mode],{entries,pending,error}=state;
    if(status)status.textContent=mode==='offline'?'仅检索本浏览器已保存的公开文章版本，不含评论与私人札记。'+(state.unavailable?' 有 '+state.unavailable+' 篇副本无法读取。':''):'搜索全站文章与栏目；结果不代表已离线保存。';
    copies=[];box.replaceChildren(); box.setAttribute('aria-busy', String(Boolean(pending)));
    if (pending) { const p=document.createElement('p');p.className='search-empty';p.textContent='正在载入文章…';box.append(p);return; }
    if (error) {
      const p=document.createElement('p');p.className='search-empty';p.textContent=error;
      const retry=document.createElement('button');retry.type='button';retry.textContent='重试';retry.addEventListener('click',()=>load(current(),true));p.append(retry);box.append(p);return;
    }
    const results = findEntries(input.value, [...(entries || []), ...(mode==='site'?sections:[])]);
    if (!results.length) { const p=document.createElement('p');p.className='search-empty';p.textContent=mode==='offline'&&!entries?.length?(state.unavailable?'保存的副本暂时无法检索，请联网更新后重试。':'还没有可检索的离线文章。请在文章阅读工具中主动保存。'):'暂无匹配内容。';box.append(p);return; }
    for (const item of results) {
      const url = safeResultURL(item.url,location.origin+root); if (!url) continue;
      const link=document.createElement('a');link.className='search-result';link.href=url;
      const text=document.createElement('span');text.className='result-copy';
      copies.push([text,item,input.value]);enhance(text,item,input.value);
      const kind=document.createElement('small');kind.textContent=mode==='offline'?'离线副本':item.section?'栏目':'文章';link.append(text,kind);box.append(link);
    }
  }
  async function load(mode=current(),refresh=false) {
    const state=states[mode];
    if(!refresh&&(state.entries||state.pending))return;
    const id=++state.id;state.pending=true;state.error='';
    if(mode==='offline'){state.entries=null;state.unavailable=0;}
    render();
    const controller=new AbortController();let timeout;
    try {
      if(mode==='offline'){
        const result=await loadOffline();
        if(id!==state.id)return;
        if(!result||result.version!==1||!Array.isArray(result.entries))throw Error('当前离线服务暂不支持搜索，请联网刷新后重试。');
        state.entries=result.entries.filter(item=>item&&typeof item.title==='string'&&typeof item.content==='string'&&typeof item.url==='string');
        state.unavailable=Number.isSafeInteger(result.unavailable)&&result.unavailable>0?result.unavailable:0;
      }else{
        timeout=setTimeout(()=>controller.abort(),8000);
        const response=await fetch(document.body.dataset.search,{signal:controller.signal});
        if(!response.ok)throw Error();const result=await response.json();
        if(id!==state.id)return;
        if(!Array.isArray(result))throw Error();
        state.entries=result.filter(item=>item&&typeof item.title==='string'&&typeof item.url==='string');
      }
    }catch(error){if(id===state.id)state.error=mode==='offline'?(error.message||'离线副本暂时无法读取。'):'文章索引暂时无法载入。';}
    finally{clearTimeout(timeout);if(id===state.id){state.pending=false;render();}}
  }
  function openSearch() {openDialog('search-dialog');input.focus();render();load(current(),current()==='offline');loadPresentation();}
  scope?.addEventListener('change',()=>{render();load(current(),current()==='offline');});
  function refreshOffline(){const state=states.offline;state.id++;state.entries=null;state.pending=false;state.error='';state.unavailable=0;if(dialog.open&&current()==='offline')load('offline',true);}
  document.addEventListener('atelier:offline',refreshOffline);
  window.addEventListener('focus',refreshOffline);
  window.addEventListener('pageshow',refreshOffline);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshOffline();});
  $$('.search-open').forEach(button=>button.addEventListener('click',openSearch));
  document.addEventListener('keydown',event=>{
    if(event.isComposing || event.keyCode===229)return;
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();openSearch();}
  });
  input.addEventListener('input',render);
  input.addEventListener('keydown',event=>{
    const first=$('.search-result',box);
    const action=searchInputAction(event,Boolean(first));
    if(action==='open'){event.preventDefault();location.assign(first.href);}
    if(action==='focus'){event.preventDefault();first.focus();}
  });
  box.addEventListener('keydown',event=>{
    if(!['ArrowDown','ArrowUp'].includes(event.key))return;
    const links=$$('.search-result',box),index=links.indexOf(document.activeElement);if(index<0)return;
    event.preventDefault();const next=index+(event.key==='ArrowDown'?1:-1);
    if(next<0)input.focus();else links[Math.min(next,links.length-1)]?.focus();
  });
}
