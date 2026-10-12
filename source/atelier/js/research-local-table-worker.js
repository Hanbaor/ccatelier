// Created only by explicit local-table actions. No case/history/export
// protocol is accepted here. The parent owns bootstrap and whole-pair deadlines.
let SQL, core, reducer;
const ready = (async () => {
  importScripts('../vendor/sql.js/1.14.2/sql-wasm.js');
  core = await import('./research-local-table-core.mjs');
  reducer = await import('./research-local-table-reduce.mjs');
  SQL = await initSqlJs({locateFile:file => new URL('../vendor/sql.js/1.14.2/' + file, self.location.href).href});
  self.postMessage({type:'ready'});
})().catch(() => { self.postMessage({type:'load-error'}); });

self.onmessage = async ({data}) => {
  if (!data || !['run','reduce','replay'].includes(data.type) || !Number.isSafeInteger(data.id)) return;
  await ready;
  if (!SQL || !core) return;
  try {
    const args = [SQL, data.table, data.sqlA, data.sqlB];
    const result = data.type === 'reduce' ? reducer.reduceLocalDifference(...args,data.expectedPair)
      : data.type === 'replay' ? reducer.replayLocalDifference(...args,data.witness)
      : core.runLocalTablePair(...args);
    self.postMessage({type:'result', id:data.id, result});
  } catch (error) {
    const code = error instanceof reducer.LocalReductionError ? error.code : 'invalid-input';
    self.postMessage({type:'result', id:data.id, code, error:error instanceof reducer.LocalReductionError || error instanceof core.LocalTableError ? error.message : '本地查询未能完成，请重试。'});
  }
};
