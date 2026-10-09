import {motion} from './ui.js';

// Reveal a section once as it enters view. Native scrolling and links remain
// untouched, and content stays visible without JavaScript or reduced motion.
export function initImmersive() {
  const elements=[...document.querySelectorAll('[data-reveal]')];
  if (!elements.length) return;
  let observer;
  function update() {
    observer?.disconnect();
    if (!motion.enabled || !('IntersectionObserver' in window)) {
      document.body.classList.remove('immersive-motion');
      elements.forEach(el=>el.classList.add('is-visible'));
      return;
    }
    document.body.classList.add('immersive-motion');
    observer=new IntersectionObserver(entries=>{
      for (const entry of entries) if(entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    },{threshold:.08,rootMargin:'0px 0px 30px 0px'});
    elements.forEach(el=>{if(!el.classList.contains('is-visible'))observer.observe(el);});
  }
  update();
  document.addEventListener('atelier:motion',update);
  window.addEventListener('pagehide',()=>observer?.disconnect());
  window.addEventListener('pageshow',event=>{if(event.persisted)update();});
}
