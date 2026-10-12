const test=require('node:test');
const assert=require('node:assert/strict');
const core=import('../source/atelier/js/practice-challenge-core.mjs');
const score=(overrides={})=>({id:'original-challenge',title:'原创练习',description:'Original timing fixture.',bpm:120,bars:[{hits:[{step:0,type:'kick',velocity:.8},{step:0,type:'hat',velocity:.5},{step:4,type:'snare',velocity:.8},{step:15,type:'tom',velocity:.7}]},{hits:[]}],...overrides});
const memory=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),values};};

test('challenge chords use independent targets; duplicates do not claim a nearby target',async()=>{
 const {PracticeChallenge}=await core,run=new PracticeChallenge(score());
 assert.equal(run.strike('kick',0).kind,'center');assert.equal(run.strike('hat',0).kind,'center');
 assert.equal(run.strike('kick',0),null);assert.equal(run.strike('kick',.01),null);
 assert.equal(run.summary().hit,2);assert.equal(run.summary().extra,0);
 const dense=new PracticeChallenge(score({bpm:220,bars:[{hits:[0,1,2].map(step=>({step,type:'kick',velocity:1}))}]}));
 assert.equal(dense.strike('kick',0).kind,'center');assert.equal(dense.strike('kick',0),null);
 assert.equal(dense.strike('kick',60/220/4).kind,'center');assert.equal(dense.summary().hit,2);
});

test('bounded windows have inclusive edges, nearest unclaimed matching, and transparent totals',async()=>{
 const {PracticeChallenge}=await core;
 for(const [offset,kind] of [[-.12,'early'],[-.045,'center'],[0,'center'],[.045,'center'],[.12,'late']]){
  const run=new PracticeChallenge(score());assert.equal(run.strike('snare',.5+offset).kind,kind);
 }
 const outside=new PracticeChallenge(score());assert.equal(outside.strike('snare',.379).kind,'extra');assert.equal(outside.strike('snare',.621).kind,'extra');assert.equal(outside.summary().hit,0);
 const run=new PracticeChallenge(score());run.strike('kick',0);run.strike('hat',.06);run.strike('tom',1);run.strike('snare',.55);
 assert.deepEqual(run.finish(),{total:4,hit:3,center:1,extra:1,score:60});assert.equal(run.strike('tom',1.875),null);
});

test('rests, silent hits, selection-relative time and final grace retain the full duration',async()=>{
 const {PracticeChallenge}=await core;
 const p=score({bars:[{hits:[]},{hits:[{step:15,type:'tom',velocity:.8},{step:0,type:'kick',velocity:0}]}]});
 const run=new PracticeChallenge(p,220,1,1);assert.equal(run.targets.length,1);assert.equal(run.targets[0].bar,1);assert.equal(run.targets[0].time,15*60/220/4);assert.equal(run.duration,4*60/220);
 assert.equal(run.strike('tom',run.targets[0].time+.12).kind,'late','last 16th receives the full late-hit window beyond bar end');
 assert.equal(run.strike('snare',run.duration+.11),null);assert.equal(run.summary().extra,0);
 const rests=new PracticeChallenge(p,120,0,0);assert.equal(rests.duration,2);assert.deepEqual(rests.finish(),{total:0,hit:0,center:0,extra:0,score:0});
});

test('unsafe or out-of-session events are ignored, independently per instrument',async()=>{
 const {PracticeChallenge}=await core,run=new PracticeChallenge(score());
 for(const [type,time] of [['crash',0],['kick',NaN],['kick',Infinity],['kick',-.121],['kick',4.121],['kick','0']])assert.equal(run.strike(type,time),null);
 assert.equal(run.summary().extra,0);assert.equal(run.strike('kick',1).kind,'extra');assert.equal(run.strike('kick',.5),null);assert.equal(run.strike('snare',.5).kind,'center');
});

test('local best compares exact audible pattern, selected range and tempo with bounded history',async()=>{
 const {PracticeChallenge,saveChallengeBest,readChallengeBest,CHALLENGE_BEST_KEY}=await core,s=memory(),run=new PracticeChallenge(score());
 assert.equal(readChallengeBest(s,run.signature),null);assert.equal(saveChallengeBest(s,run.signature,72),72);assert.equal(saveChallengeBest(s,run.signature,50),72);assert.equal(readChallengeBest(s,run.signature),72);
 assert.equal(new PracticeChallenge(score({title:'Different label'})).signature,run.signature);
 assert.notEqual(new PracticeChallenge(score(),121).signature,run.signature);assert.notEqual(new PracticeChallenge(score(),120,0,0).signature,run.signature);
 assert.notEqual(new PracticeChallenge(score({bars:[{hits:[{step:0,type:'snare',velocity:1}]}]})).signature,run.signature);
 s.setItem('unrelated-project','safe');for(let i=0;i<20;i++)saveChallengeBest(s,'pattern-'+i,i);
 assert.equal(JSON.parse(s.getItem(CHALLENGE_BEST_KEY)).length,12);assert.equal(s.getItem('unrelated-project'),'safe');
});

test('blocked, corrupt, oversized or no-op storage reports failure without changing other keys',async()=>{
 const {saveChallengeBest,readChallengeBest,CHALLENGE_BEST_KEY}=await core;
 assert.throws(()=>saveChallengeBest({getItem(){throw Error('blocked');}},'[]',80),/blocked/);
 assert.throws(()=>saveChallengeBest({getItem:()=>null,setItem(){}},'[]',80),/未保存/);
 for(const raw of ['{}','bad',JSON.stringify([{signature:'[]',score:1000}]),' '.repeat(250001)]){
  const s=memory();s.setItem(CHALLENGE_BEST_KEY,raw);assert.throws(()=>readChallengeBest(s,'[]'));assert.throws(()=>saveChallengeBest(s,'[]',50));assert.equal(s.getItem(CHALLENGE_BEST_KEY),raw);
 }
});


test('input timestamps retain occurrence time, normalize legacy epochs and reject incompatible clocks',async()=>{
 const {challengeInputTime}=await core;assert.equal(challengeInputTime(3100,3250),3100);assert.equal(challengeInputTime(1700000003100,3250,1700000000000),3100);
 for(const stamp of [NaN,Infinity,-1,3251,1700000003100,undefined])assert.equal(challengeInputTime(stamp,3250),3250);
});
