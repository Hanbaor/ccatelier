import {$, $$, openDialog} from './ui.js';
import {findEntries, safeResultURL, searchInputAction} from './search-core.mjs';

export function initSearch() {
  const input = $('#search-input'), box = $('#search-results');
  let entries = null, pending = null, failed = false;
  const root = document.body.dataset.root;
  const sections = [['笔记','notes/'],['项目','projects/'],['研究','research/'],['生活','life/'],['关于 CC','about/']].map(([title,url]) => ({title,content:'',url:root+url,section:true}));
  function render() {
    box.replaceChildren(); box.setAttribute('aria-busy', String(Boolean(pending)));
    if (pending) { const p=document.createElement('p');p.className='search-empty';p.textContent='正在载入文章…';box.append(p);return; }
    if (failed) {
      const p=document.createElement('p');p.className='search-empty';p.textContent='文章索引暂时无法载入。';
      const retry=document.createElement('button');retry.type='button';retry.textContent='重试';retry.addEventListener('click',load);p.append(retry);box.append(p);return;
    }
    const results = findEntries(input.value, [...(entries || []), ...sections]);
    if (!results.length) { const p=document.createElement('p');p.className='search-empty';p.textContent='暂无匹配内容。';box.append(p);return; }
    for (const item of results) {
      const url = safeResultURL(item.url,location.origin+root); if (!url) continue;
      const link=document.createElement('a');link.className='search-result';link.href=url;
      const text=document.createElement('span');text.className='result-copy';text.textContent=item.title || '未命名文章';
      if (input.value.trim() && item.content) {
        const excerpt=document.createElement('small');const content=String(item.content).replace(/\s+/g,' ');
        const index=Math.max(0,content.toLocaleLowerCase().indexOf(input.value.trim().toLocaleLowerCase())-12);
        excerpt.textContent=content.slice(index,index+70);text.append(excerpt);
      }
      const kind=document.createElement('small');kind.textContent=item.section?'栏目':'文章';link.append(text,kind);box.append(link);
    }
  }
  async function load() {
    if (entries || pending) return;
    failed=false;
    const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),8000);
    pending=fetch(document.body.dataset.search,{signal:controller.signal}).then(response=>{
      if(!response.ok)throw new Error('Index unavailable');return response.json();
    });
    render();
    try {
      const result=await pending;
      if(!Array.isArray(result))throw new Error('Invalid index');
      entries=result.filter(item=>item&&typeof item.title==='string'&&typeof item.url==='string');
    } catch {failed=true;}
    finally {clearTimeout(timeout);pending=null;render();}
  }
  function openSearch() { input.value='';openDialog('search-dialog');input.focus();render();load(); }
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
