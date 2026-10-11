# Practice → Studio: selected bars

The existing From/To selectors now have one progressive action, **选区继续编排**. It loads the converter and share codec only when requested, then opens a small inline preview. The preview names the source, inclusive bar range, current BPM and resulting 16/32-step grid. New preview prose, trigger and actions use at least 13px text; trigger and actions retain 44px targets. One concise visible explanation discloses the changed timbre, that the link contains the selected rhythm, and that no project-library save happens automatically. Escape closes only while focus is inside the preview and returns focus to the trigger, including during loading.

The native **在 Studio 打开** link opens a new tab with the existing `#rhythm=v1.` receiver. Practice remains available in the original tab.

## Exactness contract

- Validate the entire original Practice object using its existing strict schema. Work with fresh copies; never rewrite a demo, import or recording.
- Accept exactly one or two consecutive complete 4/4 bars. Reject larger, fractional, reversed or invalid ranges rather than truncating or quantizing.
- Use the current displayed Practice BPM, including fractions. Studio supports 60–180 BPM; outside values produce a recovery message, never an automatic tempo change.
- Copy each kick/snare/hat/tom event to its matching track at `(sourceBar − firstBar) × 16 + sourceStep`. Preserve floating-point velocity exactly, silent bars and the full final rest tail. Leave clap/rim empty.
- Use the existing blank Studio preset's synth mix and zero swing. The preview explicitly discloses the different Studio timbre.
- Studio cannot distinguish an explicit zero-velocity event from an absent event. Reject selected zero-velocity events rather than silently discarding that distinction. Events outside the selected range are not transferred.
- Preserve the source title verbatim when it meets Studio's 60 UTF-16-code-unit schema limit. Longer titles receive an explicit source-JSON recovery instruction; nothing is silently shortened.

## Navigation, lifecycle and privacy

`practiceStudioURL` accepts only the template-generated, root-relative adjacent Studio route verified against the current `/studio/practice/` path. It supports ordinary root/subpath deployments and rejects external origins, credentials, query/hash additions, separators and dot-segment tricks. It builds the fragment using `encodeShare`; `createShareURL` and its same-path guard are unchanged. Current Practice queries such as a local recording ID are not forwarded.

Each lazy request captures a validated source snapshot, range and tempo and owns an identity token. Selection/tempo/demo changes, import intent/completion, playback intent, close, shared dialogs, pagehide, hidden state and destruction invalidate it. An old load cannot restore an obsolete link or unlock a newer request. No file is uploaded, clipboard touched, audio started, or project automatically saved. Native primary/keyboard/middle-click link activation stops both Practice and challenge audio before navigating; normal page visibility and pagehide handling also stop playback.

The existing Studio receiver handles arrival, undo/redo, edits and exports. No parallel importer or session-storage handoff exists. Existing Practice JSON and SVG exports remain whole-score operations.

## Focused checks

`node --test tests/practice-studio.test.cjs tests/practice-interaction.test.cjs tests/studio-share.test.cjs tests/practice-score-export.test.cjs`

Coverage includes all original demos and every valid one/two-bar range; exact encode/decode and fractional velocities/BPM; source immutability; empty tails; malformed schema/accessors/duplicates/off-grid values; strict destinations at root and subpaths; delayed-load cancellation/retry/replacement; no automatic storage/audio/download; native transition stopping both transports; existing Studio arrival, edit, share and undo on 16/32-step projects. Converter/codec do not enter the initial or Practice static module graph. Studio core was already present through the existing audio graph.

Full generated-site build and real-browser visual/navigation QA are separate release checks.
