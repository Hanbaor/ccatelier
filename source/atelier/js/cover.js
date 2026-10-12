import {$, motion} from './ui.js';

// The personal homepage uses ordinary links. Navigation never waits for a
// curtain, audio, or animation; modified clicks and browser history stay native.
export function initCover() {
  const cover = $('.personal-home'), photograph = $('#cover-photograph');
  if (!cover || !photograph) return;
  const fine = window.matchMedia?.('(hover: hover) and (pointer: fine)');
  let frame = 0, pointerX = 0;
  const eligible = () => motion.enabled && (!fine || fine.matches) && !document.hidden && !document.querySelector('dialog[open]');
  const reset = () => {
    cancelAnimationFrame(frame); frame = 0;
    photograph.style.removeProperty('--portrait-x');
  };
  photograph.addEventListener('pointermove', event => {
    if (!eligible() || event.pointerType !== 'mouse') return;
    pointerX = event.clientX;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!eligible()) { reset(); return; }
      const rect = photograph.getBoundingClientRect();
      if (!(rect.width > 0) || !Number.isFinite(pointerX)) { reset(); return; }
      // Coalesce to the latest position and keep the subtle offset bounded,
      // including resize and pointer-capture events outside the photograph.
      const progress = Math.max(-.5, Math.min(.5, (pointerX - rect.left) / rect.width - .5));
      photograph.style.setProperty('--portrait-x', `${progress * 3}px`);
    });
  }, {passive:true});
  photograph.addEventListener('pointerleave', reset);
  document.addEventListener('atelier:motion', reset);
  document.addEventListener('atelier:dialog-open', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  fine?.addEventListener('change', reset);
  window.addEventListener('blur', reset);
  window.addEventListener('pagehide', reset);
  window.addEventListener('pageshow', reset);
}
