import {initDialogs, initSettings} from './ui.js';
import {initCover} from './cover.js';
import {initSearch} from './search.js';
import {initEffects} from './effects.js';
import {initRhythm} from './rhythm.js';
import {initReading} from './reading.js';
import {initBackstage} from './backstage.js';
import {initCommunity, initModeration} from './community.js';
import {initAfterHours} from './after-hours.js';
import {initArchive} from './archive.js';
import {initQueue} from './queue.js';
import {initReader} from './reader.js';
import {initNotebook} from './notebook.js';
import {initCodeStudio} from './code-studio.js';
import {initOffline} from './offline.js';
import {initStudio} from './studio.js';
import {initStageEngine} from './stage-engine.js';
import {initImmersive} from './immersive.js';
import {initNavigationScenes} from './navigation-scenes.js';

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
initArchive();
initReader();
initNotebook();
initCodeStudio();
initOffline();
initStudio();
initStageEngine();
initImmersive();

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
