import {SQL_ENGINE, SQL_CASE_REVISION, SQL_LIMITS, getSqlDataset} from './research-sql-core.mjs';

export const SQL_SNAPSHOT_LIMIT = 32 * 1024;
const fields = ['format','version','engine','caseId','caseRevision','datasetId','datasetRevision','sql'];
const byteLength = text => new TextEncoder().encode(text).length;

export function validateSqlSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('草稿必须是 JSON 对象。');
  const keys = Object.keys(value);
  if (keys.length !== fields.length || fields.some(key => !Object.hasOwn(value,key)) || keys.some(key => !fields.includes(key))) throw new Error('草稿字段不完整或包含不支持的字段。');
  if (value.format !== 'cc-atelier-sql' || value.version !== 1 || value.engine !== SQL_ENGINE) throw new Error('不支持此草稿格式、版本或 SQLite 引擎。');
  if (typeof value.caseId !== 'string' || typeof value.datasetId !== 'string') throw new Error('案例与数据集标识无效。');
  if (value.caseRevision !== SQL_CASE_REVISION || value.datasetRevision !== 1) throw new Error('不支持此案例或数据集版本。');
  getSqlDataset(value.caseId,value.datasetId,value.caseRevision,value.datasetRevision);
  if (typeof value.sql !== 'string' || value.sql.length > SQL_LIMITS.queryChars || value.sql.includes('\0')) throw new Error('草稿 SQL 最多 4,000 字符，且不能包含空字符。');
  // Copy only recognized primitives. Draft SQL deliberately need not be runnable.
  return Object.fromEntries(fields.map(key => [key,value[key]]));
}
export function createSqlSnapshot(caseId, datasetId, sql) {
  return validateSqlSnapshot({format:'cc-atelier-sql',version:1,engine:SQL_ENGINE,caseId,caseRevision:SQL_CASE_REVISION,datasetId,datasetRevision:1,sql});
}
export function serializeSqlSnapshot(value) {
  const text = JSON.stringify(validateSqlSnapshot(value),null,2) + '\n';
  if (byteLength(text) > SQL_SNAPSHOT_LIMIT) throw new Error('草稿文件最多 32 KiB。');
  return text;
}
export function parseSqlSnapshot(text) {
  if (typeof text !== 'string' || text.length > SQL_SNAPSHOT_LIMIT || byteLength(text) > SQL_SNAPSHOT_LIMIT) throw new Error('草稿文件最多 32 KiB。');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('无法读取 JSON 草稿。'); }
  return validateSqlSnapshot(value);
}
