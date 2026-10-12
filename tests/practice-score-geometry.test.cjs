'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const sharp = require('sharp');
const css = fs.readFileSync(path.join(__dirname, '../source/atelier/css/practice.css'), 'utf8');

// JSDOM validates generated vector geometry, not browser layout or audio timing.
// Sharp provides a static SVG raster check; it is not a real-browser screenshot.
async function fixture(t) {
  const dom = new JSDOM('<!doctype html><body></body>');
  const saved = new Map();
  for (const [key, value] of Object.entries({document:dom.window.document, matchMedia:()=>({matches:false,addEventListener(){}})})) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {configurable:true,writable:true,value});
  }
  t.after(() => {
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const {renderPracticeBar} = await import('../source/atelier/js/practice.js');
  const hits = Array.from({length:16}, (_,step) => ['kick','snare','hat','tom'].map(type=>({step,type,velocity:1}))).flat();
  return renderPracticeBar({hits}, 0).querySelector('svg');
}
const number = (element, name) => Number(element.getAttribute(name));
function withinBox(box, width, height) {
  assert.ok(box[0] > 0 && box[1] > 0 && box[2] < width && box[3] < height, `clipped bounds: ${box}`);
}

test('densest legal practice bar retains note, stem and grid clearance on every edge', async t => {
  const svg = await fixture(t);
  const [x,y,width,height] = svg.getAttribute('viewBox').split(' ').map(Number);
  assert.deepEqual([x,y], [0,0]);
  assert.equal(svg.querySelectorAll('.practice-note').length,64);
  for (const line of svg.querySelectorAll('line')) {
    const pad = line.closest('.practice-note') ? .6 : .275;
    withinBox([Math.min(number(line,'x1'),number(line,'x2'))-pad,Math.min(number(line,'y1'),number(line,'y2'))-pad,
      Math.max(number(line,'x1'),number(line,'x2'))+pad,Math.max(number(line,'y1'),number(line,'y2'))+pad],width,height);
  }
  for (const head of svg.querySelectorAll('ellipse')) {
    // A circle enclosing the ellipse remains safe at every rotation angle.
    const radius=Math.max(number(head,'rx'),number(head,'ry'))+.6;
    withinBox([number(head,'cx')-radius,number(head,'cy')-radius,number(head,'cx')+radius,number(head,'cy')+radius],width,height);
  }
  for (const head of svg.querySelectorAll('.practice-note path')) {
    const match=head.getAttribute('d').match(/^M([\d.]+) ([\d.]+)l7 7m-7 0 7-7$/);
    assert.ok(match,'review geometry when the cross-note shape changes');
    withinBox([Number(match[1])-.6,Number(match[2])-.6,Number(match[1])+7.6,Number(match[2])+7.6],width,height);
  }
  const counts=[...svg.querySelectorAll('.practice-count')];
  assert.equal(counts.length,16);
  assert.deepEqual(counts.map(n=>n.textContent),['1','e','&','a','2','e','&','a','3','e','&','a','4','e','&','a']);
  for (const count of counts) withinBox([number(count,'x')-5,number(count,'y')-9,number(count,'x')+5,number(count,'y')+3],width,height);
  assert.equal(svg.querySelectorAll('image,foreignObject,animate,animateTransform').length,0);
});

test('every sixteenth-note cursor cell has full clearance and covers its count center', async t => {
  const svg=await fixture(t), cursor=svg.querySelector('.practice-cursor');
  const [, ,width,height]=svg.getAttribute('viewBox').split(' ').map(Number);
  const cellWidth=number(cursor,'width'), first=number(cursor,'x');
  [...svg.querySelectorAll('.practice-count')].forEach((count,step)=>{
    const left=first+step*cellWidth;
    assert.equal(left+cellWidth/2,number(count,'x'));
    withinBox([left,number(cursor,'y'),left+cellWidth,number(cursor,'y')+number(cursor,'height')],width,height);
  });
});

test('static vector raster retains clear edges from narrow content width to 4x scale', async t => {
  const svg=await fixture(t);
  // Resolve only this isolated score's theme tokens, using the production rules.
  const selectors=['practice-staff','practice-note','practice-count'];
  const styles=selectors.map(name=>css.match(new RegExp(`\\.${name} \\{[^}]+\\}`))[0]).join('\n')
    .replaceAll('var(--muted)','#666').replaceAll('var(--ink)','#111').replaceAll('var(--sans)','sans-serif');
  svg.querySelector('.practice-cursor').remove();
  const style=svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg','style');style.textContent=styles;svg.prepend(style);
  svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
  for (const width of [272,340,680,1360]) {
    svg.setAttribute('width',width);svg.setAttribute('height',width*130/340);
    const {data,info}=await sharp(Buffer.from(svg.outerHTML)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let ink=0;
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++) {
      const alpha=data[(y*info.width+x)*info.channels+info.channels-1];
      if(alpha) ink++;
      if(x===0||y===0||x===info.width-1||y===info.height-1) assert.equal(alpha,0,`${width}px raster touches its viewport edge`);
    }
    assert.ok(ink>width,'score remains visible at each raster scale');
  }
});

test('score layout remains fluid and motion preferences suppress decorative transitions', () => {
  assert.match(css,/\.practice-sheet \{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.practice-measure \{[^}]*width:100%;min-width:0/);
  assert.match(css,/\.practice-measure svg \{[^}]*width:100%;height:auto/);
  assert.match(css,/@media\(max-width:600px\)[\s\S]*?\.practice-sheet \{grid-template-columns:1fr/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\) \{\.practice-measure,\.practice-beats i \{transition:none\}\}/);
  assert.match(css,/\.motion-off \.practice-measure,\.motion-off \.practice-beats i \{transition:none\}/);
  assert.match(css,/\.practice-cursor \{[^}]*visibility:hidden/);
  assert.match(css,/\.practice-measure\.is-current \.practice-cursor \{visibility:visible\}/);
});
