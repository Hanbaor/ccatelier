import {TWO_SUM_EXAMPLES,traceTwoSum} from './algorithm-demo-core.mjs';
const initialized=new WeakSet();
export function initAlgorithmDemo({root=document}={}){
 for(const host of root.querySelectorAll('[data-algorithm-demo]')){
  if(initialized.has(host))continue;
  const select=host.querySelector('[data-demo-example]'),previous=host.querySelector('[data-demo-prev]'),next=host.querySelector('[data-demo-next]'),state=host.querySelector('[data-demo-state]'),table=host.querySelector('[data-demo-map]'),message=host.querySelector('[data-demo-message]'),position=host.querySelector('[data-demo-position]');
  const doc=host.ownerDocument;let steps=traceTwoSum(TWO_SUM_EXAMPLES[0].nums,6),index=0;
  function paint(){
   const step=steps[index];state.textContent=step.i===null?'i = — · nums[i] = — · target − nums[i] = —':`i = ${step.i} · nums[i] = ${step.value} · target − nums[i] = ${step.needed}`;
   table.replaceChildren();
   for(const [key,value] of step.entries){const row=doc.createElement('tr');for(const text of [key,value]){const cell=doc.createElement('td');cell.textContent=String(text);row.append(cell);}table.append(row);}
   if(!step.entries.length){const row=doc.createElement('tr'),cell=doc.createElement('td');cell.colSpan=2;cell.textContent='空表';row.append(cell);table.append(row);}
   position.textContent=`${index+1} / ${steps.length}`;message.textContent=`第 ${index+1} / ${steps.length} 步：${step.message}`;
   previous.disabled=index===0;next.disabled=index===steps.length-1;
  }
  previous.addEventListener('click',()=>{if(index>0){index--;paint();}});
  next.addEventListener('click',()=>{if(index<steps.length-1){index++;paint();}});
  select.addEventListener('change',()=>{const example=TWO_SUM_EXAMPLES[Number(select.value)];if(!example)return;steps=traceTwoSum(example.nums,example.target);index=0;paint();});
  paint();host.querySelector('[data-demo-controls]').hidden=false;host.querySelector('[data-demo-fallback]').hidden=true;initialized.add(host);
 }
}
