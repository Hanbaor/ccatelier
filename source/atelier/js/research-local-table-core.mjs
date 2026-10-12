// Temporary local tables have no case IDs, snapshots, persistence or network API.
export const LOCAL_TABLE_LIMITS = Object.freeze({fileBytes:256 * 1024, rows:500, columns:16, cellChars:512, headerChars:128, queryChars:4000, resultRows:100, heapBytes:16 * 1024 * 1024});
export class LocalTableError extends Error {}
const fail = message => { throw new LocalTableError(message); };
const encoder = new TextEncoder();
const validText = (value, limit) => typeof value === 'string' && value.length <= limit && !value.includes('\0');

export function validateLocalTable(table) {
  if (!table || !Array.isArray(table.headers) || !Array.isArray(table.columns) || !Array.isArray(table.rows)) fail('表格格式无效。');
  const width = table.headers.length;
  if (width < 1 || width > LOCAL_TABLE_LIMITS.columns || table.columns.length !== width || Array.from(table.headers).some(value => !validText(value, LOCAL_TABLE_LIMITS.headerChars)) || Array.from(table.columns).some((value,index) => value !== `c${index + 1}`)) fail('表格最多 16 列，表头最多 128 字符。');
  if (table.rows.length > LOCAL_TABLE_LIMITS.rows) fail('表格最多 500 行数据。');
  let bytes = table.headers.reduce((sum,value) => sum + encoder.encode(value).length, 0);
  const rows = Array.from(table.rows, row => {
    if (!Array.isArray(row) || row.length !== width || Array.from(row).some(value => !validText(value, LOCAL_TABLE_LIMITS.cellChars))) fail('每行列数须一致，单元格最多 512 字符且不能包含空字符。');
    for (const value of row) bytes += encoder.encode(value).length;
    if (bytes > LOCAL_TABLE_LIMITS.fileBytes) fail('表格内容超过 256 KiB。');
    return [...row];
  });
  return {headers:[...table.headers], columns:[...table.columns], rows};
}

// Explicit CSV/TSV dialect: quoted fields, doubled quotes, LF or CRLF records.
// Empty records are data; a final record separator adds no phantom row.
export function parseLocalTable(input, delimiter=',') {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  if (!(bytes instanceof Uint8Array)) fail('请读取 UTF-8 文件。');
  if (bytes.byteLength > LOCAL_TABLE_LIMITS.fileBytes) fail('文件最多 256 KiB。');
  if (delimiter !== ',' && delimiter !== '\t') fail('请选择 CSV 或 TSV。');
  let text;
  try { text = new TextDecoder('utf-8', {fatal:true}).decode(bytes); }
  catch { fail('文件必须使用有效的 UTF-8 编码。'); }
  if (!text.length) fail('文件需要一行表头。');
  if (text.includes('\0')) fail('文件不能包含空字符。');
  const records = [];
  let row = [], field = '', state = 'start', started = false;
  const append = char => {
    field += char;
    if (field.length > (records.length ? LOCAL_TABLE_LIMITS.cellChars : LOCAL_TABLE_LIMITS.headerChars)) fail(records.length ? '单元格最多 512 字符。' : '表头最多 128 字符。');
  };
  const finishField = () => {
    row.push(field); field = ''; state = 'start';
    if (row.length > LOCAL_TABLE_LIMITS.columns) fail('表格最多 16 列。');
  };
  const finishRow = () => {
    finishField();
    if (records.length && row.length !== records[0].length) fail('每行的列数必须与表头一致。');
    records.push(row); row = []; started = false;
    if (records.length > LOCAL_TABLE_LIMITS.rows + 1) fail('表格最多 500 行数据。');
  };
  for (let index=0; index<text.length; index++) {
    const char = text[index]; started = true;
    if (state === 'quoted') {
      if (char === '"') {
        if (text[index + 1] === '"') { append('"'); index++; }
        else state = 'closed';
      } else append(char);
      continue;
    }
    if (char === delimiter) { finishField(); continue; }
    if (char === '\n' || char === '\r') {
      if (char === '\r') {
        if (text[index + 1] !== '\n') fail('换行须使用 LF 或 CRLF。');
        index++;
      }
      finishRow(); continue;
    }
    if (state === 'closed') fail('引号关闭后只能接分隔符或换行。');
    if (char === '"') {
      if (state !== 'start') fail('字段中的引号须使用双引号转义。');
      state = 'quoted';
    } else { append(char); state = 'plain'; }
  }
  if (state === 'quoted') fail('文件含未闭合的引号。');
  if (started) finishRow();
  const headers = records.shift();
  return validateLocalTable({headers, columns:headers.map((_,index) => `c${index + 1}`), rows:records});
}

