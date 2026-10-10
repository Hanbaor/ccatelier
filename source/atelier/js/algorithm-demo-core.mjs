// A deterministic model of the displayed implementation, not a C++ runtime.
export const TWO_SUM_EXAMPLES = Object.freeze([
 Object.freeze({nums:Object.freeze([3,2,4]),target:6}),
 Object.freeze({nums:Object.freeze([3,3]),target:6})
]);
export function traceTwoSum(nums,target){
 const map=new Map(),steps=[];
 function snapshot(phase,i,message,result=null){
  steps.push({phase,i,value:i===null?null:nums[i],needed:i===null?null:target-nums[i],entries:[...map].sort((a,b)=>a[0]-b[0]),message,result});
 }
 snapshot('start',null,'从空表开始；表内保存下标 + 1。');
 for(let i=0;i<nums.length;i++){
  const needed=target-nums[i],missing=!map.has(needed);
  // C++ unordered_map::operator[] inserts a value-initialized int on a miss.
  if(missing)map.set(needed,0);
  const stored=map.get(needed);
  snapshot('lookup',i,missing?`查询 ${needed}：缺失键被插入，值为 0；条件不成立。`:`查询 ${needed}：取到 ${stored}；条件${stored?'成立':'不成立'}。`);
  if(stored){snapshot('return',i,`返回 [${stored-1}, ${i}]，两个下标不同。`,[stored-1,i]);return steps;}
  map.set(nums[i],i+1);
  snapshot('store',i,`保存 mp[${nums[i]}] = ${i+1}，即下标 ${i} + 1。`);
 }
 snapshot('return',null,'没有命中；原代码返回 [0, 0]，这不是有效下标对。',[0,0]);return steps;
}
