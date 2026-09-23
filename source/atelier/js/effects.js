import {$, motion} from './ui.js';
export function initEffects() {
  const ring=$('.cursor-ring'),layer=$('.click-effects');
  const fine=matchMedia('(hover: hover) and (pointer: fine)');
  let frame=0,x=0,y=0;
  function hide(){ring.classList.remove('visible','is-link','is-pressed');cancelAnimationFrame(frame);frame=0;}
  document.addEventListener('pointermove',event=>{
    if(!fine.matches||!motion.enabled||event.pointerType!=='mouse'||document.body.dataset.cursor!=='true')return;
    if(event.target.closest('input,textarea,[contenteditable=true],.article-body p,.article-body pre')){hide();return;}
    x=event.clientX;y=event.clientY;
    ring.classList.add('visible');ring.classList.toggle('is-link',Boolean(event.target.closest('a,button,summary,[role=button]')));
    if(!frame)frame=requestAnimationFrame(()=>{ring.style.transform=`translate3d(${x}px,${y}px,0)`;frame=0;});
  },{passive:true});
  document.addEventListener('pointerdown',event=>{
    if(!motion.enabled||event.button!==0||event.target.closest('input,textarea,[contenteditable=true],dialog'))return;
    if(layer.childElementCount>=12)return;
    if(event.pointerType==='mouse')ring.classList.add('is-pressed');
    const effect=document.createElement('span');effect.className='beat-click';effect.style.left=event.clientX+'px';effect.style.top=event.clientY+'px';
    [24,116,205,298].forEach(angle=>{const spark=document.createElement('i');spark.style.setProperty('--angle',angle+'deg');effect.append(spark);});
    layer.append(effect);setTimeout(()=>effect.remove(),550);
  },{passive:true});
  document.addEventListener('pointerup',()=>ring.classList.remove('is-pressed'),{passive:true});
  document.documentElement.addEventListener('pointerleave',hide);
  window.addEventListener('blur',hide);fine.addEventListener('change',hide);
  document.addEventListener('atelier:motion',()=>{hide();layer.replaceChildren();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){hide();layer.replaceChildren();}});
}
