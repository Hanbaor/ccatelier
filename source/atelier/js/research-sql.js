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
    worker.postMessage({type:pending.operation, id:pending.id, caseId:pending.caseId, sql:pending.sql, datasetId:pending.datasetId, caseRevision:1, datasetRevision:1});
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
    run(caseId, sql, datasetId='default', operation='run') {
      if (!['run','explain'].includes(operation)) return Promise.reject(new Error('未知操作。'));
      if (pending) finish(abortError(), null, true);
      return new Promise((resolve,reject) => {
        pending = {id:++serial, caseId, sql, datasetId, operation, resolve, reject, timer:null};
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
    if (state === 'loading' && !planBusy) message('正在载入 SQLite…');
    if (state === 'running') message('SQLite 正在运行…');
  }});
  const runButton = host.querySelector('[data-sql-run]'), stopButton = host.querySelector('[data-sql-cancel]');
  const status = host.querySelector('[data-sql-status]'), panels = Array.from(host.querySelectorAll('[data-sql-case]'));
  let active = SQL_CASES[0].id, ticket = 0, busy = false, importTicket = 0, recovery = null;
  let planBusy = false;
  const plans = new WeakMap();
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
  function cancel(release=false) { importTicket++; ticket++; if (busy || planBusy || release) runner.stop(); planBusy=false; setBusy(false); }
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
    node.querySelector('.sql-insight summary').textContent=datasets.get(active)==='default' ? '为什么会不同？' : '原始反例说明';
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
