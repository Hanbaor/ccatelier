import {initDialogs, initSettings} from './ui.js';
import {initCover} from './cover.js';
import {initSearch} from './search.js';
import {initEffects} from './effects.js';
import {initRhythm} from './rhythm.js';
import {initReading} from './reading.js';
import {initBackstage} from './backstage.js';
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
initBackstage();
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
 let livehouse;
 document.querySelectorAll('[data-live-open]').forEach(button => {
  button.hidden = false;
  button.addEventListener('click', async () => {
   button.disabled = true;
   try { livehouse ||= import('./livehouse.js').then(module => module.initLivehouse()); (await livehouse).open(button); }
   catch { livehouse = null; button.textContent = '载入失败，点击重试'; }
   finally { button.disabled = false; }
  });
 });
}

if (document.querySelector('[data-practice]')) import('./practice.js').then(module => module.initPractice()).catch(() => { document.querySelector('[data-practice]').insertAdjacentText('beforeend','排练室暂未载入，请刷新重试。'); });
