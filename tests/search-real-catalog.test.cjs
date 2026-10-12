const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const output=path.resolve(__dirname,'..',process.env.CATALOG_PUBLIC_DIR||'public');
const entries=JSON.parse(fs.readFileSync(path.join(output,'search.json'),'utf8'));
const archive=JSON.parse(fs.readFileSync(path.join(output,'atelier/data/archive.json'),'utf8')).posts;
const text=parts=>parts.map(part=>part.text).join('');
const normalized=value=>value.normalize('NFKC').toLocaleLowerCase();

test('real search retains every archive article and excludes only canonically absent exercise scaffolding',async()=>{
 assert.equal(entries.length,archive.length);
 assert.deepEqual(entries.map(entry=>entry.url).sort(),archive.map(entry=>entry.path).sort());
 for(const post of archive.filter(post=>post.group==='hot100')){
  const entry=entries.find(entry=>entry.url===post.path);
  assert.equal(entry.title,post.title);
  for(const phrase of ['在这里填写你的代码','在这里补充：']){
   if(!post.text.includes(phrase))assert.equal(entry.content.includes(phrase),false,post.path+' '+phrase);
  }
 }

});

test('real Chinese and mixed technical queries preserve matching evidence and literal C++ punctuation',async()=>{
 const {findEntries}=await import('../source/atelier/js/search-core.mjs');
 const {searchResultText}=await import('../source/atelier/js/search-context.mjs');
 for(const query of ['全排列','二分','C++ STL','全排列 dfs','全排列 时间复杂度','list splice']){
  const terms=normalized(query).split(/\s+/);
  // Canonical authored content is the oracle, including any future completed
  // analyses or added articles. Search intentionally caps its output at 20.
  const expected=archive.filter(post=>terms.every(term=>normalized(post.title).includes(term)||normalized(post.text).includes(term))).map(post=>post.path);
  const found=findEntries(query,entries);assert.equal(found.length,Math.min(20,expected.length),query);
  assert.ok(found.every(entry=>expected.includes(entry.url)),query);
  if(expected.length<=20)assert.deepEqual(found.map(entry=>entry.url).sort(),expected.sort(),query);
  for(const entry of found){
   const post=archive.find(post=>post.path===entry.url);
   assert.ok(terms.every(term=>normalized(post.title+' '+post.text).includes(term)),query+' '+entry.title);
   const result=searchResultText(entry,query),marked=[...result.title,...result.excerpt].filter(part=>part.match);
   assert.equal(text(result.title),entry.title);assert.ok(marked.length,query+' '+entry.title);
   for(const part of marked)assert.ok(terms.some(term=>normalized(part.text).includes(term)));
   const excerpt=text(result.excerpt).replace(/^…|…$/g,'');assert.ok(entry.content.includes(excerpt));
   assert.ok([...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(excerpt)].length<=70);
  }
 }
});
