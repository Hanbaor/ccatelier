const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase();
export function searchInputAction(event, hasResult) {
  // Enter/arrow keys belong to the IME while choosing a Chinese candidate.
  if (event.isComposing || event.keyCode === 229 || !hasResult) return null;
  if (event.key === 'Enter') return 'open';
  if (event.key === 'ArrowDown') return 'focus';
  return null;
}
export function findEntries(query, entries) {
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return entries.map(entry => {
    const title = normalize(entry.title), content = normalize(entry.content);
    if (!terms.every(term => title.includes(term) || content.includes(term))) return null;
    const score = terms.reduce((sum,term) => sum + (title.includes(term) ? 5 : 1),0);
    return {entry,score};
  }).filter(Boolean).sort((a,b) => b.score-a.score).slice(0,20).map(result => result.entry);
}
export function safeResultURL(value, base) {
  try {
    const url = new URL(value, base), origin = new URL(base).origin;
    if (!['http:','https:'].includes(url.protocol) || url.origin !== origin) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}
