# Local-table SQL comparison

The optional Research-page panel compares two user-authored queries on one small local table. It is a separate, initially closed sibling of the existing four teaching cases. Neither query is a reference answer. Agreement on this table does not establish general SQL equivalence or that either query expresses the user's intent.

## Data and execution

- Explicit CSV or TSV; strict UTF-8 with an optional UTF-8 BOM. Limits are 256 KiB, 500 data rows, 16 columns, 128 characters per header and 512 per cell. String limits count JavaScript UTF-16 code units rather than grapheme clusters.
- The first record is a header. Display-only headers map to generated c1…c16 in the fixed local_data table. Values are parameter-bound TEXT; whitespace, leading zeroes, long integer text and formula-like text are retained. Empty cells stay empty strings, and NULL text is not SQL NULL. Malformed or oversized data is rejected, not silently truncated or repaired.
- File selection loads the parser and previews at most 20 rows. SQL runs only after an explicit Run or editor shortcut. A failed file replacement preserves the previous accepted table and its valid result.
- The separate worker creates an independent fresh database for each query, verifies query_only and the complete prepared SELECT wrapper, and releases statements/databases. Limits: 4,000 query characters, 100 result rows, 16 columns, 512 characters per text result. Semicolons and NUL are unsupported. SQLite allocations are limited to 16 MiB; total browser memory is not bounded by that number.
- One main-thread deadline covers the whole A/B pair and table setup: 1.5 seconds, after a separate 10-second cold-load deadline. Cancellation terminates the worker. Editing, accepted replacement, clearing, closing the panel or lifecycle changes invalidate obsolete work. Late file reads and worker results cannot refill cleared state.

## Typed comparison

Integer results use sql.js 1.14.2's BigInt read option, then travel as typed decimal strings. REAL values retain SQLite binary64 semantics, not arbitrary-precision decimal arithmetic. Non-finite REAL values cannot produce agreement. INTEGER 1 and REAL 1.0 are distinct types; REAL negative zero compares numerically as zero.

Comparison includes column positions, typed values, duplicate multiplicity and row order. Aliases do not affect agreement. Truncation on either side is inconclusive. Text labels identify A-only/B-only rows and order differences; color is not the sole signal. Without sufficient ORDER BY, or with random/time-dependent queries, results may be unstable.

## Privacy and isolation

The local panel has no upload, telemetry, URL serialization, history, export or clipboard path. Its table and SQL stay in page memory and never enter built-in snapshots, sharing or reports. Clearing or leaving the page discards them. Backgrounding or closing the disclosure stops work without automatic rerun. SQLite may fetch the site's pinned assets when run, so this is not a zero-network or guaranteed-offline claim.

Headers, cells, labels and results are rendered as text. Raw SQLite errors are not exposed because they can contain user data. The controller supplies bounded, actionable error categories instead.

## Bounded difference-sample reduction

After a complete ordinary comparison shows different values/multiplicities or a pure ordering difference, a separate explicit action can search for fewer source records that still reproduce that category of difference. Neither opening the panel nor running an ordinary comparison starts the search. A successful search does not replace the imported table.

Subsets use strictly increasing, unique, zero-based source-record indices. SQLite receives an explicit hidden rowid equal to the original index plus one, including when earlier records have been removed. No extra visible column is added to SELECT *. These are parsed data-record numbers, not physical CSV line numbers: quoted fields may contain line breaks. TEXT values, duplicate records and their original insertion order remain intact.

The reducer retains the existing conservative function/SQL gate and requires top-level ORDER BY. Its additional option rejects unquoted LIMIT/OFFSET tokens at any depth, without misreading strings, comments or quoted identifiers. Ordinary comparison and the built-in teaching minimizer retain their existing supported syntax. SQLite still prepares the standalone query and the complete bounded wrapper; the lexer is not the read-only boundary or a proof of determinism.

Each candidate verification uses at most four SELECT executions, using a fresh database per query. An accepted or returned evidence candidate must complete two independent A/B pairs, with both typed results complete and repeating identically. A failed query may short-circuit its pair; that candidate still counts against the budget and remains unknown, never accepted evidence. The full-table baseline must also match the previously displayed comparison. A smaller candidate must preserve the original difference category: a value/multiplicity difference is not replaced by an ordering-only difference. The particular cause of the difference need not be identical.

Search tries the empty set, then fixed-order chunk deletions and finer single-record deletions. It makes no monotonicity assumption. At most 64 candidate verifications are allowed, including the full-table baseline, unknown/failed candidates and a reserved final two-pair verification. This is not an enumeration of every subset. The operation retains one 1.5-second main-thread hard deadline after the separate 10-second worker load deadline.

Errors and truncation make a candidate unknown; they do not establish equivalence or that a record is necessary. Detected inconsistent repetitions revoke the reduction result. Exhausting the candidate budget may return a smaller sample only after final revalidation, with an explicit incomplete-search notice. Hard timeout returns no partial witness. If no smaller sample is found, the interface says only that this bounded search found none. There is no claim of global minimum size, one-record minimality, query purity, general SQL equivalence or correctness against an unstated question.

The retained records and their A/B outputs are shown in a closed detail section, with any 20-row preview explicitly distinguished from the total. A separate explicit replay action starts a fresh worker and repeats the exact original-table subset and queries against the saved typed evidence. The result means repeated observation under the pinned SQLite engine and construction, not a general reproducibility guarantee.

The in-memory witness carries a bounded copy of the original table and query strings. Replay checks that binding, source indices, counters and comparison metadata as well as the repeated typed outputs. This validates the local evidence contract; it is not a cryptographic signature against a caller deliberately rewriting the entire object.

Editing either query, accepting another file, stopping, clearing, closing or leaving the panel/page invalidates the local reduction evidence and cancels pending work. Failed file replacement preserves the previously accepted table and valid evidence. No checkpoint stream, automatic replay, external sharing, export, history or clipboard path is added.

## Verification boundary

Focused checks cover strict parsing and limits, actual shipped-WASM int64/type behavior, independent read-only execution and cleanup, worker cancellation/recovery, typed result rendering, file/run races, and same-page controller isolation. Share isolation and side-effect sentinels have focused coverage; built-in history/export isolation also relies on separation of state and selectors, not a claim that every export route was dynamically tested.

Full integration must pass after recovery or any source change. Node/jsdom and Node worker adapters do not validate native browser file pickers, geometry, CSP enforcement, assistive technology, network transfer performance or PDF behavior. Those are separate browser-validation tasks.
