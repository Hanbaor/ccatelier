// Original, deliberately small teaching fixtures. These are not research results.
export const SQL_LIMITS = Object.freeze({queryChars:4000, rows:100, columns:16, cellChars:512, heapBytes:16 * 1024 * 1024, planRows:64, planDetailChars:512});
function deepFreeze(value) {
  Object.values(value).forEach(item => { if (item && typeof item === 'object') deepFreeze(item); });
  return Object.freeze(value);
}
export const SQL_CASES = deepFreeze([
  {
    id:'empty-count', label:'空集计数',
    question:'列出每位创作者的曲目数，包含 0 首，按 id 排序。',
    tables:[
      {name:'artists', columns:['id','name'], rows:[[1,'Aster'],[2,'Lumen'],[3,'Moss']]},
      {name:'tracks', columns:['id','artist_id','title'], rows:[[101,1,'Blue'],[102,1,'Gold'],[103,2,'Echo']]}
    ],
    schema:'CREATE TABLE artists(id INTEGER PRIMARY KEY, name TEXT NOT NULL); CREATE TABLE tracks(id INTEGER PRIMARY KEY, artist_id INTEGER NOT NULL, title TEXT NOT NULL);',
    candidate:'SELECT a.name, COUNT(*) AS tracks\nFROM artists AS a\nLEFT JOIN tracks AS t ON t.artist_id = a.id\nGROUP BY a.id, a.name\nORDER BY a.id',
    reference:'SELECT a.name, COUNT(t.id) AS tracks\nFROM artists AS a\nLEFT JOIN tracks AS t ON t.artist_id = a.id\nGROUP BY a.id, a.name\nORDER BY a.id',
    expected:{columns:['name','tracks'], rows:[['Aster',2],['Lumen',1],['Moss',0]]},
    insight:'LEFT JOIN 为 Moss 留下一行，t.id 是 NULL。COUNT(*) 数行；COUNT(t.id) 只数非空值。',
    source:'https://sqlite.org/lang_aggfunc.html'
  },
  {
    id:'top-ties', label:'并列第一',
    question:'列出所有最高分曲目，保留并列，按曲名排序。',
    tables:[{name:'scores', columns:['track','points'], rows:[['Blue',95],['Gold',95],['Echo',88]]}],
    schema:'CREATE TABLE scores(track TEXT PRIMARY KEY, points INTEGER NOT NULL);',
    candidate:'SELECT track, points\nFROM scores\nORDER BY points DESC, track\nLIMIT 1',
    reference:'SELECT track, points\nFROM scores\nWHERE points = (SELECT MAX(points) FROM scores)\nORDER BY track',
    expected:{columns:['track','points'], rows:[['Blue',95],['Gold',95]]},
    insight:'LIMIT 1 只保留一行。先取最高分，再筛选同分曲目，才能保留全部并列。',
    source:'https://sqlite.org/lang_select.html#the_limit_clause'
  },
  {
    id:'null-exclusion', label:'空值陷阱',
    question:'列出尚未排练的曲目，忽略未指定曲目的记录，按 id 排序。',
    tables:[
      {name:'tracks', columns:['id','title'], rows:[[101,'Blue'],[102,'Gold'],[103,'Echo']]},
      {name:'rehearsals', columns:['id','track_id'], rows:[[1,102],[2,null]]}
    ],
    schema:'CREATE TABLE tracks(id INTEGER PRIMARY KEY NOT NULL, title TEXT NOT NULL); CREATE TABLE rehearsals(id INTEGER PRIMARY KEY, track_id INTEGER);',
    candidate:'SELECT t.id, t.title\nFROM tracks AS t\nWHERE t.id NOT IN (SELECT track_id FROM rehearsals)\nORDER BY t.id',
    reference:'SELECT t.id, t.title\nFROM tracks AS t\nWHERE NOT EXISTS (\n  SELECT 1 FROM rehearsals AS r WHERE r.track_id = t.id\n)\nORDER BY t.id',
    expected:{columns:['id','title'], rows:[[101,'Blue'],[103,'Echo']]},
    insight:'本例曲目 id 非空。子查询含 NULL，未命中的 NOT IN 得到未知值，WHERE 不保留；已命中的也被排除。NOT EXISTS 只检查匹配行，本例保留 Blue 和 Echo。',
    source:'https://sqlite.org/lang_expr.html#the_in_and_not_in_operators'
  }
]);

