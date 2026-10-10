# Research room: Text-to-SQL teaching playground

This is an original, three-case teaching artifact attached to the site's existing Database / Text-to-SQL interest. It does not represent a publication, benchmark, research result, model evaluation, or claim about the site author's work.

## What it demonstrates

1. A `LEFT JOIN` preserves an artist with no tracks. `COUNT(*)` returns one for that null-extended row; `COUNT(t.id)` returns zero. All three artists and all three tracks are visible.
2. `LIMIT 1` excludes one of two top-scoring tracks. Filtering by `MAX(points)` keeps both. All three score rows are visible.
3. A `NOT IN` subquery includes a `NULL` rehearsal track ID. Its matching track is excluded; both unmatched tracks produce unknown predicates and are also filtered out. Correlated `NOT EXISTS` keeps the two unrehearsed tracks. All three tracks and both rehearsal records are visible; SQL nulls display as `NULL`, never blank cells. Track IDs are non-null primary keys, and the question explicitly ignores unassigned rehearsals. Filtering nulls out of the subquery is another valid repair for this fixture, not a universal equivalence claim.

The candidate and reference SQL execute against fresh copies of the displayed fixture. Reference output is verified against the hand-authored expected rows every run. Result comparison is positional by column, type-aware, duplicate-aware and order-aware. Column aliases do not affect agreement. All questions explicitly request ordering. The success label is “本例结果一致”, never a general SQL-equivalence verdict. Truncated output is never declared a match. Static markup duplicates only these small public fixtures and queries; tests enforce parity with the execution core.

## Runtime and provenance

