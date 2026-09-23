import {$, $$, openDialog, toast} from './ui.js';

export function initReading() {
  const article=$('.article-body');if(!article)return;
  // Redefine's server-side filter supplies .code-container and language labels.
  $$('.code-container',article).forEach(container=>{
    const button=document.createElement('button');button.type='button';button.className='copy-code';button.textContent='复制';button.setAttribute('aria-label','复制代码');
    button.addEventListener('click',async()=>{
      const lines=$$('.code .line',container);
      const code=lines.length?lines.map(line=>line.textContent).join('\n'):($('pre',container)?.textContent||'');
      try {
        if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(code);button.textContent='已复制';setTimeout(()=>button.textContent='复制',1700);
      } catch {toast('暂时无法自动复制，请选中代码复制');}
    });container.append(button);
  });
  const imageDialog=$('#image-dialog');let imageOpener=null;
  $$('img',article).forEach(image=>{
    if(image.closest('a'))return;
    image.dataset.zoom='true';image.tabIndex=0;image.setAttribute('role','button');image.setAttribute('aria-label',`放大图片：${image.alt||'文章图片'}`);
    function show(){imageOpener=image;const large=$('img',imageDialog);large.src=image.currentSrc||image.src;large.alt=image.alt; $('figcaption',imageDialog).textContent=image.alt;openDialog('image-dialog');}
    image.addEventListener('click',show);
    image.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();show();}});
  });
  imageDialog.addEventListener('close',()=>imageOpener?.focus({preventScroll:true}));
  const links=$$('.reading-toc a');
  const sections=links.map(link=>{try{return document.getElementById(decodeURIComponent(link.hash.slice(1)));}catch{return null;}});
  let frame=0;
  function update(){
    const distance=document.documentElement.scrollHeight-innerHeight;
    $('.reading-progress>span').style.transform=`scaleX(${distance>0?Math.max(0,Math.min(1,scrollY/distance)):0})`;
    let active=0;sections.forEach((section,index)=>{if(section&&section.getBoundingClientRect().top<120)active=index;});
    links.forEach((link,index)=>{if(index===active)link.setAttribute('aria-current','true');else link.removeAttribute('aria-current');});frame=0;
  }
  window.addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(update);},{passive:true});window.addEventListener('resize',update,{passive:true});update();
  const toc=$('.reading-toc details');if(toc&&matchMedia('(max-width:1000px)').matches)toc.open=false;
  // Reuse Redefine's tabs handler; add keyboard navigation to the same semantic tabs.
  if($('.tabs',article)) {
    import(document.body.dataset.root+'js/plugins/tabs.js').then(module=>module.default()).catch(()=>{
      $$('.tabs .tab-pane',article).forEach(pane=>{pane.hidden=false;});
      $$('.tabs [role=tablist]',article).forEach(list=>{list.hidden=true;});
      toast('标签页已展开为完整内容');
    });
    article.addEventListener('keydown',event=>{
      const tab=event.target.closest('[role=tab]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      const tabs=$$('[role=tab]',tab.closest('[role=tablist]'));let next=tabs.indexOf(tab);
      if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else next=(next+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      event.preventDefault();tabs[next].focus();tabs[next].click();
    });
  }
}
