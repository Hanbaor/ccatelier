import {motion} from './ui.js';

// A bounded pointer response: no running animation loop or touch parallax.
export function initBackstage() {
  const scene = document.querySelector('[data-backstage-scene]');
  if (!scene) return;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  let frame = 0;
  let point;
  function reset() {
    cancelAnimationFrame(frame);
    frame = 0;
    point = null;
    for (const key of ['--spot-x', '--spot-y', '--portrait-x', '--portrait-y']) scene.style.removeProperty(key);
  }
  scene.addEventListener('pointermove', event => {
    if (!motion.enabled || !finePointer.matches || event.pointerType === 'touch') return;
    const bounds = scene.getBoundingClientRect();
    point = {x:(event.clientX - bounds.left) / bounds.width, y:(event.clientY - bounds.top) / bounds.height};
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      scene.style.setProperty('--spot-x', `${point.x * 100}%`);
      scene.style.setProperty('--spot-y', `${point.y * 100}%`);
      scene.style.setProperty('--portrait-x', `${(point.x - .5) * 7}px`);
      scene.style.setProperty('--portrait-y', `${(point.y - .5) * 4}px`);
    });
  }, {passive:true});
  scene.addEventListener('pointerleave', reset);
  window.addEventListener('blur', reset);
  document.addEventListener('atelier:motion', reset);
  finePointer.addEventListener('change', reset);
}
