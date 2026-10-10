// Included only in the fingerprint-matched article, never in the global entry graph.
const initialized = new WeakMap();
const styles = new WeakMap();
function loadStyle(doc) {
  if (styles.has(doc)) return styles.get(doc);
  const ready = new Promise((resolve, reject) => {
    const link = doc.createElement('link');
    link.rel = 'stylesheet'; link.href = new URL('../css/permutation-demo.css', import.meta.url).href;
    link.addEventListener('load', resolve, {once: true});
    link.addEventListener('error', () => { link.remove(); styles.delete(doc); reject(new Error('Stylesheet unavailable')); }, {once: true});
    doc.head.append(link);
  });
  styles.set(doc, ready); return ready;
}
export function initPermutationDemo({root = document, load = () => import('./permutation-demo-view.js'), style = loadStyle} = {}) {
  for (const host of root.querySelectorAll('[data-permutation-demo]')) {
    if (initialized.has(host)) continue;
    const status = host.querySelector('[data-permutation-load-status]');
    const record = {pending: null, ready: false, failed: false}; initialized.set(host, record);
    let retry = null, message = null;
    async function open() {
      if (!host.open || record.pending || record.ready || record.failed) return;
      status.hidden = false;
      if (retry) { message.textContent = '正在准备回溯… '; retry.textContent = '准备中…'; retry.setAttribute('aria-disabled', 'true'); }
      else status.textContent = '正在准备回溯…';
      record.pending = Promise.all([load(), style(host.ownerDocument)]);
      try {
        const [module] = await record.pending;
        module.mountPermutationDemo(host);
        if (host.open && retry && host.ownerDocument.activeElement === retry) host.querySelector('[data-permutation-size]')?.focus();
        record.ready = true; status.hidden = true;
      } catch {
        record.failed = true;
        if (!retry) {
          message = host.ownerDocument.createElement('span'); retry = host.ownerDocument.createElement('button');
          retry.type = 'button'; retry.addEventListener('click', () => { if (record.pending) return; record.failed = false; open(); });
          status.replaceChildren(message, retry);
        }
        message.textContent = '演示暂未载入，静态示例仍可阅读。 ';
        retry.textContent = '重试'; retry.removeAttribute('aria-disabled');
      } finally { record.pending = null; }
    }
    host.addEventListener('toggle', open); open();
  }
}
if (typeof document !== 'undefined') initPermutationDemo();