export function getSqlCase(id) {
  const fixture = SQL_CASES.find(item => item.id === id);
  if (!fixture) throw new Error('未知示例，请重新选择。');
  return fixture;
}

// Published revision 1 fixtures are immutable. Add a new revision rather than
// changing these rows when an exported draft must continue to replay them.
export const SQL_ENGINE = 'sql.js@1.14.2';
export const SQL_CASE_REVISION = 1;
const variants = deepFreeze({
  'empty-count':[
    {id:'no-tracks', label:'没有曲目', rows:[null,[]], expected:[['Aster',0],['Lumen',0],['Moss',0]]},
    {id:'empty', label:'全部为空', rows:[[],[]], expected:[]}
  ],
  'top-ties':[
    {id:'unique', label:'唯一最高分', rows:[[['Blue',95],['Gold',94],['Echo',88]]], expected:[['Blue',95]]},
    {id:'empty', label:'没有评分', rows:[[]], expected:[]}
  ],
  'null-exclusion':[
    {id:'no-null', label:'没有空值', rows:[null,[[1,102]]], expected:[[101,'Blue'],[103,'Echo']]},
    {id:'empty-rehearsals', label:'没有排练', rows:[null,[]], expected:[[101,'Blue'],[102,'Gold'],[103,'Echo']]}
  ]
});
export function listSqlDatasets(caseId) {
  getSqlCase(caseId);
  return [{id:'default',label:'原始反例',revision:1}, ...variants[caseId].map(item => ({id:item.id,label:item.label,revision:1}))];
}
export function getSqlDataset(caseId, datasetId='default', caseRevision=1, datasetRevision=1) {
  const fixture = getSqlCase(caseId);
  if (caseRevision !== SQL_CASE_REVISION || datasetRevision !== 1) throw new Error('不支持此案例或数据集版本。');
  if (datasetId === 'default') return fixture;
  const variant = variants[caseId].find(item => item.id === datasetId);
  if (!variant) throw new Error('未知数据集，请重新选择。');
  return deepFreeze({...fixture,
    tables:fixture.tables.map((table,index) => ({...table,rows:variant.rows[index] ?? table.rows})),
    expected:{columns:fixture.expected.columns,rows:variant.expected}
  });
}

export function validateQuery(sql) {
  if (typeof sql !== 'string' || !sql.trim()) throw new Error('先写一条 SELECT 或 WITH 查询。');
  if (sql.length > SQL_LIMITS.queryChars) throw new Error('查询最多 4,000 个字符。');
  if (sql.includes(';')) throw new Error('每次只运行一条查询，请删除所有分号（包括注释或字符串中的分号）。');
  if (sql.includes('\0')) throw new Error('查询不能包含空字符。');
  if (!/^(SELECT|WITH)\b/i.test(sql.trim())) throw new Error('这里只运行 SELECT 或 WITH 开头的只读查询。');
  return sql.trim();
}

// SQL remains SQL: SQLite parses the complete SELECT wrapper. The initial-word
// check is a helpful error, not the safety boundary. Semicolons/NUL are disallowed
// everywhere, so input cannot introduce a second statement or change query_only.
// An outer LIMIT is an optimization; the independent step limit still applies
// when a valid input comment or expression changes the wrapper's structure.
function withFixtureQuery(SQL, caseId, input, datasetId, consume) {
  const fixture = getSqlDataset(caseId, datasetId), sql = validateQuery(input);
  const db = new SQL.Database();
  try {
    db.run(`PRAGMA hard_heap_limit = ${SQL_LIMITS.heapBytes}`);
    db.run(fixture.schema);
    for (const table of fixture.tables) {
      const statement = db.prepare(`INSERT INTO ${table.name} VALUES (${table.columns.map(() => '?').join(',')})`);
      try { for (const row of table.rows) statement.run(row); }
      finally { statement.free(); }
    }
    db.run('PRAGMA query_only = ON');
    if (db.exec('PRAGMA query_only')[0]?.values[0]?.[0] !== 1) throw new Error('只读数据库未就绪。');
    const wrapped = `SELECT * FROM (\n${sql}\n) AS query_result LIMIT ${SQL_LIMITS.rows + 1}`;
    const statement = db.prepare(wrapped);
    if (statement.getSQL() !== wrapped) throw new Error('每次只运行一条完整的只读查询。');
    const columns = statement.getColumnNames();
    if (columns.length > SQL_LIMITS.columns) throw new Error('结果最多支持 16 列。');
    return consume(db, statement, wrapped, columns);
  } finally { db.close(); }
}

