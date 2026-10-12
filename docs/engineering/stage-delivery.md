# Studio-only stage delivery

The ambient WebGL stage is now a DOM-gated route feature selected by `[data-studio]`. `main.js` no longer statically imports or invokes it. Navigation, settings, dialog arbitration, rhythm, queue and offline controls still initialize synchronously before route enhancements. The stage's defensive reading-page and studio-section checks remain.

The existing studio-template lighting button stays usable during delivery: the shared loader captures its latest click and replays it once after successful initialization. Dialog opening, page hiding and visibility loss cancel that intent. Failed imports show the existing retry UI; partial initializer failures require refresh rather than duplicating partially initialized controls. This change does not replay audio gestures.

A stage-specific readiness gate delays initialization when an import resolves in a hidden or departed page. Visibility return / `pageshow` resumes initialization without reviving canceled clicks. Stage initialization is idempotent per document. Once initialized, `pagehide` suppresses all animation wake paths until `pageshow`, including resize, visibility and motion events. Reduced motion remains a static pass; unavailable/lost WebGL retains the idle fallback and existing magnetic interactions.

## Local delivery accounting

Measured using the real entry compiler and static module graph in temporary directories, retaining the current unrelated offline changes. The comparison restores only the prior `main.js`, `route-features.js` and `stage-engine.js` for the before sample. Gzip is the sum of independently compressed initial files at level 9.

| Metric | Before | After | Change |
| --- | ---: | ---: | ---: |
| Initial source closure, bytes | 97,190 | 88,393 | −8,797 |
| Initial source modules | 23 | 22 | −1 |
| Built initial closure, bytes | 82,998 | 75,343 | −7,655 |
| Built initial file requests | 10 | 10 | 0 |
| Initial gzip file sum, bytes | 31,032 | 28,090 | −2,942 |
| Studio total built closure, bytes | 125,361 | 127,336 | +1,975 |
| Studio total file requests | 17 | 18 | +1 |

The intentional tradeoff is one separate request on the studio route and a slightly larger studio total, in return for excluding this GPU-only payload from every other initial route. Lifecycle safeguards are included in the after figures. Source and built initial ceilings remain 100,000 and 83,000 bytes. Shared `ui.js`, `archive-store.js` and `live-dialog.js` retain their original native module identities. These are file-byte and closure measurements, not browser timing, network-transfer, memory or performance-score measurements.

## Offline and verification

The generated delivered-module profile marks `stage-engine.js` with `data-studio`. Root and subpath ordinary-article snapshots neither fetch nor store it, including when that unrelated asset is unavailable. Studio markup includes it and its shared dependency closure. The legacy conservative manifest remains complete.

Focused verification: 69 passing tests across `stage-delivery`, `stage-resource-cost`, `route-features`, `route-reader-readiness`, `main-entry-build`, `module-graph`, and `offline-profile`. Coverage includes the actual main source, actual template button, actual stage initializer, delayed and failed imports, retries, repeated initialization, canceled intents, initially hidden tabs, departure before and after import, repeated return, root/subpath resolution, reduced motion, context loss and fallback, graph membership, and real worker snapshot fetches.

No full site build or browser/network benchmark was run for this change. The parent integration pass owns the final aggregate verification.
