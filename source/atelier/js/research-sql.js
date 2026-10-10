import {SQL_CASES, getSqlCase, validateQuery, compareResults} from './research-sql-core.mjs';

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
    onState('running');
    pending.timer = setTimer(() => finish(new Error('查询超过 1.5 秒，已停止。可修改后再运行。'), null, true), queryMs);
    worker.postMessage({type:'run', id:pending.id, caseId:pending.caseId, sql:pending.sql});
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
    run(caseId, sql) {
      if (pending) finish(abortError(), null, true);
      return new Promise((resolve,reject) => {
        pending = {id:++serial, caseId, sql, resolve, reject, timer:null};
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
    if (state === 'loading') message('正在载入 SQLite…');
    if (state === 'running') message('SQLite 正在运行…');
  }});
  const runButton = host.querySelector('[data-sql-run]'), stopButton = host.querySelector('[data-sql-cancel]');
  const status = host.querySelector('[data-sql-status]'), panels = Array.from(host.querySelectorAll('[data-sql-case]'));
  let active = SQL_CASES[0].id, ticket = 0, busy = false;
  const panel = () => panels.find(node => node.dataset.sqlCase === active);
  const editor = () => panel().querySelector('[data-sql-editor]');
  function message(text, state='') { status.textContent = text; status.dataset.state = state; }
  function setBusy(value) { busy = value; runButton.disabled = value; stopButton.hidden = !value; host.setAttribute('aria-busy', String(value)); }
  function clearResult(node=panel()) {
    const empty = doc.createElement('p'); empty.className = 'sql-result-empty'; empty.textContent = '运行查询，看看哪些行不同。';
    node.querySelector('[data-sql-actual]').replaceChildren(empty);
    node.querySelector('[data-sql-result-count]').textContent = '尚未运行';
    node.querySelectorAll('[data-sql-expected] tbody tr').forEach(row => {
      delete row.dataset.diff; const mark = row.querySelector('[data-sql-row-mark]'); mark.textContent = ''; mark.removeAttribute('aria-label');
    });
  }
  function cancel(release=false) { ticket++; if (busy || release) runner.stop(); setBusy(false); }
  function modified() { cancel(); clearResult(); message('查询已修改，重新运行后比较。'); }
  function select(id) {
    getSqlCase(id); cancel(); active = id;
    panels.forEach(node => { node.hidden = node.dataset.sqlCase !== id; });
    host.querySelectorAll('[data-sql-select]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.sqlSelect === id)));
    clearResult(); message('修改候选 SQL，再与预期比较。');
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
    const caseId = active, sql = editor().value;
    cancel(); clearResult();
    try { validateQuery(sql); }
    catch (error) { message(error.message, 'error'); return; }
    const current = ++ticket;
    setBusy(true); message('正在载入或运行 SQLite…');
    try {
      const result = await runner.run(caseId, sql);
      if (current !== ticket || caseId !== active) return;
      const comparison = compareResults(result, getSqlCase(caseId).expected);
      renderResult(result, comparison);
      if (comparison.state === 'match') message('本例结果一致。', 'match');
      else if (comparison.state === 'order') message('值和重复次数一致，行顺序不同。↕ 标出错位行。', 'different');
      else if (comparison.state === 'limited') message('结果超过 100 行，已截断；不作一致性判断。', 'error');
      else message(`结果不同：+ 多出 ${comparison.extra} 行，− 缺少 ${comparison.missing} 行。`, 'different');
    } catch (error) {
      if (current !== ticket || error.cancelled) return;
      message(error.message || '查询失败，请修改后重试。', 'error');
      panel().querySelector('[data-sql-result-count]').textContent = '未得到结果';
    } finally { if (current === ticket) setBusy(false); }
  }
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
  runButton.addEventListener('click', run);
  stopButton.addEventListener('click', () => { cancel(); message('已停止，可修改后再运行。'); runButton.focus(); });
  function leave() { const wasBusy = busy; cancel(true); if (wasBusy) message('已停止，可重新运行。'); }
  win.addEventListener('pagehide', leave);
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) leave(); });
  doc.addEventListener('atelier:dialog-open', leave);
  host.classList.add('is-enhanced'); select(active);
  const controller = {run, select, stop:leave}; controllers.set(host,controller); return controller;
}

if (typeof document !== 'undefined') initResearchSql();
