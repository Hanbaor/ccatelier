// Progressively enhance the real, server-rendered index; no fetch or article rewriting.
const initialized=new WeakSet();
const fields={query:'hot100_q',difficulty:'hot100_difficulty',code:'hot100_code'};
const normalize=value=>value.normalize('NFKC').trim().toLocaleLowerCase();
export function initSeriesFilter({root=document}={}) {
 const host=root.querySelector('[data-hot100-filter]');if(!host||initialized.has(host))return;
 const doc=host.ownerDocument,win=doc.defaultView,pathname=win.location.pathname;
 const controls=host.querySelector('[data-series-controls]'),search=host.querySelector('[data-series-search]'),difficulty=host.querySelector('select[data-series-difficulty]'),code=host.querySelector('[data-series-code]'),count=host.querySelector('[data-series-count]'),clear=host.querySelector('[data-series-clear]'),empty=host.querySelector('[data-series-empty]');
 const rows=[...host.querySelectorAll('.series-track')].map(node=>({node,title:normalize(node.dataset.seriesTitle),topic:normalize(node.dataset.seriesTopic),order:node.dataset.seriesOrder,difficulty:node.dataset.seriesDifficulty,hasCode:node.dataset.seriesHasCode==='true'}));
 const groups=[...host.querySelectorAll('.series-group')].map(node=>({node,rows:rows.filter(row=>node.contains(row.node)),links:[...host.querySelectorAll('.series-topics>a,.series-mobile-topics>a')].filter(link=>link.getAttribute('href')==='#'+node.id)}));
 let composing=false;
 function readURL(){
  const params=new URL(win.location.href).searchParams;
  search.value=params.get(fields.query)||'';
  const level=params.get(fields.difficulty);difficulty.value=['简单','中等','困难'].includes(level)?level:'';
  code.checked=params.get(fields.code)==='1';
 }
 function writeURL(){
  if(win.location.pathname!==pathname)return;
  const url=new URL(win.location.href),values={query:search.value.trim(),difficulty:difficulty.value,code:code.checked?'1':''};
  for(const [key,param] of Object.entries(fields)){if(values[key])url.searchParams.set(param,values[key]);else url.searchParams.delete(param);}
  if(url.href!==win.location.href){try{win.history.replaceState(win.history.state,'',url);}catch{/* Filtering still works when history is unavailable. */}}
 }
 function apply(save=false){
  const terms=normalize(search.value).split(/\s+/).filter(Boolean);let matches=0,visibleGroups=0;
  for(const row of rows){
   const match=(!difficulty.value||row.difficulty===difficulty.value)&&(!code.checked||row.hasCode)&&terms.every(term=>/^#?\d+$/.test(term)?Number(term.replace('#',''))===Number(row.order):row.title.includes(term)||row.topic.includes(term));
   row.node.hidden=!match;if(match)matches++;
  }
  for(const group of groups){const visible=group.rows.filter(row=>!row.node.hidden).length;group.node.hidden=!visible;if(visible)visibleGroups++;
   for(const link of group.links){link.hidden=!visible;link.querySelector('small').textContent=String(visible).padStart(2,'0');}
  }
  host.querySelector('[data-series-topic-count]').textContent=visibleGroups+' 个专题';
  count.textContent='显示 '+matches+' / '+rows.length+' 题';empty.hidden=matches!==0;
  if(save)writeURL();
 }
 search.addEventListener('compositionstart',()=>{composing=true;});
 search.addEventListener('compositionend',()=>{composing=false;apply(true);});
 search.addEventListener('input',event=>{if(!composing&&!event.isComposing)apply(true);});
 difficulty.addEventListener('change',()=>apply(true));code.addEventListener('change',()=>apply(true));
 clear.addEventListener('click',()=>{composing=false;search.value='';difficulty.value='';code.checked=false;apply(true);});
 win.addEventListener('popstate',()=>{if(win.location.pathname!==pathname)return;composing=false;readURL();apply();});
 readURL();apply();controls.hidden=false;initialized.add(host);
}