Pinned package: [`sql.js@1.14.2`](https://github.com/sql-js/sql.js/releases/tag/v1.14.2), obtained from the official npm package via `npm install --save-exact --ignore-scripts sql.js@1.14.2`. The lockfile records integrity. The included engine reports SQLite 3.49.1. SQLite is public domain; sql.js is MIT licensed and its distributed license is shipped beside the assets.

The following unchanged npm files are copied to `source/atelier/vendor/sql.js/1.14.2/` and byte-compared in tests:

| Asset | Uncompressed source bytes |
| --- | ---: |
| sql-wasm.js | 46,535 |
| sql-wasm.wasm | 658,410 |
| Runtime total | 704,945 |
| LICENSE | 2,199 |

These are source asset sizes, not measured transfer sizes or performance scores. The npm tarball is 9,443,490 bytes; all flavors unpack to 24,151,707 bytes in development, but only the two listed runtime files and license ship. The controller/core/CSS are separate route-local assets. No runtime code is added to the global main module graph.

The research page loads its small route-local controller. **No Worker, SQLite loader or WASM request occurs until Run** (or its explicit Ctrl/⌘+Enter shortcut). The worker uses the same origin's versioned assets; no CDN/API is involved. Query text is neither stored nor uploaded. The existing offline manifest does not promise WASM availability, so the UI explicitly says offline execution is not guaranteed.

## Execution boundaries

- User SQL never executes on the UI thread. A classic dedicated Worker loads the official runtime; the UI only validates limits, sends a query and renders text.
- Input is at most 4,000 JavaScript string characters, must start with SELECT/WITH, and may contain no semicolon or NUL anywhere. This deliberately includes semicolons in string literals and comments; the error explains that restriction. The prefix check is helpful validation, not the safety boundary.
- SQLite parses the input within a complete `SELECT * FROM (...) AS query_result LIMIT 101` wrapper. The prepared SQL must match the entire supplied wrapper. No hand-written SQL parser, evaluator, or keyword-based correctness inference is used.
- Each run constructs only a fixed original fixture, using parameterized inserts. It then sets and verifies `PRAGMA query_only=ON` before preparing user SQL. No user-provided fixture/schema, extension, file path, database import, export or SQL function is accepted. The packaged build omits extension loading.
- No semicolon/NUL means input cannot introduce another SQL statement that turns off query_only. A syntactically valid wrapper-closing expression/comment can alter the outer SELECT, so the outer LIMIT is only an optimization. A separate statement-step loop enforces the 100-row cap regardless. A 101st row marks output truncated; it is never called a match.
- `PRAGMA hard_heap_limit=16777216` bounds **SQLite allocations**, not total browser/Worker memory. SQL strings and output are separately bounded. At most 16 columns and 512 characters per text cell are returned; blobs are rejected. The fixture DB and prepared statements are closed on success or error.
- Bootstrap has its own 10-second deadline. After a ready event, execution has a 1.5-second main-thread timer. Exceeding it terminates the worker; the next explicit Run creates a new one. Sending an abort message to a blocked synchronous worker would not suffice.
- Changing cases, editing, stopping, leaving the page, opening a site dialog or hiding the document cancels pending work. Request IDs and UI generation tokens ignore stale responses. An idle engine may be reused; every query still gets a fresh DB.
- Results and errors render with textContent. Color is supplemented by + / − / ↕ and accessible labels. No SQL or returned cell is rendered as HTML.

This is a bounded in-browser teaching tool, not an isolation boundary against arbitrary same-origin script execution, a browser compromise, or engine vulnerabilities.

Primary documentation: [sql.js Database API](https://sql.js.org/documentation/Database.html), [SQLite query_only](https://sqlite.org/pragma.html#pragma_query_only), [SQLite hard_heap_limit](https://sqlite.org/pragma.html#pragma_hard_heap_limit), [COUNT](https://sqlite.org/lang_aggfunc.html), [LIMIT](https://sqlite.org/lang_select.html#the_limit_clause), [IN / NOT IN](https://sqlite.org/lang_expr.html#the_in_and_not_in_operators), [EXISTS](https://sqlite.org/lang_expr.html#the_exists_operator).

## Verification

`node --test tests/research-sql*.test.cjs` exercises the exact shipped WASM, fixtures and static parity; forbidden command/statement probes; allocation/row/column/cell limits and recovery; type/multiplicity/order comparison; XSS-safe rendering; keyboard/IME behavior; cancellation/stale responses; separate deadlines and restart. A Node Worker transport adapter executes the shipped worker body and real WASM, terminates an unbounded recursive aggregate and confirms a subsequent fresh worker succeeds. It is an automated worker test, not a substitute for browser rendering/network verification.

Use `npm test` and `npm run test:fixtures` for the complete existing regression suite and prefixed-site generation. Browser verification should additionally check first-Run network loading, real worker execution, narrow/large viewports, day/night, reduced motion, error/retry/timeout flows and navigation/music regression. Do not report browser checks that were not performed.

## Optional SQLite query-plan inspection

After a successful Run, a closed details control appears below the actual result. Its first opening sends an `explain` request to the same local Worker; ordinary Run never computes a plan. Reopening a completed plan uses a cache bound to that exact run's SQL, case, dataset and fixed revisions. Editing, new Run, changing cases/data, successful draft import/restore, stopping, hiding the document, leaving or opening a site dialog invalidates the old plan. Invalid imports preserve the existing result and plan. Late completions cannot overwrite newer work.

`explainFixtureQuery` and `runFixtureQuery` use the same `withFixtureQuery` setup. Both independently validate the original SELECT/WITH input, construct a fresh trusted fixture DB, enforce the SQLite heap budget, verify query_only, prepare the exact complete SELECT wrapper and check `getSQL()` and the original column limit. The plan path frees that unstepped candidate statement, then internally prefixes the same wrapper with `EXPLAIN QUERY PLAN` and checks the complete prepared SQL again. User-supplied EXPLAIN remains rejected. It does not execute candidate expressions, add indexes, accept SQL setup, or relax the SQL whitelist. In particular, planning an expression that would exceed execution's cell/blob/allocation limits need not fail: that expression is not executed. The UI only offers inspection after a Run has returned a result.

The inspected statement includes the tool's `SELECT * FROM (...) AS query_result LIMIT 101` wrapper, not just the editor's SQL. The existing caveat about legal input expressions/comments changing the wrapper and the need for independent output bounds still applies. The plan has its own 64-node step cap (a 65th node detects truncation) and 512-character detail cap, with incomplete output explicitly marked. The raw id, parent and detail fields are rendered as text; the fourth SQLite auxiliary field is validated but not displayed. No automatic interpretation, score, timing, or equivalence decision is derived from detail strings.

Planning retains the separate 10-second bootstrap and 1.5-second operation deadlines. The main thread terminates a blocked Worker rather than relying on an abort message. Planning failure, timeout or retry does not replace the already completed query result or its comparison message. Subsequent explicit retries can create a fresh Worker. Plans are not exported in draft snapshots and do not start during import or page load.

The [official SQLite EQP guide](https://www.sqlite.org/eqp.html) describes these plans as high-level interactive debugging output whose format can change between releases. SCAN may traverse an index's full ordering; it does not necessarily mean that no index is used. SEARCH visits a subset of records. Neither keyword establishes correctness or measured performance, and these small fixed SQLite fixtures are not a benchmark or a generic database optimizer demonstration.

### Observed examples with the shipped SQLite 3.49.1

The following are genuine EQP rows for the actual wrapped queries on the original dataset, not simulated output:

- `SELECT id,name FROM artists`: `[3,0,"SCAN artists"]`.
- `SELECT id,name FROM artists WHERE id=1`: `[3,0,"SEARCH artists USING INTEGER PRIMARY KEY (rowid=?)"]`.
- The empty-count candidate and reference both have the same sequence of detail descriptions: `CO-ROUTINE query_result`, `SCAN a`, `BLOOM FILTER ON t (artist_id=?)`, `SEARCH t USING AUTOMATIC COVERING INDEX (artist_id=?) LEFT-JOIN`, `USE TEMP B-TREE FOR ORDER BY`, `SCAN query_result`. Their node IDs differ, and their results differ for Moss. Similar high-level plans do not establish equivalent results.
- The original NOT IN query includes `[9,0,"LIST SUBQUERY 1"]`; the NOT EXISTS reference includes `[7,0,"CORRELATED SCALAR SUBQUERY 1"]`. These structures do not explain away the NULL semantics: the result comparison and example discussion remain necessary.

`tests/research-sql-plan.test.cjs` compares candidate/reference plans for all nine fixed datasets with direct EQP from the shipped WASM, exercises the actual Worker transport for all datasets, repeats forbidden-input probes on the plan path, checks real output truncation, tests full prepared-statement checks and cleanup, and verifies lazy/cached rendering, XSS safety, retry state, deadlines and cancellation. Mocked timing/failure tests supplement real-engine tests; they are not evidence of browser rendering or real-world performance.
