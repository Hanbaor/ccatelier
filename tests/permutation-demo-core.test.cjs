const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {supportsPermutationDemo,CODE_SHA256}=require('../scripts/permutation-demo.js');
const raw=fs.readFileSync(path.join(__dirname,'../source/_posts/csdn/124338541.md'),'utf8');
function lexicographic(n){
 const a=Array.from({length:n},(_,i)=>i+1),result=[];
 do{result.push(a.slice());let i=n-2;while(i>=0&&a[i]>=a[i+1])i--;if(i<0)break;let j=n-1;while(a[j]<=a[i])j--;[a[i],a[j]]=[a[j],a[i]];for(let l=i+1,r=n-1;l<r;l++,r--)[a[l],a[r]]=[a[r],a[l]];}while(true);
 return result;
}
test('source fingerprint accepts only this unchanged author implementation and preserves original dates',()=>{
 assert.match(CODE_SHA256,/^[a-f0-9]{64}$/);assert.equal(supportsPermutationDemo({source_id:'124338541',_content:raw}),true);
 assert.equal(supportsPermutationDemo({source_id:'124338541',raw:raw.replaceAll('\n','\r\n')}),true);
 for(const page of [{source_id:'055',_content:raw},{source_id:'124338541',_content:raw.replace('book[j]=0;//','book[j]=1;//')},{source_id:'124338541',_content:raw+'\n```cpp\nfoo\n```\n'},{source_id:'124338541'}])assert.equal(supportsPermutationDemo(page),false);
 assert.match(raw,/date: "2022-04-22 09:59:52"/);assert.match(raw,/updated: "2022-04-22 22:57:33"/);
});
test('bounded deterministic model agrees with independent lexicographic oracle, including final residual slots',async()=>{
 const {tracePermutation}=await import('../source/atelier/js/permutation-demo-core.mjs');
 for(const [n,count,nodes] of [[2,23,5],[3,84,16],[4,383,65]]){
  const model=tracePermutation(n),last=model.steps.at(-1);assert.equal(model.steps.length,count);assert.equal(model.nodes.length,nodes);
  assert.deepEqual(last.results.map(result=>result.values),lexicographic(n));assert.deepEqual(last.a,Array.from({length:n},(_,i)=>n-i));assert.deepEqual(last.book,Array(n).fill(0));assert.deepEqual(last.stack,[]);assert.equal(last.prefixLength,0);
  assert.deepEqual(model.steps[0].a,Array(n).fill(0));assert.deepEqual(model,tracePermutation(n));
  for(const s of model.steps){assert.equal(s.book.filter(Boolean).length,s.prefixLength);assert.deepEqual(s.a.slice(0,s.prefixLength).sort((a,b)=>a-b),s.book.flatMap((v,i)=>v?[i+1]:[]));assert.equal(s.step,s.stack.at(-1)??null);for(const result of s.results)assert.ok(result.at<=model.steps.indexOf(s));}
 }
 for(const bad of [0,1,5,6,20,-1,2.5,'3',null,undefined,NaN,Infinity,[3],{}])assert.throws(()=>tracePermutation(bad),RangeError);
});
test('return and release are distinct; stale a=133 is not a duplicate active prefix',async()=>{
 const {tracePermutation}=await import('../source/atelier/js/permutation-demo-core.mjs'),model=tracePermutation(3),steps=model.steps;
 const first=steps.findIndex(s=>s.phase==='emit'),out=steps[first],returned=steps[first+1],released=steps[first+2];
 assert.deepEqual(out.a,[1,2,3]);assert.equal(returned.phase,'return');assert.equal(returned.step,2);assert.equal(returned.returnedStep,3);assert.equal(returned.prefixLength,3);assert.deepEqual(returned.book,[1,1,1]);assert.deepEqual(returned.stack,[0,1,2]);
 assert.equal(released.phase,'release');assert.equal(released.prefixLength,2);assert.deepEqual(released.a,[1,2,3]);assert.deepEqual(released.book,[1,1,0]);
 const stale=steps.find(s=>s.phase==='choose'&&s.a.join()==='1,3,3');assert.equal(stale.prefixLength,2);assert.deepEqual(stale.book,[1,0,1]);
 assert.equal(Object.isFrozen(model),true);for(const s of steps){assert.ok(Object.isFrozen(s)&&Object.isFrozen(s.a)&&Object.isFrozen(s.book)&&Object.isFrozen(s.stack)&&Object.isFrozen(s.results));for(const r of s.results)assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.values));}
 assert.throws(()=>steps[0].a.push(9),TypeError);assert.equal(steps[0].results.length,0);assert.equal(steps.at(-1).results.length,6);
});
