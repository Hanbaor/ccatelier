const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');

// Actual-module state checks. Synthetic pointer events do not model browser capture delivery.
test('graph drag ends on capture loss, hiding and pause, while new gestures still work',async()=>{
 const dom=new JSDOM('<body data-root="/"><section><canvas tabindex="0"></canvas><div class="constellation-detail"></div><select data-graph-select></select><button data-graph-zoom="in"></button><button data-graph-zoom="out"></button><button data-graph-reset></button></section></body>',{url:'https://example.test/notes/'}),w=dom.window;
 let draws=0,arcs=[],frames=0,hidden=false;
 const ctx={clearRect(){draws++;arcs=[];},arc(x,y,r){if(r>1)arcs.push([x,y,r]);},measureText:text=>({width:Array.from(text).length*7}),fillText(){},setTransform(){},beginPath(){},fill(){},stroke(){},moveTo(){},lineTo(){}};
 w.HTMLCanvasElement.prototype.getContext=()=>ctx;
 w.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({width:800,height:470,left:0,top:0});
 w.HTMLCanvasElement.prototype.setPointerCapture=()=>{};
 Object.defineProperty(w.document,'hidden',{get:()=>hidden});
 Object.assign(globalThis,{window:w,document:w.document,location:w.location,localStorage:w.localStorage,CustomEvent:w.CustomEvent,devicePixelRatio:1,matchMedia:()=>({matches:false,addEventListener(){}}),ResizeObserver:class{observe(){}},requestAnimationFrame:()=>++frames,cancelAnimationFrame(){}});
 const posts=[{path:'/a/',title:'Article A',tags:['topic']},{path:'/b/',title:'Article B',tags:['topic']}];
 let graph;
 try{
  const {motion}=await import('../source/atelier/js/ui.js');motion.enabled=false;
  const {createConstellation}=await import('../source/atelier/js/constellation.js');
  graph=createConstellation(document.querySelector('section'),()=>{});graph.setPosts(posts);
  const canvas=document.querySelector('canvas'),select=document.querySelector('select'),detail=document.querySelector('.constellation-detail');
  const pointer=(type,x,y,buttons=1)=>canvas.dispatchEvent(new w.MouseEvent(type,{clientX:x,clientY:y,buttons}));
  const geometry=()=>JSON.stringify(arcs),selection=()=>select.value+'\n'+detail.innerHTML;
  // The host already delegates pagehide to graph.pause(); keep this lifecycle route.
  const archive=fs.readFileSync(require.resolve('../source/atelier/js/archive.js'),'utf8');
  assert.match(archive,/window\.addEventListener\('pagehide',[^\n]*graph\?\.pause\(\)/);
  const onPageHide=()=>graph.pause();w.addEventListener('pagehide',onPageHide);
  for(const transition of ['pause','hidden','lostpointercapture','pagehide','pointercancel']){
   // Check both background panning and a node gesture pending click/selection.
   for(const target of ['background','node']){
    document.querySelector('[data-graph-reset]').click();
    const [x,y]=target==='node'?arcs[0]:[10,10];pointer('pointerdown',x,y);
    if(transition==='pause'){graph.pause();graph.setPosts(posts);}
    if(transition==='hidden'){hidden=true;document.dispatchEvent(new w.Event('visibilitychange'));hidden=false;document.dispatchEvent(new w.Event('visibilitychange'));}
    if(transition==='lostpointercapture'||transition==='pointercancel')canvas.dispatchEvent(new w.Event(transition));
    if(transition==='pagehide'){w.dispatchEvent(new w.Event('pagehide'));graph.setPosts(posts);}
    const before=geometry(),count=draws,chosen=selection();
    // Tiny movement would otherwise retain click eligibility for stale node drags.
    pointer('pointermove',x+1,y+1,0);pointer('pointerup',x+1,y+1,0);
    assert.equal(geometry(),before,`${transition}/${target}: no stale movement`);
    assert.equal(draws,count,`${transition}/${target}: no stale repaint`);
    assert.equal(selection(),chosen,`${transition}/${target}: no stale selection`);
    // A fresh background drag supports consecutive moves as before.
    const start=arcs.map(a=>[...a]);pointer('pointerdown',10,10);pointer('pointermove',30,20);pointer('pointermove',40,30);pointer('pointerup',40,30,0);
    assert.equal(draws,count+2);assert.equal(arcs[0][0]-start[0][0],30);assert.equal(arcs[0][1]-start[0][1],20);assert.equal(selection(),chosen);
   }
  }
  document.querySelector('[data-graph-reset]').click();
  const [x,y]=arcs[0];pointer('pointerdown',x,y);pointer('pointerup',x,y,0);
  assert.notEqual(select.value,'','ordinary node clicks still select');assert.ok(detail.querySelector('strong'));
  const before=geometry(),count=draws;pointer('pointerdown',x,y);pointer('pointermove',x+20,y+10);pointer('pointerup',x+20,y+10,0);
  assert.notEqual(geometry(),before,'fresh node drags still move');assert.ok(draws>count);
  assert.equal(frames,0);w.removeEventListener('pagehide',onPageHide);
 }finally{graph?.pause();w.close();}
});
