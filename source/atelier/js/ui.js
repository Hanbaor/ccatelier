import {initTheme} from './theme.js';
export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const IMPORT_TIMEOUT_MS = 15000;
export function withImportDeadline(pending, win=window) {
 let timer;
 const timeout=new Promise((_,reject)=>{
  timer=win.setTimeout(()=>reject(new Error('Import timed out')),IMPORT_TIMEOUT_MS);
 });
 // Imports cannot be aborted. Only the winning import may enter initialization.
 return Promise.race([pending,timeout]).finally(()=>win.clearTimeout(timer));
}
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
const dialogDocuments = new WeakSet();
export function initDialogs() {
  if (dialogDocuments.has(document)) return;
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
  dialogDocuments.add(document);
  // Reveal the enhanced control only after all dialog bindings succeed. A
  // missing module, unsupported dialog API, or failed setup keeps native links.
  const menu = $('#menu-dialog'), trigger = $('.menu-open');
  const fallback = $('.menu-fallback'), navigation = $('#site-navigation');
  if (menu && trigger && fallback && navigation && typeof menu.showModal === 'function' && typeof menu.close === 'function') {
    function enhanceNavigation() {
      // Do not remove the focused native link/region when a slow module arrives.
      const active = document.activeElement;
      if (window.location.hash === '#site-navigation') {
        if (navigation.hidden) document.addEventListener('focusout', afterFocus);
        fallback.hidden = false;
        navigation.hidden = false;
        // A later fragment visit (including Back/Forward) can address the
        // native destination after the enhanced menu has already appeared.
        if (menu.open) {
          menu.close();
          navigation.focus();
        } else if (active === trigger) navigation.focus();
        trigger.hidden = true;
        return;
      }
      if (fallback === active || navigation.contains(active)) return;
      trigger.hidden = false;
      fallback.hidden = true;
      navigation.hidden = true;
      document.removeEventListener('focusout', afterFocus);
      // Keep the hash binding: history may address the native region again.
    }
    function afterFocus() { queueMicrotask(enhanceNavigation); }
    document.addEventListener('focusout', afterFocus);
    window.addEventListener('hashchange', enhanceNavigation);
    enhanceNavigation();
  }
}
export const motion = {enabled:false};
export function initSettings() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
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
