import {validateProject} from './studio-core.mjs';

// Fragments stay in the browser. Bounded UTF-8 JSON keeps numeric precision;
// JSON canonicalizes signed zero to 0, without changing the rhythm's meaning.
export const MAX_SHARE_BYTES=16384;
export const MAX_SHARE_HASH=22000;
const prefix='#rhythm=v1.';
const invalid=()=>Error('分享链接无效或已损坏；当前编排未改变。');
function exactKeys(value,keys){
 if(!value||Object.getPrototypeOf(value)!==Object.prototype||Object.keys(value).length!==keys.length||!Object.keys(value).every(key=>keys.includes(key)))throw invalid();
}
function checked(value){
 exactKeys(value,['version','name','bpm','steps','swing','master','tracks']);
 if(!Array.isArray(value.tracks)||value.tracks.length!==6)throw invalid();
 for(const track of value.tracks)exactKeys(track,['type','volume','pan','tone','decay','mute','solo','steps']);
 return validateProject(value);
}
function base64(bytes){return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export function encodeShare(project){
 const value=checked(project),bytes=new TextEncoder().encode(JSON.stringify(value));
 if(bytes.length>MAX_SHARE_BYTES)throw Error('编排超过链接容量；请改用 JSON 导出。');
 return prefix+base64(bytes);
}
export function decodeShare(hash){
 if(typeof hash!=='string'||!hash.startsWith('#rhythm='))return null;
 if(hash.length>MAX_SHARE_HASH)throw Error('分享链接过长；当前编排未改变。');
 if(!hash.startsWith(prefix))throw Error('无法读取这个分享链接版本；当前编排未改变。');
 try{
  const payload=hash.slice(prefix.length);
  if(!payload||!/^[A-Za-z0-9_-]+$/.test(payload)||payload.length%4===1)throw invalid();
  const binary=atob(payload.replaceAll('-','+').replaceAll('_','/'));
  if(binary.length>MAX_SHARE_BYTES)throw invalid();
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  if(base64(bytes)!==payload)throw invalid();
  const json=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  const value=JSON.parse(json,(key,item)=>{if(['__proto__','prototype','constructor'].includes(key))throw invalid();return item;});
  return checked(value);
 }catch{throw invalid();}
}
export function createShareURL(project,source,current=globalThis.location?.href){
 let url,base;
 try{url=new URL(source);base=new URL(current);}catch{throw Error('无法为当前页面生成分享链接。');}
 if(!['https:','http:'].includes(url.protocol)||url.origin!==base.origin||url.pathname!==base.pathname||url.username||url.password)throw Error('只能分享当前页面的节奏链接。');
 return url.origin+url.pathname+encodeShare(project);
}
