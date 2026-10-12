const test=require('node:test'),assert=require('node:assert/strict');
test('match navigation advances on repeated Enter and previous starts at final occurrence',async()=>{
 const {nextMatch}=await import('../source/atelier/js/reader-search.mjs');
 assert.equal(nextMatch(-1,3,1),0);assert.equal(nextMatch(0,3,1),1);assert.equal(nextMatch(2,3,1),0);assert.equal(nextMatch(-1,3,-1),2);assert.equal(nextMatch(0,3,-1),2);assert.equal(nextMatch(0,0,1),-1);
});
test('literal search keeps original offsets for Unicode case folding and regex characters',async()=>{
 const {findMatches}=await import('../source/atelier/js/reader-search.mjs');
 assert.deepEqual(findMatches('a.b A.B a?b','a.b'),[{start:0,end:3},{start:4,end:7}]);
 assert.deepEqual(findMatches('İ X X','X'),[{start:2,end:3},{start:4,end:5}]);
});
