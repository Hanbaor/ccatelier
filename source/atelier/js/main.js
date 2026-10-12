import {initDialogs, initSettings} from './ui.js';
import {initCover} from './cover.js';
import {initSearch} from './search.js';
import {initEffects} from './effects.js';
import {initRhythm} from './rhythm.js';
import {initReading} from './reading.js';
import {initCommunity, initModeration} from './community.js';
import {initAfterHours} from './after-hours.js';
import {initQueue} from './queue.js';
import {initOffline} from './offline.js';
import {initImmersive} from './immersive.js';
import {initNavigationScenes} from './navigation-scenes.js';
import {initRouteFeatures} from './route-features.js';

initSettings();
initDialogs();
initNavigationScenes();
initCover();
initSearch();
initEffects();
initRhythm();
initReading();
initCommunity();
initModeration();
initAfterHours();
initQueue();
initOffline();
initImmersive();

// Global navigation, dialogs and audio coordination are ready before route enhancements.
initRouteFeatures();

// The concert bundle is fetched only when someone actually enters the stage.
if (document.querySelector('[data-live-open]')) {
 let livehouse, entryButton, entryEpoch = 0, refreshRequired = false;
 const refreshButtons = new WeakSet();
 const markRefresh = button => {
  button.textContent = '现场暂未就绪，刷新页面';
  refreshButtons.add(button);
 };
 const recoverOpen = (button, token) => {
  const dialog = document.querySelector('#livehouse-dialog');
  if (!dialog?.open) return;
  const current = () => token === entryEpoch && !document.hidden;
  if (current()) {
   button.disabled = false;
   try { dialog.close(); } catch { /* Keep an in-dialog recovery if closing fails. */ }
   if (!dialog.open) {
    if (current()) button.focus({preventScroll:true});
    return;
   }
  }
  // A partial modal can hide the outside entrance. Keep Refresh reachable inside.
  let reload = dialog.querySelector('[data-live-reload]');
  if (!reload) {
   reload = document.createElement('button');
   reload.type = 'button';
   reload.className = 'live-show';
   reload.dataset.liveReload = '';
   reload.textContent = '现场暂未就绪，刷新页面';
   reload.addEventListener('click', () => window.location.reload());
   (dialog.querySelector('.livehouse-transport') || dialog).prepend(reload);
  }
  if (current()) reload.focus({preventScroll:true});
 };
 const loadLivehouse = () => {
  let timer, initializing = false;
  const pending = import('./livehouse.js');
  const timeout = new Promise((_, reject) => {
   timer = window.setTimeout(() => reject(new Error('Livehouse import timed out')), 15000);
  });
  // Only the winning pure import may initialize; import itself cannot be aborted.
  return Promise.race([pending, timeout]).finally(() => window.clearTimeout(timer)).then(module => {
   initializing = true;
   return module.initLivehouse();
  }).catch(error => {
   // Initialization may have bound listeners already; it is not safe to repeat.
   if (initializing) refreshRequired = true;
   throw error;
  });
 };
 // A finished import may be reused, but an abandoned entrance must not reopen UI.
 const cancelEntry = () => {
  entryEpoch++;
  if (entryButton) entryButton.disabled = false;
  entryButton = null;
 };
 document.addEventListener('atelier:dialog-open', cancelEntry);
 document.addEventListener('visibilitychange', () => { if (document.hidden) cancelEntry(); });
 window.addEventListener('pagehide', cancelEntry);
 document.querySelectorAll('[data-live-open]').forEach(button => {
  const originalContents = [...button.childNodes];
  button.hidden = false;
  button.addEventListener('click', async () => {
   cancelEntry();
   if (document.hidden) return;
   if (refreshRequired) {
    if (refreshButtons.has(button)) window.location.reload();
    else markRefresh(button);
    return;
   }
   // Reattach the original nodes, preserving entrance artwork and its listeners.
   button.replaceChildren(...originalContents);
   const token = entryEpoch;
   entryButton = button;
   button.disabled = true;
   const request = livehouse ||= loadLivehouse();
   let initialized = false;
   try {
    const controller = await request;
    initialized = true;
    if (token === entryEpoch && !document.hidden) controller.open(button);
   }
   catch {
    // An open failure can also leave partial UI; retain the initialized controller.
    if (initialized) { refreshRequired = true; recoverOpen(button, token); }
    if (!refreshRequired && livehouse === request) livehouse = null;
    if (token === entryEpoch) {
     if (refreshRequired) markRefresh(button);
     else button.textContent = '载入失败，点击重试';
    }
   }
   finally { if (token === entryEpoch) cancelEntry(); }
  });
 });
}
