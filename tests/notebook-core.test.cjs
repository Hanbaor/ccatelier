const test=require('node:test'),assert=require('node:assert/strict');
const core=()=>import('../source/atelier/js/notebook-core.mjs');
test('quote anchors locate repeated phrases by context and fail honestly after edits',async()=>{
 const {anchorQuote,locateQuote}=await core();
 const text='第一段，鼓点。第二段，鼓点。尾声。',a=anchorQuote(text,11,13);
 assert.equal(a.quote,'鼓点');assert.equal(locateQuote('序言。'+text,a),14);
 assert.equal(locateQuote('原文已经删除',a),-1);
  assert.equal(locateQuote('鼓点 … 鼓点',{quote:'鼓点',prefix:'',suffix:'',start:100}),-1);
 const original='第一节：今天敲鼓。结束第一节。第二节：今天敲鼓。结束第二节。';
 const first=anchorQuote(original,4,8);
 assert.equal(locateQuote('第二节：今天敲鼓。结束第二节。',first),-1,'must not move deleted quote to a different passage');
});
test('backup validation rejects unsafe paths and malformed records without partial import',async()=>{
 const {validateNotebook}=await core();
 const valid={version:1,notes:[{id:'abc',path:'/lab/a/',title:'文章',quote:'文字',prefix:'',suffix:'',start:0,note:'<img onerror=1>',updated:100}]};
 assert.equal(validateNotebook(valid,'/lab/').notes[0].note,'<img onerror=1>');
 for(const path of ['//evil.test/','/lab/../admin/','/outside/','/lab/%2e%2e/admin/'])assert.throws(()=>validateNotebook({...valid,notes:[{...valid.notes[0],path}]},'/lab/'));
 assert.throws(()=>validateNotebook({...valid,notes:[...valid.notes,{...valid.notes[0],quote:''}]},'/lab/'));
 assert.throws(()=>validateNotebook({...valid,version:9},'/lab/'));
});
test('queue operations deduplicate, reorder and preserve completion state',async()=>{
 const {updateQueue,validateQueue}=await core();let q=[];
 q=updateQueue(q,{type:'add',item:{path:'/a/',title:'A'}});q=updateQueue(q,{type:'add',item:{path:'/b/',title:'B'}});q=updateQueue(q,{type:'add',item:{path:'/a/',title:'A'}});
 assert.equal(q.length,2);q=updateQueue(q,{type:'move',path:'/b/',delta:-1});assert.equal(q[0].title,'B');
 q=updateQueue(q,{type:'done',path:'/b/',at:100});assert.equal(q[0].completed,100);
 assert.deepEqual(validateQueue({version:1,queue:q},'/'),q);
 assert.throws(()=>validateQueue({version:1,queue:[{path:'javascript:alert(1)',title:'bad'}]},'/'));
});
