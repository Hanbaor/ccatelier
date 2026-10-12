# Nijika After Hours — design and acceptance
Date: 2026-09-24

## User intent
Preserve the approved dark, graphic backstage direction. Replace poorly integrated imagery with deliberate, higher-quality compositions. Add many useful and playful features corresponding to Nijika / live-house / writing themes. User explicitly selected nickname comments with owner moderation and retaining the existing CC identity and links.

## Experience
The creator room remains a composed entrance. A clearly discoverable After Hours room (/lounge/) contains richer toys, a ticket passport and reading collection; a short utility ribbon exposes visitors, random reading, the lounge and guestbook without making the main composition crowded. About becomes an owner backstage pass with verified site facts, interests, real writing and GitHub. Guestbook and per-article comments use one original styled system.

## Deliverables
1. Curated/created artwork with provenance, deliberate crops and theme-matched color; generated artwork labelled honestly in credits.
2. Visitor/device and page-view counters backed by a persistent database; no fictitious totals, local mode labelled.
3. Nickname comments, required moderation, pagination, field limits, validation, error/retry states; owner can approve/reject/reply from an authenticated moderation page.
4. Applause reactions with server-side per-browser deduplication.
5. Personal page, static real post/series totals and links; no invented life/work claims.
6. Random actual article and random Hot100 pick, no dummy navigation.
7. Local reading list, recent reading, reading-position resume and article share action.
8. Reading focus mode and comfortable type-size controls.
9. A local visitor ticket/passport with section stamps and downloadable SVG souvenir.
10. Daily original encore note (not falsely attributed as a character quote).
11. Stage light presets, interactive charm and respectful small effects.
12. An extended drum instrument with a 16-step sequencer/tap tempo.
13. An amp-styled focus timer with visible pause/reset and no automatic sound.
14. A readable help/shortcut panel and RSS discovery.
15. Coherent 390/820/1440 layouts, keyboard/focus support, reduced motion, no unwanted audio.

## Data / architecture
Retain Hexo/Redefine and all 109 posts. Add a Cloudflare Worker and D1 schema next to the existing static-assets configuration; use real local D1 emulation to verify full functionality without publishing. Keep an assets-only build usable with explicit unavailable community states. Production binding/secrets are release configuration and must never be fabricated; do not deploy without an explicit instruction.

Anonymous browser cookie is random, HttpOnly and SameSite; store only a hashed identifier. Explain that visitors are browser-deduplicated, not a count of identifiable people. Page views deduplicate repeated refreshes within a session window. Never request geolocation or fingerprinting. Comments are plain text, nickname + message + optional preset stamp; no email required. Public results contain approved records only. Writes use same-origin checks, size limits, honeypot and rate limits. Admin authentication is server-side with a private environment secret, expiring signed cookie, login rate limits; secrets never go into Hexo output. Database queries are parameterized.

## Inspiration
- Anzhiyu configuration: random post, guestbook, music room, albums, site clock: https://github.com/anzhiyu-c/hexo-theme-anzhiyu/blob/dev/_config.yml
- Heo blog changelog: global guestbook and compact music controls: https://blog.zhheo.com/update/
- Reimu: character-centric details and interactive discovery: https://github.com/D-Sketon/hexo-theme-reimu
Use the patterns as inspiration, implement original theme-specific visuals; no source copying required.

## Acceptance evidence
Fresh build and existing site/fixture tests; meaningful server tests for comment moderation, authentication, XSS-safe text, dedup/rate limits, pagination and missing-service errors. Browser exercise local persistent comment submit/reload/approval visibility, counts, reactions, real links, stored reading list, ticket export, timer and rhythm stop behavior, responsive screenshots. Clear boundary between local preview and any unconfigured production release.

