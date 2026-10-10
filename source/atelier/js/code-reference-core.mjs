// Content identity only: no article position, private notes, or query parameters.
export const normalizeCode = text => String(text).replace(/\r\n/g, '\n');
export function extractCode(container) {
 const lines = [...container.querySelectorAll('.code .line')];
 return normalizeCode(lines.length ? lines.map(line => line.textContent).join('\n') : (container.querySelector('.code pre, pre')?.textContent || ''));
}
export function validRange(start,end,count=Number.MAX_SAFE_INTEGER) {
 return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 1 && end >= start && end <= count;
}
export function parseCodeReference(hash) {
 if (typeof hash !== 'string' || !hash.startsWith('#cc-code=')) return null;
 const match = /^#cc-code=v1\.([a-f0-9]{64})\.([1-9]\d{0,8})-([1-9]\d{0,8})$/.exec(hash);
 if (!match || !validRange(Number(match[2]),Number(match[3]))) throw new Error('代码引用链接无效。');
 return {version:1,block:match[1],start:Number(match[2]),end:Number(match[3])};
}
export function codeReferenceURL(url,reference) {
 const {block,start,end}=reference;
 if (!/^[a-f0-9]{64}$/.test(block) || !validRange(start,end) || end>999999999) throw new Error('代码引用链接无效。');
 const target=new URL(url);target.search='';target.hash=`cc-code=v1.${block}.${start}-${end}`;
 return target.href;
}
export async function digestCode(code,crypto=globalThis.crypto) {
 if (!crypto?.subtle?.digest) throw new Error('当前浏览器不支持代码引用校验。');
 const bytes=new TextEncoder().encode(normalizeCode(code));
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
}
export function resolveCodeReference(reference,blocks) {
 const matches=blocks.filter(block=>block.digest===reference.block);
 if(matches.length!==1 || !validRange(reference.start,reference.end,matches[0].code.split('\n').length)) throw new Error('代码已变化或无法唯一定位。');
 return matches[0];
}
