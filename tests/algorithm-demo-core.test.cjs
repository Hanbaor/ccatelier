const test=require('node:test'),assert=require('node:assert/strict');
const core=()=>import('../source/atelier/js/algorithm-demo-core.mjs');
test('trace models insertion on missing lookup and i+1 storage, including overwritten sentinel',async()=>{
 const {traceTwoSum}=await core(),steps=traceTwoSum([3,2,4],6);
 assert.deepEqual(steps.map(s=>s.phase),['start','lookup','store','lookup','store','lookup','return']);
 assert.deepEqual(steps.map(s=>s.entries),[[],[[3,0]],[[3,1]],[[3,1],[4,0]],[[2,2],[3,1],[4,0]],[[2,2],[3,1],[4,0]],[[2,2],[3,1],[4,0]]]);
 assert.deepEqual(steps.at(-1).result,[1,2]);assert.equal(steps[3].needed,4);assert.equal(steps[3].i,1);
 const duplicate=traceTwoSum([3,3],6);assert.deepEqual(duplicate.at(-1).result,[0,1]);assert.deepEqual(duplicate[1].entries,[[3,0]]);assert.deepEqual(duplicate[2].entries,[[3,1]]);
});
test('only the two fixed original examples are offered; snapshots are independent and repeatable',async()=>{
 const {traceTwoSum,TWO_SUM_EXAMPLES}=await core();assert.deepEqual(TWO_SUM_EXAMPLES,[{nums:[3,2,4],target:6},{nums:[3,3],target:6}]);
 for(const example of TWO_SUM_EXAMPLES){const a=traceTwoSum(example.nums,example.target),b=traceTwoSum(example.nums,example.target);assert.deepEqual(a,b);a[1].entries[0][1]=999;assert.notDeepEqual(a,b);assert.equal(b[1].entries[0][1],0);assert.equal(a[2].entries[0][1],1);}
});
