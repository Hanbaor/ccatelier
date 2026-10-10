import {SQL_CASES, getSqlCase, getSqlDataset, listSqlDatasets, validateQuery, compareResults} from './research-sql-core.mjs';
import {SQL_SNAPSHOT_LIMIT, createSqlSnapshot, serializeSqlSnapshot, parseSqlSnapshot} from './research-sql-snapshot.mjs';

// The main thread controls the wall-clock deadline. A busy synchronous SQLite
// worker cannot service its own timer, so timeout means termination, not a message.
export function createSqlRunner({WorkerClass=globalThis.Worker, setTimer=setTimeout, clearTimer=clearTimeout, loadMs=10000, queryMs=1500, onState=()=>{}}={}) {
  let worker = null, ready = false, pending = null, serial = 0;
  const abortError = () => Object.assign(new Error('已停止。'), {cancelled:true});
  function finish(error, result, terminate=false) {
    if (terminate && worker) { worker.terminate(); worker = null; ready = false; onState('idle'); }
    if (!pending) return;
    const current = pending; pending = null; clearTimer(current.timer);
    if (worker && ready) onState('ready');
    error ? current.reject(error) : current.resolve(result);
  }
  function submit() {
    if (!worker || !ready || !pending) return;
    clearTimer(pending.timer);
    onState(pending.operation === 'explain' ? 'planning' : 'running');
    pending.timer = setTimer(() => finish(new Error('查询超过 1.5 秒，已停止。可修改后再运行。'), null, true), queryMs);
    worker.postMessage({type:pending.operation, id:pending.id, caseId:pending.caseId, sql:pending.sql, datasetId:pending.datasetId, caseRevision:1, datasetRevision:1, ...(pending.subsetMask === undefined ? {} : {subsetMask:pending.subsetMask})});
  }
  function startWorker() {
    if (typeof WorkerClass !== 'function') throw new Error('当前浏览器不支持 Worker；示例数据与参考结果仍可阅读。');
    const instance = new WorkerClass(new URL('./research-sql-worker.js', import.meta.url));
    worker = instance;
    onState('loading');
    instance.onmessage = ({data}) => {
      if (worker !== instance || !data) return;
      if (data.type === 'ready') { ready = true; submit(); }
      else if (data.type === 'load-error') finish(new Error('SQLite 未能载入，请检查网络后重试。'), null, true);
      else if (data.type === 'result' && pending && data.id === pending.id) {
        finish(data.error ? new Error(data.error) : null, data.result);
      }
    };
    instance.onerror = event => { event.preventDefault?.(); if (worker === instance) finish(new Error('SQLite 运行中断，请重试。'), null, true); };
    instance.onmessageerror = () => { if (worker === instance) finish(new Error('SQLite 返回结果失败，请重试。'), null, true); };
  }
  return {
    run(caseId, sql, datasetId='default', operation='run', subsetMask) {
      if (!['run','explain','minimize','witness'].includes(operation)) return Promise.reject(new Error('未知操作。'));
      if (pending) finish(abortError(), null, true);
      return new Promise((resolve,reject) => {
        pending = {id:++serial, caseId, sql, datasetId, operation, subsetMask, resolve, reject, timer:null};
        try {
          if (!worker) startWorker();
          if (ready) submit();
          else pending.timer = setTimer(() => finish(new Error('SQLite 载入超时，请检查网络后重试。'), null, true), loadMs);
        } catch (error) { finish(error, null, true); }
      });
    },
    stop() { finish(abortError(), null, true); }
  };
}

const controllers = new WeakMap();
const marks = {extra:['+','多出的行'], missing:['−','缺少的行'], order:['↕','顺序不同'], same:['','']};

