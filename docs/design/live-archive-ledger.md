# SDD ledger — plan: docs/superpowers/plans/2026-09-24-live-archive.md

BASE: 79f52bc; pre-existing uncommitted After Hours work is part of the site and must survive.
Ruling: execute in existing nijika checkout — existing uncommitted site work is required context, a new checkout would omit it. No commits or deployment requested.
Ruling: keep human-readable ledger here instead of shell-based SDD helper — Windows runtime and non-numbered plan units; identical evidence requirements retained.
Pre-flight A→B/C/D/E: rooted article path is the stable ID for archive, queue, annotations, offline shelf. Rich index supplies text/tags/date/minutes, no inferred or invented summaries.
Pre-flight S→F: actual scheduled drum hits dispatch timestamped events; the analyser supplies spectrum; stage engine never invents audio activity.
Pre-flight C→D: annotation offsets are in rendered text node order; context disambiguates repeated quotes, missing anchors are shown honestly.
Pre-flight E→all: only selected article documents and whitelisted static paths cached; API/admin always bypass cache.
Task A: complete. Tests cover Unicode normalization, combined filters, stable relevance, query URL validation and real tag relationships.

Implementation S/A/B/C/D/E/F/G/H complete; evidence and limits below.
Evidence: full 31-test suite + /lab/ fixture build passed before review fixes. Browser: 109-post archive, Chinese fulltext→17 results, tag constellation→15 real articles, queue addition, 1440px three-column reader, duplicate h1 removed, in-article search, 4.8MB offline save all observed.
Ruling: moved SW template from scripts/templates to custom — Hexo loads every scripts file regardless of extension; initial script-load warning fixed and regenerated with no errors.
Independent review: live_archive_review, read-only. Six P2 issues accepted and fixed: stale online assets, partial offline quota commits, stale async playback start, Enter navigation, Unicode offsets, deleted anchor ambiguity.
Evidence: added failing reproduction tests for search navigation/Unicode, playback race, changed quote context, offline quota/online update; all green after fixes.
Ruling: offline storage uses per-article immutable snapshot caches and an atomic metadata pointer; failure deletes only the uncommitted snapshot. Online fetch is network-first without incidental cache writes. Previous offline copies remain consistent until explicitly updated. Storage cost is duplicated shell resources per saved article, bounded to 30 articles and 35MB each.
Minor review fix: notebook write transaction enforces 2000-note ceiling, import reads up to 64MB to cover maximum valid exported payload.
Declined review areas: real browser/device/performance QA delegated back to root, not dropped; backend unchanged and existing suite green. No production deployment or original article edits.

## Final acceptance — 2026-09-24

| Spec | Implementation and observed evidence |
| --- | --- |
| 0 / stage engine | WebGL available in browser; global light controls, moon/amber switching and motion off/on verified. Shader consumes actual audio beat/spectrum events. Hidden-page and reduced-motion guards inspected. |
| 1 / artwork | New 1942×809 local asset; face, hair and desktop/390px crops inspected. Full prompt/provenance in live-archive-art.md. Cover title positioning conflict corrected; real entrance navigation verified. |
| 2–3 / discovery | 109 real records; 二叉树 fulltext query returns 17 results; corresponding graph theme has 15 real articles. Grid/list/graph use common filters; keyboard chooser and zoom/pan fallback available. Desktop and phone layout inspected. |
| 4 / queue | Two test articles added, reordered and marked read; order and completion survived reload. Own test entries subsequently removed. Import validation and queue operations tested. |
| 5 / reading | Desktop three-column and 820/390 responsive layouts inspected. Mobile workbench opens above body; inherited narrow-width bug fixed. Search next/previous and repeated Enter verified. Duplicate and empty rendered headings removed without editing source Markdown. |
| 6 / annotations | Actual text selection → note saved → reload → original quote located → test note deleted. Context mismatch and hostile/corrupt import tests pass; IndexedDB writes await transaction completion. |
| 7 / code | Existing C++ block opened in workbench; jump to line 3 selects actual printf statement. Copy/download/wrap operate on original code text. No evaluation. |
| 8 / assistance | Speech UI entered “正在朗读 1 / 27” and was stopped. Browser voices remain platform-dependent. Queue completion and history verified. |
| 9 / offline | Saved /hot100/036/, stopped the task-owned Wrangler server, reloaded and observed original article plus code/reader tools from snapshot. Unsaved /hot100/037/ showed the explicit offline explanation. Comments failed independently rather than using cached API data. Restarted server and the same unsaved article returned normally. Friendly network copy improved. Quota rollback and online asset freshness have regression tests. |
| 10 / music | Actual playback advances steps and analyser meter; 32-step editing and undo checked. Project saved with edited name, reloaded, then own test projects deleted. WAV offline rendering reached export completion. Mobile playback and stop verified; sequencer scroll remains inside its panel. Playback race regression passes. |
| 11–12 / quality | 1440/820/390 viewports checked, no document horizontal overflow. 37/37 tests pass; fixture covers all posts plus 9 fixtures and /lab/ URLs. Force build generated 557 files with no ERROR/FATAL; git diff --check passed. Six independent-review findings repaired. Original source/_posts diff empty. |

Latest commands: `node node_modules/hexo/bin/hexo generate --force`, `node --test tests/*.test.cjs`, `node tests/fixture-build.cjs`, `git diff --check`.

Limits: browser viewport checks are not physical-device performance benchmarks; platform speech quality and storage quotas vary. Personal annotations/projects/queue are local to the browser, not cloud-synced. Offline works only for explicitly saved articles. Local preview uses local D1; no production deployment, commit or push performed.

Final preview restored at http://127.0.0.1:4319. Stop this Windows preview before attempting WSL clean/removal of public. Current code and generated output include the final fixes; existing saved offline copies update only when requested from the offline shelf.
