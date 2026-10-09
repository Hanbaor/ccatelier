/**
 * Original drum exercises, not transcriptions of any recorded song.
 * Each bar is 4/4 with sixteen steps. A step is one sixteenth note;
 * exported event beats are quarter notes and timing helpers return seconds.
 * Local JSON imports use exactly the same bounded schema as these demos.
 */
export const PRACTICE_TYPES = Object.freeze(['kick', 'snare', 'hat', 'tom']);
export const PRACTICE_LIMITS = Object.freeze({minBpm: 40, maxBpm: 220, maxBars: 64, maxHits: 64});

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const fail = path => { throw new TypeError(`无效练习数据：${path}`); };

function record(value, keys, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(path);
  const actualKeys = Reflect.ownKeys(value);
  if (actualKeys.length !== keys.length || actualKeys.some(key => !keys.includes(key))) fail(`${path} 字段`);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !own(descriptor, 'value')) fail(`${path}.${key}`);
  }
}

function list(value, min, max, path) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < min || value.length > max) fail(path);
  // JSON arrays are dense and have no additional properties or accessors.
  if (Reflect.ownKeys(value).length !== value.length + 1) fail(path);
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !own(descriptor, 'value')) fail(`${path}[${index}]`);
  }
}

function label(value, max, path) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) fail(path);
}

const compareHits = (a, b) => a.step - b.step || PRACTICE_TYPES.indexOf(a.type) - PRACTICE_TYPES.indexOf(b.type);

/**
 * Validate an already-parsed JSON object and return a fresh, canonical copy.
 * Unknown/missing fields, duplicate drum hits, sparse arrays and non-finite
 * numbers are rejected. Zero-velocity hits and silent bars are allowed.
 * Text is plain text; render it with textContent, never as HTML.
 */
export function validatePractice(value) {
  record(value, ['id', 'title', 'description', 'bpm', 'bars'], 'practice');
  if (typeof value.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(value.id)) fail('id');
  label(value.title, 80, 'title');
  label(value.description, 500, 'description');
  if (!finite(value.bpm, PRACTICE_LIMITS.minBpm, PRACTICE_LIMITS.maxBpm)) fail('bpm (40–220)');
  list(value.bars, 1, PRACTICE_LIMITS.maxBars, 'bars (1–64)');
  const bars = value.bars.map((bar, index) => {
    const path = `bars[${index}]`;
    record(bar, ['hits'], path);
    list(bar.hits, 0, PRACTICE_LIMITS.maxHits, `${path}.hits`);
    const seen = new Set();
    const hits = bar.hits.map((hit, hitIndex) => {
      const hitPath = `${path}.hits[${hitIndex}]`;
      record(hit, ['step', 'type', 'velocity'], hitPath);
      if (!Number.isInteger(hit.step) || hit.step < 0 || hit.step > 15) fail(`${hitPath}.step (0–15)`);
      if (!PRACTICE_TYPES.includes(hit.type)) fail(`${hitPath}.type`);
      if (!finite(hit.velocity, 0, 1)) fail(`${hitPath}.velocity (0–1)`);
      const key = `${hit.step}:${hit.type}`;
      if (seen.has(key)) fail(`${hitPath} 重复鼓点`);
      seen.add(key);
      return {step: hit.step, type: hit.type, velocity: hit.velocity};
    }).sort(compareHits);
    return {hits};
  });
  return {id: value.id, title: value.title, description: value.description, bpm: value.bpm, bars};
}

function selectedBars(project, startBar, endBar) {
  if (!Number.isInteger(startBar) || !Number.isInteger(endBar) || startBar < 0 || endBar < startBar || endBar >= project.bars.length) {
    throw new RangeError('小节范围必须是有效的零基索引，末尾小节包含在内');
  }
}

/**
 * Fresh events ordered by beat, then kick/snare/hat/tom for simultaneous hits.
 * startBar and endBar are zero-based, inclusive. beat is relative to the
 * selection's beginning; bar retains its original index for score highlighting.
 */
