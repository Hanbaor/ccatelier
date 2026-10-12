const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync,execFileSync}=require('node:child_process');
const raw=fs.readFileSync(path.join(__dirname,'../source/_posts/hot100/001.md'),'utf8');
const code=[...raw.matchAll(/^```cpp\n([\s\S]*?)^```\s*$/gm)][0][1];
const compiler=spawnSync('g++',['--version'],{encoding:'utf8'}).status===0;
function pairs(nums,target){const out=[];for(let i=0;i<nums.length;i++)for(let j=i+1;j<nums.length;j++)if(nums[i]+nums[j]===target)out.push([i,j]);return out;}
function cases(){
 const all=[[[2,7,11,15],9],[[3,2,4],6],[[3,3],6],[[0,0],0],[[-3,4,3,90],0],[[-1000000000,1000000000],0],[[1000000000,-1000000000,0],1000000000],[[-1000000000,1000000000,0],-1000000000]];
 function visit(nums,n){if(nums.length===n){for(let target=-4;target<=4;target++)if(pairs(nums,target).length===1)all.push([nums.slice(),target]);return;}for(let value=-2;value<=2;value++){nums.push(value);visit(nums,n);nums.pop();}}
 for(let n=2;n<=6;n++)visit([],n);all.push([[...Array(9998).fill(0),1,2],3]);return all;
}
test('demo remains bound by regression test to the unchanged imported twoSum implementation',()=>{
 const {createHash}=require('node:crypto');
 assert.equal(createHash('sha256').update(code).digest('hex'),'0d7b02e47a605a8497ed55a4642595711c3d744f370ea61448cdd3050dad925f');
});
test('original C++ passes samples, zero/negative/boundary cases and exhaustive bounded unique-solution inputs',async t=>{
 assert.equal(compiler,true,'g++ is required for real C++ validation; no compiler was installed automatically.');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cc-two-sum-'));
 try{
  const source=path.join(directory,'two-sum.cpp'),program=path.join(directory,'two-sum');
  fs.writeFileSync(source,'#include <vector>\n#include <unordered_map>\n#include <iostream>\nusing namespace std;\n'+code+'\nint main(){int n,target;while(cin>>n>>target){vector<int> nums(n);for(int &x:nums)cin>>x;auto result=Solution().twoSum(nums,target);if(result.size()!=2)return 2;cout<<result[0]<<" "<<result[1]<<"\\n";}}\n');
  execFileSync('g++',['-std=c++11','-O1','-fsanitize=undefined','-fno-sanitize-recover=all',source,'-o',program],{timeout:20000});
  const fixtures=cases(),input=fixtures.map(([nums,target])=>`${nums.length} ${target} ${nums.join(' ')}`).join('\n')+'\n';
  const output=execFileSync(program,{input,encoding:'utf8',timeout:20000,maxBuffer:16*1024*1024}).trim().split('\n');assert.equal(output.length,fixtures.length);
  const {traceTwoSum}=await import('../source/atelier/js/algorithm-demo-core.mjs');
  fixtures.forEach(([nums,target],index)=>{const expected=pairs(nums,target);assert.equal(expected.length,1);const actual=output[index].split(' ').map(Number);assert.deepEqual(actual.slice().sort((a,b)=>a-b),expected[0],JSON.stringify({nums,target}));assert.deepEqual(traceTwoSum(nums,target).at(-1).result,actual,'JS logic result agrees with real C++');});
  t.diagnostic(`${fixtures.length} unique-solution cases; original C++11 source, UBSan, brute-force oracle, JS result cross-check. This is bounded testing, not a proof for all inputs.`);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
