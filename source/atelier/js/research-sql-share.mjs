import {validateSqlSnapshot} from './research-sql-snapshot.mjs';

export const SQL_SHARE_MAX_BYTES = 16 * 1024;
export const SQL_SHARE_MAX_HASH = 22000;
const prefix = '#sql=v1.';
const invalid = () => new Error('实验链接无效或已损坏；当前草稿未改变。');
const base64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');

export function encodeSqlShare(snapshot) {
  const bytes = new TextEncoder().encode(JSON.stringify(validateSqlSnapshot(snapshot)));
  if (bytes.length > SQL_SHARE_MAX_BYTES) throw new Error('实验超过链接容量；请改用导出草稿。');
  return prefix + base64(bytes);
}
export function decodeSqlShare(hash) {
  if (typeof hash !== 'string' || !hash.startsWith('#sql=')) return null;
  if (hash.length > SQL_SHARE_MAX_HASH) throw new Error('实验链接过长；当前草稿未改变。');
  if (!hash.startsWith(prefix)) throw new Error('不支持此实验链接版本；当前草稿未改变。');
  try {
    const payload = hash.slice(prefix.length);
    if (!payload || !/^[A-Za-z0-9_-]+$/.test(payload) || payload.length % 4 === 1) throw invalid();
    const binary = atob(payload.replaceAll('-','+').replaceAll('_','/'));
    if (binary.length > SQL_SHARE_MAX_BYTES) throw invalid();
    const bytes = Uint8Array.from(binary,char => char.charCodeAt(0));
    if (base64(bytes) !== payload) throw invalid();
    const text = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    const snapshot = JSON.parse(text,(key,value) => {
      if (['__proto__','constructor','prototype'].includes(key)) throw invalid();
      return value;
    });
    return validateSqlSnapshot(snapshot);
  } catch { throw invalid(); }
}
export function createSqlShareURL(snapshot,source,current=globalThis.location?.href) {
  let url,base;
  try { url=new URL(source); base=new URL(current); } catch { throw new Error('无法为当前页面生成实验链接。'); }
  if (!['http:','https:'].includes(url.protocol) || url.origin!==base.origin || url.pathname!==base.pathname || url.username || url.password) throw new Error('只能分享当前页面的实验链接。');
  return url.origin + url.pathname + encodeSqlShare(snapshot);
}
