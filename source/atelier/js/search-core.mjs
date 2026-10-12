const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase();
export function searchInputAction(e, hasResult) {
  // Respect handled input, IME and text selection.
  if (e.defaultPrevented || e.isComposing || e.keyCode === 229 || !hasResult) return null;
  if (e.key === 'Enter') return 'open';
  if (e.key === 'ArrowDown' && !(e.shiftKey||e.ctrlKey||e.metaKey||e.altKey||e.getModifierState?.('AltGraph'))) return 'focus';
  return null;
}
const termsFor = query => normalize(query).trim().split(/\s+/).filter(Boolean);
const termScore = (term,title,content) => title.includes(term) ? 5 : content.includes(term) ? 1 : 0;
function evaluateEntry(entry,terms,trace=false) {
  const title=normalize(entry.title),content=normalize(entry.content);
  const evidence=trace ? [] : null;let score=0,matches=true;
  for(const term of terms){
    const points=termScore(term,title,content);
    if(!points){matches=false;if(!trace)return null;}
    score+=points;
    if(trace)evidence.push({term,where:points===5?'title':points===1?'body':'missing'});
  }
  return trace ? {evidence,score,matches} : score;
}
export function explainEntry(query,entry) {
  return evaluateEntry(entry,termsFor(query),true);
}
export function findEntries(query, entries) {
  const terms=termsFor(query);
  return entries.map(entry=>({entry,score:evaluateEntry(entry,terms)}))
    .filter(result=>result.score!==null).sort((a,b)=>b.score-a.score).slice(0,20).map(result=>result.entry);
}
export function safeResultURL(value, base) {
  try {
    const url = new URL(value, base), origin = new URL(base).origin;
    if (!['http:','https:'].includes(url.protocol) || url.origin !== origin) return null;
    // A same-origin absolute URL may have a // path. Returning that path alone
    // would turn it into an external authority when assigned to an anchor.
    // Check after URL normalization, including backslashes and dot segments.
    if (url.pathname.startsWith('//')) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}
