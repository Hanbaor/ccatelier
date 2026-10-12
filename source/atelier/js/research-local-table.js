// This optional sibling owns no URLs, storage, telemetry, downloads or clipboard.
// The parser is fetched only on file selection; SQLite only after an explicit run.
const DEFAULT_SQL = 'SELECT * FROM local_data ORDER BY rowid';
const MAX_BYTES = 256 * 1024;
const controllers = new WeakMap();
const ERRORS = Object.freeze({loadTimeout:'SQLite 载入超时，请检查网络后重试。',queryTimeout:'A / B 执行超过 1.5 秒，已停止。可修改后重试。',submit:'无法启动比较，请重试。',load:'SQLite 未能载入，请检查网络后重试。',query:'查询未完成。请检查 SQL 是否为受支持的只读查询，并确认结果未超出限制。',runtime:'SQLite 运行中断，请重试。',message:'无法读取比较结果，请重试。',unsupported:'当前浏览器无法启动 Worker，请使用支持 Worker 和 WebAssembly 的浏览器。'});
const REDUCTION_ERRORS = Object.freeze({unsupported:'此 SQL 暂不支持缩小样本；仍可运行普通 A / B 比较。缩小需顶层 ORDER BY，且不支持 LIMIT、OFFSET 或非确定性表达式。',unstable:'复验结果不稳定，未保留样本。请检查排序与非确定性表达式后重试。',unknown:'候选结果无法完整验证，未保留样本。请减少结果规模后重试。','invalid-witness':'样本证据已失效，请重新运行普通比较后缩小。','invalid-input':'输入已失效，请重新载入表并运行普通比较。'});
const localError=code=>Object.assign(new Error(ERRORS[code]),{localTableCode:code});

export function createLocalTableRunner({WorkerClass=globalThis.Worker,setTimer=setTimeout,clearTimer=clearTimeout,onState=()=>{}}={}) {
  let current=null, serial=0;
  function finish(task,error,result) {
    if (current!==task) return;
    current=null; clearTimer(task.timer);
    if (task.worker) { task.worker.onmessage=null; task.worker.onerror=null; task.worker.onmessageerror=null; task.worker.terminate(); }
    task.table=null; task.sqlA=null; task.sqlB=null;task.options=null;
    error ? task.reject(error) : task.resolve(result);
  }
  const stop=()=>{ if (current) finish(current,Object.assign(new Error('已停止。'),{cancelled:true})); };
  return {
    run(table,sqlA,sqlB,options={}) {
      stop();
      return new Promise((resolve,reject)=>{
        const task={id:++serial,table,sqlA,sqlB,options,resolve,reject,timer:null,worker:null,submitted:false}; current=task;
        try {
          if (typeof WorkerClass!=='function') throw new Error();
          const worker=new WorkerClass(new URL('./research-local-table-worker.js',import.meta.url)); task.worker=worker;
          onState('loading');
          task.timer=setTimer(()=>finish(task,localError('loadTimeout')),10000);
          worker.onmessage=({data})=>{
            if (current!==task || !data) return;
            if (data.type==='ready' && !task.submitted) {
              task.submitted=true; clearTimer(task.timer); onState('running');
              task.timer=setTimer(()=>finish(task,localError('queryTimeout')),1500);
              try { const operation=task.options.operation;const request={type:operation==='reduce' || operation==='replay'?operation:'run',id:task.id,table:task.table,sqlA:task.sqlA,sqlB:task.sqlB};if(operation==='reduce')request.expectedPair=task.options.expectedPair;if(operation==='replay')request.witness=task.options.witness;worker.postMessage(request); }
              catch { finish(task,localError('submit')); }
            } else if (data.type==='load-error') finish(task,localError('load'));
            else if (data.type==='result' && task.submitted && data.id===task.id) {
              const error=data.error && task.options.operation && Object.hasOwn(REDUCTION_ERRORS,data.code)?Object.assign(new Error(REDUCTION_ERRORS[data.code]),{reductionCode:data.code}):data.error?localError('query'):null;finish(task,error,data.result);
            }
          };
          worker.onerror=event=>{event.preventDefault?.();finish(task,localError('runtime'));};
          worker.onmessageerror=()=>finish(task,localError('message'));
        } catch { finish(task,localError('unsupported')); }
      });
    },stop
  };
}

