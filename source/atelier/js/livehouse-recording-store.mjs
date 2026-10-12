import {validatePractice} from './practice-core.mjs';

export const RECORDING_PREFIX = 'cc-live-take-v1:';
export const RECORDING_LIMIT = 12;
const validId = id => typeof id === 'string' && /^live-[a-z0-9-]{1,59}$/u.test(id);
const assertId = id => { if (!validId(id)) throw new TypeError('现场录音编号无效'); };

export function readRecording(storage, id) {
 assertId(id);
 const raw = storage.getItem(RECORDING_PREFIX + id);
 if (raw === null) return null;
 if (raw.length > 50000) throw new TypeError('现场录音数据过大');
 const project = validatePractice(JSON.parse(raw));
 if (project.id !== id || ![2, 4].includes(project.bars.length)) throw new TypeError('现场录音数据无效');
 return project;
}

/** A separate key per take: unrelated projects and earlier takes are never replaced. */
export function saveRecording(storage, value) {
 const project = validatePractice(value);assertId(project.id);
 if (![2, 4].includes(project.bars.length)) throw new TypeError('现场录音长度无效');
 const key = RECORDING_PREFIX + project.id, text = JSON.stringify(project), existing = storage.getItem(key);
 if (existing !== null) {
  if (existing === text) return project;
  throw new Error('这份录音已存在；没有覆盖原内容。');
 }
 // Damaged slots stay untouched, but cannot occupy an invisible, unremovable
 // place in the twelve usable takes shown by the practice room.
 const count = listRecordings(storage).length;
 if (count >= RECORDING_LIMIT) throw new Error('本机录音已满，请先在排练室移除旧录音，或下载 JSON。');
 storage.setItem(key, text);
 if (storage.getItem(key) !== text) throw new Error('录音未能保存，请下载 JSON。');
 return project;
}

export function listRecordings(storage) {
 const result = [];
 for (let i = 0; i < storage.length; i++) {
  const key = storage.key(i);
  if (!key?.startsWith(RECORDING_PREFIX)) continue;
  try { const project = readRecording(storage, key.slice(RECORDING_PREFIX.length));if (project) result.push(project); } catch { /* A damaged slot cannot break the other scores. */ }
 }
 return result.slice(-RECORDING_LIMIT);
}

export function removeRecording(storage, id) { assertId(id);storage.removeItem(RECORDING_PREFIX + id); }
