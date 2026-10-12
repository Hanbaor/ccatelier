// Loaded only after the first completed comparison. Drafts stay in this page's
// memory; no storage, URLs, worker messages or automatic execution are involved.
export const SQL_HISTORY_LIMIT = 12;
const TEXT_LIMIT = 4000;
const sameDraft = (a,b) => a.datasetId === b.datasetId && a.sql === b.sql;

export function createSqlHistory({panels, readDraft, restoreDraft, datasetLabel}) {
  const views = new Map();
  let serial = 0;
  function view(caseId) {
    if (views.has(caseId)) return views.get(caseId);
    const panel=panels.find(node=>node.dataset.sqlCase===caseId),doc=panel.ownerDocument;
    const details=doc.createElement('details'); details.className='sql-history sql-insight'; details.dataset.sqlHistory='';
    const summary=doc.createElement('summary');
    const controls=doc.createElement('div'); controls.className='sql-history-controls';
    const label=doc.createElement('label'); label.textContent='选择记录';
    const select=doc.createElement('select'); select.dataset.sqlHistorySelect=''; label.append(select);
    const button=doc.createElement('button'); button.type='button'; button.className='sql-text-button'; button.textContent='恢复此草稿'; button.dataset.sqlHistoryRestore='';
    controls.append(label,button);
    const preview=doc.createElement('pre'); preview.tabIndex=0; preview.setAttribute('aria-label','记录中的候选 SQL'); preview.dataset.sqlHistoryPreview='';
    const note=doc.createElement('p'); note.textContent='仅保留本例最近 12 条。结论属于记录当时的运行；恢复后需重新运行。刷新即清除。';
    const live=doc.createElement('p'); live.setAttribute('role','status'); live.setAttribute('aria-live','polite'); live.setAttribute('aria-atomic','true');
    details.append(summary,controls,preview,note,live);
    panel.querySelector('.sql-comparison').after(details);
    const state={items:[],details,summary,select,preview,live}; views.set(caseId,state);
    select.addEventListener('change',()=>preview.textContent=state.items.find(item=>String(item.id)===select.value)?.sql || '');
    button.addEventListener('click',()=>{
      const selected=state.items.find(item=>String(item.id)===select.value);
      if (!selected) return;
      const current=readDraft(caseId);
      // Never truncate a displaced draft and call it recoverable.
      if (current.sql.length>TEXT_LIMIT) { live.textContent='当前草稿超过 4,000 字符，请先缩短或另行保留，再恢复记录。'; return; }
      if (!sameDraft(current,selected)) put(caseId,{...current,outcome:'替换前草稿 · 未运行'},false);
      if (!state.items.includes(selected)) state.items[state.items.length-1]=selected;
      restoreDraft(caseId,{datasetId:selected.datasetId,sql:selected.sql});
      // Selected records stay selectable; putting the displaced draft first
      // makes reversal explicit without duplicating snapshots on repeated swaps.
      render(state,selected.id);
      live.textContent='已恢复，尚未运行。替换前草稿也在记录中。';
    });
    return state;
  }
  function render(state,selectedId=state.items[0]?.id) {
    const doc=state.details.ownerDocument;
    state.select.replaceChildren(...state.items.map(item=>{
      const option=doc.createElement('option'); option.value=String(item.id);
      option.textContent=`#${item.id} · ${datasetLabel(item.caseId,item.datasetId)} · ${item.outcome}`;
      return option;
    }));
    state.select.value=String(selectedId);
    state.preview.textContent=state.items.find(item=>item.id===selectedId)?.sql || '';
    state.summary.textContent=`最近实验 · ${state.items.length}`;
  }
  function put(caseId,draft,isRun=true) {
    if (typeof draft.sql!=='string' || draft.sql.length>TEXT_LIMIT) return;
    const state=view(caseId),existing=state.items.find(item=>sameDraft(item,draft));
    // A recovery checkpoint must not erase an actual recorded outcome.
    const item=existing && !isRun ? existing : {...draft,caseId,id:++serial};
    state.items=[item,...state.items.filter(other=>!sameDraft(other,draft))].slice(0,SQL_HISTORY_LIMIT);
    render(state);
    return item;
  }
  return {record:put};
}
