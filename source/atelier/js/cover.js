import {$, motion} from './ui.js';

// The personal homepage uses ordinary links. Navigation never waits for a
// curtain, audio, or animation; modified clicks and browser history stay native.
export function initCover() {
  const cover = $('.personal-home'), photograph = $('#cover-photograph');
  if (!cover || !photograph) return;
  let frame = 0;
  const reset = () => {
    cancelAnimationFrame(frame); frame = 0;
    photograph.style.removeProperty('--portrait-x');
  };
  photograph.addEventListener('pointermove', event => {
    if (!motion.enabled || event.pointerType !== 'mouse' || frame) return;
    frame = requestAnimationFrame(() => {
      const rect = photograph.getBoundingClientRect();
      photograph.style.setProperty('--portrait-x', `${(event.clientX - rect.left - rect.width / 2) / rect.width * 3}px`);
      frame = 0;
    });
  }, {passive:true});
  photograph.addEventListener('pointerleave', reset);
  document.addEventListener('atelier:motion', reset);
  window.addEventListener('pagehide', reset);
  window.addEventListener('pageshow', reset);
}
