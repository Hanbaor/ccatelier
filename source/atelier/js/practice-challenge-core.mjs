import {validatePractice, flattenPractice, beatTime, PRACTICE_TYPES} from './practice-core.mjs';

// Browser event timing is a practice aid, not a hardware latency measurement.
export const CHALLENGE_WINDOW = .12;
export const CHALLENGE_CENTER = .045;
export const CHALLENGE_BEST_KEY = 'cc-practice-best-v1';

/** Normalize modern monotonic or legacy epoch event stamps to performance.now(). */
export function challengeInputTime(timestamp, now, timeOrigin) {
 let value = timestamp;
 if (Number.isFinite(timeOrigin) && timestamp > 1e12) value = timestamp - timeOrigin;
 return Number.isFinite(value) && value >= 0 && value <= now ? value : now;
}

export class PracticeChallenge {
 constructor(project, bpm = project.bpm, startBar = 0, endBar = project.bars.length - 1) {
  const clean = validatePractice({...project, bpm});
  this.targets = flattenPractice(clean, startBar, endBar).filter(hit => hit.velocity > 0).map(hit => ({...hit, time: beatTime(hit.beat, bpm), offset: null}));
  this.duration = beatTime((endBar - startBar + 1) * 4, bpm);
  this.extra = 0; this.closed = false; this.lastStrike = new Map();
  // Compare the exact audible pattern, range and tempo, never just a mutable id.
  this.signature = JSON.stringify([bpm, startBar, endBar, this.targets.map(hit => [hit.beat, hit.type])]);
 }
 strike(type, elapsed) {
  if (this.closed || !PRACTICE_TYPES.includes(type) || !Number.isFinite(elapsed) || elapsed < -CHALLENGE_WINDOW || elapsed > this.duration + CHALLENGE_WINDOW) return null;
  // Duplicate event delivery must not claim the next nearby sixteenth note.
  const previous = this.lastStrike.get(type);
  if (previous !== undefined && elapsed - previous < .025) return null;
  this.lastStrike.set(type, elapsed);
  let target = null, distance = Infinity;
  for (const candidate of this.targets) {
   const delta = Math.abs(elapsed - candidate.time);
   if (candidate.type === type && candidate.offset === null && delta <= CHALLENGE_WINDOW + 1e-9 && delta < distance) { target = candidate; distance = delta; }
  }
  if (!target) {
   // Count-in and the final timing grace are not extra-note opportunities.
   if (elapsed < 0 || elapsed >= this.duration) return null;
   this.extra++; return {kind: 'extra', type};
  }
  target.offset = elapsed - target.time;
  return {kind: distance <= CHALLENGE_CENTER + 1e-9 ? 'center' : target.offset < 0 ? 'early' : 'late', type, target};
 }
 summary() {
  const hit = this.targets.filter(target => target.offset !== null), total = this.targets.length;
  return {total, hit: hit.length, center: hit.filter(target => Math.abs(target.offset) <= CHALLENGE_CENTER + 1e-9).length, extra: this.extra, score: total ? Math.round(hit.length / (total + this.extra) * 100) : 0};
 }
 finish() { this.closed = true; return this.summary(); }
}

function entries(storage) {
 const raw = storage.getItem(CHALLENGE_BEST_KEY);
 if (raw === null) return [];
 if (raw.length > 250000) throw Error('本机成绩数据过大');
 const value = JSON.parse(raw);
 if (!Array.isArray(value) || value.length > 12 || value.some(entry => !entry || typeof entry.signature !== 'string' || entry.signature.length > 90000 || !Number.isInteger(entry.score) || entry.score < 0 || entry.score > 100)) throw Error('本机成绩无法读取');
 return value;
}
export function readChallengeBest(storage, signature) { return entries(storage).find(entry => entry.signature === signature)?.score ?? null; }
export function saveChallengeBest(storage, signature, score) {
 if (typeof signature !== 'string' || signature.length > 90000 || !Number.isInteger(score) || score < 0 || score > 100) throw Error('成绩无效');
 const previous = entries(storage), old = previous.find(entry => entry.signature === signature)?.score ?? 0;
 const next = [...previous.filter(entry => entry.signature !== signature), {signature, score: Math.max(old, score)}].slice(-12);
 while (JSON.stringify(next).length > 250000 && next.length > 1) next.shift();
 const text = JSON.stringify(next);storage.setItem(CHALLENGE_BEST_KEY, text);
 if (storage.getItem(CHALLENGE_BEST_KEY) !== text) throw Error('本机成绩未保存');
 return Math.max(old, score);
}
