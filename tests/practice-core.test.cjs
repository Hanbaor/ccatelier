const test = require('node:test');
const assert = require('node:assert/strict');
const core = import('../source/atelier/js/practice-core.mjs');
const fixture = () => ({
  id: 'original-test', title: '原创测试', description: 'An original test drum exercise.', bpm: 120,
  bars: [
    {hits: [{step: 8, type: 'snare', velocity: .8}, {step: 0, type: 'hat', velocity: .5}, {step: 0, type: 'kick', velocity: 1}]},
    {hits: []},
    {hits: [{step: 15, type: 'tom', velocity: .6}, {step: 0, type: 'kick', velocity: .9}]},
    {hits: [{step: 4, type: 'snare', velocity: .7}]},
  ],
});

test('three original demos are valid, deeply immutable, and use 4/8 bars', async () => {
  const {PRACTICE_DEMOS, PRACTICE_TYPES, validatePractice} = await core;
  assert.equal(PRACTICE_DEMOS.length, 3);
  assert.ok(Object.isFrozen(PRACTICE_DEMOS));
  assert.ok(Object.isFrozen(PRACTICE_TYPES));
  assert.equal(new Set(PRACTICE_DEMOS.map(demo => demo.id)).size, 3);
  assert.deepEqual(PRACTICE_DEMOS.map(demo => demo.bars.length), [4, 4, 8]);
  for (const demo of PRACTICE_DEMOS) {
    assert.match(demo.id, /^original-/);
    assert.match(demo.title, /原创/);
    assert.match(demo.description, /原创/);
    assert.deepEqual(validatePractice(demo), demo);
    assert.ok(Object.isFrozen(demo) && Object.isFrozen(demo.bars));
    for (const bar of demo.bars) {
      assert.ok(Object.isFrozen(bar) && Object.isFrozen(bar.hits));
      assert.ok(bar.hits.every(Object.isFrozen));
      assert.equal(new Set(bar.hits.map(hit => `${hit.step}:${hit.type}`)).size, bar.hits.length);
    }
  }
});

test('demo patterns teach eighth-note time, syncopation, and one-beat tom fills', async () => {
  const {PRACTICE_DEMOS} = await core;
  const [eighth, syncopation, fill] = PRACTICE_DEMOS;
  for (const bar of eighth.bars) {
    assert.deepEqual(bar.hits.filter(hit => hit.type === 'hat').map(hit => hit.step), [0, 2, 4, 6, 8, 10, 12, 14]);
    assert.deepEqual(bar.hits.filter(hit => hit.type === 'snare').map(hit => hit.step), [4, 12]);
    assert.ok(bar.hits.every(hit => hit.step % 2 === 0));
  }
  assert.ok(syncopation.bars.some(bar => bar.hits.some(hit => hit.type === 'kick' && hit.step % 2 === 1)));
  assert.ok(syncopation.bars[3].hits.some(hit => hit.type === 'snare' && hit.velocity < .4));
  for (const [index, bar] of fill.bars.entries()) {
    const toms = bar.hits.filter(hit => hit.type === 'tom');
    assert.deepEqual(toms.map(hit => hit.step), [3, 7].includes(index) ? [12, 13, 14, 15] : []);
    assert.ok(toms.every((hit, i) => i === 0 || hit.velocity > toms[i - 1].velocity));
  }
});

test('validation returns a fresh canonical copy without changing caller input', async () => {
  const {validatePractice} = await core;
  const input = fixture();
  const before = structuredClone(input);
  const clean = validatePractice(input);
  assert.deepEqual(input, before);
  assert.notEqual(clean, input);
  assert.notEqual(clean.bars, input.bars);
  assert.deepEqual(clean.bars[0].hits.map(hit => hit.type), ['kick', 'hat', 'snare']);
  clean.bars[0].hits[0].velocity = 0;
  clean.bars[0].hits.pop();
  assert.deepEqual(input, before);
});

test('validation strictly rejects unknown and missing fields at every schema level', async () => {
  const {validatePractice} = await core;
  for (const locate of [p => p, p => p.bars[0], p => p.bars[0].hits[0]]) {
    const extra = fixture();
    locate(extra).unexpected = true;
    assert.throws(() => validatePractice(extra), TypeError);
    const symbol = fixture();
    locate(symbol)[Symbol('hidden')] = 'no';
    assert.throws(() => validatePractice(symbol), TypeError);
    for (const field of Object.keys(locate(fixture()))) {
      const missing = fixture();
      delete locate(missing)[field];
      assert.throws(() => validatePractice(missing), TypeError);
    }
  }
  for (const value of [null, undefined, false, [], 'project', 1, new Date()]) {
    assert.throws(() => validatePractice(value), TypeError);
  }
  const prototypeField = JSON.parse(JSON.stringify(fixture()));
  Object.defineProperty(prototypeField, '__proto__', {value: {}, enumerable: true});
  assert.throws(() => validatePractice(prototypeField), TypeError);
});

test('validation rejects malformed labels, tempos, bars, and oversized imports', async () => {
  const {validatePractice} = await core;
  const invalidFields = {
    id: ['', 'UPPERCASE', 'has spaces', '../path', 'x'.repeat(65), 12],
    title: ['', '   ', 'x'.repeat(81), 'a\u0000b', null],
    description: ['', ' ', 'x'.repeat(501), 'a\u007fb', []],
    bpm: [39.99, 220.01, 0, -1, NaN, Infinity, -Infinity, '120', null],
    bars: [[], new Array(4), null, {}, Array.from({length: 65}, () => ({hits: []}))],
  };
  for (const [key, values] of Object.entries(invalidFields)) {
    for (const value of values) assert.throws(() => validatePractice({...fixture(), [key]: value}), TypeError, `${key}: ${String(value)}`);
  }
  const extra = fixture();
  extra.bars.note = 'unrecognized';
  assert.throws(() => validatePractice(extra), TypeError);
});