export function flattenPractice(project, startBar = 0, endBar = undefined) {
  const clean = validatePractice(project);
  if (endBar === undefined) endBar = clean.bars.length - 1;
  selectedBars(clean, startBar, endBar);
  const events = [];
  for (let bar = startBar; bar <= endBar; bar++) {
    for (const hit of clean.bars[bar].hits) {
      events.push({beat: (bar - startBar) * 4 + hit.step / 4, bar, ...hit});
    }
  }
  return events;
}

/** Convert a non-negative quarter-note beat to seconds at a practice tempo. */
export function beatTime(beat, bpm) {
  if (!Number.isFinite(beat) || beat < 0) throw new RangeError('拍数必须是非负有限数值');
  if (!finite(bpm, PRACTICE_LIMITS.minBpm, PRACTICE_LIMITS.maxBpm)) throw new RangeError('速度必须为 40–220 BPM');
  // Divide first to avoid overflowing a large but finite beat at slow tempos.
  const seconds = beat * (60 / bpm);
  if (!Number.isFinite(seconds)) throw new RangeError('拍数超出可计算范围');
  return seconds;
}

/** Full selected duration, including rests after the final hit. */
export function practiceDuration(project, startBar = 0, endBar = undefined) {
  const clean = validatePractice(project);
  if (endBar === undefined) endBar = clean.bars.length - 1;
  selectedBars(clean, startBar, endBar);
  return beatTime((endBar - startBar + 1) * 4, clean.bpm);
}

function groove(kicks = [0, 8], hats = [0, 2, 4, 6, 8, 10, 12, 14], snares = [4, 12]) {
  return {hits: [
    ...kicks.map(step => ({step, type: 'kick', velocity: step === 0 ? .88 : .76})),
    ...snares.map(step => ({step, type: 'snare', velocity: .82})),
    ...hats.map(step => ({step, type: 'hat', velocity: step % 4 === 0 ? .54 : .36})),
  ]};
}

function fillBar(final = false) {
  const bar = groove([0, 6, 8], [0, 2, 4, 6, 8, 10], [4]);
  bar.hits.push({step: 11, type: 'snare', velocity: .42});
  for (let step = 12; step < 16; step++) {
    bar.hits.push({step, type: 'tom', velocity: .52 + (step - 12) * .1});
  }
  if (final) bar.hits.push({step: 14, type: 'kick', velocity: .68});
  return bar;
}

function freezePractice(project) {
  const clean = validatePractice(project);
  for (const bar of clean.bars) {
    bar.hits.forEach(Object.freeze);
    Object.freeze(bar.hits);
    Object.freeze(bar);
  }
  Object.freeze(clean.bars);
  return Object.freeze(clean);
}

/** Entirely original drills, intentionally unrelated to any band's songs. */
export const PRACTICE_DEMOS = Object.freeze([
  freezePractice({
    id: 'original-eighth-foundation',
    title: '八分音符地基 · 原创练习',
    description: '4 小节原创鼓练习。踩镲保持均匀八分音符，军鼓落在第 2、4 拍；先听清每一拍，再让底鼓稳稳落地。',
    bpm: 88,
    bars: [groove(), groove([0, 6, 8]), groove(), groove([0, 8, 14])],
  }),
  freezePractice({
    id: 'original-offbeat-walk',
    title: '切分推进 · 原创练习',
    description: '4 小节原创鼓练习。保持军鼓与踩镲稳定，让底鼓在反拍和十六分音符位置推进；第 4 小节轻军鼓是弱音。',
    bpm: 104,
    bars: [groove([0, 6, 10]), groove([0, 7, 8, 14]), groove([0, 3, 8, 11]), {
      hits: [...groove([0, 6, 8, 14]).hits, {step: 11, type: 'snare', velocity: .3}],
    }],
  }),
  freezePractice({
    id: 'original-tom-turnaround',
    title: '通鼓转场 · 原创练习',
    description: '8 小节原创鼓练习。每四小节用一拍通鼓滚奏转场，音量渐强；不要抢拍，回到下一小节时保持同一速度。',
    bpm: 112,
    bars: [groove(), groove([0, 6, 8]), groove([0, 8, 14]), fillBar(), groove(), groove([0, 6, 8]), groove([0, 8, 14]), fillBar(true)],
  }),
]);
