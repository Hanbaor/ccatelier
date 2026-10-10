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
