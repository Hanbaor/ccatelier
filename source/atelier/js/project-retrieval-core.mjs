import {findEntries,safeResultURL,explainEntry} from './search-core.mjs';
const normalize = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase();
export function queryTerms(query) {
  if (String(query).length > 200) throw Error('请使用 200 字以内的查询。');
  const terms = [...new Set(normalize(query).trim().split(/\s+/).filter(Boolean))];
  if (terms.length > 8) throw Error('最多比较 8 个关键词，请用空格分开。');
  return terms;
}
export function inspectRetrieval(entries,query,{mode='all',base='https://example.invalid/'}={}) {
  if (!Array.isArray(entries)||entries.length>2000||entries.reduce((n,e)=>n+String(e?.content||'').length,0)>2000000)throw Error('检索材料过大');
  const terms=queryTerms(query);
  if (!terms.length) return {terms,results:[],total:0};
  // Same normalization and 5/1 weighting as production search. Terms repeat
  // neither evidence nor points. A body hit adds nothing when title already hits.
  const candidates=entries.filter(entry=>entry && typeof entry.title==='string' && typeof entry.content==='string' && typeof entry.url==='string').map(entry=>{
    const href=safeResultURL(entry.url,base);
    const {evidence,score}=explainEntry(terms.join(' '),entry);
    return {entry,href,evidence,score};
  }).filter(result=>result.href && result.score && (mode==='any'||result.evidence.every(item=>item.where!=='missing')));
  const results=mode==='any' ? candidates.sort((a,b)=>b.score-a.score) :
    // Reuse the actual production ranker, rather than present a lookalike as it.
    findEntries(terms.join(' '),candidates.map(item=>item.entry)).map(entry=>candidates.find(item=>item.entry===entry));
  return {terms,results:results.slice(0,3),total:candidates.length};
}

export function publishedWriting(data) {
  if(data?.version!==1||!Array.isArray(data.posts)||data.posts.length>2000)throw Error('Invalid archive');
  const entries=data.posts.filter(post=>post?.group==='writing' && post.published!==false && typeof post.text==='string' && post.text.trim()).map(post=>({title:post.title,content:post.text,url:post.path}));
  if(entries.reduce((sum,e)=>sum+e.content.length,0)>2000000)throw Error('Archive too large');
  return entries;
}
