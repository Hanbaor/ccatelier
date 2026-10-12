const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');

// Actual-module event/geometry checks; JSDOM does not exercise native browser shortcuts.
test('constellation keyboard ownership preserves modified, composing and previously handled events',async()=>{
 const dom=new JSDOM('<body data-root="/"><section><canvas tabindex="0"></canvas><div class="constellation-detail"></div><select data-graph-select></select><button data-graph-zoom="in"></button><button data-graph-zoom="out"></button><button data-graph-reset></button></section></body>',{url:'https://example.test/notes/'}),w=dom.window;
 let draws=0,arcs=[],frames=0;
 const ctx={clearRect(){draws++;arcs=[];},arc(x,y,r){if(r>1)arcs.push([x,y,r]);},measureText:text=>({width:Array.from(text).length*7}),fillText(){},setTransform(){},beginPath(){},fill(){},stroke(){},moveTo(){},lineTo(){}};
 w.HTMLCanvasElement.prototype.getContext=()=>ctx;
 w.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({width:800,height:470,left:0,top:0});
 Object.assign(globalThis,{window:w,document:w.document,location:w.location,localStorage:w.localStorage,CustomEvent:w.CustomEvent,devicePixelRatio:1,matchMedia:()=>({matches:false,addEventListener(){}}),ResizeObserver:class{observe(){}},requestAnimationFrame:()=>++frames,cancelAnimationFrame(){}});
 let graph;
 try{
  const {motion}=await import('../source/atelier/js/ui.js');motion.enabled=false;
  const {createConstellation}=await import('../source/atelier/js/constellation.js');
  graph=createConstellation(document.querySelector('section'),()=>{});
  graph.setPosts([{path:'/a/',title:'Article A',tags:['topic']},{path:'/b/',title:'Article B',tags:['topic']}]);
  const canvas=document.querySelector('canvas');canvas.focus();assert.equal(document.activeElement,canvas);
  const geometry=()=>JSON.stringify(arcs),keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'];
  // A capture listener models another handler owning the event first.
  const prevent=event=>event.preventDefault();
  for(const key of keys){
   for(const kind of ['ctrlKey','metaKey','altKey','altgraph','isComposing','229','handled']){
    const init={key,bubbles:true,cancelable:true};
    if(['ctrlKey','metaKey','altKey','isComposing'].includes(kind))init[kind]=true;
    if(kind==='229')init.keyCode=229;
    const event=new w.KeyboardEvent('keydown',init);
    if(kind==='altgraph')Object.defineProperty(event,'getModifierState',{value:name=>name==='AltGraph'});
    if(kind==='handled')document.addEventListener('keydown',prevent,{capture:true,once:true});
    const before=geometry(),count=draws;canvas.dispatchEvent(event);
    assert.equal(event.defaultPrevented,kind==='handled',`${kind} ${key}: preserve cancellation ownership`);
    assert.equal(draws,count,`${kind} ${key}: no repaint`);
    assert.equal(geometry(),before,`${kind} ${key}: no pan or zoom`);
   }
  }
  for(const init of [...keys.map(key=>({key})),{key:'+',shiftKey:true},{key:'ArrowRight',repeat:true}]){
   const event=new w.KeyboardEvent('keydown',{...init,bubbles:true,cancelable:true}),before=geometry(),count=draws;
   canvas.dispatchEvent(event);assert.equal(event.defaultPrevented,true,JSON.stringify(init));assert.equal(draws,count+1);assert.notEqual(geometry(),before,JSON.stringify(init));
  }
  for(const key of ['Tab','Escape','a']){
   const event=new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}),before=geometry(),count=draws;
   canvas.dispatchEvent(event);assert.equal(event.defaultPrevented,false);assert.equal(draws,count);assert.equal(geometry(),before);
  }
  for(const ctrlKey of [false,true]){
   const event=new w.WheelEvent('wheel',{ctrlKey,deltaY:-1,cancelable:true}),before=geometry(),count=draws;
   canvas.dispatchEvent(event);assert.equal(event.defaultPrevented,ctrlKey);assert.equal(draws,count+(ctrlKey?1:0));assert.equal(geometry()!==before,ctrlKey);
  }
  for(const direction of ['in','out']){
   const before=geometry(),count=draws;document.querySelector(`[data-graph-zoom="${direction}"]`).click();assert.equal(draws,count+1);assert.notEqual(geometry(),before);
  }
  assert.equal(frames,0,'static graph interactions must not schedule animation');
 }finally{graph?.pause();w.close();}
});