export function initResearchSql(root=document, {runnerFactory=createSqlRunner}={}) {
  const host = root.querySelector('[data-sql-lab]');
  if (!host) return null;
  if (controllers.has(host)) return controllers.get(host);
  const doc = host.ownerDocument, win = doc.defaultView;
  host.dataset.sqlEngine = 'idle';
  const runner = runnerFactory({onState:state => {
    host.dataset.sqlEngine = state;
    if (state === 'loading' && !planBusy && !minimizeBusy) message('正在载入 SQLite…');
    if (state === 'running' && !minimizeBusy) message('SQLite 正在运行…');
  }});
  const runButton = host.querySelector('[data-sql-run]'), stopButton = host.querySelector('[data-sql-cancel]');
  const status = host.querySelector('[data-sql-status]'), panels = Array.from(host.querySelectorAll('[data-sql-case]'));
  let active = SQL_CASES[0].id, ticket = 0, busy = false, importTicket = 0, recovery = null;
  let planBusy = false, minimizeBusy = null;
  const plans = new WeakMap();
  const witnesses = new WeakMap();
  const datasets = new Map(SQL_CASES.map(item => [item.id,'default']));
  const datasetSelect = host.querySelector('[data-sql-dataset]');
  const fileInput = host.querySelector('[data-sql-file]');
  const restoreButton = host.querySelector('[data-sql-restore-draft]');
  const fixture = () => getSqlDataset(active,datasets.get(active));
  const panel = () => panels.find(node => node.dataset.sqlCase === active);
  const editor = () => panel().querySelector('[data-sql-editor]');
  function message(text, state='') { status.textContent = text; status.dataset.state = state; }
  function setBusy(value) { busy = value; runButton.disabled = value; stopButton.hidden = !value; host.setAttribute('aria-busy', String(value)); }
  function clearPlan(node=panel()) {
    plans.delete(node);
    witnesses.delete(node);
    const witness=node.querySelector('[data-sql-minimize]');
    if (witness) { witness.hidden=true; witness.open=false; witness.querySelector('[data-sql-minimize-output]').replaceChildren(); witness.querySelector('[data-sql-minimize-evidence]').replaceChildren(); witness.querySelector('[data-sql-minimize-scope]').open=false; witness.querySelector('[data-sql-minimize-status]').textContent=''; witness.querySelector('[data-sql-witness-replay]').hidden=true; }
    const details=node.querySelector('[data-sql-plan]');
    if (details) { details.open=false; details.hidden=true; details.querySelector('[data-sql-plan-output]').replaceChildren(); const planStatus=details.querySelector('[data-sql-plan-status]'); if (planStatus) planStatus.textContent=''; }
  }
  function clearResult(node=panel()) {
    clearPlan(node);
    const empty = doc.createElement('p'); empty.className = 'sql-result-empty'; empty.textContent = '运行查询，看看哪些行不同。';
    node.querySelector('[data-sql-actual]').replaceChildren(empty);
    node.querySelector('[data-sql-result-count]').textContent = '尚未运行';
    node.querySelectorAll('[data-sql-expected] tbody tr').forEach(row => {
      delete row.dataset.diff; const mark = row.querySelector('[data-sql-row-mark]'); mark.textContent = ''; mark.removeAttribute('aria-label');
    });
  }
  function cancel(release=false) { if (minimizeBusy) { minimizeBusy.querySelector('[data-sql-minimize-status]').textContent='已停止，未得到新的验证结果。'; minimizeBusy=null; } importTicket++; ticket++; if (busy || planBusy || release) runner.stop(); planBusy=false; setBusy(false); }
  function modified() { cancel(); clearResult(); message('查询已修改，重新运行后比较。'); }
  function select(id) {
    getSqlCase(id); cancel(); clearPlan(); active = id;
    panels.forEach(node => { node.hidden = node.dataset.sqlCase !== id; });
    host.querySelectorAll('[data-sql-select]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.sqlSelect === id)));
    renderDataset(); clearResult(); message('修改候选 SQL，再与预期比较。');
  }
  function makeTable(columns, rows, withMarks=false) {
    const table = doc.createElement('table'), head = table.createTHead().insertRow();
    if (withMarks) { const th = doc.createElement('th'); th.scope='col'; th.className='sql-mark-column'; th.textContent='对照'; head.append(th); }
    columns.forEach(value => { const th=doc.createElement('th'); th.scope='col'; th.textContent=value; head.append(th); });
    const body=table.createTBody();
    rows.forEach(values => {
      const row=body.insertRow();
      if (withMarks) { const cell=row.insertCell(); cell.className='sql-mark-column'; cell.dataset.sqlRowMark=''; }
      values.forEach(value => { row.insertCell().textContent=value === null ? 'NULL' : String(value); });
    });
    return table;
  }
  function renderDataset() {
    const data=fixture(), node=panel();
    if (datasetSelect) {
      datasetSelect.replaceChildren(...listSqlDatasets(active).map(item => { const option=doc.createElement('option'); option.value=item.id; option.textContent=item.label; return option; }));
      datasetSelect.value=datasets.get(active);
    }
    const tables=data.tables.map(item => {
      const wrap=doc.createElement('div'); wrap.className='sql-table-wrap';
      const table=makeTable(item.columns,item.rows); table.dataset.sqlFixture=item.name;
      const caption=table.createCaption(); caption.textContent=item.name;
      const count=doc.createElement('span'); count.textContent=`${item.rows.length} rows`; caption.append(count); wrap.append(table); return wrap;
    });
    node.querySelector('.sql-fixtures').replaceChildren(...tables);
    const expected=node.querySelector('[data-sql-expected]');
    const table=makeTable(data.expected.columns,data.expected.rows,true);
    const caption=table.createCaption(); caption.className='sr-only'; caption.textContent='当前数据集的预期结果';
    expected.replaceChildren(table);
    if (!data.expected.rows.length) { const empty=doc.createElement('p'); empty.className='sql-result-empty'; empty.textContent='0 行'; expected.append(empty); }
    node.querySelector('.sql-reference-panel .sql-result-heading span').textContent=`${data.expected.rows.length} 行`;
    const insightSummary=node.querySelector('[data-sql-insight] > summary');
    if (insightSummary) insightSummary.textContent=datasets.get(active)==='default' ? '为什么会不同？' : '原始反例说明';
  }
  function captureDrafts() {
    return {active, drafts:panels.map(node => ({caseId:node.dataset.sqlCase,datasetId:datasets.get(node.dataset.sqlCase),sql:node.querySelector('[data-sql-editor]').value}))};
  }
  function restoreDrafts(saved) {
    saved.drafts.forEach(item => { datasets.set(item.caseId,item.datasetId); panels.find(node => node.dataset.sqlCase===item.caseId).querySelector('[data-sql-editor]').value=item.sql; });
    select(saved.active); panels.forEach(node => clearResult(node));
  }
  async function importFile(file) {
    const current=++importTicket;
    if (!file) return;
    try {
      if (!Number.isFinite(file.size) || file.size > SQL_SNAPSHOT_LIMIT || file.size < 0) throw new Error('草稿文件最多 32 KiB。');
      const text = typeof file.text === 'function' ? await file.text() : await new Promise((resolve,reject) => {
        const reader=new win.FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=()=>reject(new Error('无法读取草稿文件。')); reader.readAsText(file);
      });
      if (current !== importTicket) return;
      const saved=parseSqlSnapshot(text);
      recovery=captureDrafts();
      datasets.set(saved.caseId,saved.datasetId); select(saved.caseId); editor().value=saved.sql;
      if (restoreButton) { restoreButton.hidden=false; restoreButton.textContent='恢复导入前草稿'; }
      message('已导入，尚未运行。原草稿可恢复。'); editor().focus();
    } catch (error) { if (current === importTicket) message(error.message || '无法导入草稿。','error'); }
  }
  function exportDraft() {
    let url;
    try {
      const text=serializeSqlSnapshot(createSqlSnapshot(active,datasets.get(active),editor().value));
      url=win.URL.createObjectURL(new win.Blob([text],{type:'application/json;charset=utf-8'}));
      const link=doc.createElement('a'); link.href=url; link.download=`cc-atelier-${active}-${datasets.get(active)}-v1.json`;
      doc.body.append(link); link.click(); link.remove();
      message('已发起下载；草稿仅保存到你选择的本机位置。');
    } catch (error) { message(error.message || '无法导出草稿。','error'); }
    finally { if (url) win.setTimeout(()=>win.URL.revokeObjectURL(url),0); }
  }
  function markRow(row, mark, cell) {
    const [symbol,label] = marks[mark] || marks.same;
    row.dataset.diff = mark; cell.textContent = symbol;
    if (label) cell.setAttribute('aria-label',label);
  }
  function renderResult(result, comparison) {
    const node = panel(), table = doc.createElement('table'), caption = doc.createElement('caption');
    caption.className = 'sr-only'; caption.textContent = '候选 SQL 的 SQLite 实际执行结果'; table.append(caption);
    const thead = table.createTHead(), header = thead.insertRow();
    const markHeader = doc.createElement('th'); markHeader.scope = 'col'; markHeader.className = 'sql-mark-column';
    const sr = doc.createElement('span'); sr.className = 'sr-only'; sr.textContent = '比较状态'; markHeader.append(sr); header.append(markHeader);
    result.columns.forEach(value => { const cell = doc.createElement('th'); cell.scope = 'col'; cell.textContent = value; header.append(cell); });
    const tbody = table.createTBody();
    result.rows.forEach((values,index) => {
      const row = tbody.insertRow(), mark = row.insertCell(); mark.className = 'sql-mark-column'; markRow(row, comparison.actualMarks[index] || 'same', mark);
      values.forEach(value => { const cell = row.insertCell(); cell.textContent = value === null ? 'NULL' : String(value); });
    });
    node.querySelector('[data-sql-actual]').replaceChildren(table);
    if (!result.rows.length) {
      const empty = doc.createElement('p'); empty.className = 'sql-result-empty'; empty.textContent = '0 行'; node.querySelector('[data-sql-actual]').append(empty);
    }
    node.querySelector('[data-sql-result-count]').textContent = result.truncated ? '仅显示前 100 行' : `SQLite · ${result.rows.length} 行`;
    node.querySelectorAll('[data-sql-expected] tbody tr').forEach((row,index) => markRow(row, comparison.expectedMarks[index] || 'same', row.querySelector('[data-sql-row-mark]')));
  }
  async function run() {
    const caseId = active, datasetId = datasets.get(active), sql = editor().value;
    cancel(); clearResult();
    try { validateQuery(sql); }
    catch (error) { message(error.message, 'error'); return; }
    const current = ++ticket;
    setBusy(true); message('正在载入或运行 SQLite…');
    try {
      const result = await runner.run(caseId, sql, datasetId);
      if (current !== ticket || caseId !== active || datasetId !== datasets.get(active)) return;
      const comparison = compareResults(result, getSqlDataset(caseId,datasetId).expected);
      renderResult(result, comparison);
      const node=panel(), details=node.querySelector('[data-sql-plan]');
      plans.set(node,{caseId,datasetId,sql,caseRevision:1,datasetRevision:1,result:null,loading:false});
      if (details) details.hidden=false;
      node.querySelector('[data-sql-minimize]').hidden=false;
      if (comparison.state === 'match') message(datasetId === 'default' ? '本例结果一致。' : '此数据集结果一致，不代表所有数据都成立。', 'match');
      else if (comparison.state === 'order') message('值和重复次数一致，行顺序不同。↕ 标出错位行。', 'different');
      else if (comparison.state === 'limited') message('结果超过 100 行，已截断；不作一致性判断。', 'error');
      else message(`结果不同：+ 多出 ${comparison.extra} 行，− 缺少 ${comparison.missing} 行。`, 'different');
    } catch (error) {
      if (current !== ticket || error.cancelled) return;
      message(error.message || '查询失败，请修改后重试。', 'error');
      panel().querySelector('[data-sql-result-count]').textContent = '未得到结果';
    } finally { if (current === ticket) setBusy(false); }
  }
  async function loadPlan(node) {
    const details=node.querySelector('[data-sql-plan]'), saved=plans.get(node);
    if (!details?.open || !saved || saved.loading || saved.result || busy) return;
    const current=++ticket, output=details.querySelector('[data-sql-plan-output]'), planStatus=details.querySelector('[data-sql-plan-status]');
    saved.loading=true; planBusy=true; stopButton.hidden=false;
    output.textContent='正在读取 SQLite 执行计划…';
    if (planStatus) planStatus.textContent='正在读取 SQLite 执行计划。';
    try {
      const result=await runner.run(saved.caseId,saved.sql,saved.datasetId,'explain');
      if (current !== ticket || plans.get(node) !== saved || active !== saved.caseId || datasets.get(active) !== saved.datasetId || editor().value !== saved.sql) return;
      saved.result=result;
      const label=doc.createElement('p');
      label.textContent=`${getSqlCase(saved.caseId).label} · ${listSqlDatasets(saved.caseId).find(item=>item.id===saved.datasetId).label} · SQLite ${result.version}`;
      const table=makeTable(result.columns,result.rows), wrap=doc.createElement('div'); wrap.className='sql-plan-table'; wrap.append(table);
      const caption=table.createCaption(); caption.textContent='SQLite 原始计划节点';
      output.replaceChildren(label,wrap);
      if (planStatus) planStatus.textContent=`执行计划已载入，显示 ${result.rows.length} 个节点。${result.truncated ? '计划未完整显示。' : ''}`;
      if (result.truncated) { const note=doc.createElement('p'); note.textContent='计划未完整显示：最多 64 个节点，每段描述最多 512 字符。'; output.append(note); }
    } catch (error) {
      if (current === ticket && !error.cancelled) {
        output.textContent=`${error.message || '计划读取失败。'} 收起后展开可重试；已有查询结果不变。`;
        if (planStatus) planStatus.textContent='执行计划读取失败。收起后展开可重试。';
      }
    } finally {
      saved.loading=false;
      if (current === ticket) { planBusy=false; stopButton.hidden=true; }
    }
  }
  async function minimize(node,replay=false) {
    if (busy || planBusy || node !== panel()) return;
    const caseId=active,datasetId=datasets.get(active),sql=editor().value;
    const details=node.querySelector('[data-sql-minimize]'),output=details.querySelector('[data-sql-minimize-output]');
    const live=details.querySelector('[data-sql-minimize-status]'),saved=witnesses.get(node);
    if (replay && !saved) return;
    importTicket++;
    const current=++ticket;
    minimizeBusy=details; setBusy(true); live.textContent=replay ? '正在重放同一反例…' : '正在搜索行数最少的反例…';
    try {
      const result=await runner.run(caseId,sql,datasetId,replay ? 'witness' : 'minimize',replay ? saved.mask : undefined);
      if (current !== ticket || caseId !== active || sql !== editor().value || datasetId !== datasets.get(active)) return;
      if (replay) {
        const stable=JSON.stringify(result.actual)===JSON.stringify(saved.actual) && JSON.stringify(result.reference)===JSON.stringify(saved.reference);
        live.textContent=stable ? '同一数据与查询已重放，结果一致。' : '重放结果改变，不能继续声称此反例稳定。';
        if (!stable) { witnesses.delete(node); details.querySelector('[data-sql-witness-replay]').hidden=true; }
        return;
      }
      witnesses.delete(node); details.querySelector('[data-sql-witness-replay]').hidden=true; output.replaceChildren(); details.querySelector('[data-sql-minimize-evidence]').replaceChildren();
      const summary=doc.createElement('p');
      if (result.state==='inconclusive') summary.textContent=`未完成验证。${result.reason} 已检查 ${result.tested} 个子集。`;
      else if (result.state==='no-witness') summary.textContent=`已检查全部 ${result.tested} 个行子集，未发现反例；不代表对其他数据成立。`;
      else {
        summary.textContent=`${result.totalRows} → ${result.remainingRows} 行 · 检查 ${result.tested} / ${result.totalSubsets} 个子集。更少行的全部子集均已比较。`;
        witnesses.set(node,result); details.querySelector('[data-sql-witness-replay]').hidden=false;
      }
      output.append(summary); live.textContent=result.state==='witness' ? `找到 ${result.remainingRows} 行的反例。` : result.state==='no-witness' ? '所有行子集均一致。' : '反例验证未完成。';
      if (result.state!=='witness') return;
      const inputs=doc.createElement('div'); inputs.className='sql-fixtures';
      for (const table of result.tables) {
        const wrap=doc.createElement('div'); wrap.className='sql-table-wrap';
        const view=makeTable(table.columns,table.rows); view.createCaption().textContent=`${table.name} · ${table.rows.length} 行`; wrap.append(view); inputs.append(wrap);
      }
      output.append(inputs);
      const comparison=doc.createElement('p'); comparison.textContent=result.comparison.state==='order' ? '值与重复次数一致，行顺序不同。' : `候选输出多出 ${result.comparison.extra} 行，缺少 ${result.comparison.missing} 行。`; output.append(comparison);
      const outputs=doc.createElement('div'); outputs.className='sql-comparison';
      for (const [label,data,rowMarks] of [['候选输出',result.actual,result.comparison.actualMarks],['参考输出',result.reference,result.comparison.expectedMarks]]) {
        const wrap=doc.createElement('div'); wrap.className='sql-result';
        const table=makeTable(data.columns,data.rows,true); table.createCaption().textContent=`${label} · ${data.rows.length} 行`;
        Array.from(table.tBodies[0].rows).forEach((row,index)=>markRow(row,rowMarks[index],row.cells[0]));
        wrap.append(table); outputs.append(wrap);
      }
      output.append(outputs);
      const evidence=details.querySelector('[data-sql-minimize-evidence]');
      const label=doc.createElement('label'); label.textContent='在新的临时 SQLite 数据库执行';
      const code=doc.createElement('textarea'); code.readOnly=true; code.rows=10; code.className='sql-editor'; code.setAttribute('aria-label','完整反例重放 SQL'); code.value=result.script;
      label.append(code); evidence.replaceChildren(label);
    } catch(error) {
      if (current===ticket && !error.cancelled) live.textContent=`${error.message || '验证失败。'} 未得到最小性结论，可重试。`;
    } finally { if(current===ticket) { minimizeBusy=null; setBusy(false); } }
  }
  panels.forEach(node=>{
    const details=doc.createElement('details'); details.className='sql-insight'; details.dataset.sqlMinimize=''; details.hidden=true;
    const title=doc.createElement('summary'); title.textContent='缩小反例';
    const note=doc.createElement('p'); note.textContent='仅删当前数据中的行；最多 64 个子集，整体限时 1.5 秒。';
    const boundary=doc.createElement('p'); boundary.textContent='仅支持完整的确定性查询子集：需顶层 ORDER BY，函数须在白名单内；拒绝时间、随机数、连接状态和数据库元数据。最小性仅适用于这些行的子集，只比较固定 SQLite 版本的实际输出，不是 SQL 等价性证明；排序键并列时不保证跨环境顺序。两次结果一致本身不能证明确定性。只保留声明的 schema 约束，不补充业务外键。';
    const scope=doc.createElement('details'); scope.className='sql-insight'; scope.dataset.sqlMinimizeScope='';
    const scopeTitle=doc.createElement('summary'); scopeTitle.textContent='验证范围与重放 SQL';
    const semantics=doc.createElement('p'); semantics.textContent='按保留行数从少到多穷举；比较值、重复次数和行顺序。错误、截断或重复执行不一致时停止，不作最小性结论。重放 SQL 需在新的临时 SQLite 数据库中执行。';
    const evidence=doc.createElement('div'); evidence.dataset.sqlMinimizeEvidence=''; scope.append(scopeTitle,boundary,semantics,evidence);
    const button=doc.createElement('button'); button.type='button'; button.className='sql-text-button'; button.dataset.sqlMinimizeRun=''; button.textContent='搜索最小反例'; button.addEventListener('click',()=>minimize(node));
    const replay=doc.createElement('button'); replay.type='button'; replay.className='sql-text-button'; replay.dataset.sqlWitnessReplay=''; replay.textContent='重放同一反例'; replay.hidden=true; replay.addEventListener('click',()=>minimize(node,true));
    const live=doc.createElement('p'); live.dataset.sqlMinimizeStatus=''; live.setAttribute('role','status'); live.setAttribute('aria-live','polite'); live.setAttribute('aria-atomic','true');
    const output=doc.createElement('div'); output.dataset.sqlMinimizeOutput='';
    const controls=doc.createElement('div'); controls.className='sql-draft-tools'; controls.append(button,replay);
    details.append(title,note,controls,live,output,scope);
    const plan=node.querySelector('[data-sql-plan]'); if (plan) plan.after(details); else node.append(details);
  });
  panels.forEach(node=>node.querySelector('[data-sql-plan]')?.addEventListener('toggle',()=>loadPlan(node)));
  host.querySelector('[data-sql-switch]').hidden = false;
  host.querySelector('[data-sql-run-bar]').hidden = false;
  host.querySelectorAll('[data-sql-editor]').forEach(field => {
    field.readOnly = false;
    field.addEventListener('input', modified);
    field.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) { event.preventDefault(); run(); } });
  });
  host.querySelectorAll('[data-sql-select]').forEach(button => button.addEventListener('click', () => select(button.dataset.sqlSelect)));
  host.querySelectorAll('[data-sql-reset],[data-sql-use-reference]').forEach(button => {
    button.hidden = false;
    button.addEventListener('click', () => { editor().value = getSqlCase(active)[button.hasAttribute('data-sql-reset') ? 'candidate' : 'reference']; modified(); editor().focus(); });
  });
  host.querySelector('[data-sql-draft-tools]')?.removeAttribute('hidden');
  datasetSelect?.addEventListener('change', () => { getSqlDataset(active,datasetSelect.value); cancel(); datasets.set(active,datasetSelect.value); renderDataset(); clearResult(); message('已切换数据，SQL 保留；运行后比较。'); });
  host.querySelector('[data-sql-import]')?.addEventListener('click', () => { importTicket++; fileInput.click(); });
  fileInput?.addEventListener('change', () => { const file=fileInput.files?.[0]; fileInput.value=''; importFile(file); });
  host.querySelector('[data-sql-export]')?.addEventListener('click', exportDraft);
  restoreButton?.addEventListener('click', () => {
    if (!recovery) return;
    const current=captureDrafts(), previous=recovery; recovery=current; restoreDrafts(previous);
    restoreButton.textContent='恢复替换前草稿'; message('已恢复草稿，尚未运行；刚才的草稿也可切回。'); editor().focus();
  });
  runButton.addEventListener('click', run);
  stopButton.addEventListener('click', () => { const planning=planBusy; cancel(); if (planning) clearPlan(); else message('已停止，可修改后再运行。'); runButton.focus(); });
  function leave() { const wasBusy = busy; cancel(true); panels.forEach(clearPlan); if (wasBusy) message('已停止，可重新运行。'); }
  win.addEventListener('pagehide', leave);
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) leave(); });
  doc.addEventListener('atelier:dialog-open', leave);
  host.classList.add('is-enhanced'); select(active);
  const controller = {run, select, stop:leave, importFile, exportDraft}; controllers.set(host,controller); return controller;
}

if (typeof document !== 'undefined') initResearchSql();
