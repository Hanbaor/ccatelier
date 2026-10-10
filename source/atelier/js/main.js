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
import {initStageEngine} from './stage-engine.js';
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
initStageEngine();
initImmersive();

// Global navigation, dialogs and audio coordination are ready before route enhancements.
initRouteFeatures();

// The concert bundle is fetched only when someone actually enters the stage.
if (document.querySelector('[data-live-open]')) {
 let livehouse, entryButton, entryEpoch = 0;
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
  button.hidden = false;
  button.addEventListener('click', async () => {
   cancelEntry();
   if (document.hidden) return;
   const token = entryEpoch;
   entryButton = button;
   button.disabled = true;
   const request = livehouse ||= import('./livehouse.js').then(module => module.initLivehouse());
   try {
    const controller = await request;
    if (token === entryEpoch && !document.hidden) controller.open(button);
   }
   catch {
    if (livehouse === request) livehouse = null;
    if (token === entryEpoch) button.textContent = '载入失败，点击重试';
   }
   finally { if (token === entryEpoch) cancelEntry(); }
  });
 });
}

if (document.querySelector('[data-practice]')) import('./practice.js').then(module => module.initPractice()).catch(() => { document.querySelector('[data-practice]').insertAdjacentText('beforeend','排练室暂未载入，请刷新重试。'); });
