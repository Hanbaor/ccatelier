const test=require('node:test');
const assert=require('node:assert/strict');
const core=import('../source/atelier/js/livehouse-recording-core.mjs');
const store=import('../source/atelier/js/livehouse-recording-store.mjs');
const practice=import('../source/atelier/js/practice-core.mjs');
function memory(){const values=new Map();return{get length(){return values.size;},key:i=>[...values.keys()][i]??null,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),values};}

test('recording timing excludes count-in and endpoint, rounds across bars, clamps final half-cell',async()=>{
 const {RhythmTake}=await core,take=new RhythmTake({id:'live-test',bpm:120,bars:2});
 assert.equal(take.durationMs,4000);assert.equal(take.stepMs,125);
 for(const elapsed of [-100,-.1,4000,Infinity,NaN])assert.equal(take.capture('kick',elapsed),false);
 assert.equal(take.capture('kick',0,.7),true);
 assert.equal(take.capture('snare',61),true);assert.equal(take.capture('hat',62.5),true);
 assert.equal(take.capture('tom',1980),true);assert.equal(take.capture('snare',3999.99),true);
 const p=take.finish();assert.deepEqual(p.bars[0].hits.map(h=>[h.step,h.type]),[[0,'kick'],[0,'snare'],[1,'hat']]);
 assert.deepEqual(p.bars[1].hits.map(h=>[h.step,h.type]),[[0,'tom'],[15,'snare']]);
 assert.equal((await practice).practiceDuration(p),4);
});

test('duplicate drum cells merge at strongest velocity and output copies cannot mutate the take',async()=>{
 const {RhythmTake}=await core,take=new RhythmTake({id:'live-test',bpm:220,bars:4});
 assert.equal(take.capture('kick',10,.4),true);assert.equal(take.capture('kick',11,.9),false);assert.equal(take.capture('kick',12,.1),false);
 for(const [type,time,velocity] of [['crash',0,1],['hat',0,0],['hat',0,-1],['hat',0,1.1],['hat',0,NaN]])assert.equal(take.capture(type,time,velocity),false);
 assert.equal(take.size,1);const first=take.finish();assert.equal(first.bars[0].hits[0].velocity,.9);first.bars[0].hits[0].velocity=0;assert.equal(take.finish().bars[0].hits[0].velocity,.9);
 for(const bpm of [40,220])for(const bars of [2,4])assert.doesNotThrow(()=>new RhythmTake({id:'live-bounds',bpm,bars}));
 for(const args of [{bars:1},{bars:64},{bpm:0},{bpm:221},{bpm:NaN},{id:'<bad>'}])assert.throws(()=>new RhythmTake({id:'live-bounds',bpm:120,bars:2,...args}));
});

test('all four voices fit the practice schema without unbounded hit growth',async()=>{
 const {RhythmTake}=await core,take=new RhythmTake({id:'live-dense',bpm:40,bars:4});
 for(let repeat=0;repeat<4;repeat++)for(let i=0;i<64;i++)for(const type of ['kick','snare','hat','tom'])take.capture(type,i*take.stepMs,.8);
 assert.equal(take.size,256);assert.ok(take.finish().bars.every(bar=>bar.hits.length===64));
 const {validatePractice}=await practice;assert.doesNotThrow(()=>validatePractice(take.finish()));
});

test('recording slots are separate, idempotent and never replace older takes or studio projects',async()=>{
 const {RhythmTake}=await core,{saveRecording,readRecording,listRecordings,RECORDING_PREFIX}=await store,s=memory();s.setItem('studio-project','untouched');
 const take=new RhythmTake({id:'live-one',bpm:112,bars:2});take.capture('kick',0);const one=take.finish();
 saveRecording(s,one);saveRecording(s,one);assert.equal(s.length,2);
 assert.throws(()=>saveRecording(s,{...one,bpm:120}),/没有覆盖/);assert.equal(readRecording(s,'live-one').bpm,112);
 saveRecording(s,{...one,id:'live-two'});assert.equal(listRecordings(s).length,2);assert.equal(s.getItem('studio-project'),'untouched');
 s.setItem(RECORDING_PREFIX+'live-bad','<script>');assert.equal(listRecordings(s).length,2);
 s.setItem(RECORDING_PREFIX+'live-mismatch',JSON.stringify(one));assert.throws(()=>readRecording(s,'live-mismatch'));
 for(const id of ['../bad','<script>','ordinary-score',null])assert.throws(()=>readRecording(s,id));
});

test('full or unavailable storage fails safely; explicit removal frees only that slot',async()=>{
 const {RhythmTake}=await core,{saveRecording,readRecording,removeRecording,RECORDING_LIMIT}=await store,s=memory();
 for(let i=0;i<RECORDING_LIMIT;i++)saveRecording(s,new RhythmTake({id:'live-'+i,bpm:120,bars:2}).finish());
 const next=new RhythmTake({id:'live-next',bpm:120,bars:2}).finish();assert.throws(()=>saveRecording(s,next),/已满/);assert.equal(s.length,RECORDING_LIMIT);
 removeRecording(s,'live-0');saveRecording(s,next);assert.equal(readRecording(s,'live-0'),null);assert.equal(s.length,RECORDING_LIMIT);
 assert.throws(()=>saveRecording({...memory(),setItem(){throw Error('QuotaExceededError');}},next),/QuotaExceeded/);
 assert.throws(()=>saveRecording({...memory(),setItem(){}},next),/未能保存/);
});

test('corrupt local slots do not consume capacity or get silently removed',async()=>{
 const {RhythmTake}=await core,{saveRecording,listRecordings,RECORDING_PREFIX,RECORDING_LIMIT}=await store,s=memory();
 for(let i=0;i<RECORDING_LIMIT;i++)s.setItem(RECORDING_PREFIX+'live-broken-'+i,'not json');
 const value=new RhythmTake({id:'live-good',bpm:120,bars:2}).finish();saveRecording(s,value);assert.equal(listRecordings(s).length,1);assert.equal(s.length,RECORDING_LIMIT+1);assert.equal(s.getItem(RECORDING_PREFIX+'live-broken-0'),'not json');
});
