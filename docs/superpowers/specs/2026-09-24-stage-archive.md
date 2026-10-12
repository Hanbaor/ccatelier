# Nijika Stage Archive and CSDN migration

User-approved intent: transform the post-entry experience into a polished, imaginative Nijika Live House stage archive, then transfer all of the user's public CSDN articles from m0_68856756, including the three downloaded Markdown exports and splitting Hot100 into exactly 100 separate posts.

## Visual contract

Keep the single-screen cover and official existing character art. Redesign the entry destination and global navigation as an asymmetric stage composition with an illuminated image, visible chapter labels, fine typographic hierarchy and direct native links. Replace the five-row menu. Distinguish the personal landing surface from the complete writing library. Give real writing an editorial lead, meaningful collections and compact browsable rows. Carry warm yellow triangles, circles and restrained stage light into reading, metadata, series navigation and post endings. No invented article text, AI character assets, autoplay audio or forced scroll animations. Real posts and long titles must determine a usable layout. Mobile is deliberately composed, not a shrunk desktop.

## Content contract

Inventory the public owner's profile and enumerate every owned article. Use downloaded Markdown as primary faithful content when it matches; obtain remaining public article bodies, dates and titles. Preserve code, images, links, formulae and original wording; remove CSDN platform chrome. Store provenance and source/content hashes in a migration manifest. Copy content into the blog locally; do not delete or change CSDN or deploy to production.

Split the exported Hot100 at its actual 100 question boundaries, preserve each question body and algorithm topic, rewrite intra-compilation anchors to local URLs, and add a usable collection index plus previous/next in sequence. Do not invent missing personal solutions. All 100 are individual generated posts. Avoid overwhelming the main landing page with a hundred near-identical rows: expose the collection with its own complete index while keeping every post discoverable through search and archives.

## Verification

Audit inventory count against profile, each source-to-destination mapping, Hot100 1–100 uniqueness/body fidelity, asset availability, internal anchor/link targets and output safety. Build actual Hexo/Redefine routes, inspect desktop and mobile landing/navigation/reading/series, preserve native navigation and keyboard/motion fallbacks. Get an independent final code/content audit. Keep work on existing user-requested `nijika` branch, currently clean at 4a14521.
