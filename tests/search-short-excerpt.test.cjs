const test=require('node:test'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const moduleURL=process.env.SEARCH_CONTEXT_MODULE || pathToFileURL(path.resolve(__dirname,'../source/atelier/js/search-context.mjs')).href;
const load=()=>import(moduleURL);
const plain=parts=>parts.map(part=>part.text).join('');
const marked=parts=>parts.filter(part=>part.match).map(part=>part.text);
const count=text=>Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)).length;

test('short SQL catalog description retains its complete opening and both highlights',async()=>{
 const {searchResultText}=await load();
 const content='Database · Text-to-SQL SQL 教学示例 · 在浏览器中运行与验证。';
 const result=searchResultText({title:'研究',content},'SQL');
 assert.ok(count(content)<70);
 assert.equal(plain(result.excerpt),content);
 assert.deepEqual(marked(result.excerpt),['SQL','SQL']);
});

test('Unicode 70-unit bodies retain early, late and absent matches without ellipses',async()=>{
 const {searchResultText}=await load();
 for(const [content,query,marks] of [
  ['e\u0301'.repeat(67)+'SQL','sql',['SQL']],
  ['SQL'+'👩🏽‍💻'.repeat(67),'sql',['SQL']],
  ['👩🏽‍💻'.repeat(70),'unmatched',[]],
  ['e\u0301'.repeat(69)+'ﬃ','fi',['ﬃ']]
 ]){
  assert.equal(count(content),70);
  const result=searchResultText({title:'研究',content},query);
  assert.equal(plain(result.excerpt),content);
  assert.deepEqual(marked(result.excerpt),marks);
 }
});

test('Unicode 71-unit bodies keep existing early, late and no-match clipping',async()=>{
 const {searchResultText}=await load();
 const cases=[
  ['e\u0301'.repeat(68)+'SQL','sql','…'+'e\u0301'.repeat(12)+'SQL'],
  ['SQL'+'👩🏽‍💻'.repeat(68),'sql','SQL'+'👩🏽‍💻'.repeat(67)+'…'],
  ['👩🏽‍💻'.repeat(71),'absent','👩🏽‍💻'.repeat(70)+'…']
 ];
 for(const [content,query,expected] of cases){
  assert.equal(count(content),71);
  assert.equal(plain(searchResultText({title:'研究',content},query).excerpt),expected);
 }
});

test('short multi-term body retains opening regardless of title terms or query order',async()=>{
 const {searchResultText}=await load();
 const content='A complete opening to keep · alpha 与 beta；Cafe\u0301 👩🏽‍💻';
 assert.ok(count(content)<=70);
 const entry={title:'alpha',content};
 const result=searchResultText(entry,'alpha beta café 💻');
 assert.equal(plain(result.excerpt),content);
 assert.deepEqual(marked(result.excerpt),['alpha','beta','Cafe\u0301','👩🏽‍💻']);
 assert.deepEqual(searchResultText(entry,'💻 café beta alpha alpha'),result);
});

test('empty query/content and whitespace normalization retain existing behavior',async()=>{
 const {searchResultText}=await load();
 assert.deepEqual(searchResultText({title:'研究',content:'short SQL'},'  ').excerpt,[]);
 assert.deepEqual(searchResultText({title:'研究',content:''},'sql').excerpt,[]);
 assert.equal(plain(searchResultText({title:'研究',content:'Opening\n\t   SQL'},'sql').excerpt),'Opening SQL');
});

test('short unit count does not bypass the 2048 UTF-16 safety cap',async()=>{
 const {searchResultText}=await load();
 for(const size of [2048,2049]){
  const content='a'+'\u0338'.repeat(size-1);
  assert.equal(count(content),1);
  const excerpt=searchResultText({title:'研究',content},'a').excerpt;
  if(size===2048)assert.equal(plain(excerpt),content);
  else assert.deepEqual(excerpt,[]);
 }
});

test('no-Segmenter whole-content fallback still enforces 280 UTF-16 cap and no marks',async()=>{
 const original=Intl.Segmenter;let searchResultText;
 try{Intl.Segmenter=undefined;({searchResultText}=await import(moduleURL+'?short-excerpt-without-segmenter'));}
 finally{Intl.Segmenter=original;}
 const short='Database Text to SQL';
 assert.equal(plain(searchResultText({title:'研究',content:short},'sql').excerpt),short);
 for(const [content,visible] of [['💻'.repeat(137)+'needle',true],['💻'.repeat(137)+'xneedle',false]]){
  assert.equal(content.length,visible?280:281);
  const excerpt=searchResultText({title:'研究',content},'needle').excerpt;
  assert.equal(plain(excerpt),visible?content:'');
  assert.deepEqual(marked(excerpt),[]);
 }
});

test('oversized leading clusters retain safe later context, while trailing clusters stay suppressed',async()=>{
 const {searchResultText}=await load();
 const cluster='a'+'\u0338'.repeat(2048);
 const leading=cluster+'x'.repeat(20)+'SQL';
 assert.ok(count(leading)<=70);
 const expected='…'+'x'.repeat(12)+'SQL';
 assert.equal(plain(searchResultText({title:'研究',content:leading},'sql').excerpt),expected);
 const trailing='SQL'+'x'.repeat(20)+cluster;
 assert.deepEqual(searchResultText({title:'研究',content:trailing},'sql').excerpt,[]);
});

test('fallback oversized leading runs retain safe later context and trailing runs stay suppressed',async()=>{
 const original=Intl.Segmenter;let searchResultText;
 try{
  Intl.Segmenter=undefined;
  ({searchResultText}=await import(moduleURL+'?oversized-leading-fallback'));
 }finally{Intl.Segmenter=original;}
 const cluster='💻'.repeat(141);
 const leading=cluster+'x'.repeat(20)+'SQL';
 const expected='…'+'x'.repeat(12)+'SQL';
 assert.equal(plain(searchResultText({title:'研究',content:leading},'sql').excerpt),expected);
 assert.deepEqual(marked(searchResultText({title:'研究',content:leading},'sql').excerpt),[]);
 const trailing='SQL'+'x'.repeat(20)+cluster;
 assert.deepEqual(searchResultText({title:'研究',content:trailing},'sql').excerpt,[]);
});
