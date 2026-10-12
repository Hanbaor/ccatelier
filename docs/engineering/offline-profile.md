# Dependency-aware offline article snapshots

The v2 worker requests `atelier/data/offline-profile.json`. This versioned graph
is generated from the same `planMainEntry` analysis used to deliver `main.js`:
exclusive initial modules are represented by their delivered main bundle, while
shared modules keep their independent URLs. Static imports, literal lazy imports,
worker/style `new URL(..., import.meta.url)` dependencies and known root-relative
runtime CSS are traversed. Graph nodes do not themselves cause downloads.

The complete global and article-tool lazy closure remains available: dialogs,
rhythm, search, queue history/backup/import, reader, notebook, code workbench and
algorithm demos. Rendered HTML discovers independent script entries, styles and
responsive images. CSS `url()` discovery preserves all current WOFF2/TTF fallback
fonts. `archive.json` remains in every committed snapshot for offline search.

Only known DOM-gated route imports are conditional: Practice, Livehouse, Studio,
archive, backstage and Hot100 filtering. Their marker contracts are tested against
the actual loaders. Unknown imports are conservative unconditional dependencies.
Shared audio/studio-core remain dependencies of the routes that use them; they
are not globally removed. Inert markup, comments and raw text cannot activate a
route feature.

## Compatibility and boundaries

The old `offline-shell.json` array is still generated unchanged for already-active
v1 workers during rollout. New workers fetch only the profile on a successful
current-version save. If the profile is unavailable, malformed, unknown-version or incomplete for
the discovered article scripts, they use the old shell. Ambiguous foreign/select
markup also uses the conservative old shell. A required dependency failure after
a valid profile has been selected rejects the save. There is no destructive migration or shared mutable asset cache.

The existing public-static URL allowlist is unchanged. In particular, SQL WASM
and Livehouse Three vendor routes are outside this allowlist, as before. Ordinary
articles do not expose these features. A selected profile closure requiring those vendor runtimes is explicitly
rejected before committing, rather than claiming a complete offline copy. Reading Connections' dynamically installed CSS is a
graph dependency when its script is exposed; its connections.json request retains
the existing exclusion. Archive search continues using the allowed archive.json.

## Atomic ownership and accounting

Each article still owns its entire immutable snapshot. All downloads and size
checks complete before cache writes. Metadata's snapshot pointer commits only
after all resource writes succeed. A quota or metadata failure deletes the new
snapshot and retains the previous copy. Update/remove/clear retain their existing
ownership semantics; no cross-snapshot mutable deduplication is introduced.

New rows commit sorted URL/byte-length pairs alongside `row.bytes`. Normal shelf
listing checks cache existence, exact keys, valid sizes/sum, page and response
availability, then trusts those committed immutable-body sizes without consuming
resource bodies. It does not rehash immutable bodies. Legacy or inconsistent rows
use actual body reads; shared legacy caches count once. Missing/incomplete rows
keep their recovery/removal pointer and report actual available bytes plus
`unavailable:true`. Listing neither deletes such caches nor overwrites metadata.
Metadata-only status remains a lightweight metadata read.

A saved article may be revisited with exactly one validated `notes` navigation
context. Offline navigation then serves the canonical stored page while keeping
the address intact. Unknown/duplicate/malformed query parameters, queried asset
requests, API/admin paths and foreign origins remain outside fallback. Queried
aliases are never cached.

## Reproducible local accounting

Run `node tools/offline-snapshot-audit.cjs` against generated public artifacts.
This compiles only main's in-memory delivered bytes and runs the real worker in a
local response/cache harness. It measures logical cached response-body bytes, not
browser disk usage, compressed transfer bytes or network latency. Its legacy mode
selects the old shell directly under the new accounting worker (without adding a
profile-fallback round trip), so both modes show
zero body reads during modern listing; the earlier worker read every cached body.

At final focused review with the current generated corpus and the same current
main bytes in both modes (including the small unavailable-row UI addition):

- Hello: 137 → 64 responses; 2,049,086 → 1,469,850 body bytes; 138 → 65 fetches.
- Hot100/001: 137 → 65 responses; 2,056,643 → 1,483,437 body bytes; 138 → 66 fetches.
- Across those two independent snapshots: duplicated URLs 136 → 63;
  duplicated body bytes 2,014,410 → 1,435,174. Remaining duplication is intentional.
- Unchanged modern shelf listing: zero resource-body reads.

Focused coverage lives in offline-profile, offline-accounting, offline-transaction,
offline-resources and offline-core tests. The source/built initial-JS limits remain
unchanged at 100,000/83,000 bytes. Full build, aggregate and browser QA are separate
release checks; these measurements alone do not constitute browser verification.

The directly selected legacy baseline uses 138 fetches for these fixtures. A real
new-worker compatibility fallback uses 139 because it first attempts the profile.
Known unsupported dependencies of explicit article scripts are checked before
ambiguity/skew fallback, so unrelated markup cannot hide that limitation.

Known selected route gates are checked for unsupported runtimes before fallback
as well. For ambiguous foreign/select markup, possible gated-attribute syntax is
used only for conservative rejection, never for omission. If no valid versioned
profile is available at all, the legacy shell retains its historical limitations:
it cannot verify vendor-runtime completeness. No vendor allowlist was expanded.
