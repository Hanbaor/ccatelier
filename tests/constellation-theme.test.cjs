const test=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const markup='<section><canvas></canvas><div class="constellation-detail"></div><select data-graph-select></select><button data-graph-zoom="in"></button><button data-graph-zoom="out"></button><button data-graph-reset></button></section>';
const posts=[{path:'/a/',title:'Article A',tags:['set'],group:'writing'},{path:'/b/',title:'Article B',tags:['set'],group:'writing'}];

test('settled constellation repaints theme colors once without simulation or RAF and skips inactive/hidden states',async()=>{
 const dom=new JSDOM('<body class="light" data-root="/">'+markup+'</body>',{url:'https://example.test/notes/',pretendToBeVisual:true});
 let hidden=false,requests=0,frameId=0,draws=0,labels=[];const pending=new Map();
 const ctx={fillStyle:'',clearRect(){draws++;labels=[];},fillText(text,x,y){labels.push({text,x,y,color:this.fillStyle});},setTransform(){},beginPath(){},arc(){},fill(){},moveTo(){},lineTo(){},stroke(){}};
 Object.defineProperty(dom.window.document,'hidden',{configurable:true,get:()=>hidden});
 dom.window.HTMLCanvasElement.prototype.getContext=()=>ctx;
 dom.window.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({width:800,height:470,left:0,top:0});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,location:dom.window.location,localStorage:dom.window.localStorage,CustomEvent:dom.window.CustomEvent,devicePixelRatio:1,matchMedia:()=>({matches:false,addEventListener(){}}),ResizeObserver:class{observe(){}},requestAnimationFrame:callback=>{requests++;pending.set(++frameId,callback);return frameId;},cancelAnimationFrame:id=>pending.delete(id)});
 const settle=()=>{let iterations=0;while(pending.size){assert.ok(iterations++<1000);const [id,callback]=pending.entries().next().value;pending.delete(id);callback();}};
 const theme=light=>{document.body.classList.toggle('light',light);document.dispatchEvent(new CustomEvent('atelier:theme',{detail:{light}}));};
 const positions=()=>labels.map(({text,x,y})=>({text,x,y}));
 const colors=expected=>{assert.ok(labels.length);assert.ok(labels.every(label=>label.color===expected));};
 try{
  const {motion}=await import('../source/atelier/js/ui.js');motion.enabled=true;
  const {createConstellation}=await import('../source/atelier/js/constellation.js'),host=document.querySelector('section'),graph=createConstellation(host,()=>{});
  theme(true);assert.equal(draws,0,'no paint before graph activation');
  graph.setPosts(posts);settle();colors('#413b32');assert.equal(pending.size,0);
  const original=positions(),before=draws,scheduled=requests;theme(false);
  assert.equal(draws,before+1);assert.equal(requests,scheduled);assert.equal(pending.size,0);assert.deepEqual(positions(),original,'theme paint does not move nodes');colors('#e0d7c6');
  theme(true);assert.equal(draws,before+2);assert.equal(requests,scheduled);assert.deepEqual(positions(),original);colors('#413b32');
  graph.pause();const paused=draws;theme(false);assert.equal(draws,paused);assert.equal(requests,scheduled);
  graph.setPosts(posts);settle();colors('#e0d7c6');assert.deepEqual(positions(),original);
  host.hidden=true;const concealed=draws,concealedRequests=requests;theme(true);assert.equal(draws,concealed);assert.equal(requests,concealedRequests);
  host.hidden=false;graph.setPosts(posts);settle();colors('#413b32');
  hidden=true;document.dispatchEvent(new window.Event('visibilitychange'));const background=draws,backgroundRequests=requests;theme(false);assert.equal(draws,background);assert.equal(requests,backgroundRequests);
  hidden=false;document.dispatchEvent(new window.Event('visibilitychange'));settle();colors('#e0d7c6');assert.deepEqual(positions(),original);assert.equal(pending.size,0);
  motion.enabled=false;const reducedRequests=requests;theme(true);colors('#413b32');assert.equal(requests,reducedRequests);assert.deepEqual(positions(),original);
  graph.pause();
 }finally{dom.window.close();}
});
