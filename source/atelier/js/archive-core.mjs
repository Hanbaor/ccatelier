// Data-only boundary shared by the browser worker and the build verification.
const normalize=value=>String(value||'').normalize('NFKC').toLocaleLowerCase();
export function readQuery(search='') {
  const p=new URLSearchParams(search),pick=(key,values,fallback)=>values.includes(p.get(key))?p.get(key):fallback;
  return {q:(p.get('q')||'').slice(0,200),group:pick('group',['writing','hot100'],'all'),tag:(p.get('tag')||'').slice(0,80),duration:pick('duration',['short','medium','long'],'all'),sort:pick('sort',['oldest','minutes','title'],'newest'),view:pick('view',['list','graph'],'grid')};
}
export function writeQuery(query) {
  const p=new URLSearchParams();const defaults=readQuery();
  for(const [key,value] of Object.entries(query))if(value&&value!==defaults[key]&&key in defaults)p.set(key,value);
  return p.toString()?'?'+p.toString():'';
}
export function queryArchive(posts,query={}) {
  const terms=normalize(query.q).trim().split(/\s+/).filter(Boolean);
  return posts.map(post=>{
    const title=normalize(post.title),tags=normalize((post.tags||[]).join(' ')),text=normalize(post.text);
    const score=terms.reduce((sum,t)=>sum+(title.includes(t)?20:tags.includes(t)?8:text.includes(t)?1:-10000),0);
    return {post,score};
  }).filter(({post:p,score})=>score>=0&&(!query.group||query.group==='all'||p.group===query.group)&&(!query.tag||p.tags.includes(query.tag))&&(!query.duration||query.duration==='all'||(query.duration==='short'?p.minutes<=5:query.duration==='medium'?p.minutes>5&&p.minutes<=15:p.minutes>15)))
    .sort((a,b)=>{
      if(terms.length&&b.score!==a.score)return b.score-a.score;
      if(query.sort==='title')return a.post.title.localeCompare(b.post.title,'zh-CN');
      if(query.sort==='minutes')return a.post.minutes-b.post.minutes||a.post.path.localeCompare(b.post.path);
      const date=String(b.post.date).localeCompare(String(a.post.date));
      return (query.sort==='oldest'?-date:date)||a.post.path.localeCompare(b.post.path);
    }).map(({post})=>post);
}
export function buildGraph(posts) {
  const tags=new Map(),nodes=[],edges=[];
  for(const p of posts){nodes.push({id:p.path,label:p.title,kind:'post',group:p.group});for(const tag of new Set(p.tags||[])){tags.set(tag,(tags.get(tag)||0)+1);edges.push({source:p.path,target:'tag:'+tag});}}
  for(const [tag,count] of tags)nodes.push({id:'tag:'+tag,label:tag,kind:'tag',count});
  return {nodes,edges};
}
export function relatedPosts(posts,current,limit=4) {
  const tags=new Set(current.tags||[]);
  return posts.filter(p=>p.path!==current.path).map(p=>({p,score:(p.tags||[]).filter(t=>tags.has(t)).length})).filter(p=>p.score>0).sort((a,b)=>b.score-a.score||b.p.date.localeCompare(a.p.date)).slice(0,limit).map(({p})=>p);
}