export function validateLocalQuery(sql) {
  if (typeof sql !== 'string' || !sql.trim()) fail('请填写两条 SELECT 或 WITH 查询。');
  if (sql.length > LOCAL_TABLE_LIMITS.queryChars) fail('每条查询最多 4,000 字符。');
  if (sql.includes(';') || sql.includes('\0')) fail('查询不能包含分号或空字符，包括注释与字符串中的分号。');
  if (!/^(SELECT|WITH)\b/i.test(sql.trim())) fail('这里只运行 SELECT 或 WITH 开头的只读查询。');
  return sql.trim();
}

function typedCell(value) {
  if (value === null) return {type:'null', value:null};
  if (typeof value === 'bigint') return {type:'integer', value:value.toString()};
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('结果包含非有限实数，无法可靠比较。');
    return {type:'real', value:Object.is(value, -0) ? 0 : value};
  }
  if (typeof value === 'string' && value.length <= LOCAL_TABLE_LIMITS.cellChars) return {type:'text', value};
  fail('结果不支持二进制值，文本单元格最多 512 字符。');
}

export function validateLocalSourceIndices(sourceIndices, rowCount) {
  if (!Array.isArray(sourceIndices) || Array.from(sourceIndices).some((value,index) => !Number.isSafeInteger(value) || value < 0 || value >= rowCount || index > 0 && value <= sourceIndices[index - 1])) fail('源记录索引无效。');
  return [...sourceIndices];
}

function execute(SQL, table, sql, sourceIndices, requireStandalone) {
  if (typeof BigInt !== 'function') fail('当前浏览器不支持无损整数读取。');
  let db, insert, statement;
  try {
    db = new SQL.Database();
    db.run(`PRAGMA hard_heap_limit = ${LOCAL_TABLE_LIMITS.heapBytes}`);
    const heap = db.exec('PRAGMA hard_heap_limit')[0]?.values[0]?.[0];
    if (!Number.isSafeInteger(heap) || heap <= 0 || heap > LOCAL_TABLE_LIMITS.heapBytes) fail('数据库内存边界未就绪。');
    db.run(`CREATE TABLE local_data (${table.columns.map(name => `"${name}" TEXT`).join(',')})`);
    insert = db.prepare(`INSERT INTO local_data (rowid,${table.columns.join(',')}) VALUES (?,${table.columns.map(() => '?').join(',')})`);
    for (const index of sourceIndices) insert.run([index + 1, ...table.rows[index]]);
    insert.free(); insert = null;
    db.run('PRAGMA query_only = ON');
    if (db.exec('PRAGMA query_only')[0]?.values[0]?.[0] !== 1) fail('只读数据库未就绪。');
    if (requireStandalone) {
      statement = db.prepare(sql);
      if (statement.getSQL() !== sql) fail('每次只运行一条完整的只读查询。');
      statement.free(); statement = null;
    }
    const wrapped = `SELECT * FROM (\n${sql}\n) AS query_result LIMIT ${LOCAL_TABLE_LIMITS.resultRows + 1}`;
    statement = db.prepare(wrapped);
    if (statement.getSQL() !== wrapped) fail('每次只运行一条完整的只读查询。');
    const columns = statement.getColumnNames();
    if (columns.length < 1 || columns.length > LOCAL_TABLE_LIMITS.columns || columns.some(name => typeof name !== 'string' || name.length > LOCAL_TABLE_LIMITS.queryChars + 64)) fail('结果最多支持 16 列。');
    const rows = [];
    let truncated = false;
    while (statement.step()) {
      if (rows.length === LOCAL_TABLE_LIMITS.resultRows) { truncated = true; break; }
      // The shipped sql.js implements this option using sqlite3_column_text for
      // INTEGER only; REAL remains the engine's binary64 value. No polyfill.
      rows.push(statement.get(undefined, {useBigInt:true}).map(typedCell));
    }
    return {columns, rows, truncated};
  } catch (error) {
    if (error instanceof LocalTableError) throw error;
    // SQLite errors can echo identifiers or values: do not forward raw errors.
    fail('查询无法完成，请检查 SQL、列名与资源限制。');
  } finally {
    try { statement?.free(); } finally { try { insert?.free(); } finally { db?.close(); } }
  }
}

