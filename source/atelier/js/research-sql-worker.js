// This classic worker is created only after an explicit Run action. Keep the
// official runtime local and versioned; no remote API or user data is involved.
let SQL, core;
const ready = (async () => {
  importScripts('../vendor/sql.js/1.14.2/sql-wasm.js');
  core = await import('./research-sql-core.mjs');
  SQL = await initSqlJs({locateFile:file => new URL('../vendor/sql.js/1.14.2/' + file, self.location.href).href});
  self.postMessage({type:'ready'});
})().catch(() => { self.postMessage({type:'load-error'}); });

self.onmessage = async ({data}) => {
  if (!data || data.type !== 'run' || !Number.isSafeInteger(data.id) || typeof data.caseId !== 'string' || typeof data.sql !== 'string') return;
  await ready;
  if (!SQL) return;
  try {
    const datasetId = data.datasetId === undefined ? 'default' : data.datasetId;
    const fixture = core.getSqlDataset(data.caseId, datasetId, data.caseRevision === undefined ? 1 : data.caseRevision, data.datasetRevision === undefined ? 1 : data.datasetRevision);
    const result = core.runFixtureQuery(SQL, data.caseId, data.sql, datasetId);
    const reference = core.runFixtureQuery(SQL, data.caseId, fixture.reference, datasetId);
    if (core.compareResults(reference, fixture.expected).state !== 'match') throw new Error('参考结果校验失败，请刷新页面。');
    self.postMessage({type:'result', id:data.id, result});
  }
  catch (error) { self.postMessage({type:'result', id:data.id, error:String(error?.message || error).slice(0,400)}); }
};
