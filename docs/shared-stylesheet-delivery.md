# Bounded shared stylesheet delivery

This build-only optimization replaces eleven authored head links with four stable
same-directory links. Every source stylesheet and its original public URL remains
available. No rules, selectors, declarations, ordering, source files, or runtime
loaders are removed or changed.

## Permanent URL membership

| Delivery file under `atelier/css/` | Ordered source members |
| --- | --- |
| `delivery-foundation.css` | `atelier.css`, `content.css`, `effects.css`, `stage.css` |
| `delivery-dialogs.css` | `after-hours.css`, `archive.css` |
| `delivery-editorial.css` | `daylight.css`, `refinement.css`, `editorial.css` |
| `delivery-immersive.css` | `immersive.css`, `navigation-scenes.css` |

These URLs permanently represent these ordered memberships. Edit the source CSS
normally; do not repurpose an existing delivery URL for a different membership.
A future regrouping requires different URLs and separate compatibility analysis.
`fonts.css`, generated Stylus `redefine.css`, Tailwind, FontAwesome, route-specific,
body, and dynamically loaded CSS remain untouched.

## Preparation and publication

`tools/build-shared-stylesheets.cjs` reads a new snapshot each generation, validates
UTF-8 and CSS syntax using the existing esbuild parser, and rejects warnings,
position-sensitive `@import`, `@charset`, `@namespace`, source-map directives,
BOMs, missing files, and reserved output collisions. The parser output is discarded.
Delivery bytes are the original buffers in order with one newline between members;
there is no minification, pruning, URL rewriting, or final added newline. Relative
URLs therefore retain the original directory and resolve identically.

The prepared in-memory manifest includes each member's SHA-256 and each delivered
buffer's SHA-256. Hashes are verification metadata, not href cache-busters.
`scripts/shared-stylesheets.js` prepares all four outputs before generation and
commits the prepared snapshot only on success. The generator emits native Hexo
routes as `{data: preparedBuffer, modified: true}`. Original routes are unchanged.
Reserved source paths are checked before generation. A separate priority-1000
filter installs guards after the existing priority-100 generator setup. Plugins
registering generators later than that boundary need separate coordination; guarded generator results
also reject competing output routes before Hexo's route refresh publishes them.
No `after_generate` route mutation is used.

The once-registered final HTML filter rewrites only exact, approved sequences in
a document head. Links must have exactly plain quoted `rel="stylesheet"` and
`href` attributes, and the members must have the same directory prefix. Only
whitespace can intervene. Unknown or duplicate attributes, media, disabled/title,
integrity/events, comments, other nodes, reordered members, and URL suffixes cause
the sequence to remain unchanged. Body links are never rewritten. Running the
filter again does not change the result.

## Caching, rollout, and offline behavior

HTML caching stays enabled. Cached rewritten HTML references stable delivery URLs,
which receive fresh prepared bytes through Hexo's normal writer when CSS changes.
Cached original HTML continues to use retained original URLs. Unchanged outputs
keep identical bytes and the writer's content hash avoids rewriting them.

Stable URLs preserve the site's existing stable-CSS rollout/cache model. This does
not claim fresh client caches or atomic cross-request HTML/CSS updates. No hashed
asset retention, HTTP/CDN headers, provider configuration, worker cache names, or
service-worker source changes are introduced.

Both current and legacy offline selection discover the delivery links directly
from saved HTML, follow same-directory CSS URLs, and can restore their exact saved
bytes using the existing worker fetch handler. Original URLs remain available for
older saved HTML and shell manifests. The legacy/fallback shell may cache both
the eleven originals and four HTML-discovered bundles, duplicating those CSS
bytes. Compatibility is preserved at that storage cost; the current lean profile
avoids those duplicate originals when the saved HTML uses delivery bundles.

## Verification and measured scope

Run `node --test tests/shared-stylesheets.test.cjs` for focused verification,
including temporary real Hexo writer/watch fixtures and the populated Cache model.
After a normal site build, run `node --test tests/route-scene-budget.test.cjs` for
generated-output counts, route omissions, expanded semantic dependencies, original
asset preservation, and exact delivery byte equality. Normal aggregate tests remain
required for integration.

The focused suite also checks complete stylesheet-sequence expansion over all 211
existing documents at `/` and `/lab/`, including body links; adversarial markup;
missing/malformed/source/generated collision failures and recovery; repeat-build
stability; and current/legacy offline save and restore at both prefixes.

The current source snapshot yields seven fewer stylesheet links per document.
The sum of individually gzip-9-compressed CSS bodies is 4,575 bytes smaller per
route with this exact separator convention. This is static compression accounting,
not measured network transfer, request latency, LCP, or browser load-time benefit.
For example, all-document link counts change from 17 to 10 on home, 16 to 9 on
notes/projects, 17 to 10 on research, and 18 to 11 on Hot100 001. Initial JavaScript
budgets are unchanged.
