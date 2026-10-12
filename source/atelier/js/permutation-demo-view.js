import {tracePermutation} from './permutation-demo-core.mjs';
const mounted = new WeakMap();
const SVG = 'http://www.w3.org/2000/svg';
export function describeStep(step, n) {
  switch (step.phase) {
    case 'enter': return {action: `进入 dfs(${step.step})`, code: step.step === 0 ? 'dfs(0)' : 'dfs(step + 1)'};
    case 'choose': return {action: `选择 ${step.j}，写入 a[${step.step}]`, code: `book[${step.j}] = 1; a[${step.step}] = ${step.j}`};
    case 'skip': return {action: `${step.j} 已选，继续尝试下一个数`, code: `book[${step.j}] != 0`};
    case 'emit': return {action: `输出 ${step.a.join('')}`, code: 'step == n → printf'};
    case 'return': return {action: step.step === null ? 'dfs(0) 已返回' : `返回 dfs(${step.step})，所选数字尚未解除标记`, code: step.returnedStep === n ? 'return' : '函数结束，返回调用处'};
    case 'release': return {action: `解除 ${step.j} 的标记，a 中的旧值保留`, code: `book[${step.j}] = 0`};
    default: return {action: '遍历完成，所有标记已解除', code: 'dfs(0) 完成'};
  }
}
function makeTree(doc, model) {
  const width = model.n === 4 ? 720 : 420, height = 188;
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`); svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('permutation-tree'); svg.style.minWidth = `${width}px`;
  const leaves = model.nodes.filter(node => node.depth === model.n), positions = new Map(), elements = new Map();
  leaves.forEach((node, index) => positions.set(node.id, {x: 16 + index * (width - 32) / (leaves.length - 1), y: 166}));
  for (const node of model.nodes.slice().reverse()) {
    if (positions.has(node.id)) continue;
    const children = model.nodes.filter(child => child.parentId === node.id).map(child => positions.get(child.id));
    positions.set(node.id, {x: children.reduce((sum, child) => sum + child.x, 0) / children.length, y: 20 + node.depth * 146 / model.n});
  }
  for (const node of model.nodes) {
    const {x, y} = positions.get(node.id), group = doc.createElementNS(SVG, 'g');
    if (node.parentId !== null) {
      const parent = positions.get(node.parentId), edge = doc.createElementNS(SVG, 'path');
      edge.setAttribute('d', `M${parent.x},${parent.y} C${parent.x},${(parent.y+y)/2} ${x},${(parent.y+y)/2} ${x},${y}`);
      edge.classList.add('permutation-edge'); group.append(edge);
    }
    const dot = doc.createElementNS(SVG, 'circle'); dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', '3'); group.append(dot);
    const label = doc.createElementNS(SVG, 'text'); label.setAttribute('x', x); label.setAttribute('y', y - 8); label.textContent = node.depth ? String(node.path.at(-1)) : '∅'; group.append(label);
    svg.append(group); elements.set(node.id, group);
  }
  return {svg, paint(step, index) {
    for (const node of model.nodes) {
      const group = elements.get(node.id), selected = node.depth <= step.prefixLength && node.path.every((value, i) => step.a[i] === value);
      group.dataset.visited = String(node.enteredAt <= index);
      group.dataset.active = String(selected); group.dataset.current = String(node.id === step.nodeId);
      group.dataset.returning = String(step.phase === 'return' && node.id === step.returnedNodeId);
    }
  }};
}
export function mountPermutationDemo(host) {
  if (mounted.has(host)) return mounted.get(host);
  const doc = host.ownerDocument, win = doc.defaultView, app = host.querySelector('[data-permutation-app]');
  app.innerHTML = `<div class="permutation-heading"><label>排列 <select data-permutation-size aria-label="排列规模"><option value="2">1 · 2</option><option value="3" selected>1 · 2 · 3</option><option value="4">1 · 2 · 3 · 4</option></select></label><span data-permutation-count></span></div>
    <div class="permutation-state"><div class="permutation-slot-label">a <span>亮起的是有效前缀 · 淡字保留初值或旧值</span></div><div class="permutation-slots" data-permutation-slots></div><div class="permutation-book" data-permutation-book></div></div>
    <div class="permutation-action"><strong data-permutation-action></strong><code data-permutation-code></code><span class="permutation-stack" data-permutation-stack></span></div>
    <div class="permutation-tree-window" data-permutation-tree></div>
    <div class="permutation-transport"><button type="button" data-permutation-prev aria-label="上一步">←</button><button type="button" data-permutation-play>播放</button><button type="button" data-permutation-next aria-label="下一步">→</button><output data-permutation-position></output></div>
    <input class="permutation-timeline" data-permutation-seek type="range" min="0" value="0" step="1" aria-label="回溯时间轴">
    <div class="permutation-output"><span>已输出</span><ol data-permutation-results aria-label="此刻已输出的排列"></ol><span data-permutation-empty>尚未抵达叶节点</span></div>
    <p class="sr-only" data-permutation-live role="status" aria-live="polite" aria-atomic="true"></p>`;
  const find = name => app.querySelector(`[data-permutation-${name}]`);
  const select = find('size'), seek = find('seek'), play = find('play'), previous = find('prev'), next = find('next');
  const reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  let model, index = 0, tree, timer = null, playing = false;
  const motionOff = () => Boolean(reduced?.matches || doc.body.classList.contains('motion-off') || doc.body.dataset.motion === 'false');
  function announce() { const s = model.steps[index]; find('live').textContent = `第 ${index + 1} / ${model.steps.length} 步。${describeStep(s, model.n).action}。有效前缀 ${s.a.slice(0, s.prefixLength).join('、') || '空'}。`; }
  function stop(speak = false) { playing = false; if (timer !== null) win.clearTimeout(timer); timer = null; play.textContent = '播放'; play.setAttribute('aria-pressed', 'false'); if (speak) announce(); }
  function paint(speak = false) {
    const step = model.steps[index], description = describeStep(step, model.n);
    seek.value = index; seek.setAttribute('aria-valuetext', `第 ${index + 1} / ${model.steps.length} 步，${description.action}`);
    find('position').textContent = `${index + 1} / ${model.steps.length}`;
    find('count').textContent = `${step.results.length} / ${model.totalResults} 个结果`;
    find('action').textContent = description.action; find('code').textContent = description.code;
    find('stack').textContent = step.stack.length ? step.stack.map(depth => `dfs(${depth})`).join(' › ') : '调用栈已清空';
    find('slots').replaceChildren(...step.a.map((value, slot) => {
      const cell = doc.createElement('span'); cell.className = 'permutation-slot'; cell.dataset.active = String(slot < step.prefixLength);
      cell.setAttribute('aria-label', `a[${slot}] = ${value}，${slot < step.prefixLength ? '有效前缀' : '不在有效前缀中'}`);
      const number = doc.createElement('b'), label = doc.createElement('small'); number.textContent = value; label.textContent = `a[${slot}]`; cell.append(number, label); return cell;
    }));
    find('book').replaceChildren(...step.book.map((used, slot) => {
      const chip = doc.createElement('span'); chip.dataset.used = String(Boolean(used)); chip.textContent = `${slot + 1} ${used ? '已选' : '可选'}`; chip.setAttribute('aria-label', `book[${slot + 1}] = ${used}`); return chip;
    }));
    const resultList = find('results');
    while (resultList.children.length > step.results.length) resultList.lastElementChild.remove();
    for (let i = 0; i < step.results.length; i++) {
      const result = step.results[i];
      if (!resultList.children[i]) {
        const item = doc.createElement('li'), button = doc.createElement('button');
        button.type = 'button'; button.textContent = result.values.join(''); button.setAttribute('aria-label', `回看输出 ${result.values.join('、')}`);
        button.addEventListener('click', () => go(result.at)); item.append(button); resultList.append(item);
      }
      resultList.children[i].dataset.latest = String(step.phase === 'emit' && result.at === index);
    }
    find('empty').hidden = step.results.length > 0; tree.paint(step, index);
    previous.disabled = index === 0; next.disabled = index === model.steps.length - 1;
    play.disabled = motionOff() || index === model.steps.length - 1;
    play.title = motionOff() ? '减少动态已开启；可逐步操作或拖动时间轴' : '';
    if (speak) announce();
  }
  function reset(n) { stop(); model = tracePermutation(n); index = 0; seek.max = model.steps.length - 1; tree = makeTree(doc, model); find('tree').replaceChildren(tree.svg); find('results').replaceChildren(); paint(); }
  function go(position, speak = true) { stop(); index = Math.max(0, Math.min(model.steps.length - 1, Number(position) || 0)); paint(speak); }
  function tick() {
    if (!playing || !host.open || doc.hidden || motionOff()) { stop(); return; }
    index++; paint(model.steps[index].phase === 'emit');
    if (index === model.steps.length - 1) { stop(true); return; }
    timer = win.setTimeout(tick, 650);
  }
  previous.addEventListener('click', () => go(index - 1)); next.addEventListener('click', () => go(index + 1));
  seek.addEventListener('input', () => go(seek.value, false)); seek.addEventListener('change', announce);
  select.addEventListener('change', () => { const n = Number(select.value); if (![2, 3, 4].includes(n)) return; reset(n); announce(); });
  play.addEventListener('click', () => {
    if (playing) { stop(true); return; }
    if (!host.open || doc.hidden || motionOff() || index === model.steps.length - 1) return;
    playing = true; play.textContent = '暂停'; play.setAttribute('aria-pressed', 'true'); timer = win.setTimeout(tick, 650);
  });
  host.addEventListener('toggle', () => { if (!host.open) stop(); });
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) stop(); }); win.addEventListener('pagehide', () => stop());
  const motionChanged = () => { if (motionOff()) stop(); paint(); };
  reduced?.addEventListener('change', motionChanged); doc.addEventListener('atelier:motion', motionChanged);
  reset(3); app.hidden = false; host.querySelector('[data-permutation-fallback]').hidden = true;
  const controller = {get index() { return index; }, get playing() { return playing; }};
  mounted.set(host, controller); return controller;
}
