import {SQL_ENGINE, SQL_CASE_REVISION, SQL_LIMITS, getSqlDataset, validateQuery, compareResults} from './research-sql-core.mjs';

export const SQL_REPORT_LIMIT = 1024 * 1024;
const records = new WeakSet();
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const wrapped = sql => `SELECT * FROM (\n${validateQuery(sql)}\n) AS query_result LIMIT ${SQL_LIMITS.rows + 1}`;
function typedCell(value) {
  if (value === null) return {type:'null',value:null};
  if (typeof value === 'string' && value.length <= SQL_LIMITS.cellChars) return {type:'string',value};
  if (typeof value === 'number') return {type:'number',value:Object.is(value,-0) ? '-0' : Number.isFinite(value) ? value : String(value)};
  throw new Error('运行记录包含不支持的值。');
}
function typedResult(result) {
  if (!result || result.truncated !== false || !Array.isArray(result.columns) || result.columns.length < 1 || result.columns.length > SQL_LIMITS.columns || !result.columns.every(column => typeof column === 'string' && column.length <= SQL_LIMITS.queryChars + 64) || !Array.isArray(result.rows) || result.rows.length > SQL_LIMITS.rows) throw new Error('仅能导出完整且有界的运行结果。');
  return {columns:[...result.columns], rows:result.rows.map(row => {
    if (!Array.isArray(row) || row.length !== result.columns.length) throw new Error('运行记录的结果形状无效。');
    return row.map(typedCell);
  }), truncated:false};
}
// Construct only from a completed worker observation. This is an export format,
// not a trusted import format, SQL-equivalence proof or replay guarantee.
export function createSqlRunRecord({caseId,datasetId,sql,result}) {
  const fixture=getSqlDataset(caseId,datasetId), evidence=result?.runEvidence;
  validateQuery(sql);
  if (!evidence || evidence.caseId !== caseId || evidence.datasetId !== datasetId || evidence.sql !== sql || evidence.engine !== SQL_ENGINE || typeof evidence.sqliteVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(evidence.sqliteVersion) || evidence.referenceCheckedAgainstFixture !== true) throw new Error('缺少此查询的完整执行记录。');
  if (!Number.isFinite(evidence.queryMs) || evidence.queryMs <= 0 || !Number.isFinite(evidence.loadMs) || evidence.loadMs <= 0) throw new Error('缺少实际运行时限。');
  const actual=typedResult(result), reference=typedResult(evidence.reference);
  if (compareResults(evidence.reference,fixture.expected).state !== 'match') throw new Error('参考执行结果不符。');
  const record={
    format:'cc-atelier-sql-run',version:1,
    engine:{package:SQL_ENGINE,sqliteVersion:evidence.sqliteVersion,sqliteVersionObservedAt:'worker-initialization'},
    fixture:{caseId,caseRevision:SQL_CASE_REVISION,datasetId,datasetRevision:1,schema:fixture.schema,tables:fixture.tables.map(table=>({name:table.name,columns:[...table.columns],rows:table.rows.map(row=>row.map(typedCell))}))},
    execution:{status:'complete',submittedSql:sql,executedSql:wrapped(sql),referenceSql:fixture.reference,executedReferenceSql:wrapped(fixture.reference),referenceCheckedAgainstFixture:true},
    actual,reference,comparison:compareResults(result,fixture.expected),
    comparisonSemantics:{columnCount:true,columnLabels:false,values:'Existing JavaScript-typed JSON row-key comparison; column positions matter',duplicates:true,order:true},
    limits:{queryChars:SQL_LIMITS.queryChars,rows:SQL_LIMITS.rows,columns:SQL_LIMITS.columns,cellChars:SQL_LIMITS.cellChars,heapBytes:SQL_LIMITS.heapBytes,queryMs:evidence.queryMs,loadMs:evidence.loadMs,reportBytes:SQL_REPORT_LIMIT},
    scope:[
      'Original fixed teaching fixture only; not CARVE measurements or general SQL equivalence.',
      'Observed JavaScript number values; SQLite INTEGER/REAL storage classes and exact 64-bit integers are not retained. Number tags preserve non-finite values and negative zero; comparison keeps the existing JSON row-key semantics.',
      'Random/time/stateful queries and tied or unspecified ordering may differ on replay. This records an observation, not a reproducibility guarantee.',
      'Candidate and reference execute in separate fresh read-only fixture databases. The wall-clock query deadline covers both executions and reference validation; load deadline is separate.',
      'Column labels are displayed only and are not compared. Truncated, failed, cancelled and timed-out runs are not supported by this export format.'
    ]
  };
  freeze(record); records.add(record); return record;
}
export function serializeSqlRunRecord(record) {
  if (!records.has(record)) throw new Error('只能导出本次会话中已完成的运行记录。');
  const text=JSON.stringify(record,null,2)+'\n';
  if (new TextEncoder().encode(text).length > SQL_REPORT_LIMIT) throw new Error('运行记录超过 1 MiB，无法导出；查询结果保留。');
  return text;
}
