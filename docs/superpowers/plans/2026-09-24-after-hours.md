# Nijika After Hours Implementation Plan

> Use superpowers:executing-plans inline; independent review before completion.

**Goal:** Deliver all items in the After Hours design, preserving the approved identity and real content.
**Architecture:** Hexo templates and small browser modules, Cloudflare Worker + D1 for shared community data, native HTML fallbacks.
**Tech Stack:** existing EJS/CSS/ES modules, Wrangler local runtime, Node test runner.
**Spec:** docs/superpowers/specs/2026-09-24-after-hours.md

## Tasks
- [x] Artwork: inspect official candidates and one generated portrait; select appropriate assets, add provenance, update frames/crops/alt text.
- [x] Community service: install pinned Wrangler development tool; add D1 migration and Worker; test visits, reactions, validation, moderation/auth and persistence before exposing UI.
- [x] Community UI: theme visitor badge, guestbook/per-post comments, owner moderation page, coherent loading/error/empty states.
- [x] Profile: rebuild about page as owner pass, use real writing/counts and approved identity.
- [x] Reading tools: real discovery index/RSS, random navigation, bookmark/recent/resume, copy link, focus/type controls.
- [x] After Hours: route and visual room for passport/ticket export, daily note, lighting/charm, timer and expanded rhythm.
- [x] Integration: all entry points, route prefixes, no-JS baseline and absent-backend handling.
- [x] Verification: server tests, site+fixture tests, local DB browser workflow, 390/820/1440 QA, independent review, documentation with exact setup and release boundary.

## Review focus
Unknown/invalid page keys, repeated submissions, rate-limit races, Unicode nicknames, scripts as comment text, unauthenticated moderation, cleared/blocked browser storage, reduced motion/audio cleanup, unavailable API, subpath deployments and empty comments.

## Execution ledger
- Initial inspection: prior visual reconstruction is present as uncommitted work on nijika; preserve it. Existing site is assets-only on Cloudflare, no comment or analytics service.
- User chose native nickname comments with moderation, existing CC identity.
- Browser inspiration found in Anzhiyu, Heo and Reimu; adapt ideas with original live-house visual treatment.
- Image generation job started once; wait on the same handle.


- Implemented shared Worker/D1 visits, moderated comments, replies, applause; local D1 migration applied. Local admin secret stays only in ignored .dev.vars.
- Generated and integrated two original image assets; official cover/standing identity retained, credits and design provenance updated.
- Implemented all 15 deliverables, including native reading utilities, a themed 8-object lounge, personal pass page, 16-step drum machine and tap tempo.
- Independent review found default GET form leakage, unavailable-storage feedback and bfcache timer cleanup. Corrected disabled POST form guards, failed-write-only memory fallback, pageshow resume; reviewer confirmed fixes. Storage regression tests added.
- Browser verified local nickname submission, private pending state, real D1 approval/reply appearing after reload; QA comment then moved to rejected status. Shared count dedup and owner logout checked via actual local workerd.
- Browser verified reading save, shared applause, larger font/focus mode, 13% resume after refresh, random real article, ticket download, note copy, light/charm, timer after refresh, drum pattern/play/stop. 390/820/1440 layouts inspected; no horizontal page overflow or missing new assets.
- Local full preview is http://127.0.0.1:4319/; static preview remains 4318. No production deploy, push or database creation.

- Final validation: Hexo build exit 0; Node suite 20/20 pass; fixture suite passes including 118 posts and /lab/ discovery/RSS routes (XML entities decoded for semantic URL assertion); Wrangler production bundle dry-run succeeds; git diff --check clean. Owner wrong-password UI returns inline error without changing URL. Test-only public comment was hidden. Temporary viewport, lamp, drum pattern, timer and saved-item changes reset; full local preview retained for review.
