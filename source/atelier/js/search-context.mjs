const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase();
const queryTerms = query => [...new Set(normalize(query).trim().split(/\s+/).filter(Boolean))];
const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, {granularity:'grapheme'}) : null;

function matchedText(value, terms) {
  const text = String(value ?? ''), normalized = normalize(text);
  if (!terms.length) return {text,boundaries:[0,text.length],matches:[]};
  // Map normalized UTF-16 offsets back to whole original graphemes. NFKC may
  // expand a ligature or compose combining marks; neither may split the display.
  const segments = segmenter ? segmenter.segment(text) : conservativeSegments(text);
  const units=[];
  for (const {segment,index} of segments) {
    let unit={text:segment,index,normalized:segment.normalize('NFKC')};
    // Compatibility Jamo can compose across original grapheme boundaries.
    // Merge only the adjacent units whose normalization interacts.
    while(units.length){
      const previous=units.at(-1),joined=(previous.normalized+unit.normalized).normalize('NFKC');
      if(joined===previous.normalized+unit.normalized)break;
      units.pop();unit={text:previous.text+unit.text,index:previous.index,normalized:joined};
    }
    units.push(unit);
  }
  const boundaries=[0],offsets=[0];let length=0;
  for(const unit of units){
    length+=unit.normalized.toLocaleLowerCase().length;
    offsets.push(length);boundaries.push(unit.index+unit.text.length);
  }
  // Contextual lowercasing (e.g. final Greek sigma) changes letters but not
  // offsets. Keep a conservative, unmarked fallback if a locale changes length.
  if(length!==normalized.length)return {text,boundaries,matches:[]};
  const matches = [];
  for (const term of terms) {
    let from = 0, index;
    while ((index = normalized.indexOf(term, from)) !== -1) {
      const first = upperBound(offsets,index) - 1;
      const last = lowerBound(offsets,index + term.length);
      matches.push({start:boundaries[first],end:boundaries[last],first,last,term});
      from = index + 1;
    }
  }
  matches.sort((a,b) => a.start-b.start || b.end-a.end);
  return {text,boundaries,matches};
}
function* conservativeSegments(text) {
  // Older browsers: break only between two simple base characters. All complex
  // Unicode runs stay together, including adjacent marks, ZWJ and emoji flags.
  const simple=/^[A-Za-z0-9 \u4e00-\u9fff]$/u;
  let segment='',index=0,previous='';
  for(const char of text){
    if(segment && simple.test(previous) && simple.test(char)){
      yield {segment,index};index+=segment.length;segment='';
    }
    segment+=char;previous=char;
  }
  if(segment)yield {segment,index};
}
function lowerBound(values, target) {
  let lo=0,hi=values.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(values[mid]<target)lo=mid+1;else hi=mid;}
  return lo;
}
function upperBound(values, target) {
  let lo=0,hi=values.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(values[mid]<=target)lo=mid+1;else hi=mid;}
  return lo;
}
function textParts(text, matches, start=0, end=text.length) {
  const parts=[];let cursor=start;
  for(const match of matches){
    if(match.end<=cursor || match.start>=end)continue;
    const left=Math.max(cursor,match.start),right=Math.min(end,match.end);
    if(left>cursor)parts.push({text:text.slice(cursor,left),match:false});
    if(parts.at(-1)?.match)parts.at(-1).text+=text.slice(left,right);
    else parts.push({text:text.slice(left,right),match:true});
    cursor=right;
  }
  if(cursor<end)parts.push({text:text.slice(cursor,end),match:false});
  return parts;
}
function excerptStart(content, normalizedTitle) {
  // A frequent word near the opening should not hide a later passage that
  // explains several requested concepts. Count distinct terms, prioritizing
  // evidence not already visible in the title, within the same 70-unit budget.
  const matches=content.matches.filter(match=>match.last-match.first<=70);
  if(!matches.length)return 0;
  const starts=[...new Set(matches.flatMap(match=>[
    Math.max(0,match.first-Math.min(12,70-(match.last-match.first))),match.first
  ]))].sort((a,b)=>a-b);
  const endings=[...matches].sort((a,b)=>a.last-b.last);
  const counts=new Map();let added=0,removed=0,body=0,total=0;
  let best=starts[0],bestBody=-1,bestTotal=-1;
  function count(term,delta){
    const before=counts.get(term)||0,after=before+delta;counts.set(term,after);
    if(!before || !after){
      const change=after ? 1 : -1;total+=change;
      if(!normalizedTitle.includes(term))body+=change;
    }
  }
  // Sweep both ends instead of rescanning every window. Repeated query words
  // and repeated occurrences cannot inflate relevance or cause quadratic work.
  for(const start of starts){
    while(added<endings.length && endings[added].last<=start+70)count(endings[added++].term,1);
    while(removed<matches.length && matches[removed].first<start)count(matches[removed++].term,-1);
    if(body>bestBody || body===bestBody && total>bestTotal){best=start;bestBody=body;bestTotal=total;}
  }
  return best;
}
export function searchResultText(entry, query) {
  const terms=queryTerms(query),title=matchedText(entry.title || '未命名文章',terms);
  const content=matchedText(String(entry.content ?? '').replace(/\s+/g,' '),terms);
  const first=excerptStart(content,normalize(title.text));
  const last=Math.min(content.boundaries.length-1,first+70);
  const start=content.boundaries[first],end=content.boundaries[last];
  // Never send an entire oversized token/grapheme to the one-line preview.
  // The result remains available by its title when safe context cannot fit.
  const fits=(!content.matches.length || content.matches.some(match=>match.first>=first && match.last<=last)) && end-start<=(segmenter ? 2048 : 280);
  const excerpt=terms.length && fits ? textParts(content.text,segmenter ? content.matches : [],start,end) : [];
  if(excerpt.length && start>0)excerpt.unshift({text:'…',match:false});
  if(excerpt.length && end<content.text.length)excerpt.push({text:'…',match:false});
  return {title:textParts(title.text,segmenter ? title.matches : []),excerpt};
}