export function runFixtureQuery(SQL, caseId, input, datasetId='default') {
  return withFixtureQuery(SQL, caseId, input, datasetId, (db, statement, wrapped, columns) => {
    const rows = [];
    let truncated = false;
    while (statement.step()) {
      if (rows.length === SQL_LIMITS.rows) { truncated = true; break; }
      const row = statement.get();
      if (row.some(value => value instanceof Uint8Array || (typeof value === 'string' && value.length > SQL_LIMITS.cellChars))) {
        throw new Error('结果过大：不显示二进制值，单元格最多 512 个字符。');
      }
      rows.push(row);
    }
    return {columns, rows, truncated};
  });
}

// The prefix is internal only: user SQL still passes the identical SELECT
// wrapper preparation and read-only validation as execution. EQP never steps
// the candidate statement and describes precisely that bounded wrapper.
export function explainFixtureQuery(SQL, caseId, input, datasetId='default') {
  return withFixtureQuery(SQL, caseId, input, datasetId, (db, candidate, wrapped) => {
    candidate.free();
    const sql = `EXPLAIN QUERY PLAN ${wrapped}`;
    const statement = db.prepare(sql);
    if (statement.getSQL() !== sql || statement.getColumnNames().length !== 4) throw new Error('无法读取完整执行计划。');
    const rows = [];
    let truncated = false;
    while (statement.step()) {
      if (rows.length === SQL_LIMITS.planRows) { truncated = true; break; }
      const [id,parent,aux,detail] = statement.get();
      if (![id,parent,aux].every(Number.isSafeInteger) || typeof detail !== 'string') throw new Error('执行计划格式不支持。');
      if (detail.length > SQL_LIMITS.planDetailChars) truncated = true;
      rows.push([id,parent,detail.slice(0,SQL_LIMITS.planDetailChars)]);
    }
    const version = db.exec('SELECT sqlite_version()')[0].values[0][0];
    return {columns:['id','parent','detail'],rows,truncated,version};
  });
}

const rowKey = row => JSON.stringify(row.map(value => [value === null ? 'null' : typeof value, value]));
export function compareResults(actual, expected) {
  if (!actual || actual.truncated) return {state:'limited', actualMarks:[], expectedMarks:[], missing:0, extra:0};
  const shapeMatches = actual.columns.length === expected.columns.length;
  const expectedCounts = new Map();
  expected.rows.forEach(row => { const key = rowKey(row); expectedCounts.set(key, (expectedCounts.get(key) || 0) + 1); });
  const actualMarks = actual.rows.map(row => {
    const key = rowKey(row), count = expectedCounts.get(key) || 0;
    if (!shapeMatches || !count) return 'extra';
    expectedCounts.set(key, count - 1); return 'same';
  });
  const actualCounts = new Map();
  actual.rows.forEach(row => { const key = rowKey(row); actualCounts.set(key, (actualCounts.get(key) || 0) + 1); });
  const expectedMarks = expected.rows.map(row => {
    const key = rowKey(row), count = actualCounts.get(key) || 0;
    if (!shapeMatches || !count) return 'missing';
    actualCounts.set(key, count - 1); return 'same';
  });
  const missing = expectedMarks.filter(mark => mark === 'missing').length;
  const extra = actualMarks.filter(mark => mark === 'extra').length;
  const ordered = actual.rows.length === expected.rows.length && actual.rows.every((row, index) => rowKey(row) === rowKey(expected.rows[index]));
  const state = missing || extra || !shapeMatches ? 'different' : ordered ? 'match' : 'order';
  if (state === 'order') actualMarks.forEach((_, index) => { if (rowKey(actual.rows[index]) !== rowKey(expected.rows[index])) actualMarks[index] = 'order'; });
  return {state, actualMarks, expectedMarks, missing, extra};
}
