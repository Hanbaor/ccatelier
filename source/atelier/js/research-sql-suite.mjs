import {listSqlDatasets, getSqlDataset, validateQuery, compareResults} from './research-sql-core.mjs';

// Fixed published fixtures only. This is a finite regression check, never a proof
// of equivalence or a generator of arbitrary user-provided database setups.
export const SQL_SUITE_LIMIT = 8;
export async function runSqlSuite({caseId, sql, runner, isCurrent=()=>true, onUpdate=()=>{}}) {
  validateQuery(sql);
  const datasets=listSqlDatasets(caseId);
  if (datasets.length > SQL_SUITE_LIMIT) throw new Error('数据集数量超过验证上限。');
  const results=datasets.map(data=>({...data,state:'pending'}));
  const publish=()=>onUpdate(results.map(row=>({...row})));
  for (let index=0;index<results.length;index++) {
    if (!isCurrent()) return null;
    results[index]={...results[index],state:'running'}; publish();
    try {
      const actual=await runner.run(caseId,sql,results[index].id);
      if (!isCurrent()) return null;
      const expected=getSqlDataset(caseId,results[index].id).expected;
      const comparison=compareResults(actual,expected);
      results[index]={...results[index],state:comparison.state,actualCount:actual.rows.length,expectedCount:expected.rows.length,extra:comparison.extra,missing:comparison.missing};
    } catch (error) {
      if (!isCurrent() || error.cancelled) return null;
      results[index]={...results[index],state:'error',error:(error.message || '查询失败。').slice(0,512)};
    }
    if (!isCurrent()) return null;
    publish();
  }
  return results;
}

export function renderSqlSuite(output, results, investigate) {
  const doc=output.ownerDocument, table=doc.createElement('table');
  table.createCaption().textContent='同一候选 SQL · 固定数据集验证';
  const head=table.createTHead().insertRow();
  for (const label of ['数据集','实际 / 预期行数','比较结果','查看']) {
    const cell=doc.createElement('th'); cell.scope='col'; cell.textContent=label; head.append(cell);
  }
  const labels={pending:'等待',running:'正在运行',match:'此数据集一致',order:'值与次数一致，顺序不同',limited:'结果截断，未判断'};
  const body=table.createTBody();
  for (const result of results) {
    const row=body.insertRow(); row.dataset.state=result.state;
    const name=doc.createElement('th'); name.scope='row'; name.textContent=result.label; row.append(name);
    row.insertCell().textContent=result.actualCount===undefined ? '—' : `${result.state==='limited' ? '≥' : ''}${result.actualCount} / ${result.expectedCount}`;
    row.insertCell().textContent=result.state==='error' ? `错误：${result.error}` : result.state==='different' ? `+${result.extra} / −${result.missing}` : labels[result.state] || '未判断';
    const cell=row.insertCell(),button=doc.createElement('button'); button.type='button'; button.className='sql-text-button'; button.textContent='查看数据'; button.dataset.sqlSuiteDataset=result.id;
    button.setAttribute('aria-label',`查看${result.label}，不运行查询`);
    button.disabled=results.some(item=>['pending','running'].includes(item.state));
    button.addEventListener('click',()=>investigate(result.id)); cell.append(button);
  }
  output.replaceChildren(table);
}
