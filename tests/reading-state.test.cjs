const {test}=require('node:test');
const assert=require('node:assert/strict');
const modulePath='../source/atelier/js/reading-state.mjs';
test('local reading data accepts only bounded same-site paths and repairs corrupt storage',async()=>{
  const {readShelf,remember,safePath}=await import(modulePath);
  assert.deepEqual(readShelf('{broken'),[]);
  assert.equal(safePath('//evil.test/post/'),false);
  assert.equal(safePath('/a/../admin/'),false);
  assert.deepEqual(readShelf(JSON.stringify([{path:'javascript:alert(1)',title:'x'},{path:'/writing/a/',title:'A',progress:5}])),[{path:'/writing/a/',title:'A',progress:1}]);
  const list=Array.from({length:80},(_,i)=>({path:`/writing/${i}/`,title:String(i)}));
  const result=remember(list,{path:'/writing/5/',title:'Five'},60);
  assert.equal(result.length,60);assert.equal(result[0].title,'Five');assert.equal(result.filter(p=>p.path==='/writing/5/').length,1);
});
test('focus timer uses elapsed wall time, preserves pause and rejects corrupt or excessive durations',async()=>{
  const {readTimer,remainingTime,pauseTimer}=await import(modulePath);
  const timer={duration:300000,remaining:300000,endsAt:1000000};
  assert.equal(remainingTime(timer,880000),120000);
  assert.deepEqual(pauseTimer(timer,880000),{duration:300000,remaining:120000,endsAt:0});
  assert.equal(remainingTime(timer,1100000),0);
  assert.equal(readTimer('{oops').duration,1500000);
  assert.equal(readTimer(JSON.stringify({duration:Infinity,remaining:-1,endsAt:0})).duration,1500000);
});
