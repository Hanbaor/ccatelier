import {safePath} from './reading-state.mjs';
const compare=(a,b)=>a<b?-1:a>b?1:0;
export function validateConnections(data,root='/'){
 if(data?.version!==1||!Array.isArray(data.posts)||data.posts.length>5000)throw Error('关联索引版本不匹配');
 const seen=new Set();
 return data.posts.filter(p=>p&&safePath(p.path)&&p.path.startsWith(root)&&!seen.has(p.path)&&seen.add(p.path)).map(p=>{
  if(!Array.isArray(p.evidence)||p.evidence.length>128)throw Error('关联索引格式有误');
  const concepts=new Set();
  const evidence=p.evidence.filter(e=>e&&typeof e.concept==='string'&&e.concept.length>=2&&e.concept.length<=60&&typeof e.excerpt==='string'&&Array.from(e.excerpt).length<=160&&e.excerpt.toLowerCase().includes(e.concept.toLowerCase())&&['prose','code'].includes(e.kind)&&typeof e.anchor==='string'&&e.anchor.length<500&&!concepts.has(e.concept)&&concepts.add(e.concept));
  return {path:p.path,evidence};
 });
}
export function connectedArticles(index,posts,current,limit=3){
 const scope=new Map(posts.map(p=>[p.path,p])),evidence=new Map(index.filter(p=>scope.has(p.path)).map(p=>[p.path,new Map(p.evidence.map(e=>[e.concept,e]))]));
 const seed=evidence.get(current);if(!seed)return [];
 const frequency=new Map();for(const terms of evidence.values())for(const term of terms.keys())frequency.set(term,(frequency.get(term)||0)+1);
 return [...evidence].filter(([path])=>path!==current).map(([path,terms])=>{
  const shared=[...seed].filter(([term])=>terms.has(term)).map(([concept,from])=>({concept,from,to:terms.get(concept),weight:Math.log(1+scope.size/frequency.get(concept))})).sort((a,b)=>b.weight-a.weight||compare(a.concept,b.concept));
  return {post:scope.get(path),shared,score:shared.reduce((sum,e)=>sum+e.weight,0)};
 }).filter(row=>row.shared.length).sort((a,b)=>b.score-a.score||compare(a.post.path,b.post.path)).slice(0,Math.min(3,Math.max(0,limit)));
}
