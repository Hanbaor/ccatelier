/**
 * An original, sample-free sixteen-bar miniature in C major.
 * Times are quarter-note beats; bass and chord notes are MIDI root numbers.
 * Chords use only major roots, allowing a warm major or open-fifth voicing.
 * The final tonic falls at beat 60, leaving a full bar for the sound to fade.
 */
export const SCORE_BPM = 112;
export const SCORE_BEATS = 64;
export const SCORE_DURATION = SCORE_BEATS * 60 / SCORE_BPM;

export const SCORE_SECTIONS = Object.freeze([
  Object.freeze({id: 'arrival', start: 0, end: 8}),
  Object.freeze({id: 'build', start: 8, end: 24}),
  Object.freeze({id: 'chorus', start: 24, end: 56}),
  Object.freeze({id: 'finale', start: 56, end: SCORE_BEATS}),
]);

/** Clamp transport under/overflow; a missing or invalid position is arrival. */
export function sectionAt(beat) {
  if (typeof beat !== 'number' || Number.isNaN(beat)) return 'arrival';
  if (beat < 8) return 'arrival';
  if (beat < 24) return 'build';
  if (beat < 56) return 'chorus';
  return 'finale';
}

// C, F / F, C, G, C / F, C, G, C, F, C, G, C / F, C.
// Bass roots sit below the chords; fifths and octaves stay in the same harmony.
const ROOTS = Object.freeze([36, 41, 41, 36, 43, 36, 41, 36, 43, 36, 41, 36, 43, 36, 41, 36]);
const INSTRUMENT_ORDER = Object.freeze(['kick', 'snare', 'hat', 'tom', 'bass', 'chord', 'crash']);

/** Return a fresh, deterministic event list, ready for an audio lookahead clock. */
export function scoreEvents() {
  const events = [];
  const hit = (beat, instrument, velocity, note) => {
    const event = {beat, instrument, velocity};
    if (note !== undefined) event.note = note;
    events.push(event);
  };

  for (let bar = 0; bar < 16; bar++) {
    const beat = bar * 4;
    const root = ROOTS[bar];
    const section = sectionAt(beat);
    const chorus = section === 'chorus';
    const fill = bar === 5 || bar === 9 || bar === 13 || bar === 14;

    hit(beat, 'chord', chorus ? .48 : bar === 15 ? .52 : .36, root + 12);

    if (bar === 15) {
      hit(beat, 'kick', .9);
      hit(beat, 'bass', .62, root);
      hit(beat, 'crash', .6);
      continue;
    }

    if (section === 'arrival') {
      // A soft heartbeat and sticks first; the second bar opens the room.
      hit(beat, 'kick', .57);
      hit(beat + 2, 'kick', .46);
      hit(beat, 'bass', .4, root);
      hit(beat + 2.5, 'bass', .34, root + 7);
      for (let step = 0; step < 4; step++) hit(beat + step, 'hat', step % 2 ? .25 : .33);
      if (bar === 1) {
        hit(beat + 1, 'snare', .4);
        hit(beat + 3, 'snare', .47);
        hit(beat + 3.5, 'hat', .23);
      }
      continue;
    }

    // Alternating eighth notes give the groove motion without random timing.
    for (let step = 0; step < 8; step++) {
      if (fill && step >= 6) continue;
      hit(beat + step / 2, 'hat', step % 2 ? (chorus ? .32 : .24) : (chorus ? .48 : .38));
    }
    hit(beat, 'kick', chorus ? .88 : .74);
    hit(beat + 2, 'kick', chorus ? .8 : .65);
    hit(beat + 1.5, 'kick', chorus ? .65 : .51);
    if (chorus && bar % 2 === 0) hit(beat + 3.5, 'kick', .58);

    hit(beat + 1, 'snare', chorus ? .84 : .65);
    if (!fill) hit(beat + 3, 'snare', chorus ? .88 : .7);
    if (chorus && bar % 2 === 1) hit(beat + 2.75, 'snare', .28);

    hit(beat, 'bass', chorus ? .62 : .51, root);
    hit(beat + 1.5, 'bass', chorus ? .5 : .43, root);
    hit(beat + 2.5, 'bass', chorus ? .56 : .46, root + 7);
    if (chorus) hit(beat + 3.5, 'bass', .45, root + 12);

    if (bar === 6 || bar === 10) hit(beat, 'crash', .52);
    if (fill) {
      // Short rising-velocity tom rolls lead into each next four-bar phrase.
      hit(beat + 3, 'snare', .62);
      hit(beat + 3.25, 'tom', .53);
      hit(beat + 3.5, 'tom', .64);
      hit(beat + 3.75, 'tom', .75);
    }
  }

  return events.sort((a, b) => a.beat - b.beat || INSTRUMENT_ORDER.indexOf(a.instrument) - INSTRUMENT_ORDER.indexOf(b.instrument));
}
