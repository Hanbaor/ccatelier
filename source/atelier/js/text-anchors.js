// Only Hexo's line-number cell is decoration; prose and real code may also use
// classes such as gutter or line and must keep their text (including digits).
function codeGutter(node){
 const cell=node.parentElement.closest('figure.highlight > table > tbody > tr > td.gutter');
 return cell?.nextElementSibling?.matches('td.code')&&cell.querySelector(':scope > pre');
}
// Legacy extraction is only for exact matching of existing notebook anchors.
export function articleText(article,{legacyCodeGutter=false}={}){
 const nodes=[];let text='';const walker=document.createTreeWalker(article,NodeFilter.SHOW_TEXT,{acceptNode(node){return (node.parentElement.closest('button,script,style,[data-reader-exclude]')||(!legacyCodeGutter&&codeGutter(node)))?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;}});
 let node;while(node=walker.nextNode()){nodes.push({node,start:text.length,end:text.length+node.textContent.length});text+=node.textContent;}return {text,nodes};
}
export function textRange(snapshot,start,end){
 const a=snapshot.nodes.find(n=>n.end>start),b=snapshot.nodes.find(n=>n.end>=end&&n.start<end);if(!a||!b)return null;
 const range=document.createRange();range.setStart(a.node,start-a.start);range.setEnd(b.node,end-b.start);return range;
}
export function revealRange(range){const node=range?.startContainer.parentElement;if(!node)return;let parent=node;while(parent){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}node.scrollIntoView({block:'center',behavior:'instant'});}
