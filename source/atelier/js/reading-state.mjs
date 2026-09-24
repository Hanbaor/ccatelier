export function safePath(path) {
  return typeof path==='string' && path.length<500 && /^\/(?!\/)/.test(path) && !/[\\?#\u0000-\u0020]/.test(path) && !path.split('/').includes('..') && !/%2e|%2f|%5c/i.test(path);
}
export function readShelf(raw) {
  try {
    const data=JSON.parse(raw);if(!Array.isArray(data))return [];
    return data.filter(p=>p && safePath(p.path) && typeof p.title==='string').slice(0,100).map(p=>({path:p.path,title:p.title.slice(0,180),...(Number.isFinite(p.progress)?{progress:Math.min(1,Math.max(0,p.progress))}:{})}));
  } catch {return [];}
}
export function remember(list,item,limit=60) {return [item,...list.filter(p=>p.path!==item.path)].slice(0,limit);}
export function readTimer(raw) {
  const fallback={duration:1500000,remaining:1500000,endsAt:0};
  try {const t=JSON.parse(raw);return t && [300000,1500000].includes(t.duration) && Number.isFinite(t.remaining) && t.remaining>=0 && t.remaining<=t.duration && Number.isFinite(t.endsAt) && t.endsAt>=0 && t.endsAt<=Date.now()+t.duration ? t : fallback;}catch{return fallback;}
}
export function remainingTime(timer,now=Date.now()) {return timer.endsAt?Math.max(0,Math.min(timer.duration,timer.endsAt-now)):timer.remaining;}
export function pauseTimer(timer,now=Date.now()) {return {...timer,remaining:remainingTime(timer,now),endsAt:0};}
