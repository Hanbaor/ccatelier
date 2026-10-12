const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(process.env.SEARCH_CONTEXT_SOURCE||path.resolve(__dirname,'../source/atelier/js/search-context.mjs'),'utf8');
// Inspect a fresh in-memory test copy only. Production gains no test exports.
const inspection='\nexport const inspect=()=>({size:preparedTexts.size,units:preparedUnits,slots:preparedSlots,keys:[...preparedTexts.keys()],values:[...preparedTexts.values()]}); export {preparedText};';
let serial=0;
async function load({inspect=true,fallback=false}={}){
 const saved=Intl.Segmenter;
 try{
  if(fallback)Intl.Segmenter=undefined;
  return await import('data:text/javascript;base64,'+Buffer.from(source+(inspect?inspection:'')).toString('base64')+'#prepared-text-test-'+serial++);
 }finally{Intl.Segmenter=saved;}
}
async function assertColdEqual(warm,entry,query,fallback=false){
 const cold=await load({inspect:false,fallback});
 assert.deepEqual(warm.searchResultText(entry,query),cold.searchResultText(entry,query));
}
function bounds(module){
 const state=module.inspect();
 assert.equal(state.size,state.keys.length);assert.equal(state.size,state.values.length);
 assert.ok(state.size<=64);assert.ok(state.units<=262144);assert.ok(state.slots<=262144);
 assert.equal(state.units,state.values.reduce((sum,value)=>sum+value.text.length+value.normalized.length,0));
 assert.equal(state.slots,state.values.reduce((sum,value)=>sum+value.boundaries.length+value.offsets.length,0));
 state.values.forEach((value,index)=>{
  assert.equal(state.keys[index],value.text);assert.ok(value.text.length<=32768);
  assert.deepEqual(Object.keys(value).sort(),['aligned','boundaries','normalized','offsets','text']);
 });
 return state;
}
const plain=parts=>parts.map(part=>part.text).join('');
const marked=parts=>parts.filter(part=>part.match).map(part=>part.text);

test('prepared-text reuse never changes the public exports or stores queries/matches',async()=>{
 const production=await load({inspect:false});assert.deepEqual(Object.keys(production),['searchResultText']);
 const module=await load(),entry={title:'Original ＡＢＣ',content:'start alpha beta'};
 assert.deepEqual(module.searchResultText(entry,'alpha'),{
  title:[{text:'Original ＡＢＣ',match:false}],
  excerpt:[{text:'start ',match:false},{text:'alpha',match:true},{text:' beta',match:false}]
 });
 const retained=module.inspect().values.slice();
 for(const query of ['beta','unrecorded-query-secret','','alpha'])await assertColdEqual(module,entry,query);
 assert.equal(bounds(module).size,2);assert.deepEqual(module.inspect().values,retained);
 assert.ok(!module.inspect().keys.includes('unrecorded-query-secret'));
});

test('entry mutation, replacement, coercion and returned-part edits never reuse stale results',async()=>{
 const module=await load(),entry={url:'/same',title:'Original',content:'start alpha beta'};
 const first=module.searchResultText(entry,'alpha');first.title[0].text='corrupt';first.excerpt.splice(0);
 await assertColdEqual(module,entry,'alpha');
 for(const [title,content] of [['Changed title','new needle body'],['',''],[null,null],['ΟΣ','ㄱㅏ Cafe\u0301 ﬃ 👩🏽‍💻']]){
  Object.assign(entry,{title,content});
  for(const query of ['needle','ος 가 fi café 💻','absent'])await assertColdEqual(module,entry,query);
 }
 const unicode=module.searchResultText(entry,'ος 가 fi café 💻');
 assert.deepEqual(marked(unicode.title),['ΟΣ']);assert.deepEqual(marked(unicode.excerpt),['ㄱㅏ','Cafe\u0301','ﬃ','👩🏽‍💻']);
 let value='first';entry.content={toString:()=>value};module.searchResultText(entry,'first');value='second';
 await assertColdEqual(module,entry,'second');assert.equal(plain(module.searchResultText(entry,'second').excerpt),'second');
 await assertColdEqual(module,{url:'/same',title:'Different',content:'new'},'new');
 assert.equal(module.preparedText('same text'),module.preparedText('same text'));bounds(module);
});

test('64-entry LRU evicts oldest, refreshes hit recency, and recomputes evicted preparation',async()=>{
 const module=await load();for(let i=0;i<64;i++)module.preparedText('text-'+i);
 const oldest=module.inspect().values[1],recent=module.preparedText('text-0');module.preparedText('text-64');
 assert.equal(bounds(module).size,64);assert.ok(!module.inspect().keys.includes('text-1'));
 assert.equal(module.preparedText('text-0'),recent);
 const recomputed=module.preparedText('text-1');assert.notEqual(recomputed,oldest);assert.deepEqual(recomputed,oldest);bounds(module);
});

