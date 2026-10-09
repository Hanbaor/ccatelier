# Projects case study

## Scope

The `/projects/` placeholder is now a compact implementation record for CC Atelier itself. It keeps the existing Nijika electronics-workbench illustration and places a useful summary beside it. The page has three content sections: implementation structure, three engineering choices, and related technical writing. It adds no JavaScript, dependency, generated artwork, achievement claim, or invented project.

The only shared-template edit is a `page.nijika === 'projects'` stylesheet condition in `custom/redefine/nijika/head.ejs`. The existing description frontmatter mechanism supplies both description and Open Graph metadata. Styling is route-specific, uses existing light/night tokens, and collapses to a single column on small screens. No reveal animation is required to expose the content.

## Evidence behind the copy

Source links on the page are pinned to the published commit `0f0ca188521f991b726eb132b3b131921c63c253`. The files were confirmed through GitHub before linking. The overview's repository link opens the `nijika-dot` branch.

- **Static document foundation.** `scripts/nijika.js` loads tracked EJS overrides through `before_generate` while retaining Hexo generators. `custom/redefine/layout.ejs` supplies a no-script navigation and exposes tab contents; `custom/redefine/nijika/notes.ejs` supplies a static directory and pagination. Demo: `/archives/`.
- **Shareable, recoverable search.** `source/atelier/js/archive-core.mjs` reads and writes bounded URL query parameters and implements the pure `queryArchive` function. `archive.js` handles URL history, `popstate`, worker errors and timeout fallback, and leaves the static directory in place if loading the index fails. Demo: `/notes/?q=STL&group=writing&sort=oldest`. Tests confirm that the actual index returns the vector and set articles.
- **Staged offline snapshots.** `custom/live-sw.template` downloads the article and resources, writes a new per-article cache, and only then updates metadata. A failed snapshot write removes that new cache without replacing the previous pointer. `source/atelier/js/offline.js` exposes the explicit save action and checks secure context and Service Worker support. Demo: the divide-and-conquer article; the page tells visitors where to find its save control instead of inventing an anchor.
- **Local state boundary.** `after-hours.js`, `archive-store.js`, `reader.js` and `ui.js` use browser storage and report persistence restrictions. The case study does not imply accounts or cross-device sync.
- **Separate shared backend.** `worker/index.mjs`, `worker/migrations/` and `wrangler.jsonc` implement same-origin `/api/*` interactions with a D1 binding. The page explicitly says these interactions need an independently deployed backend. This source review does not verify live service availability, production security, scale or performance.
- **Real writing.** `source/_posts/csdn/154834561.md` contains inverse-pair counting, meet-in-the-middle and closest-pair material; `124387071.md` discusses vector capacity/iteration; `124460411.md` covers set operations. Their frontmatter permalinks are the three destinations in the reading section. No empty exercise entry is promoted as a finished explanation.

## Validation

Run the ordinary build and complete suite, then check the prefixed fixture using the same case-study tests:

```sh
npm test
npm run test:fixtures
PROJECTS_PUBLIC_DIR=.nijika-qa/public PROJECTS_ROOT=/lab/ node --test tests/projects.test.cjs
```

`tests/projects.test.cjs` covers static semantics, visible content structure, immutable source paths, existence of demo routes, actual query results, root-prefix rendering, route-only stylesheet loading, metadata, CSS parsing/scoping, theme tokens, keyboard focus and small-screen/print rules. The generated offline shell also includes the new stylesheet through the existing collector.

Validation on 2026-10-09: focused build and 17 relevant tests passed; the complete suite passed all 190 tests; the fixture build passed; the six case-study tests also passed against the generated `/lab/` fixture. `git diff --check` passed. Browser screenshots and visual viewport checks remain pending; DOM tests are not a substitute for that review.
