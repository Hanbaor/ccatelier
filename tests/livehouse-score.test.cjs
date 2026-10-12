const test = require('node:test');
const assert = require('node:assert/strict');

const scoreModule = import('../source/atelier/js/livehouse-score.mjs');

test('the livehouse score is sixteen bars at 112 BPM, followed by no extra events', async () => {
  const {SCORE_BPM, SCORE_BEATS, SCORE_DURATION, scoreEvents} = await scoreModule;
  assert.equal(SCORE_BPM, 112);
  assert.equal(SCORE_BEATS, 16 * 4);
  assert.equal(SCORE_DURATION, SCORE_BEATS * 60 / SCORE_BPM);
  assert.ok(Math.abs(SCORE_DURATION - 34.285714285714285) < 1e-9);
  const events = scoreEvents();
  assert.equal(events[0].beat, 0);
  assert.equal(events.at(-1).beat, 60, 'leave the last bar for the final chord to ring out');
});

test('the livehouse arrangement is deterministic, fresh, and chronologically sorted', async () => {
  const {scoreEvents} = await scoreModule;
  const a = scoreEvents();
  const b = scoreEvents();
  assert.deepEqual(a, b);
  assert.notEqual(a, b);
  assert.notEqual(a[0], b[0]);
  a[0].velocity = 0;
  a.pop();
  assert.deepEqual(scoreEvents(), b, 'a caller cannot mutate a later performance');
  assert.ok(b.length > 200, 'the show contains a fully arranged instrumental part');
  assert.ok(b.every((event, index) => index === 0 || event.beat >= b[index - 1].beat));
});

test('every score event uses valid instruments, velocity, quantization and MIDI ranges', async () => {
  const {SCORE_BEATS, scoreEvents} = await scoreModule;
  const instruments = new Set(['kick', 'snare', 'hat', 'tom', 'bass', 'chord', 'crash']);
  const seen = new Set();
  const played = new Set();
  for (const event of scoreEvents()) {
    const {beat, instrument, velocity, note} = event;
    assert.ok(Number.isFinite(beat) && beat >= 0 && beat < SCORE_BEATS);
    assert.ok(Number.isInteger(beat * 4), 'all hits are on the sixteenth-note grid');
    assert.ok(instruments.has(instrument));
    assert.ok(Number.isFinite(velocity) && velocity > 0 && velocity <= 1);
    played.add(instrument);
    const key = `${beat}:${instrument}`;
    assert.ok(!seen.has(key), `no accidentally doubled instrument hit: ${key}`);
    seen.add(key);
    if (instrument === 'bass') {
      assert.ok(Number.isInteger(note) && note >= 36 && note <= 55);
    } else if (instrument === 'chord') {
      assert.ok([48, 53, 55].includes(note), 'C, F and G major have compatible warm voicings');
    } else {
      assert.equal(note, undefined, 'percussion leaves pitch selection to the synth');
    }
  }
  assert.deepEqual(played, instruments);
});

test('section boundaries are explicit and transport values are safe to query', async () => {
  const {SCORE_SECTIONS, sectionAt} = await scoreModule;
  assert.deepEqual(SCORE_SECTIONS, [
    {id: 'arrival', start: 0, end: 8},
    {id: 'build', start: 8, end: 24},
    {id: 'chorus', start: 24, end: 56},
    {id: 'finale', start: 56, end: 64},
  ]);
  assert.ok(Object.isFrozen(SCORE_SECTIONS));
  assert.ok(SCORE_SECTIONS.every(Object.isFrozen));
  for (const [beat, section] of [
    [-Infinity, 'arrival'], [-1, 'arrival'], [0, 'arrival'], [7.999, 'arrival'],
    [8, 'build'], [23.999, 'build'], [24, 'chorus'], [55.999, 'chorus'],
    [56, 'finale'], [64, 'finale'], [Infinity, 'finale'],
    [NaN, 'arrival'], [undefined, 'arrival'], ['24', 'arrival'],
  ]) assert.equal(sectionAt(beat), section, `position ${beat}`);
});

test('the show develops from sparse arrival to fuller chorus and resolves on the tonic', async () => {
  const {scoreEvents, SCORE_SECTIONS} = await scoreModule;
  const events = scoreEvents();
  const density = SCORE_SECTIONS.map(section =>
    events.filter(event => event.beat >= section.start && event.beat < section.end).length / (section.end - section.start));
  assert.ok(density[0] < density[1], 'the build introduces the backbeat and moving bass');
  assert.ok(density[1] < density[2], 'the chorus adds rhythmic detail');
  assert.ok(density[3] < density[2], 'the finale leaves room for the last chord');
  const chords = events.filter(event => event.instrument === 'chord');
  assert.equal(chords.length, 16);
  assert.deepEqual(chords.map(event => event.beat), Array.from({length: 16}, (_, index) => index * 4));
  for (const chord of chords) {
    const bass = events.find(event => event.beat === chord.beat && event.instrument === 'bass');
    assert.equal(bass.note, chord.note - 12, 'bass and chord agree on each downbeat');
  }
  assert.deepEqual(events.filter(event => event.beat === 60).map(event => event.instrument), ['kick', 'bass', 'chord', 'crash']);
  assert.equal(chords.at(-1).note, 48);
  assert.ok(events.some(event => event.instrument === 'tom' && event.beat > 59 && event.beat < 60), 'a final fill leads to the ending');
});
