import {motion} from './ui.js';

const controllers = new WeakMap();

// Navigation always belongs to the anchors. This small enhancement only swaps
// their companion illustration, once the requested image is ready to paint.
export function initNavigationScenes(root = document) {
  const dialog = root.querySelector('#menu-dialog');
  const frame = dialog?.querySelector('[data-menu-scene-frame]');
  const nav = dialog?.querySelector('[data-section-navigation]');
  if (!frame || !nav) return null;
  if (controllers.has(dialog)) return controllers.get(dialog);

  const doc = dialog.ownerDocument;
  const view = doc.defaultView;
  const hover = view.matchMedia('(hover: hover) and (pointer: fine)');
  const reduced = view.matchMedia('(prefers-reduced-motion: reduce)');
  let current = frame.querySelector('img');
  if (!current) return null;
  let active = frame.dataset.scene;
  let requested = active;
  let generation = 0;
  let outgoing = null;
  let cleanupTimer = null;
  let keyboardIntent = true;
  let destroyed = false;

  const canAnimate = () => motion.enabled && !reduced.matches && !doc.body.classList.contains('motion-off');
  function finishTransition() {
    if (cleanupTimer !== null) view.clearTimeout(cleanupTimer);
    cleanupTimer = null;
    outgoing?.remove();
    outgoing = null;
    current.classList.remove('is-entering');
  }

  function interrupt() {
    generation++;
    requested = active;
    finishTransition();
  }

  async function preview(link) {
    const key = link?.dataset.menuScene;
    if (destroyed || !dialog.open || doc.hidden || !key || key === requested) return;
    const ticket = ++generation;
    requested = key;
    if (key === active) return;

    const image = doc.createElement('img');
    image.className = 'menu-scene-image';
    image.alt = link.dataset.sceneAlt || '';
    image.width = Number(link.dataset.sceneWidth);
    image.height = Number(link.dataset.sceneHeight);
    image.decoding = 'async';
    image.loading = 'eager';
    image.sizes = '(max-width:600px) 40vw, 440px';
    // The datasets are inert until an actual hover or keyboard focus. Do not
    // preload the remaining eight scenes merely because the menu was opened.
    try {
      const ready = typeof image.decode === 'function' ? null : new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
      if (link.dataset.sceneSrcset) image.srcset = link.dataset.sceneSrcset;
      image.src = link.dataset.sceneSrc;
      if (ready) await ready;
      else await image.decode();
    } catch {
      if (ticket === generation) requested = active;
      return; // A failed scene never removes the last usable illustration.
    } finally {
      image.onload = null;
      image.onerror = null;
    }
    if (destroyed || ticket !== generation || !dialog.open || doc.hidden) return;

    finishTransition();
    const previous = current;
    current = image;
    active = key;
    frame.dataset.scene = key;
    if (canAnimate()) {
      // Only the current scene is exposed to assistive technology. The fading
      // layer is purely visual and is removed after one bounded transition.
      previous.setAttribute('aria-hidden', 'true');
      previous.alt = '';
      previous.classList.add('is-leaving');
      image.classList.add('is-entering');
      outgoing = previous;
      frame.append(image);
      cleanupTimer = view.setTimeout(finishTransition, 420);
    } else {
      previous.replaceWith(image);
    }
  }

  const sceneLink = target => target?.closest?.('a[data-menu-scene]');
  function onPointerOver(event) {
    if (!hover.matches || event.pointerType === 'touch') return;
    const link = sceneLink(event.target);
    if (!link || !nav.contains(link) || link.contains(event.relatedTarget)) return;
    preview(link);
  }
  function onPointerDown(event) { keyboardIntent = event.pointerType !== 'touch'; }
  function onKeyDown(event) {
    if (!event.metaKey && !event.ctrlKey && !event.altKey) keyboardIntent = true;
  }
  function onFocus(event) {
    if (!keyboardIntent) return;
    const link = sceneLink(event.target);
    if (link && nav.contains(link)) preview(link);
  }
  function onMotion() { if (!canAnimate()) finishTransition(); }
  function onVisibility() { if (doc.hidden) interrupt(); }
  function onAnimationEnd(event) {
    if (event.target === current && event.animationName === 'menu-scene-arrive') finishTransition();
  }

  nav.addEventListener('pointerover', onPointerOver);
  dialog.addEventListener('pointerdown', onPointerDown);
  dialog.addEventListener('keydown', onKeyDown);
  nav.addEventListener('focusin', onFocus);
  dialog.addEventListener('close', interrupt);
  frame.addEventListener('animationend', onAnimationEnd);
  doc.addEventListener('atelier:motion', onMotion);
  doc.addEventListener('visibilitychange', onVisibility);
  reduced.addEventListener('change', onMotion);
  view.addEventListener('pagehide', interrupt);

  const controller = {destroy() {
    if (destroyed) return;
    destroyed = true;
    interrupt();
    nav.removeEventListener('pointerover', onPointerOver);
    dialog.removeEventListener('pointerdown', onPointerDown);
    dialog.removeEventListener('keydown', onKeyDown);
    nav.removeEventListener('focusin', onFocus);
    dialog.removeEventListener('close', interrupt);
    frame.removeEventListener('animationend', onAnimationEnd);
    doc.removeEventListener('atelier:motion', onMotion);
    doc.removeEventListener('visibilitychange', onVisibility);
    reduced.removeEventListener('change', onMotion);
    view.removeEventListener('pagehide', interrupt);
    controllers.delete(dialog);
  }};
  controllers.set(dialog, controller);
  return controller;
}
