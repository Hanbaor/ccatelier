// Deterministic semantic trace of CC's fixed dfs implementation. No source is executed.
// A choose step groups book[j]=1 and a[step]=j. Return and book[j]=0 stay separate.
export function tracePermutation(n) {
  if (!Number.isInteger(n) || n < 2 || n > 4) throw new RangeError('The demonstration supports n = 2, 3 or 4.');
  const a = Array(20).fill(0), book = Array(20).fill(0), stack = [], steps = [], nodes = [], results = [];
  let prefixLength = 0;
  function snapshot(phase, j = null, returned = null) {
    const frame = stack.at(-1);
    steps.push(Object.freeze({
      phase, j, step: frame?.step ?? null, nodeId: frame?.nodeId ?? null,
      returnedStep: returned?.step ?? null, returnedNodeId: returned?.nodeId ?? null,
      prefixLength, a: Object.freeze(a.slice(0, n)), book: Object.freeze(book.slice(1, n + 1)),
      stack: Object.freeze(stack.map(frame => frame.step)), results: Object.freeze(results.slice())
    }));
  }
  function dfs(step) {
    const nodeId = nodes.length, parentId = stack.at(-1)?.nodeId ?? null;
    nodes.push(Object.freeze({id: nodeId, parentId, depth: step, path: Object.freeze(a.slice(0, step)), enteredAt: steps.length}));
    const frame = {step, nodeId};
    stack.push(frame); prefixLength = step; snapshot('enter');
    if (step === n) {
      results.push(Object.freeze({values: Object.freeze(a.slice(0, n)), at: steps.length, nodeId}));
      snapshot('emit');
    } else {
      for (let j = 1; j <= n; j++) {
        if (book[j] !== 0) { snapshot('skip', j); continue; }
        book[j] = 1; a[step] = j; prefixLength = step + 1; snapshot('choose', j);
        dfs(step + 1);
        book[j] = 0; prefixLength = step; snapshot('release', j);
      }
    }
    // The caller regains control BEFORE its book[j]=0. Keep that choice active.
    stack.pop(); prefixLength = step; snapshot('return', null, frame);
  }
  dfs(0); snapshot('done');
  return Object.freeze({n, steps: Object.freeze(steps), nodes: Object.freeze(nodes), totalResults: results.length});
}
