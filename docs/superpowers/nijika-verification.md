# Nijika verification · 2026-09-23

Implementation: `nijika`, based on `main` b9c4357. No production deployment.

## Automated evidence

- Clean default Hexo build; published source contains only the user's original article.
- Node suite: eight passing checks covering real routes/content, Redefine pinning, theme state, local assets, safe search URLs, matching/ranking, and Chinese IME handling.
- Isolated fixture build: ten posts, four notes pages, Unicode tags/categories, escaped HTML-like titles, long code/table/title, TOC, image captions, tabs/folding, regular Markdown page styles, `/lab/` prefix and normalized search permalink paths.
- Regression failures observed before fixes: missing implementation baseline, missing search module, dark-mode/highlight mismatch, IME key-action guard, and duplicate slash search URLs.
- `git diff --check`; JS syntax checks before commit.

## Browser checks

Actual project server: `http://127.0.0.1:4318/`. Temporary fixture server: port 4319.

- 1280 × 720 desktop: approved cover composition, scene switching, entrance navigation, actual notes/article and cursor/click feedback.
- Click-effect nodes cleared after feedback; browser Back restored the cover with its transition curtain inactive.
- 390 × 844 mobile: cover, menu, notes, projects, research, life, about; long article/TOC/code/table and image viewing.
- 320 × 568 and 844 × 390: cover fits a single viewport, including entrance and footer. 768 × 1024: notes and reading controls.
- Dark/light and motion preferences survive reload. Motion-off hides cursor ring/click effects and disables smooth scrolling.
- Search retrieves the actual article from body text; Down/Enter opens the correct article. Fixture HTML-like titles render as text with zero injected images.
- Missing search JSON shows retry; restoring the file and clicking retry restores results. Custom permalink result opens the generated page under `/lab/`.
- Missing tabs module reveals every pane and hides inert tab controls; restored module switches panes using clicks and arrow keys.
- Code copy shows success; folding opens, TOC follows headings, image dialog dismisses with Escape and restores focus to the image.
- Rhythm starts only after explicit playback; closing via Escape resets the playing state and all beat lights, returning focus to its opener.
- Pagination advances to page two with the expected articles and current-page number.
- Real site console had no errors or warnings during these checks. Expected missing-resource errors were induced only in the ignored fixture sandbox, then resources restored.

No-JavaScript navigation/content fallbacks and reduced-motion/coarse-pointer CSS were reviewed in source; actual OS accessibility preferences and touch hardware were not changed for testing. Audio playback state and lifecycle were verified in browser; subjective sound quality was not evaluated.

## Independent review

Reviewer inspected the working tree and confirmed genuine Redefine reuse. IME navigation, unavailable-tab content, regular-page Tailwind, brand fonts and an overly first-page-specific assertion were fixed. No remaining Critical or Important findings were reported. The search-generator normalization received an additional focused review.
