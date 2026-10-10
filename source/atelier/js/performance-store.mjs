import {validatePerformance} from './performance-core.mjs';
export const PERFORMANCE_KEY='cc-directed-performance-v1';
export function parsePerformance(text){if(typeof text!=='string'||text.length>500000)throw Error('工程文件过大，最大 500 KB。');return validatePerformance(JSON.parse(text));}
export function savePerformance(storage,project){const text=JSON.stringify(validatePerformance(project));storage.setItem(PERFORMANCE_KEY,text);if(storage.getItem(PERFORMANCE_KEY)!==text)throw Error('工程未能保存，请下载 JSON 备份。');}
export function loadPerformance(storage){const text=storage.getItem(PERFORMANCE_KEY);return text===null?null:parsePerformance(text);}
/** Async text only: callers supply their permitted local reader, never a URL. */
export class PerformanceImport {
 constructor(){this.revision=0;}
 invalidate(){this.revision++;}
 async read(readText){const revision=++this.revision;try{const text=await readText();if(revision!==this.revision)return null;return parsePerformance(text);}catch(error){if(revision!==this.revision)return null;throw error;}}
}
