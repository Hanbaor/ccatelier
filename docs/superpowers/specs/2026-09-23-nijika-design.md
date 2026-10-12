# Nijika × Redefine

Approved direction: the V5 Live House design preview, implemented in the actual CCAtelier repository on branch `nijika`, created directly from `main` (`b9c4357`). The user explicitly requested immediate implementation, including cursor and click effects; no additional design approval is needed.

## Product

- Black, warm ivory and Nijika yellow. Monumental condensed type, two official animation stills, angled frames, quiet interiors. Do not use generated character art or add marketing paragraphs.
- Root is a single-screen entrance. Notes, projects, research, life and about have real URLs. Published Markdown posts generate real reading pages and remain directly accessible, including existing CC Atelier post URLs.
- Notes use actual posts and pagination. Categories, tags, archives, search, 404 and empty states share the design. Projects and personal information use known content only. Default Hexo tutorial remains available as a draft, not personal published writing.
- Reading supports long prose, headings/TOC, code/copy, tables, lists, images, links and Redefine writing modules. No fake articles are published for testing.
- Cursor uses a small yellow triangular tip inspired by Nijika's hair accessory, a subtle drum-ring hover cue, and short beat-ring/spark click feedback. Native cursor remains usable, text selection uses an I-beam, touch gets no fake cursor. Effects do not obscure reading or intercept events.
- Effects, cover parallax and transitions respect reduced motion and the persistent motion toggle. Audio is opt-in, stops on close/navigation/background, and never autoplays.
- Desktop, tablet and narrow phone layouts; keyboard navigation, focus visibility, dialog dismissal and restoration, usable touch targets. Real links remain usable without JavaScript.

## Technical approach

Keep `theme: redefine`, pin Redefine 2.9.0, reuse its Hexo filters, Markdown/code processing, writing modules, theme configuration, language data and appropriate article helpers/components. Project-owned EJS overrides are installed into Hexo's loaded theme via `before_generate`/`setView`; do not edit node_modules. Document exactly what is reused and overridden.

Project CSS/JS assets live under `source/atelier/`; templates under `custom/redefine/`; build integration under `scripts/`. Root cover and notes are separate Hexo routes. Search reads the real `hexo-generator-searchdb` output. Native full-page links are the baseline; entrance animations are progressive enhancement. Keep Cloudflare's `public` asset deployment model.

## Verification

Build from dependencies pinned in the lockfile. Integration assertions cover theme identity, root/notes separation, real post content and permalinks, pagination, category/tag/archive routes, search data, subpath-safe URLs and local assets. Temporary fixture content exercises long prose/code/tables and malicious-looking search strings without adding fake public posts. Browser QA covers main routes, 1280/390/320 widths, light/dark modes, cursor/click effects, entry/back, search, article tools, keyboard/dialogs and audio cleanup. Final code review plus fixes before declaring completion. No deployment or push is required by this task.
