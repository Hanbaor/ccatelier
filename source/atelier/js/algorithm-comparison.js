import {COMPARISON_EXAMPLES,compareTwoSum,parseComparisonInput} from './algorithm-comparison-core.mjs';
const initialized=new WeakSet();
export function initAlgorithmComparison(host){
 if(initialized.has(host))return;
 const doc=host.ownerDocument;
 const el=(tag,text,attrs={})=>{const node=doc.createElement(tag);if(text!==null)node.textContent=text;for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);return node;};
 const body=el('div',null,{class:'algorithm-comparison-body'});
 body.append(el('p','独立教学对照，非上方 C++ 原作：哈希先查再存，缺失键不插入。',{class:'algorithm-demo-note'}));
 const form=el('form',null,{'data-comparison-form':''}),preset=el('select',null,{'data-comparison-preset':''});
 COMPARISON_EXAMPLES.forEach((example,i)=>preset.append(el('option',example.label,{value:String(i)})));
 preset.append(el('option','自定义输入',{value:'custom'}));
 const presetLabel=el('label','试一组输入 ');presetLabel.append(preset);
 const nums=el('input',null,{type:'text',value:'3, 2, 4',maxlength:'200',required:'',spellcheck:'false','data-comparison-nums':''});
 const numsLabel=el('label','数组 nums（2–12 个整数）');numsLabel.append(nums);
 const target=el('input',null,{type:'text',inputmode:'text',value:'6',maxlength:'20',required:'',spellcheck:'false','data-comparison-target':''});
 const targetLabel=el('label','目标 target');targetLabel.append(target);
 const error=el('p','',{role:'status','data-comparison-error':''});
 form.append(presetLabel,numsLabel,targetLabel,el('button','应用并重置',{type:'submit'}),el('p','逗号或空格分隔 · 整数范围 ±10⁹',{class:'algorithm-demo-note'}),error);
 body.append(form);
 const inputSummary=el('p','',{'data-comparison-input':''});body.append(inputSummary);
 const panels=el('div',null,{class:'algorithm-comparison-panels'});body.append(panels);
 const costNote=el('p','计数口径：枚举的一次“数对检查”包含求和与目标比较；哈希分别计一次字典读取、一次字典写入（含覆盖），峰值键数只计表中不同值。不计循环控制、可视化、验证器或内存字节；两种计数不能直接相加比较耗时。',{class:'algorithm-demo-note'});
 const complexityNote=el('p','枚举最坏检查 n(n−1)/2 对，辅助空间 O(1)；哈希按常见哈希表假设为期望 O(n) 时间、O(n) 辅助空间，碰撞严重时可退化为 O(n²)。这里没有测量毫秒，也没有保证哈希在每组小输入上更快。',{class:'algorithm-demo-note'});
 const verification=el('details',null,{class:'algorithm-comparison-verification'}),verificationText=el('p','',{'data-comparison-verification':''});
 verification.append(el('summary','计数说明与结果核对'),costNote,complexityNote,el('p','两侧独立前进，一个事件不代表相同工作量。无解、多解仅用于扩展观察，超出原题的唯一解保证。',{class:'algorithm-demo-note'}),verificationText);body.append(verification);
 function panel(name,key,steps,run){
  const section=el('section',null,{'data-comparison-model':key,'aria-label':name}),title=el('h4',name),state=el('p','',{'data-comparison-state':''}),cells=el('ol',null,{class:'algorithm-comparison-array','aria-label':'数组与下标'});
  run.nums.forEach((value,i)=>cells.append(el('li',`${i}: ${value}`)));
  const counts=el('p','',{'data-comparison-counts':''}),map=key==='hash'?el('p','',{'data-comparison-map':''}):null;
  const message=el('p','',{'data-comparison-message':'','aria-live':'polite','aria-atomic':'true'});
  const controls=el('div',null,{class:'algorithm-demo-controls'}),prev=el('button','上一步',{type:'button','data-comparison-prev':''}),next=el('button','下一步',{type:'button','data-comparison-next':''}),end=el('button','到结果',{type:'button','data-comparison-end':''});
  controls.append(prev,next,end);section.append(title,state,cells,counts);if(map)section.append(map);section.append(message,controls);let index=0;
  function paint(){
   const step=steps[index],c=step.counts;state.textContent=`事件 ${index+1} / ${steps.length} · ${step.phase==='start'?'开始':step.phase==='return'?'结束':step.phase==='check'?'数对检查':step.phase==='lookup'?'字典读取':'字典写入'}`;
   for(let i=0;i<cells.children.length;i++){const active=step.pair?.includes(i);cells.children[i].classList.toggle('is-active',Boolean(active));cells.children[i].setAttribute('aria-label',`下标 ${i}，值 ${run.nums[i]}${active?'，当前检查':''}`);}
   counts.textContent=key==='brute'?`数对检查 ${c.pairChecks} 次`:`字典读取 ${c.lookups} 次 · 写入 ${c.writes} 次 · 峰值 ${c.peakEntries} 个键`;
   if(map)map.textContent=`表（值 → 下标，按首次插入顺序）：${step.entries.length?step.entries.map(([value,i])=>`${value} → ${i}`).join('；'):'空'}`;
   message.textContent=`事件 ${index+1}：${step.message}`;prev.disabled=index===0;next.disabled=index===steps.length-1;end.disabled=next.disabled;
  }
  prev.addEventListener('click',()=>{if(index>0){index--;paint();}});next.addEventListener('click',()=>{if(index<steps.length-1){index++;paint();}});end.addEventListener('click',()=>{index=steps.length-1;paint();});paint();return section;
 }
 function run(input){
  const result=compareTwoSum(input.nums,input.target);inputSummary.textContent=`当前运行：nums = [${input.nums.join(', ')}] · target = ${input.target}。`;
  panels.replaceChildren(panel('枚举 · 按 i、j 顺序','brute',result.brute,result),panel('哈希 · 先查再存','hash',result.hash,result));
  const pairText=pair=>pair?`[${pair.join(', ')}]`:'无解',bc=result.brute.at(-1).counts,hc=result.hash.at(-1).counts;
  verificationText.textContent=`独立穷举核对：${result.verified?'两种结果均有效':'存在不一致'}。全部 ${result.solutions.length} 个有效下标对：${result.solutions.length?result.solutions.map(pairText).join('、'):'无'}。枚举返回 ${pairText(result.brute.at(-1).result)}（${bc.pairChecks} 次数对检查）；哈希返回 ${pairText(result.hash.at(-1).result)}（${hc.lookups} 次读取、${hc.writes} 次写入、峰值 ${hc.peakEntries} 个键）。多解时允许返回不同的有效下标对；无解用 null 表示，不沿用原代码的 [0, 0]。核对器成本不计入两侧。`;
  verification.open=false;error.textContent='';nums.removeAttribute('aria-invalid');target.removeAttribute('aria-invalid');
 }
 for(const field of [nums,target])field.addEventListener('input',()=>{preset.value='custom';});
 form.addEventListener('submit',event=>{event.preventDefault();try{run(parseComparisonInput(nums.value,target.value));}catch(problem){error.textContent=`${problem.message} 当前运行保持不变。`;nums.setAttribute('aria-invalid','true');target.setAttribute('aria-invalid','true');}});
 preset.addEventListener('change',()=>{const example=COMPARISON_EXAMPLES[Number(preset.value)];if(!example)return;nums.value=example.nums.join(', ');target.value=String(example.target);run(example);});
 run(COMPARISON_EXAMPLES[0]);host.append(body);initialized.add(host);
}
