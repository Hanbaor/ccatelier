// Bounded, in-memory evidence search, not a minimality or determinism proof.
import {validateLocalTable, validateLocalQuery, validateLocalSourceIndices, compareLocalResults, runLocalTablePair} from './research-local-table-core.mjs';
import {validateMinimizerSql} from './research-sql-deterministic.mjs';

export const LOCAL_REDUCTION_LIMITS = Object.freeze({candidateChecks:64});
const messages = Object.freeze({
  unsupported:'此查询不支持缩小差异样本；请使用带顶层 ORDER BY 的受支持查询，不含 LIMIT 或 OFFSET。普通运行仍可使用。',
  unstable:'重复执行的结果不一致，已撤回差异样本。',
  unknown:'结果不完整或查询未能完成，无法确认差异样本。',
  'invalid-witness':'差异证据无效，请重新运行完整表。',
  'invalid-input':'本地表或查询无效，请检查输入后重试。'
});
export class LocalReductionError extends Error {
  constructor(code) { super(messages[code]); this.code = code; }
}
const fail = code => { throw new LocalReductionError(code); };
function prepare(input, sqlA, sqlB) {
  let table, queries;
  try { table = validateLocalTable(input); queries = [validateLocalQuery(sqlA), validateLocalQuery(sqlB)]; }
  catch { fail('invalid-input'); }
  try { for (const query of queries) validateMinimizerSql(query, {rejectLimitOffset:true}); }
  catch { fail('unsupported'); }
  return {table, queries};
}
function inspectPair(pair) {
  try {
    if (!pair || !pair.a || !pair.b) fail('invalid-witness');
    for (const result of [pair.a,pair.b]) {
      if (!Array.isArray(result.columns) || Array.from(result.columns).some(column => typeof column !== 'string')) fail('invalid-witness');
    }
    const comparison = compareLocalResults(pair.a,pair.b);
    if (!pair.comparison || JSON.stringify(pair.comparison) !== JSON.stringify(comparison)) fail('invalid-witness');
    return comparison.state;
  } catch { fail('invalid-witness'); }
}
// Column names and ordered, typed values are part of replay evidence, even
// though the A/B semantic comparison intentionally ignores column aliases.
const evidenceKey = pair => JSON.stringify([pair.a.columns,pair.a.rows,pair.a.truncated,pair.b.columns,pair.b.rows,pair.b.truncated]);
function verifier(SQL, table, queries) {
  let checks = 0, unknown = 0;
  return {
    get checks() { return checks; }, get unknown() { return unknown; },
    check(indices) {
      if (checks >= LOCAL_REDUCTION_LIMITS.candidateChecks) fail('unknown');
      checks++;
      const attempts = [];
      // A and B each get their own new DB on both executions. Even a failed
      // attempt does not silently become an equivalent/undeletable candidate.
      for (let repeat=0; repeat<2; repeat++) {
        try { attempts.push(runLocalTablePair(SQL,table,...queries,{sourceIndices:indices,requireStandalone:true})); }
        catch { attempts.push(null); }
      }
      if (attempts[0] && attempts[1] && evidenceKey(attempts[0]) !== evidenceKey(attempts[1])) fail('unstable');
      if (attempts.some(pair => !pair || pair.a.truncated || pair.b.truncated)) { unknown++; return null; }
      return attempts[0];
    }
  };
}

export function reduceLocalDifference(SQL, input, sqlA, sqlB, expectedPair) {
  const {table,queries} = prepare(input,sqlA,sqlB);
  const category = inspectPair(expectedPair);
  if (!['different','order'].includes(category)) fail('invalid-witness');
  const verify = verifier(SQL,table,queries);
  let best = table.rows.map((_,index) => index);
  let pair = verify.check(best);
  if (!pair) fail('unknown');
  if (evidenceKey(pair) !== evidenceKey(expectedPair)) fail('unstable');
  // Reserve the last candidate slot for a two-run final verification.
  const available = () => verify.checks < LOCAL_REDUCTION_LIMITS.candidateChecks - 1;
  const attempt = indices => {
    const candidate = verify.check(indices);
    if (!candidate || candidate.comparison.state !== category) return false;
    best = indices; pair = candidate; return true;
  };
  if (best.length) attempt([]);
  // Deterministic deletion chunks, coarse to fine. No monotonicity assumption:
  // success restarts at that granularity; failure only advances this search.
  let width = Math.ceil(best.length / 2);
  while (best.length > 1 && width > 1 && available()) {
    let accepted = false;
    for (let start=0; start<best.length && available(); start+=width) {
      const indices = best.slice(0,start).concat(best.slice(start+width));
      if (attempt(indices)) { accepted = true; break; }
    }
    width = accepted ? Math.min(width,Math.ceil(best.length / 2)) : Math.floor(width / 2);
  }
  // Spend remaining search budget on single-row deletions, restarting after
  // each success since deletion behavior may be non-monotonic.
  let index = 0;
  while (index < best.length && available()) {
    if (attempt(best.slice(0,index).concat(best.slice(index+1)))) index = 0;
    else index++;
  }
  const budgetExhausted = !available() && best.length > 0;
  const finalPair = verify.check(best);
  if (!finalPair) fail('unknown');
  if (evidenceKey(finalPair) !== evidenceKey(pair) || finalPair.comparison.state !== category) fail('unstable');
  return {status:best.length < table.rows.length ? 'reduced' : 'not-found', sourceIndices:best, pair:finalPair,
    originalRows:table.rows.length, candidateChecks:verify.checks, budgetExhausted, unknownCandidates:verify.unknown,
    provenance:{table,sqlA,sqlB}};
}

export function replayLocalDifference(SQL, input, sqlA, sqlB, witness) {
  const {table,queries} = prepare(input,sqlA,sqlB);
  let indices;
  try { indices = validateLocalSourceIndices(witness?.sourceIndices,table.rows.length); }
  catch { fail('invalid-witness'); }
  const category = inspectPair(witness?.pair);
  if (!witness.provenance || JSON.stringify(witness.provenance.table) !== JSON.stringify(table) || witness.provenance.sqlA !== sqlA || witness.provenance.sqlB !== sqlB || !Number.isSafeInteger(witness.candidateChecks) || witness.candidateChecks < 3 || witness.candidateChecks > LOCAL_REDUCTION_LIMITS.candidateChecks || !Number.isSafeInteger(witness.unknownCandidates) || witness.unknownCandidates < 0 || witness.unknownCandidates > witness.candidateChecks - 2 || typeof witness.budgetExhausted !== 'boolean') fail('invalid-witness');
  if (witness.status !== 'reduced' || witness.originalRows !== table.rows.length || indices.length >= table.rows.length || !['different','order'].includes(category)) fail('invalid-witness');
  const verify = verifier(SQL,table,queries), pair = verify.check(indices);
  if (!pair) fail('unknown');
  if (evidenceKey(pair) !== evidenceKey(witness.pair) || pair.comparison.state !== category) fail('unstable');
  return {status:'replayed',sourceIndices:indices,pair,candidateChecks:verify.checks};
}
