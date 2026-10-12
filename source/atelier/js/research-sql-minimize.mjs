import {validateMinimizerSql} from './research-sql-deterministic.mjs';
import {getSqlDataset, runFixtureQuery, subsetTables, compareResults, validateQuery, SQL_LIMITS} from './research-sql-core.mjs';

const popcount = value => { let count=0; for (;value;value&=value-1) count++; return count; };
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const differs = comparison => ['different','order'].includes(comparison.state);
const literal = value => value === null ? 'NULL' : typeof value === 'number' ? String(value) : "'" + value.replaceAll("'","''") + "'";

// A complete finite search, not a heuristic reduction: cardinality first, then
// source row bit order. Worst case: 64 subsets, 4 bounded SELECTs per subset.
// Repeatability checks detect observed instability; they cannot prove purity.
export function minimizeCounterexample(SQL, caseId, input, datasetId='default') {
  const sql=validateMinimizerSql(validateQuery(input)), fixture=getSqlDataset(caseId,datasetId);
  validateMinimizerSql(validateQuery(fixture.reference));
  const totalRows=fixture.tables.reduce((sum,table)=>sum+table.rows.length,0);
  subsetTables(fixture,0); // Enforce the finite search ceiling before allocation.
  const masks=Array.from({length:2 ** totalRows},(_,mask)=>mask).sort((a,b)=>popcount(a)-popcount(b)||a-b);
  let tested=0;
  for (const mask of masks) {
    tested++;
    let actual,reference;
    try {
      actual=runFixtureQuery(SQL,caseId,sql,datasetId,mask);
      reference=runFixtureQuery(SQL,caseId,fixture.reference,datasetId,mask);
      if (actual.truncated || reference.truncated) return {state:'inconclusive',reason:'结果截断，无法验证更小的数据。',tested,totalRows,totalSubsets:masks.length};
      const again=runFixtureQuery(SQL,caseId,sql,datasetId,mask);
      const referenceAgain=runFixtureQuery(SQL,caseId,fixture.reference,datasetId,mask);
      if (!same(actual,again) || !same(reference,referenceAgain)) return {state:'inconclusive',reason:'重复执行不一致；请使用确定性查询并显式指定顺序。',tested,totalRows,totalSubsets:masks.length};
    } catch (error) {
      return {state:'inconclusive',reason:`子集查询未完成：${String(error.message || error).slice(0,300)}`,tested,totalRows,totalSubsets:masks.length};
    }
    const comparison=compareResults(actual,reference);
    if (differs(comparison)) {
      const tables=subsetTables(fixture,mask);
      const inserts=tables.flatMap(table=>table.rows.map(row=>`INSERT INTO ${table.name} VALUES (${row.map(literal).join(', ')});`));
      const script=['-- 在新的临时 SQLite 数据库重放；只使用公开示例数据。',`PRAGMA hard_heap_limit = ${SQL_LIMITS.heapBytes};`,fixture.schema,...inserts,'PRAGMA query_only = ON;','-- 候选查询（与实验室相同的 101 行包装）',`SELECT * FROM (\n${sql}\n) AS query_result LIMIT 101;`,'-- 参考查询',`SELECT * FROM (\n${fixture.reference}\n) AS query_result LIMIT 101;`].join('\n');
      return {state:'witness',tested,totalRows,totalSubsets:masks.length,remainingRows:popcount(mask),mask,tables,actual,reference,comparison,script};
    }
  }
  return {state:'no-witness',tested,totalRows,totalSubsets:masks.length};
}

export function replayCounterexample(SQL,caseId,input,datasetId,mask) {
  validateMinimizerSql(validateQuery(input));
  const fixture=getSqlDataset(caseId,datasetId), tables=subsetTables(fixture,mask);
  validateMinimizerSql(validateQuery(fixture.reference));
  const actual=runFixtureQuery(SQL,caseId,input,datasetId,mask);
  const reference=runFixtureQuery(SQL,caseId,fixture.reference,datasetId,mask);
  const actualAgain=runFixtureQuery(SQL,caseId,input,datasetId,mask);
  const referenceAgain=runFixtureQuery(SQL,caseId,fixture.reference,datasetId,mask);
  if (actual.truncated || reference.truncated || !same(actual,actualAgain) || !same(reference,referenceAgain)) throw new Error('重放未能得到完整、稳定的结果。');
  return {tables,actual,reference,comparison:compareResults(actual,reference)};
}