test('string and numeric-slot budgets evict before count capacity and counters equal retained data',async()=>{
 const strings=await load();for(let i=0;i<20;i++){strings.preparedText(String(i)+'\u0338'.repeat(30000));bounds(strings);}
 const stringState=bounds(strings);assert.ok(stringState.size<20);assert.ok(stringState.slots<100);assert.ok(stringState.units>240000);
 const maps=await load();for(let i=0;i<20;i++){maps.preparedText(String(i)+'x'.repeat(20000));bounds(maps);}
 const mapState=bounds(maps);assert.ok(mapState.size<20);assert.ok(mapState.slots>240000);
 // Four ASCII strings fit the string budget exactly, but their mapping arrays
 // need four extra pairs of endpoint slots. Only the slot budget can evict.
 const boundary=await load(),inputs=Array.from({length:4},(_,i)=>String(i)+'x'.repeat(32767));
 for(const input of inputs.slice(0,3))boundary.preparedText(input);
 assert.equal(bounds(boundary).size,3);
 assert.equal(boundary.inspect().units+inputs[3].length*2,262144);
 assert.equal(boundary.inspect().slots+2*(inputs[3].length+1),262152);
 boundary.preparedText(inputs[3]);
 const final=bounds(boundary);
 assert.deepEqual(final.keys,inputs.slice(1));assert.equal(final.size,3);
 assert.equal(final.units,196608);assert.equal(final.slots,196614);
});

test('oversized inputs leave every valid cached record and counter untouched',async()=>{
 const module=await load();for(let i=0;i<64;i++)module.preparedText('keep-'+i);
 const before=module.inspect();
 for(const value of ['x'.repeat(32769),'a'+'\u0338'.repeat(32768)]){
  assert.notEqual(module.preparedText(value),module.preparedText(value));
  assert.deepEqual(module.inspect(),before);
  module.inspect().values.forEach((retained,index)=>assert.equal(retained,before.values[index]));
  // Exercise the public formatter without adding a separate uncached title.
  await assertColdEqual(module,{title:'keep-63',content:value},'x');
  assert.deepEqual(module.inspect(),before);
 }
 const exact='a'+'\u0338'.repeat(32767);assert.equal(module.preparedText(exact),module.preparedText(exact));bounds(module);
});

test('no-Segmenter warmed results keep the 280 cap and unmarked Unicode fallback',async()=>{
 const module=await load({fallback:true});
 const visible='💻'.repeat(137)+'needle',hidden='💻'.repeat(137)+'xneedle';
 const cases=[['needle '+'后'.repeat(100),'needle'],[visible,'needle'],[hidden,'needle'],['💻'.repeat(141)+'x'.repeat(20)+'SQL','SQL'],['SQL'+'x'.repeat(20)+'💻'.repeat(141),'SQL']];
 for(const [content,query] of cases){
  const entry={title:'Title',content};module.searchResultText(entry,query);
  await assertColdEqual(module,entry,query,true);await assertColdEqual(module,entry,'',true);
  assert.deepEqual(marked(module.searchResultText(entry,query).excerpt),[]);
 }
 assert.equal(plain(module.searchResultText({title:'Title',content:visible},'needle').excerpt),visible);
 assert.deepEqual(module.searchResultText({title:'Title',content:hidden},'needle').excerpt,[]);
 assert.equal(plain(module.searchResultText({title:'Title',content:cases[3][0]},'SQL').excerpt),'…'+'x'.repeat(12)+'SQL');
 assert.deepEqual(module.searchResultText({title:'Title',content:cases[4][0]},'SQL').excerpt,[]);bounds(module);
});

test('contextual-length mismatch remains unmarked on repeated cache hits',async()=>{
 const module=await load(),saved=String.prototype.toLocaleLowerCase;
 try{
  String.prototype.toLocaleLowerCase=function(){return String(this)==='AB'?'z':saved.call(this);};
  const prepared=module.preparedText('AB');assert.equal(prepared.aligned,false);assert.equal(module.preparedText('AB'),prepared);
  assert.deepEqual(module.searchResultText({title:'AB',content:'AB'},'z'),{title:[{text:'AB',match:false}],excerpt:[{text:'AB',match:false}]});bounds(module);
 }finally{String.prototype.toLocaleLowerCase=saved;}
});

test('empty queries prepare zero texts and leave a warm cache unchanged',async()=>{
 const module=await load();
 for(let i=0;i<20;i++){
  const result=module.searchResultText({title:'Title '+i,content:'body '.repeat(10000)},'  ');
  assert.deepEqual(result,{title:[{text:'Title '+i,match:false}],excerpt:[]});
 }
 assert.deepEqual(module.inspect(),{size:0,units:0,slots:0,keys:[],values:[]});
 module.preparedText('retained');const warm=module.inspect();
 module.searchResultText({title:'Other',content:'body '.repeat(10000)},'');assert.deepEqual(module.inspect(),warm);
});
