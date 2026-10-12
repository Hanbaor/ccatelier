# Stage Archive Implementation Plan

> Execute inline with superpowers:executing-plans; perform an independent final review.

**Goal:** Deliver the approved stage-archive redesign and a complete, faithful migration of the user's public CSDN articles, including 100 individual Hot100 posts.
**Architecture:** Existing Hexo/Redefine view overrides plus focused stage CSS/JS; native static routes and explicit content collections. Deterministic migration tooling with cached public source, local assets and a provenance manifest.
**Tech stack:** Hexo 8, Redefine 2.9, EJS, CSS, browser ES modules, Node/Python import tooling.
**Spec:** `docs/superpowers/specs/2026-09-24-stage-archive.md`

## Global constraints

- Continue on `nijika`; retain current source article and permalink; no production deployment or CSDN mutation.
- Official art only; low visible copy; no fabricated personal content or missing solutions.
- Preserve accessible native links, phone layout, reduced motion and optional audio lifecycle.
- Migration is complete only after comparing every owned source article with destinations, not merely after a successful build.

## Review focus

1. One hundred series posts must not bury other writing or produce duplicate/unstable URLs.
2. Chinese/math/code/remote image fidelity; no HTML platform chrome or unsafe handlers.
3. Missing source articles, pagination and header-like text inside fenced code.
4. Global keyboard navigation, long titles, route fallback and motion preferences.
5. Actual composition at 1280, 768 and 390 widths, readable metadata and comfortable reading.

## Tasks

- [x] 1. Inventory: enumerate CSDN-owned article IDs and dates; inspect three downloaded source files; cache sources in ignored `.nijika-import/`. Record completeness evidence and preserve originals.
- [x] 2. Visual implementation: replace navigation, add stage landing, redesign notes/archive/post/series and focused styles. Preserve original cover. Reuse Redefine writing output. Verify existing routes and inspect composition before importing posts.
- [x] 3. Migration: test exact Hot100 splitting and anchor remapping; implement deterministic import, sanitize web-only article HTML, localize images, generate metadata and series index. Verify content fidelity and count for every source.
- [x] 4. Integrated QA: clean build and automated checks; browser inspect actual migrated code/math/images, complete series, navigation/search and mobile layouts; resolve review findings. Commit work and document evidence.

## Progress / rulings

- Current user explicitly approved the proposed design and asked for full execution. Proceed with this concrete specification without repeating permission gates.
- Existing branch/worktree is clean and already the user-selected `nijika`; no additional worktree needed.
- Local exports found in Downloads: `LeetCode Hot100.md`, `PyTorch基本操作实验.md`, `✨算法题目推荐 --- 分治（1）.md`. Other unrelated Downloads files are outside scope.
- Web reader failed on CSDN; normal public HTTP GET succeeds. Use accessible public source without login/captcha workarounds.

- Imported all 9 profile originals: 100 Hot100 posts + 8 other posts; the existing Hello article is unchanged. All 414 source code blocks match rendered output, all 54 image occurrences resolve locally, and article fragments resolve.
- Independent review found and rechecked fixes for deployment-prefix links, escaped C++ prose tokens, a malformed PyTorch image export, and emphasis delimiters. Final review: no remaining material issue in these findings.
- Browser QA exercised 390px reading and library views, 1280px article layout, native series navigation, real search results, image loading and dialog controls. An old Hexo watch process stopped responding during bulk import; it was restarted as a static preview on the same port 4318.
- Final fresh build passed: 8 JavaScript tests, 5 migration parser tests, 118-post prefixed fixture, and the complete migration audit. Browser inspected 390/768/1280 widths with no horizontal overflow; entry transition, guide, search, and image loading were exercised. No deployment performed.
