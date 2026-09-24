export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const sessionMemory = new Map();
export const storage = {
  persistent:true,
  get(key) { if(sessionMemory.has(key))return sessionMemory.get(key);try { return localStorage.getItem(key); } catch { this.persistent=false;return null; } },
  set(key, value) { try { localStorage.setItem(key, value);sessionMemory.delete(key);return true; } catch { sessionMemory.set(key,value);this.persistent=false;return false; } }
};
let toastTimer;
export function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2200);
}
export function closeDialogs() { $$('dialog[open]').forEach(dialog => dialog.close()); }
export function openDialog(id) { closeDialogs(); document.getElementById(id)?.showModal(); }
export function initDialogs() {
  document.addEventListener('click', event => {
    const close = event.target.closest('[data-close]');
    if (close) document.getElementById(close.dataset.close)?.close();
    if (event.target.closest('.menu-open')) openDialog('menu-dialog');
    if (event.target.closest('#credits-open')) openDialog('credits-dialog');
    if (event.target.closest('.rhythm-open')) openDialog('rhythm-dialog');
  });
  $$('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  }));
}
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
export const motion = {enabled:false};
export function initSettings() {
  function setMotion(save = false, requested = storage.get('cc-motion') !== 'off' && document.body.dataset.motion !== 'false') {
    motion.enabled = requested && !reduced.matches;
    document.body.classList.toggle('motion-off', !motion.enabled);
    $('.motion-toggle').setAttribute('aria-pressed', String(motion.enabled));
    $('.motion-toggle').setAttribute('aria-label', motion.enabled ? '关闭动效' : '开启动效');
    if (save) storage.set('cc-motion', requested ? 'on' : 'off');
    document.dispatchEvent(new CustomEvent('atelier:motion', {detail:motion.enabled}));
  }
  $('.motion-toggle').addEventListener('click', () => {
    setMotion(true, !motion.enabled);
    toast(reduced.matches ? '已遵循系统的减少动态效果设置' : motion.enabled ? '动效已开启' : '动效已关闭');
  });
  reduced.addEventListener('change', () => setMotion());
  setMotion();
  function setTheme(light, save = false) {
    document.body.classList.toggle('light', light);
    document.body.classList.toggle('light-mode', light);
    document.body.classList.toggle('dark-mode', !light);
    document.documentElement.classList.toggle('dark', !light);
    $('#theme-toggle').setAttribute('aria-pressed', String(light));
    $('#theme-toggle').setAttribute('aria-label', light ? '切换夜间阅读模式' : '切换日间阅读模式');
    $('#theme-toggle svg').innerHTML = light ? '<path d="M20 15.5A8.6 8.6 0 0 1 8.5 4a8.6 8.6 0 1 0 11.5 11.5Z"/>' : '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2 2m11.6 11.6 2 2M4.2 19.8l2-2M17.8 6.2l2-2"/>';
    if (save) storage.set('cc-theme', light ? 'light' : 'dark');
  }
  setTheme(storage.get('cc-theme') === 'light');
  $('#theme-toggle').addEventListener('click', () => setTheme(!document.body.classList.contains('light'), true));
  const section = document.body.dataset.section;
  $$('[data-section-navigation] a').forEach(link => {
    const pathname = new URL(link.href).pathname;
    const active = pathname === document.body.dataset.root + (section === 'gallery' ? 'life' : section) + '/';
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
  });
}
