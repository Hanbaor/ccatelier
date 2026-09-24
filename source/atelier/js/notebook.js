import {$,toast} from './ui.js';
import {vault} from './vault.js';
import {anchorQuote,locateQuote,validateNotebook} from './notebook-core.mjs';
import {element,action,download,readImport,root} from './archive-store.js';
import {makeDialog} from './live-dialog.js';
import {articleText,textRange,revealRange} from './text-anchors.js';
export function initNotebook(){
 const article=$('.article-body');if(!article)return;
 const {dialog,open}=makeDialog('notebook-dialog','页边札记'),editor=element('div','note-editor'),quote=element('blockquote'),textarea=element('textarea'),status=element('p','live-status','选中正文后，留下摘录和自己的想法。批注保存在本机。'),list=element('div','notebook-list'),tools=element('div','live-dialog-tools');let draft=null;
 textarea.maxLength=5000;textarea.rows=4;textarea.placeholder='写下一个念头…';textarea.setAttribute('aria-label','个人批注');
 const save=action('保存这条批注',async()=>{if(!draft)return;save.disabled=true;try{await vault.put('notes',{id:crypto.randomUUID(),path:location.pathname,title:$('[data-article-tools]')?.dataset.title||document.title,...draft,note:textarea.value,updated:Date.now()});draft=null;editor.hidden=true;textarea.value='';await render();status.textContent='已保存到本机资料库。';}catch(error){status.textContent=error.message+'，当前文字仍保留在输入框中。';}finally{save.disabled=false;}});
 editor.append(quote,textarea,save);editor.hidden=true;
 const fileLabel=element('label','live-file-label','导入批注 '),file=element('input');file.type='file';file.accept='.json,application/json';fileLabel.append(file);
 tools.append(action('导出全部批注',async()=>{try{download('cc-notebook.json',JSON.stringify({version:1,notes:await vault.all('notes')},null,2));}catch(error){status.textContent=error.message;}}),fileLabel);
 file.addEventListener('change',async()=>{try{const data=validateNotebook(await readImport(file.files[0],64),root);await vault.merge('notes',data.notes);status.textContent='已合并 '+data.notes.length+' 条批注。';await render();}catch(error){status.textContent=error.message;}file.value='';});
 dialog.append(status,editor,tools,list);
 async function render(){list.replaceChildren();try{const all=await vault.all('notes'),notes=all.filter(n=>n.path===location.pathname).sort((a,b)=>b.updated-a.updated);if(!notes.length)list.append(element('p','live-status','这篇文章还没有札记。'));
   for(const n of notes){const row=element('article','notebook-note'),q=element('blockquote','',n.quote),p=element('p','',n.note),buttons=element('div','live-dialog-tools');buttons.append(action('定位原文',()=>{const snapshot=articleText(article),at=locateQuote(snapshot.text,n);if(at<0){status.textContent='原文已变化或有重复段落，无法可靠定位；摘录仍被保留。';return;}const range=textRange(snapshot,at,at+n.quote.length);dialog.close();if(globalThis.CSS?.highlights&&globalThis.Highlight)CSS.highlights.set('notebook',new Highlight(range));else{const selection=getSelection();selection.removeAllRanges();selection.addRange(range);}revealRange(range);}),action('删除',async()=>{try{await vault.remove('notes',n.id);await render();}catch(error){status.textContent=error.message;}}));row.append(q,p,buttons);list.append(row);}
  }catch(error){status.textContent=error.message+'；当前摘录可以先复制保留。';}}
 const capture=action('＋ 留下札记',()=>{capture.hidden=true;if(!draft)return;quote.textContent=draft.quote;editor.hidden=false;render();open();textarea.focus();},'selection-note');capture.hidden=true;document.body.append(capture);
 // Pointer down on the capture button must not destroy the original selection.
 capture.addEventListener('pointerdown',e=>e.preventDefault());
 let selecting;
 document.addEventListener('selectionchange',()=>{clearTimeout(selecting);selecting=setTimeout(()=>{if(dialog.open)return;const selection=getSelection();if(!selection?.rangeCount||selection.isCollapsed){capture.hidden=true;return;}const range=selection.getRangeAt(0);if(!article.contains(range.startContainer)||!article.contains(range.endContainer)){capture.hidden=true;return;}
   const snapshot=articleText(article),a=snapshot.nodes.find(n=>n.node===range.startContainer),b=snapshot.nodes.find(n=>n.node===range.endContainer);if(!a||!b){capture.hidden=true;return;}
   try{draft=anchorQuote(snapshot.text,a.start+range.startOffset,b.start+range.endOffset);const r=range.getBoundingClientRect();capture.style.left=Math.max(12,Math.min(innerWidth-150,r.left))+'px';capture.style.top=Math.max(12,Math.min(innerHeight-55,r.bottom+9))+'px';capture.hidden=false;}catch{capture.hidden=true;}
  },90);});
 $('[data-notebook-open]')?.addEventListener('click',()=>{editor.hidden=!draft;if(draft)quote.textContent=draft.quote;render();open();});
 window.addEventListener('scroll',()=>{capture.hidden=true;},{passive:true});
}