export function initLocalTable(doc=globalThis.document,{runnerFactory=createLocalTableRunner,loadCore=()=>import('./research-local-table-core.mjs'),readFile=file=>file.arrayBuffer()}={}) {
  const host=doc?.querySelector('[data-local-lab]'); if (!host) return null;
  if (controllers.has(host)) return controllers.get(host);
  const win=doc.defaultView, find=name=>host.querySelector(`[data-local-${name}]`);
  const file=find('file'),delimiter=find('delimiter'),clear=find('clear'),runButton=find('run'),stopButton=find('stop');
  const reduceButton=find('reduce'),replayButton=find('replay'),reduction=find('reduction'),sampleDetails=find('sample-details'),sampleStatus=find('sample-status');
  const a=find('a'),b=find('b'),status=find('status'),fileStatus=find('file-status'),results=find('results');
  let accepted=null,busy=false,reading=false,disposed=false,runGeneration=0,fileGeneration=0,runner=null,resultRecord=null,witness=null,operation=null;
  const removers=[];
  function on(target,type,handler) {target.addEventListener(type,handler);removers.push(()=>target.removeEventListener(type,handler));}
  function message(text) {status.textContent=text;}
  function controls() {reduction.hidden=!resultRecord;reduceButton.disabled=!resultRecord || busy || reading;replayButton.hidden=!witness;replayButton.disabled=!witness || busy || reading;runButton.disabled=!accepted || busy || reading;clear.disabled=!accepted && !reading;a.disabled=b.disabled=!accepted;stopButton.hidden=!busy;}
  function invalidate(text) {
    runGeneration++;busy=false;operation=null;resultRecord=null;clearSample();runner?.stop();results.hidden=true;find('result-a').replaceChildren();find('result-b').replaceChildren();
    if (text) message(text);controls();
  }
  function tableView(target,columns,rows,caption,headers,marks) {
    target.replaceChildren();const table=doc.createElement('table'),cap=doc.createElement('caption');cap.textContent=caption;table.append(cap);
    const head=doc.createElement('thead'),tr=doc.createElement('tr');
    if(marks){const th=doc.createElement('th');th.scope='col';th.textContent='比较状态';tr.append(th);}
    columns.forEach((column,index)=>{const th=doc.createElement('th');th.scope='col';th.textContent=column;if(headers){const small=doc.createElement('small');small.textContent=headers[index];th.append(small);}tr.append(th);});head.append(tr);table.append(head);
    const body=doc.createElement('tbody');
    rows.forEach((row,index)=>{const line=doc.createElement('tr');if(marks){const td=doc.createElement('td'),mark=marks.values[index];td.textContent=mark==='extra'?'A 独有':mark==='missing'?'B 独有':mark==='order'?'顺序不同':'相同';td.dataset.localMark=mark || 'same';line.append(td);}row.forEach(cell=>{const td=doc.createElement('td');
      if (typeof cell==='string') td.textContent=cell===''?'（空字符串）':cell;
      else { td.textContent=cell.type==='null'?'NULL':cell.type==='text' && cell.value===''?'（空字符串）':String(cell.value);const kind=doc.createElement('small');kind.className='local-table-cell-type';kind.textContent=cell.type.toUpperCase();td.append(kind); }
      line.append(td);});body.append(line);});table.append(body);target.append(table);
  }
  function clearSample() {witness=null;sampleDetails.open=false;sampleDetails.hidden=true;sampleStatus.textContent='';find('sample-difference').textContent='';for(const name of ['sample-rows','sample-a','sample-b'])find(name).replaceChildren();}
  function errorText(error) {if(error?.localTableCode==='queryTimeout')return '整次样本操作超过 1.5 秒，已停止，未保留样本。可减少表规模后重试。';return Object.hasOwn(REDUCTION_ERRORS,error?.reductionCode)?REDUCTION_ERRORS[error.reductionCode]:Object.hasOwn(ERRORS,error?.localTableCode)?ERRORS[error.localTableCode]:'操作未完成，请检查 SQL、运行限制与网络后重试。';}
  function getRunner() {return runner ||= runnerFactory({onState:state=>{if(!busy)return;const text=state==='loading'?'正在载入 SQLite…':operation==='reduce'?'正在限额搜索差异样本…':operation==='replay'?'正在重新验证样本…':'正在运行 A / B…';if(operation==='run')message(text);else sampleStatus.textContent=text;}});}
  function showSample(sample) {
    const indices=sample.sourceIndices,pair=sample.pair,state=pair.comparison.state;
    tableView(find('sample-rows'),['源记录号',...accepted.columns],indices.slice(0,20).map(index=>[String(index+1),...accepted.rows[index]]),'样本共 '+indices.length+' 条记录 · 预览前 '+Math.min(20,indices.length)+' 条',null);
    tableView(find('sample-a'),pair.a.columns,pair.a.rows.slice(0,20),'样本 A 共 '+pair.a.rows.length+' 行 · 预览前 '+Math.min(20,pair.a.rows.length)+' 行',null,{values:pair.comparison.actualMarks || []});
    tableView(find('sample-b'),pair.b.columns,pair.b.rows.slice(0,20),'样本 B 共 '+pair.b.rows.length+' 行 · 预览前 '+Math.min(20,pair.b.rows.length)+' 行',null,{values:(state==='order'?pair.comparison.actualMarks:pair.comparison.expectedMarks) || []});
    find('sample-difference').textContent=state==='order'?'样本上行内容与重复次数一致，但顺序不同。':'样本上 A / B 的结果不同。'+(pair.a.columns.length!==pair.b.columns.length?'列数不同。':'')+'独有行按重复次数计算；请对照类型与值。';
    sampleDetails.hidden=false;sampleDetails.open=false;
  }
  async function sampleOperation(kind) {
    if(disposed || !accepted || !resultRecord || busy || reading || !host.open || doc.hidden || (kind==='replay' && !witness))return;
    if(a.value!==resultRecord.sqlA || b.value!==resultRecord.sqlB){invalidate('SQL 已修改；请重新运行普通比较。');return;}
    const saved=witness,record=resultRecord,ticket=++runGeneration;clearSample();operation=kind;busy=true;controls();sampleStatus.textContent='正在载入 SQLite…';
    try {
      const output=await getRunner().run(accepted,record.sqlA,record.sqlB,kind==='reduce'?{operation:kind,expectedPair:record.pair}:{operation:kind,witness:saved});
      if(disposed || ticket!==runGeneration || operation!==kind || resultRecord!==record)return;
      if(kind==='replay') {witness={...saved,sourceIndices:output.sourceIndices,pair:output.pair};showSample(witness);sampleStatus.textContent='已在新 Worker 中重新验证此样本；当前样本仍呈现差异。';}
      else {sampleStatus.textContent=output.originalRows+' → '+output.sourceIndices.length+' 条记录；候选 '+output.candidateChecks+' / 64；未知候选 '+output.unknownCandidates+'。'+(output.budgetExhausted?'已达预算，搜索未穷尽。':output.status==='not-found'?'本次搜索未找到更小样本；不代表最少。':'已复验此样本；不保证最少。');if(output.status==='reduced'){witness=output;showSample(output);}}
    } catch(error) {if(!disposed && ticket===runGeneration && operation===kind){clearSample();sampleStatus.textContent=error?.cancelled?'已停止；样本已失效。':errorText(error);}}
    finally {if(!disposed && ticket===runGeneration && operation===kind){busy=false;operation=null;controls();}}
  }
  async function importFile(selected) {
    if (!selected || disposed) return;
    const ticket=++fileGeneration,separator=delimiter.value==='tab'?'\t':',';reading=true;controls();fileStatus.textContent='正在读取本地文件…';
    try {
      if (!Number.isFinite(selected.size) || selected.size>MAX_BYTES || selected.size<1) throw new Error();
      const [bytes,core]=await Promise.all([readFile(selected),loadCore()]);
      if(disposed || ticket!==fileGeneration) return;
      const parsed=core.parseLocalTable(bytes,separator);
      // Commit only after the entire replacement passes validation.
      accepted=parsed;reading=false;invalidate('已载入新表；旧结果已失效。确认 SQL 后点击运行。');
      tableView(find('preview'),parsed.columns,parsed.rows.slice(0,20),'前 '+Math.min(20,parsed.rows.length)+' 行预览',parsed.headers);
      find('table-count').textContent=parsed.rows.length+' 行 · '+parsed.columns.length+' 列';find('preview-section').hidden=false;
      fileStatus.textContent='已载入。原表头映射为 c1…c'+parsed.columns.length+'；未自动运行。';
    } catch {
      if(disposed || ticket!==fileGeneration) return;
      fileStatus.textContent='文件未被接受。请检查 UTF-8 编码、分隔符、行列数与长度限制。'+(accepted?'此前的表与已有结果保持不变。':'');
    } finally {if(!disposed && ticket===fileGeneration){reading=false;file.value='';controls();}}
  }
  async function run() {
    if (disposed || !accepted || busy || reading || !host.open || doc.hidden) return;
    const sqlA=a.value,sqlB=b.value;
    invalidate();const ticket=runGeneration;
    if (!sqlA.trim() || !sqlB.trim() || sqlA.length>4000 || sqlB.length>4000) {message('请为 A / B 各输入最多 4,000 字符的只读 SQL。');return;}
    busy=true;operation='run';controls();message('正在载入 SQLite…');
    try {
      const pair=await getRunner().run(accepted,sqlA,sqlB);
      if (disposed || ticket!==runGeneration) return;
      const state=pair.a.truncated || pair.b.truncated?'limited':pair.comparison.state;
      const showMarks=state==='different' || state==='order';
      tableView(find('result-a'),pair.a.columns,pair.a.rows,'A · '+pair.a.rows.length+' 行'+(pair.a.truncated?'（已截断）':''),null,showMarks?{values:pair.comparison.actualMarks || []}:null);
      tableView(find('result-b'),pair.b.columns,pair.b.rows,'B · '+pair.b.rows.length+' 行'+(pair.b.truncated?'（已截断）':''),null,showMarks?{values:(state==='order'?pair.comparison.actualMarks:pair.comparison.expectedMarks) || []}:null);
      results.hidden=false;resultRecord=showMarks?{sqlA,sqlB,pair}:null;
      message(state==='match'?'当前数据上 A / B 的类型、值、重复次数与顺序一致；不代表普遍等价。':state==='limited'?'结果已截断，不作一致性判断。':state==='order'?'当前数据上行内容与重复次数一致，但顺序不同。':'当前数据上 A / B 的结果不同。'+(pair.a.columns.length!==pair.b.columns.length?'列数不同。':'')+'请对照类型、值与重复行；独有行按重复次数计算。');
    } catch(error) {if(!disposed && ticket===runGeneration)message(error?.cancelled?'已停止；旧结果已失效。': (Object.hasOwn(ERRORS,error?.localTableCode)?ERRORS[error.localTableCode]:'比较未完成。请检查 SQL、运行限制与网络后重试。'));}
    finally {if(!disposed && ticket===runGeneration){busy=false;operation=null;controls();}}
  }
  function clearData() {fileGeneration++;reading=false;accepted=null;invalidate('本地表与结果已清除。');file.value='';a.value=b.value=DEFAULT_SQL;find('preview').replaceChildren();find('preview-section').hidden=true;find('table-count').textContent='';fileStatus.textContent='选择文件后先预览，不会自动运行。';controls();}
  function leave() {fileGeneration++;reading=false;file.value='';if(accepted)fileStatus.textContent='本地表保留在当前页面内存；需要时手动重新运行。';else fileStatus.textContent='选择文件后先预览，不会自动运行。';invalidate('已停止；旧结果已失效，需要时手动重新运行。');}
  on(file,'change',()=>importFile(file.files?.[0]));
  on(delimiter,'change',()=>{fileGeneration++;reading=false;file.value='';fileStatus.textContent='分隔符已更改，请重新选择文件。'+(accepted?'当前已载入的表保持不变。':'');controls();});
  on(a,'input',()=>invalidate('SQL 已修改；旧结果已失效，尚未重新运行。'));
  on(b,'input',()=>invalidate('SQL 已修改；旧结果已失效，尚未重新运行。'));
  on(host,'keydown',event=>{if(event.isComposing || event.keyCode===229 || event.defaultPrevented || event.repeat || ![a,b].includes(event.target))return;if(event.key==='Enter' && (event.ctrlKey || event.metaKey)){event.preventDefault();run();}});
  on(reduceButton,'click',()=>sampleOperation('reduce'));on(replayButton,'click',()=>sampleOperation('replay'));
  on(runButton,'click',run);on(stopButton,'click',()=>{invalidate('已停止；旧结果已失效，可修改后再运行。');runButton.focus();});on(clear,'click',clearData);
  on(host,'toggle',()=>{if(!host.open)leave();});
  on(win,'pagehide',clearData);on(doc,'visibilitychange',()=>{if(doc.hidden)leave();});on(doc,'atelier:dialog-open',leave);
  file.disabled=false;controls();
  const controller={run,importFile,clear:clearData,stop:leave,destroy(){clearData();disposed=true;removers.forEach(remove=>remove());file.disabled=true;controllers.delete(host);}};
  controllers.set(host,controller);return controller;
}
if(typeof document!=='undefined')initLocalTable();
