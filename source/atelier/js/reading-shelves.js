import {storage} from './ui.js';
import {createShelfStore} from './reading-state.mjs';
// One protected store across initial and lazy readers, including quota fallbacks.
export const shelves=createShelfStore(storage);
