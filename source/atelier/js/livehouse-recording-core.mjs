import {PRACTICE_TYPES, validatePractice} from './practice-core.mjs';

/** A deliberately small original performance: 4/4, two or four bars, 1/16 grid. */
export class RhythmTake {
 constructor({id, bpm = 112, bars = 2}) {
  if (![2, 4].includes(bars)) throw new RangeError('录音长度必须为 2 或 4 小节');
  this.project = validatePractice({id, title: '我的现场节奏', description: `${bars} 小节即兴演奏 · 十六分音符量化 · 仅保存在本机`, bpm, bars: Array.from({length: bars}, () => ({hits: []}))});
  this.stepMs = 60000 / bpm / 4;
  this.durationMs = this.stepMs * bars * 16;
  this.hits = new Map();
 }
 /** elapsedMs is measured from the end of count-in; negative/end hits are ignored. */
 capture(type, elapsedMs, velocity = .8) {
  if (!PRACTICE_TYPES.includes(type) || !Number.isFinite(elapsedMs) || !Number.isFinite(velocity) || velocity <= 0 || velocity > 1) return false;
  if (elapsedMs < 0 || elapsedMs >= this.durationMs) return false;
  // Clamp the final half-cell instead of wrapping it into the opening downbeat.
  const step = Math.min(this.project.bars.length * 16 - 1, Math.round(elapsedMs / this.stepMs));
  const key = `${step}:${type}`, previous = this.hits.get(key);
  this.hits.set(key, {step, type, velocity: Math.max(previous?.velocity || 0, velocity)});
  return !previous;
 }
 get size() { return this.hits.size; }
 finish() {
  const bars = this.project.bars.map(() => ({hits: []}));
  for (const hit of this.hits.values()) bars[Math.floor(hit.step / 16)].hits.push({...hit, step: hit.step % 16});
  return validatePractice({...this.project, bars});
 }
}
