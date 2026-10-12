const test=require('node:test'),assert=require('node:assert/strict');
const core=()=>import('../source/atelier/js/algorithm-comparison-core.mjs');
test('bounded integer parser rejects unsafe, fractional, excessive and malformed inputs',async()=>{
 const {parseComparisonInput:parse,compareTwoSum}=await core();
 assert.deepEqual(parse(' -4，0, +7 4 ','0'),{nums:[-4,0,7,4],target:0});
 for(const [nums,target] of [['','0'],['3','6'],['1,2,','3'],['1e3,2','3'],['1.5 2','3'],['1 2','Infinity'],['1 2','1e2'],['1 2','1000000001'],['9007199254740993 1','2'],[Array(13).fill('1').join(','),'2'],['<script> 2','3']])assert.throws(()=>parse(nums,target));
 for(const [nums,target] of [[[1,2],NaN],[[Infinity,2],2],[[1.5,2],2],[[1_000_000_001,2],3],[[1,2],Number.MAX_SAFE_INTEGER]])assert.throws(()=>compareTwoSum(nums,target));
 const limits=compareTwoSum([-1_000_000_000,1_000_000_000],0);assert.equal(limits.verified,true);assert.deepEqual(limits.hash.at(-1).result,[0,1]);
});
test('traces expose reproducible operations with separate costs and detached snapshots',async()=>{
 const {compareTwoSum}=await core(),a=compareTwoSum([3,2,4],6),b=compareTwoSum([3,2,4],6);
 assert.deepEqual(a,b);
 assert.deepEqual(a.brute.map(s=>s.phase),['start','check','check','check','return']);
 assert.deepEqual(a.hash.map(s=>s.phase),['start','lookup','store','lookup','store','lookup','return']);
 assert.deepEqual(a.brute.at(-1).counts,{pairChecks:3});assert.deepEqual(a.hash.at(-1).counts,{lookups:3,writes:2,peakEntries:2});
 assert.deepEqual(a.hash[1].entries,[],'missing lookup never inserts a sentinel');assert.deepEqual(a.hash[2].entries,[[3,0]],'stores raw index zero');
 a.hash[2].entries[0][1]=99;a.hash[2].counts.writes=99;a.brute[1].pair[0]=99;
 assert.deepEqual(a.hash[3].entries,[[3,0]]);assert.equal(a.hash[3].counts.writes,1);assert.deepEqual(b.brute[1].pair,[0,1]);
});
test('duplicates, negative values, no solution, late solutions and multiple answers remain valid',async()=>{
 const {compareTwoSum,isValidPair}=await core();
 for(const [nums,target,expected] of [[[3,3],6,[0,1]],[[-4,0,7,4],0,[0,3]],[[0,0],0,[0,1]],[[1,2,4],99,null]]){
  const r=compareTwoSum(nums,target);assert.equal(r.verified,true);assert.deepEqual(r.brute.at(-1).result,expected);assert.deepEqual(r.hash.at(-1).result,expected);
 }
 const multiple=compareTwoSum([1,2,3,4],5);assert.deepEqual(multiple.solutions,[[0,3],[1,2]]);assert.deepEqual(multiple.brute.at(-1).result,[0,3]);assert.deepEqual(multiple.hash.at(-1).result,[1,2]);assert.equal(multiple.verified,true);
 const overwritten=compareTwoSum([1,1,3],4);assert.deepEqual(overwritten.hash.at(-1).result,[1,2]);assert.deepEqual(overwritten.hash.at(-1).counts,{lookups:3,writes:2,peakEntries:1});
 assert.equal(isValidPair([3],6,[0,0]),false);assert.equal(isValidPair([3,3],6,[-1,1]),false);assert.equal(isValidPair([3,3],6,[0,2]),false);
 const none=compareTwoSum(Array(12).fill(0),1);assert.equal(none.brute.at(-1).counts.pairChecks,66);assert.deepEqual(none.hash.at(-1).counts,{lookups:12,writes:12,peakEntries:1});assert.equal(none.brute.length,68);assert.equal(none.hash.length,26);
 const late=compareTwoSum([1,2,3,4,5,6,7,8],15);assert.equal(late.brute.at(-1).counts.pairChecks,28);assert.deepEqual(late.hash.at(-1).result,[6,7]);
});
test('exhaustive small input oracle verifies both models independently and exact counter increments',async()=>{
 const {compareTwoSum}=await core();
 for(let length=2;length<=4;length++)for(let code=0;code<3**length;code++){
  let cursor=code;const nums=Array.from({length},()=>{const value=cursor%3-1;cursor=Math.floor(cursor/3);return value;});
  for(let target=-3;target<=3;target++){
   const r=compareTwoSum(nums,target),pairs=[];
   nums.forEach((a,i)=>nums.forEach((b,j)=>{if(i<j&&a+b===target)pairs.push([i,j]);}));
   assert.deepEqual(r.solutions,pairs);assert.equal(r.verified,true,JSON.stringify({nums,target}));
   for(const trace of [r.brute,r.hash]){
    const answer=trace.at(-1).result;
    assert.equal(answer===null,pairs.length===0);if(answer)assert.ok(pairs.some(pair=>pair[0]===answer[0]&&pair[1]===answer[1]));
    for(let i=1;i<trace.length;i++)for(const key of Object.keys(trace[i].counts)){
     if(key==='peakEntries')continue;
     const event={pairChecks:'check',lookups:'lookup',writes:'store'}[key];
     assert.equal(trace[i].counts[key]-trace[i-1].counts[key],trace[i].phase===event?1:0);
    }
   }
   assert.ok(r.brute.at(-1).counts.pairChecks<=length*(length-1)/2);assert.ok(r.hash.at(-1).counts.lookups<=length);assert.ok(r.hash.at(-1).counts.writes<=length);
  }
 }
});
