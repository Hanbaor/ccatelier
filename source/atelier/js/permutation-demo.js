// Included only in the fingerprint-matched article, never in the global entry graph.
const initialized = new WeakMap();
const styles = new WeakMap();
const LOAD_TIMEOUT_MS = 15000;
function withDeadline(pending, win) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = win.setTimeout(() => reject(new Error('Demo loading timed out')), LOAD_TIMEOUT_MS);
  });
  // The import itself cannot be aborted; only the winning attempt may mount.
  return Promise.race([pending, timeout]).finally(() => win.clearTimeout(timer));
}
function loadStyle(doc) {
  if (styles.has(doc)) return styles.get(doc).ready;
  const record = {ready: null};
  styles.set(doc, record);
  record.ready = new Promise((resolve, reject) => {
    let link, win, timer, settled = false;
    function finish(failed, error) {
      if (settled) return;
      settled = true;
      if (timer !== undefined) win.clearTimeout(timer);
      link?.removeEventListener('load', loaded);
      link?.removeEventListener('error', unavailable);
      if (failed) {
        link?.remove();
        if (styles.get(doc) === record) styles.delete(doc);
        reject(error);
      } else resolve();
    }
    const loaded = () => finish(false);
    const unavailable = () => finish(true, new Error('Stylesheet unavailable'));
    try {
      win = doc.defaultView;
      link = doc.createElement('link');
      link.rel = 'stylesheet'; link.href = new URL('../css/permutation-demo.css', import.meta.url).href;
      link.addEventListener('load', loaded, {once: true});
      link.addEventListener('error', unavailable, {once: true});
      // A shared stylesheet needs its own cleanup even if an import fails first.
      timer = win.setTimeout(() => finish(true, new Error('Stylesheet loading timed out')), LOAD_TIMEOUT_MS);
      doc.head.append(link);
    } catch (error) { finish(true, error); }
  });
  return record.ready;
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
      record.pending = true;
      try {
        const resources = Promise.all([
          new Promise(resolve => resolve(load())),
          new Promise(resolve => resolve(style(host.ownerDocument)))
        ]);
        record.pending = withDeadline(resources, host.ownerDocument.defaultView);
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