test('validation rejects invalid hits, duplicates, sparse arrays, and accessors', async () => {
  const {validatePractice} = await core;
  for (const [field, values] of Object.entries({
    step: [-1, 16, .5, NaN, Infinity, '0', null],
    type: ['bass', 'Hat', '', 0, null],
    velocity: [-.001, 1.001, NaN, Infinity, '1', null],
  })) {
    for (const value of values) {
      const input = fixture();
      input.bars[0].hits[0][field] = value;
      assert.throws(() => validatePractice(input), TypeError, `${field}: ${String(value)}`);
    }
  }
  for (const hits of [null, {}, new Array(1), [null], Array(65).fill({step: 0, type: 'kick', velocity: 1})]) {
    const input = fixture();
    input.bars[0].hits = hits;
    assert.throws(() => validatePractice(input), TypeError);
  }
  const duplicate = fixture();
  duplicate.bars[0].hits.push({...duplicate.bars[0].hits[0], velocity: .1});
  assert.throws(() => validatePractice(duplicate), /重复/);
  let read = false;
  for (const locate of [p => [p, 'bpm'], p => [p.bars, '0'], p => [p.bars[0].hits[0], 'step']]) {
    const input = fixture();
    const [target, key] = locate(input);
    Object.defineProperty(target, key, {get() { read = true; return 0; }, enumerable: true});
    assert.throws(() => validatePractice(input), TypeError);
  }
  assert.equal(read, false, 'validation must not execute imported field getters');
});

test('all inclusive schema boundaries are accepted, including rests and zero velocity', async () => {
  const {validatePractice, PRACTICE_TYPES} = await core;
  const hits = Array.from({length: 16}, (_, step) => PRACTICE_TYPES.map(type => ({step, type, velocity: step % 2}))).flat();
  const boundary = {...fixture(), id: 'x'.repeat(64), title: 'x'.repeat(80), description: 'x'.repeat(500), bars: Array.from({length: 64}, () => ({hits}))};
  for (const bpm of [40, 220, 112.5]) {
    const clean = validatePractice({...boundary, bpm});
    assert.equal(clean.bars.length, 64);
    assert.equal(clean.bars[63].hits.length, 64);
  }
  assert.deepEqual(validatePractice({...fixture(), bars: [{hits: []}]}).bars, [{hits: []}]);
});

test('flattened events are deterministic, independent, and ordered for simultaneous drums', async () => {
  const {flattenPractice} = await core;
  const input = fixture();
  const events = flattenPractice(input);
  assert.deepEqual(events, [
    {beat: 0, bar: 0, step: 0, type: 'kick', velocity: 1},
    {beat: 0, bar: 0, step: 0, type: 'hat', velocity: .5},
    {beat: 2, bar: 0, step: 8, type: 'snare', velocity: .8},
    {beat: 8, bar: 2, step: 0, type: 'kick', velocity: .9},
    {beat: 11.75, bar: 2, step: 15, type: 'tom', velocity: .6},
    {beat: 13, bar: 3, step: 4, type: 'snare', velocity: .7},
  ]);
  assert.deepEqual(flattenPractice(input), events);
  const again = flattenPractice(input);
  assert.notEqual(again, events);
  assert.notEqual(again[0], events[0]);
  events[0].velocity = 0;
  events.pop();
  assert.deepEqual(flattenPractice(input), again);
});

test('bar selections are inclusive and relative, retaining rests and original bar indices', async () => {
  const {flattenPractice, practiceDuration} = await core;
  const input = fixture();
  assert.deepEqual(flattenPractice(input, 1, 1), []);
  assert.deepEqual(flattenPractice(input, 1, 2).map(({beat, bar}) => ({beat, bar})), [{beat: 4, bar: 2}, {beat: 7.75, bar: 2}]);
  assert.deepEqual(flattenPractice(input, 2, 2).map(({beat, bar}) => ({beat, bar})), [{beat: 0, bar: 2}, {beat: 3.75, bar: 2}]);
  assert.equal(practiceDuration(input), 8);
  assert.equal(practiceDuration(input, 1, 1), 2, 'a silent bar still occupies a full bar');
  assert.equal(practiceDuration(input, 2), 4);
  assert.equal(practiceDuration(input, 0, 0), 2);
  for (const args of [[-1, 0], [1, 0], [0, 4], [4, 4], [.1, 2], [0, 2.5], [NaN, 1], [0, Infinity], ['0', 1], [null, 1], [0, null]]) {
    assert.throws(() => flattenPractice(input, ...args), RangeError);
    assert.throws(() => practiceDuration(input, ...args), RangeError);
  }
});

test('timing uses quarter-note beats and rejects unsafe values instead of coercing them', async () => {
  const {beatTime, practiceDuration, PRACTICE_DEMOS} = await core;
  assert.equal(beatTime(0, 120), 0);
  assert.equal(beatTime(.25, 120), .125);
  assert.equal(beatTime(4, 120), 2);
  assert.equal(beatTime(4, 40), 6);
  assert.equal(beatTime(4, 220), 4 * (60 / 220));
  for (const value of [-1, NaN, Infinity, -Infinity, '4', null, undefined]) assert.throws(() => beatTime(value, 120), RangeError);
  for (const value of [0, 39, 221, NaN, Infinity, '120', null]) assert.throws(() => beatTime(4, value), RangeError);
  assert.throws(() => beatTime(Number.MAX_VALUE, 40), RangeError);
  for (const demo of PRACTICE_DEMOS) assert.equal(practiceDuration(demo), demo.bars.length * 4 * (60 / demo.bpm));
});
