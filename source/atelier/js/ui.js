import {initTheme} from './theme.js';
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const sessionMemory = new Map();
export const storage = {
  persistent:true,
  snapshot(key) { if(sessionMemory.has(key))return {raw:sessionMemory.get(key),available:true};try{return {raw:localStorage.getItem(key),available:true};}catch{this.persistent=false;return {raw:null,available:false};} },
  setMemory(key,value) { sessionMemory.set(key,value);this.persistent=false;return false; },
  get(key) { return this.snapshot(key).raw; },
  set(key, value) { try { localStorage.setItem(key, value);sessionMemory.delete(key);return true; } catch { return this.setMemory(key,value); } }
};
let toastTimer;
export function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 2200);
}
export function closeDialogs() { $$('dialog[open]').forEach(dialog => dialog.close()); }
export function openDialog(id) {
  const dialog=document.getElementById(id);if(!dialog)return;
  closeDialogs();
  document.dispatchEvent(new CustomEvent('atelier:dialog-open',{detail:{id}}));
  dialog.showModal();
}
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
  initTheme({storage,notify:toast});
  const section = document.body.dataset.section === 'practice' ? 'studio' : document.body.dataset.section;
  $$('[data-section-navigation] a').forEach(link => {
    const pathname = new URL(link.href).pathname;
    const active = pathname === document.body.dataset.root + (section === 'gallery' ? 'life' : section) + '/';
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
  });
}
