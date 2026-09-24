export function articleText(article){
 const nodes=[];let text='';const walker=document.createTreeWalker(article,NodeFilter.SHOW_TEXT,{acceptNode(node){return node.parentElement.closest('button,script,style,[data-reader-exclude]')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;}});
 let node;while(node=walker.nextNode()){nodes.push({node,start:text.length,end:text.length+node.textContent.length});text+=node.textContent;}return {text,nodes};
}
export function textRange(snapshot,start,end){
 const a=snapshot.nodes.find(n=>n.end>start),b=snapshot.nodes.find(n=>n.end>=end&&n.start<end);if(!a||!b)return null;
 const range=document.createRange();range.setStart(a.node,start-a.start);range.setEnd(b.node,end-b.start);return range;
}
export function revealRange(range){const node=range?.startContainer.parentElement;if(!node)return;let parent=node;while(parent){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}node.scrollIntoView({block:'center',behavior:'instant'});}
