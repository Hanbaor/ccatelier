# Reading continuity

The article's existing top navigation conditionally offers `继续阅读 · N%`. All ordinary actions remain in the closed end-of-article tools. Notes offers one native continuation link in its existing navigation, using the most recent partial record that still exists in the current root's catalog. Opening that link does not scroll the article; continuing there is an explicit second action.

## Position contract

- Partial positions greater than 5% and below 97% offer continuation. Completed articles do not.
- Existing progress is protected on initial load, reload and BFCache restoration. Incidental scroll, layout shifts, hashes and nested editor scrolling cannot overwrite it.
- Explicit resume jumps immediately to the saved position and transfers keyboard focus to nearby reading content. Explicit `从头阅读` in the footer resets the position and focuses the title. Existing tabindex values are retained; temporary focus attributes are removed on blur.
- Intentional page scrolling that reaches the saved position resumes normal tracking. After release, scrolling backward is a valid new position; progress is not a permanent maximum.
- Deep links always retain native hash navigation. Nothing scrolls or focuses at initialization.
- Tracking uses the existing protected shelf store. Unavailable, malformed and unsupported state cannot be overwritten. Recovery and external storage changes refresh the authoritative baseline before incidental scrolling can save. Quota fallback remains page-local and does not replace corrupt durable state.
- Pagehide stops tracking timers; BFCache pageshow refreshes state. A late reader import cannot start tracking a departed article.

## Entry context

Native article links carry one bounded `notes` parameter. It contains only the exact current-root Notes route, known archive filter keys and values, and either the catalog or reading-path anchor. The article back link restores that validated context. External URLs, path escapes, duplicate or unknown filters and arbitrary anchors are rejected. There is no browser-global return location or open redirect.

Catalog list/grid, graph and curated-path links retain native navigation, modifier-key and new-tab behavior. Curated entries return to their path section; this release does not invent path-next sequencing. Direct entries keep the server-rendered fallback. With JavaScript unavailable, server-rendered links remain usable and optional continuation stays hidden.

## Returning to Notes

An unchanged, completed query keeps its existing cards, expanded result count and focused DOM node across BFCache restoration and same-query history events. Queue and continuation indicators refresh in place. Changed queries and interrupted worker searches are recomputed; late worker messages cannot replace the restored results. Native viewport and hash restoration remain in control of the browser.

Fresh search input is carried into an immediate filter change rather than lost to the pending debounce. Reset and changed history override the draft, including composition-event ordering. An unchanged return retains an uncommitted draft without scheduling an automatic refilter that could displace restored focus; new input, submit or filter activation applies it.

The graph evidence panel likewise retains completed title/source nodes for the same selection and ordered render inputs, updating contextual links in place. Changed visible metadata or selection rerenders. Paused, failed or incomplete loads restart with existing stale-response guards; they are never mistaken for completed evidence.

## Delivery and verification

Continuity and return-link enhancement load with the existing lazy reader. Ordinary bookmark, focus and copy-link actions remain independent of that import. A tiny shared shelf module preserves one store identity across initial and lazy modules. Initial byte budgets remain unchanged (100,000 source; 83,000 built).

Focused tests cover reader navigation/layout, storage recovery/quota, continuation lifecycle and focus, bounded context at root/subpath, archive native links and lazy graph integration. Run the full build, aggregate tests and browser validation before publication; focused DOM tests do not establish final rendered visual quality.
