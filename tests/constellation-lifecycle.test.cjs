const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
function setup(enabled=false){
 const dom=new JSDOM('<body><section><canvas></canvas><div class="constellation-detail"></div><select data-graph-select></select><button data-graph-zoom="in"></button><button data-graph-zoom="out"></button><button data-graph-reset></button></section></body>');
 const w=dom.window,d=w.document,canvas=d.querySelector('canvas'),raf=new Map(),motion={enabled},stats={simulations:0,draws:0};let hidden=false,id=0,resize,width=800;
 Object.defineProperty(d,'hidden',{get:()=>hidden});
 canvas.getContext=()=>new Proxy({measureText:text=>({width:Array.from(text).length*7}),clearRect:()=>stats.draws++},{get:(o,k)=>o[k]||(()=>{})});canvas.getBoundingClientRect=()=>({width,height:470,left:0,top:0});canvas.setPointerCapture=()=>{};
 const element=(tag,cls,text)=>{const e=d.createElement(tag);e.className=cls||'';e.textContent=text||'';return e;};
 const context={document:d,window:w,motion,stats,devicePixelRatio:1,$:(s,r=d)=>r.querySelector(s),element,action:(text,fn)=>{const b=element('button','',text);b.addEventListener('click',fn);return b;},queueAction(){},createReadingConnections:()=>({select(){},pause(){}}),buildGraph:posts=>({nodes:posts.map(p=>({id:p.path,label:p.title,kind:'post'})),edges:[]}),ResizeObserver:class{constructor(fn){resize=fn;}observe(){}},requestAnimationFrame:fn=>{raf.set(++id,fn);return id;},cancelAnimationFrame:id=>raf.delete(id)};
 const source=fs.readFileSync(path.join(__dirname,'../source/atelier/js/constellation.js'),'utf8').replace(/^import .*;\s*$/gm,'').replace('export function createConstellation','function createConstellation').replace('function simulate(){','function simulate(){stats.simulations++;').replace('function draw(){','function draw(){stats.positions=nodes.map(n=>({x:n.x,y:n.y}));');
 vm.runInNewContext(source+'\nglobalThis.graph=createConstellation(document.querySelector("section"),()=>{});',context);
 return {w,d,canvas,raf,stats,graph:context.graph,close:()=>w.close(),visibility(value){hidden=value;d.dispatchEvent(new w.Event('visibilitychange'));},motion(value){motion.enabled=value;d.dispatchEvent(new w.Event('atelier:motion'));},resize(value){width=value;resize();},settle(){let frames=0;while(raf.size){assert.ok(++frames<1000);const tasks=[...raf.values()];raf.clear();tasks.forEach(fn=>fn());}return frames;}};
}
const posts=Array.from({length:20},(_,i)=>({path:'/'+i,title:'Post '+i}));
test('reduced-motion graph consumes its finite static budget without replay on resume or same-data entry',()=>{
 const s=setup();try{
  s.graph.setPosts(posts);assert.equal(s.stats.simulations,180);assert.equal(s.raf.size,0);const positions=JSON.stringify(s.stats.positions),draws=s.stats.draws;
  s.visibility(true);s.visibility(false);s.graph.pause();s.graph.setPosts(posts);
  assert.equal(s.stats.simulations,180);assert.equal(JSON.stringify(s.stats.positions),positions);assert.ok(s.stats.draws>draws);assert.equal(s.raf.size,0);
  s.motion(true);assert.ok(s.settle()<=1);assert.equal(s.stats.simulations,180);assert.equal(JSON.stringify(s.stats.positions),positions);
 }finally{s.close();}
});
test('static graph still repaints resize and interactions, and new data explicitly reheats the layout',()=>{
 const s=setup();try{
  s.graph.setPosts(posts);const initial=s.stats.simulations,draws=s.stats.draws;s.resize(600);assert.ok(s.stats.draws>draws);assert.equal(s.stats.simulations,initial);assert.equal(s.raf.size,0);
  const n=s.stats.positions[0],x=300+n.x,y=235+n.y;
  s.canvas.dispatchEvent(new s.w.MouseEvent('pointerdown',{clientX:x,clientY:y}));s.canvas.dispatchEvent(new s.w.MouseEvent('pointermove',{clientX:x+20,clientY:y+10}));s.canvas.dispatchEvent(new s.w.Event('pointerup'));
  assert.equal(s.stats.simulations,initial+80);assert.equal(s.raf.size,0);assert.ok(Math.abs(s.stats.positions[0].x-(n.x+20))<1e-6);
  s.visibility(true);s.visibility(false);assert.equal(s.stats.simulations,initial+80);
  s.graph.setPosts([...posts,{path:'/new',title:'New'}]);assert.equal(s.stats.simulations,initial+80+180);assert.equal(s.stats.positions.length,21);assert.equal(s.raf.size,0);
  s.motion(true);s.settle();assert.equal(s.stats.simulations,initial+80+180);
  s.graph.setPosts(posts);assert.equal(s.settle(),240);assert.equal(s.stats.simulations,initial+80+180+240);
 }finally{s.close();}
});
test('switching off animation consumes the remaining budget once while animated resume retains unfinished work',()=>{
 const s=setup(true);try{
  s.graph.setPosts(posts);s.visibility(true);assert.equal(s.raf.size,0);s.visibility(false);assert.equal(s.settle(),240);assert.equal(s.stats.simulations,240);
  s.graph.setPosts(posts.slice(1));s.motion(false);assert.equal(s.stats.simulations,420);assert.equal(s.raf.size,0);s.motion(true);assert.ok(s.settle()<=1);assert.equal(s.stats.simulations,420);
 }finally{s.close();}
});
