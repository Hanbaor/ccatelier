# Rhythm signature

A right-side warm follow-spot briefly lights the homepage hero on intent. A small oblique snare drum with two lifted sticks connects the homepage's after-hours entrance to the projects page. It uses existing ink and accent tokens, translucent shell/head surfaces, and sparse hardware marks. No new copy, control, image crop, network dependency, or navigation is introduced.

## Placement and motion

- Hero: one passive SVG between the original picture and caption. A local warm gradient lights only the right-hand image area. Two lightweight luminance masks feather each slanted side along its inward normal over 24 SVG units, without blur or filters; the existing readability scrim stays above it (z-index 1), and the caption stays above both (z-index 2). Hero hover or keyboard focus plays one 1.6-second fade and 1.5% lateral pass. It starts and ends invisible, without changing the image source, LCP priority, or image transforms. Reduced motion and motion-off hide it immediately.
- Homepage: 132 × 73.3 CSS-pixel signature before the after-hours eyebrow; 104 × 57.8 on screens up to 760px. It occupies its own grid row, outside links, and cannot intercept input.
- Projects: static 58 × 32.2 mark beside the existing eyebrow, reduced to 48 × 26.7 on small screens.
- Pointer hover on fine-hover devices and keyboard focus anywhere in the after-hours section play one 1.2-second left/right stroke phrase. Leaving the section returns it to its original pose. No autoplay or infinite loop.
- The snare drawing stays complete without hover, scripting, or animation. Reduced motion and the site's motion-off setting cancel animation and transforms on the full SVG subtree immediately.
- The drum geometry has no IDs, external resources, text, or focus targets. The hero gradients and edge masks use five unique page-local IDs with the home-stage-light prefix; every fragment reference is internal. Every decorative SVG is aria-hidden and pointer-events:none; the existing links remain the only interaction targets.

## Verification

The new source/layout contract tests use actual SVG partial rendering at root and subdirectory paths. They check passive geometry, exact two drum placements plus one hero light, preserved native links, finite animation, media gates, dimensions, and motion-stop cascade selectors. Existing home/navigation/project tests also pass (33 combined tests). These checks do not establish rendered browser layout or runtime animation timing.

The local light/dark PNG preview was rasterized directly from the authored SVG with Sharp. It is a magnified static vector detail, not a screenshot of the site. Browser pixel QA was unavailable during this change.
