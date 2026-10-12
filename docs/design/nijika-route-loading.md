# Route-scoped JavaScript loading

This milestone changes JavaScript loading only. Existing illustration, layout, CSS order,
article content, practice scoring and Projects content are unchanged.

## Loading contract

- The eager entry keeps settings/theme, navigation, global search, dialogs, reading
  queue, offline shelf, rhythm and stage coordination available on every page.
- `route-features.js` matches actual rendered elements rather than pathname strings.
  Relative module URLs therefore work at `/` and under a prefix such as `/lab/`.
- Archive logic loads only with `data-archive`; reader, notebook and code workbench
  load only with their article elements; the sequencer loads only with `data-studio`.
- Constellation loads only when the archive enters graph view (including a direct
  `?view=graph` URL). Concurrent requests share the import; a late result cannot
  start a graph after switching to a list or leaving the page. The current filter,
  rather than an old captured result, supplies its articles.
- Archive and sequencer retain their existing hidden-until-ready controls. Reader
  readiness keeps current field values and at most the latest relevant action.
  New typing cancels an older queued button action. Unfinished IME composition is
  restored without premature search. Menus, backgrounding and navigation cancel
  delayed actions while preserving entered values. Sound requires a fresh gesture.
- Import errors are isolated by feature and expose a status/retry control. If an
  initializer itself throws after partially binding events, the recovery is a page
  refresh rather than unsafe reinitialization of those listeners.
- No JavaScript fallback is removed. Archive import/data failures retain its server
  directory. The explicit offline-save manifest still includes all local JS/MJS,
  including dynamic modules and their dependencies; this milestone reduces online
  eager loading, not the intentionally complete offline snapshot.

## Measurement method

Run `npm run build` and `node tools/module-graph.cjs` against `public/`.
The audit follows local static import edges from the built main entry, then unions
required route modules (and the archive worker) to show each initial route graph.
It counts each file once. Live House is click-triggered; graph is interaction-triggered
except for a direct graph URL. Practice remains its existing route import.

These figures are uncompressed built file bytes, not measured transfer bytes,
compressed sizes, parsing time, render timing, or a synthetic performance score.
The before build is commit `5bf2b54f35a89cc0b93cf7d2f5b96dc316afff61`.
The static graph had 34 modules and 138,546 bytes before this change.

After this change, the eager graph has 22 modules and 86,771 bytes: 51,775 fewer
uncompressed built bytes (37.4%). Route totals include the eager graph, their required
dynamic features and, for Notes, its worker; shared dependencies are counted once.

| Initial route | Before modules / bytes | After modules / bytes |
| --- | ---: | ---: |
| Cover, atelier, Projects | 34 / 138,546 | 22 / 86,771 |
| Notes | 35 / 138,806 | 25 / 99,239 |
| Notes with `?view=graph` | 35 / 138,806 | 26 / 106,043 |
| Hello article (no code blocks) | 34 / 138,546 | 27 / 101,670 |
| Hot100/001 (code blocks) | 34 / 138,546 | 28 / 104,361 |
| Studio | 34 / 138,546 | 27 / 111,472 |
| Practice | 40 / 178,451 | 30 / 135,982 |

The constellation module contributes 6,804 bytes only when graph view is requested.
The complete local suite passes 226 tests with no skips; the fixture build passes.
Its upstream Redefine update check can warn about a proxy timeout; generation and
verification still complete successfully.

Live browser acceptance is reported separately with the deployed commit. Browser
transfer/request metrics are not measured: the managed preview browser denies DevTools,
and its supported inspection API does not expose a network-resource list.

## Deterministic verification

- Real generated route DOM selects only matching features; repeated boot and shared
  imports do not duplicate initialization.
- Each loader fails independently; fallback links survive, retry preserves field
  values, and partially initialized features require refresh.
- Early text/range input, current action ordering, IME, dialog/background cancellation,
  audio gesture handling, and reader/notebook/code initialization order are covered.
- Graph delayed import, enter/leave/re-enter, filter changes, history, failure/retry,
  pagehide and bfcache restoration are covered.
- `/lab/` fixture checks all dynamic module files and offline manifest membership.
- Existing archive semantics (9 writing entries / 100 exercises), reader, queue,
  modal/audio, practice, content and rendering tests remain in the full suite.

Browser acceptance should cover cover/navigation/search/queue, Notes and graph history,
article reader/notebook/code workbench, studio start/stop/modal transitions, practice,
small-screen Notes/article layout and both theme modes. Live browser resource inspection
must be stated separately from static file-graph analysis; do not present one as the other.
