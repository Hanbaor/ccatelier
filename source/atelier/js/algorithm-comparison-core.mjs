// Instrumented teaching models. These are deliberately not the article's C++ code.
export const COMPARISON_LIMITS = Object.freeze({length:12,magnitude:1_000_000_000});
export const COMPARISON_EXAMPLES = Object.freeze([
 {label:'原题示例',nums:[3,2,4],target:6},
 {label:'重复值',nums:[3,3],target:6},
 {label:'负数与零',nums:[-4,0,7,4],target:0},
 {label:'没有解',nums:[1,2,4,8,16,32],target:100},
 {label:'多个有效答案',nums:[1,2,3,4],target:5},
 {label:'最后才命中',nums:[1,2,3,4,5,6,7,8],target:15}
].map(example=>Object.freeze({...example,nums:Object.freeze(example.nums)})));
export function validateComparisonInput(nums,target){
 const {length,magnitude}=COMPARISON_LIMITS;
 if(!Array.isArray(nums)||nums.length<2||nums.length>length)throw new RangeError(`请输入 2–${length} 个整数。`);
 if(![...nums,target].every(value=>Number.isSafeInteger(value)&&Math.abs(value)<=magnitude))throw new RangeError(`数组与目标值都须为 −${magnitude} 到 ${magnitude} 的整数。`);
 // Bounds above keep both sums and complements exactly representable in JS.
}
export function parseComparisonInput(arrayText,targetText){
 if(typeof arrayText!=='string'||typeof targetText!=='string'||arrayText.length>200||targetText.length>20)throw new RangeError('输入过长，请缩短后重试。');
 const tokens=arrayText.trim().split(/[,，\s]+/),target=targetText.trim();
 if(!tokens.every(value=>/^[+-]?\d+$/.test(value))||!/^[+-]?\d+$/.test(target))throw new RangeError('请只输入整数；数组可用逗号或空格分隔。');
 const nums=tokens.map(Number),number=Number(target);validateComparisonInput(nums,number);return {nums,target:number};
}
export function isValidPair(nums,target,pair){
 return Array.isArray(pair)&&pair.length===2&&pair.every(i=>Number.isInteger(i)&&i>=0&&i<nums.length)&&pair[0]!==pair[1]&&nums[pair[0]]+nums[pair[1]]===target;
}
function snapshot(steps,state){
 steps.push({...state,pair:state.pair?[...state.pair]:null,result:state.result?[...state.result]:null,counts:{...state.counts},entries:state.entries?state.entries.map(entry=>[...entry]):[]});
}
export function traceBruteForce(nums,target){
 validateComparisonInput(nums,target);
 const steps=[],state={phase:'start',pair:null,result:null,counts:{pairChecks:0},message:'从 i = 0、j = i + 1 开始，只检查不同下标。'};
 snapshot(steps,state);
 for(let i=0;i<nums.length-1;i++)for(let j=i+1;j<nums.length;j++){
  state.pair=[i,j];state.phase='check';state.counts.pairChecks++;
  const sum=nums[i]+nums[j];state.message=`检查 (${i}, ${j})：${nums[i]} + ${nums[j]} = ${sum}，${sum===target?'等于':'不等于'}目标 ${target}。`;
  snapshot(steps,state);
  if(sum===target){state.phase='return';state.result=[i,j];state.message=`返回 [${i}, ${j}]；按 i 再 j 的顺序找到首个解。`;snapshot(steps,state);return steps;}
 }
 state.phase='return';state.pair=null;state.message='所有不同下标对均已检查，没有解。';snapshot(steps,state);return steps;
}
export function traceHashLookup(nums,target){
 validateComparisonInput(nums,target);
 const map=new Map(),steps=[],state={phase:'start',i:null,needed:null,pair:null,result:null,counts:{lookups:0,writes:0,peakEntries:0},entries:[],message:'从空表开始；这里只存已经走过的值及其下标。'};
 snapshot(steps,state);
 for(let i=0;i<nums.length;i++){
  const needed=target-nums[i];state.i=i;state.needed=needed;state.pair=[i];state.phase='lookup';state.counts.lookups++;
  // One dictionary retrieval. undefined is safe because all stored values are indices.
  const match=map.get(needed);
  state.message=`i = ${i}，需要 ${needed}；一次读取${match===undefined?'未命中':`命中下标 ${match}`}。读取缺失键不会插入。`;snapshot(steps,state);
  if(match!==undefined){state.phase='return';state.result=[match,i];state.pair=[match,i];state.message=`返回 [${match}, ${i}]；表里只含先前下标，不会重复使用当前元素。`;snapshot(steps,state);return steps;}
  map.set(nums[i],i);state.phase='store';state.counts.writes++;state.counts.peakEntries=Math.max(state.counts.peakEntries,map.size);state.entries=[...map];
  state.message=`写入 ${nums[i]} → ${i}；同值再次出现时覆盖旧下标，表中共 ${map.size} 个键。`;snapshot(steps,state);
 }
 state.phase='return';state.pair=null;state.message='已走完数组，没有解。';snapshot(steps,state);return steps;
}
export function compareTwoSum(nums,target){
 validateComparisonInput(nums,target);
 const brute=traceBruteForce(nums,target),hash=traceHashLookup(nums,target),solutions=[];
 // Independent exhaustive oracle; these checks are never added to either model's counters.
 for(let i=0;i<nums.length;i++)for(let j=i+1;j<nums.length;j++)if(nums[i]+nums[j]===target)solutions.push([i,j]);
 const valid=trace=>solutions.length?isValidPair(nums,target,trace.at(-1).result):trace.at(-1).result===null;
 return {nums:[...nums],target,brute,hash,solutions,verified:valid(brute)&&valid(hash)};
}
