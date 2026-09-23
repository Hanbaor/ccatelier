import {$, $$, motion, toast, closeDialogs} from './ui.js';

export function initCover() {
  const cover = $('.cover');
  if (!cover) return;
  const photograph = $('#cover-photograph'), img = $('#cover-image'), entry = $('.enter-button');
  const scenes = {
    street:{src:cover.dataset.street,alt:'官方动画剧照：夜晚街头，虹夏站在灯光旁微笑'},
    stage:{src:cover.dataset.stage,alt:'官方动画剧照：虹夏在 STARRY 的鼓组后'}
  };
  let sequence = 0;
  $$('.photo-index [data-scene]').forEach(button => button.addEventListener('click', async () => {
    const token = ++sequence, scene = scenes[button.dataset.scene];
    const candidate = new Image(); candidate.src = scene.src;
    try { await candidate.decode(); } catch { toast('图片暂时无法载入'); return; }
    if (token !== sequence) return;
    if (motion.enabled) { img.style.opacity = '0'; await new Promise(resolve => setTimeout(resolve, 180)); }
    if (token !== sequence) { img.style.opacity = ''; return; }
    img.src = scene.src; img.alt = scene.alt;
    photograph.dataset.scene = button.dataset.scene;
    $$('.photo-index [data-scene]').forEach(item => {
      item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button));
    });
    img.style.opacity = '';
  }));
  let frame = 0;
  cover.addEventListener('pointermove', event => {
    if (!motion.enabled || event.pointerType !== 'mouse' || frame) return;
    frame = requestAnimationFrame(() => {
      const rect = cover.getBoundingClientRect();
      photograph.style.setProperty('--px', ((event.clientX - rect.left) / rect.width - .5) * 2);
      photograph.style.setProperty('--py', ((event.clientY - rect.top) / rect.height - .5) * 2);
      frame = 0;
    });
  }, {passive:true});
  cover.addEventListener('pointerleave', () => {
    cancelAnimationFrame(frame); frame = 0;
    photograph.style.setProperty('--px', 0); photograph.style.setProperty('--py', 0);
  });
  entry.addEventListener('pointermove', event => {
    if (!motion.enabled || event.pointerType !== 'mouse') return;
    const rect = entry.getBoundingClientRect();
    entry.style.setProperty('--mx', `${(event.clientX-rect.left-rect.width/2)*.1}px`);
    entry.style.setProperty('--my', `${(event.clientY-rect.top-rect.height/2)*.1}px`);
  });
  entry.addEventListener('pointerleave', () => { entry.style.setProperty('--mx','0px');entry.style.setProperty('--my','0px'); });
  let leaving = false;
  entry.addEventListener('click', event => {
    if (!motion.enabled || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); if (leaving) return; leaving = true;
    closeDialogs(); $('.curtain').classList.add('active');
    setTimeout(() => location.assign(entry.href), 390);
  });
  window.addEventListener('pageshow', () => { leaving=false;$('.curtain').classList.remove('active'); });
}