function resultKey(row) {
  if (!Array.isArray(row) || Array.from(row).some(cell => !cell || !(
    cell.type === 'null' && cell.value === null ||
    cell.type === 'text' && typeof cell.value === 'string' && cell.value.length <= LOCAL_TABLE_LIMITS.cellChars ||
    cell.type === 'integer' && typeof cell.value === 'string' && /^(?:0|-?[1-9][0-9]*)$/.test(cell.value) && cell.value.length <= 20 && BigInt(cell.value) >= -9223372036854775808n && BigInt(cell.value) <= 9223372036854775807n ||
    cell.type === 'real' && typeof cell.value === 'number' && Number.isFinite(cell.value)
  ))) fail('结果包含不支持的数值或类型。');
  return JSON.stringify(row.map(cell => [cell.type, cell.value]));
}

export function compareLocalResults(a, b) {
  for (const result of [a,b]) {
    if (!result || !Array.isArray(result.columns) || result.columns.length < 1 || result.columns.length > LOCAL_TABLE_LIMITS.columns || !Array.isArray(result.rows) || result.rows.length > LOCAL_TABLE_LIMITS.resultRows || typeof result.truncated !== 'boolean' || Array.from(result.rows).some(row => !Array.isArray(row) || row.length !== result.columns.length)) fail('结果格式无效。');
  }
  const keysA = a.rows.map(resultKey), keysB = b.rows.map(resultKey);
  if (a.truncated || b.truncated) return {state:'limited', actualMarks:[], expectedMarks:[], missing:0, extra:0};
  const shape = a.columns.length === b.columns.length;
  const marks = (keys, other, missing) => {
    const counts = new Map(); other.forEach(key => counts.set(key, (counts.get(key) || 0) + 1));
    return keys.map(key => {
      const count = counts.get(key) || 0;
      if (!shape || !count) return missing;
      counts.set(key, count - 1); return 'same';
    });
  };
  const actualMarks = marks(keysA, keysB, 'extra'), expectedMarks = marks(keysB, keysA, 'missing');
  const extra = actualMarks.filter(mark => mark === 'extra').length, missing = expectedMarks.filter(mark => mark === 'missing').length;
  const ordered = keysA.length === keysB.length && keysA.every((key,index) => key === keysB[index]);
  const state = extra || missing || !shape ? 'different' : ordered ? 'match' : 'order';
  if (state === 'order') actualMarks.forEach((_,index) => { if (keysA[index] !== keysB[index]) actualMarks[index] = 'order'; });
  return {state, actualMarks, expectedMarks, missing, extra};
}

export function runLocalTablePair(SQL, input, sqlA, sqlB, {sourceIndices, requireStandalone = false} = {}) {
  const table = validateLocalTable(input), queryA = validateLocalQuery(sqlA), queryB = validateLocalQuery(sqlB);
  const indices = sourceIndices === undefined ? table.rows.map((_,index) => index) : validateLocalSourceIndices(sourceIndices, table.rows.length);
  const a = execute(SQL, table, queryA, indices, requireStandalone), b = execute(SQL, table, queryB, indices, requireStandalone);
  return {a, b, comparison:compareLocalResults(a,b)};
}
