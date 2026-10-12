const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
// Geometry/interaction harness with deterministic text metrics; this is not browser rendering QA.
function setup(width=360,height=260,metricsOverride=m=>m){
 const dom=new JSDOM('<body><section><canvas></canvas><div class="constellation-detail"></div><select data-graph-select></select><button data-graph-zoom="in"></button><button data-graph-zoom="out"></button><button data-graph-reset></button></section></body>'),w=dom.window,d=w.document,canvas=d.querySelector('canvas');
 let labels=[],measurements=0,frames=0,connections=0;
 const ctx={font:'12px sans-serif',clearRect(){labels=[];},measureText(text){measurements++;const size=Number(this.font.match(/([\d.]+)px/)[1]),width=Array.from(text).reduce((n,c)=>n+size*(c==='i'?.25:/[\u3400-\u9fff]/u.test(c)?1:c==='M'?.95:.6),0);return metricsOverride({width,actualBoundingBoxLeft:.8,actualBoundingBoxRight:width+.4,actualBoundingBoxAscent:size*.85,actualBoundingBoxDescent:size*.25},text);},fillText(text,x,y){const before=measurements;labels.push({text,x,y,font:this.font,metrics:this.measureText(text)});measurements=before;},setTransform(){},beginPath(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){}};
 canvas.getContext=()=>ctx;canvas.getBoundingClientRect=()=>({width,height,left:0,top:0});canvas.setPointerCapture=()=>{};
 const element=(tag,cls,text)=>{const e=d.createElement(tag);e.className=cls||'';e.textContent=text||'';return e;};
 const context={document:d,window:w,motion:{enabled:false},devicePixelRatio:1,$:(s,r=d)=>r.querySelector(s),element,action:(text,fn)=>{const b=element('button','',text);b.onclick=fn;return b;},queueAction(){},createReadingConnections:()=>({select(){connections++;},pause(){}}),buildGraph:posts=>({nodes:posts.map(p=>({id:p.path,label:p.title,kind:p.kind||'post',count:1})),edges:[]}),ResizeObserver:class{observe(){}},requestAnimationFrame:()=>++frames,cancelAnimationFrame(){}};
 let source=fs.readFileSync(path.join(__dirname,'../source/atelier/js/constellation.js'),'utf8').replace(/^import .*;\s*$/gm,'').replace('export function createConstellation','function createConstellation');
 source=source.replace('return {setPosts(next)', 'return {testLayout(points){zoom=1;pan={x:0,y:0};nodes.forEach((n,i)=>{n.x=points[i][0]-width/2;n.y=points[i][1]-height/2;});draw();},setPosts(next)');
 vm.runInNewContext(source+'\nglobalThis.graph=createConstellation(document.querySelector("section"),()=>{});',context);
 return {graph:context.graph,canvas,w,d,get labels(){return labels;},get measurements(){return measurements;},get frames(){return frames;},get connections(){return connections;},select(id){const select=d.querySelector('select');select.value=id;select.dispatchEvent(new w.Event('change'));},close:()=>w.close(),bounds(){for(const l of labels){const m=l.metrics;assert.ok(l.x-m.actualBoundingBoxLeft>=8-1e-6);assert.ok(l.x+m.actualBoundingBoxRight<=width-8+1e-6);assert.ok(l.y-m.actualBoundingBoxAscent>=8-1e-6);assert.ok(l.y+m.actualBoundingBoxDescent<=height-8+1e-6);}}};
}
const article={path:'/a',title:'深入理解图结构与状态恢复：边缘长标题测试及其实际测量和画布边界安全处理'};
test('selected long CJK article stays measured, 14px and inside each canvas edge without touching its ring',()=>{
 const s=setup();try{s.graph.setPosts([article]);s.select('/a');for(const point of [[350,130],[10,130],[180,4],[180,255],[8,8],[352,252]]){s.graph.testLayout([point]);assert.equal(s.labels.length,1);const l=s.labels[0];assert.match(l.font,/14px/);assert.match(l.text,/…$/);s.bounds();const m=l.metrics,x=l.x-m.actualBoundingBoxLeft,y=l.y-m.actualBoundingBoxAscent,dx=point[0]-Math.max(x,Math.min(l.x+m.actualBoundingBoxRight,point[0])),dy=point[1]-Math.max(y,Math.min(l.y+m.actualBoundingBoxDescent,point[1]));assert.ok(Math.hypot(dx,dy)>=12.5);}
 assert.ok(s.measurements>0);assert.equal(s.frames,0);assert.ok(s.connections>=2);
 }finally{s.close();}
});
test('measured proportional widths retain narrow text beyond the old 23 character limit',()=>{
 const s=setup();try{const title='i'.repeat(40);s.graph.setPosts([{...article,title}]);s.graph.testLayout([[25,120]]);s.select('/a');assert.equal(s.labels[0].text,title);s.bounds();}finally{s.close();}
});
test('selected title avoids another node and quiet labels do not expand all article titles',()=>{
 const s=setup();try{s.graph.setPosts([article,{path:'/b',title:'Other article'},{path:'tag:topic',title:'主题',kind:'tag'}]);s.graph.testLayout([[180,130],[240,130],[100,60]]);s.select('/a');assert.equal(s.labels[0].font,'500 14px sans-serif');assert.ok(!s.labels.some(l=>l.text==='Other article'));const l=s.labels[0],m=l.metrics;assert.ok(l.y+m.actualBoundingBoxDescent<126.5||l.y-m.actualBoundingBoxAscent>133.5||l.x+m.actualBoundingBoxRight<236.5||l.x-m.actualBoundingBoxLeft>243.5);s.bounds();s.select('tag:topic');assert.ok(s.labels.every(l=>l.text!=='Other article'));assert.equal(s.labels.filter(l=>l.font.includes('14px')).length,1);assert.equal(s.frames,0);}finally{s.close();}
});
test('truncation preserves grapheme clusters and keyboard pan/zoom repaint safely',()=>{
 const s=setup(150,150);try{const cluster='👩‍💻';s.graph.setPosts([{...article,title:cluster.repeat(20)}]);s.graph.testLayout([[75,75]]);s.select('/a');assert.ok(s.labels.length);const text=s.labels[0].text;assert.match(text,/…$/);assert.equal(text.slice(0,-1).split(cluster).join(''),'');s.bounds();for(const key of ['ArrowLeft','+','-','ArrowUp']){s.canvas.dispatchEvent(new s.w.KeyboardEvent('keydown',{key}));s.bounds();}assert.equal(s.frames,0);}finally{s.close();}
});

test('same-layout repaints reuse bounded measurements and new data clears the cache',()=>{
 const s=setup();try{s.graph.setPosts([article]);s.graph.testLayout([[180,130]]);s.select('/a');const measured=s.measurements;s.graph.testLayout([[180,130]]);assert.equal(s.measurements,measured);s.graph.setPosts([{...article,path:'/new'}]);s.graph.testLayout([[180,130]]);s.select('/new');assert.ok(s.measurements>measured);const source=fs.readFileSync(path.join(__dirname,'../source/atelier/js/constellation.js'),'utf8');assert.match(source,/textMetrics.size>=1024/);assert.match(source,/textMetrics.clear\(\)/);}finally{s.close();}
});

test('non-monotonic ink collision cannot discard a longer, width-fitting label',()=>{
 // Adversarial ink bounds: shorter shaping results are taller. Width stays
 // monotonic, while geometry is deliberately unsuitable for binary search.
 const s=setup(360,260,(metrics,text)=>({...metrics,actualBoundingBoxAscent:text.length<=61?200:metrics.actualBoundingBoxAscent}));
 try{s.graph.setPosts([{...article,title:'i'.repeat(120)},{path:'/left',title:'left'},{path:'/right',title:'right'}]);s.graph.testLayout([[180,130],[125,70],[235,70]]);s.select('/a');assert.equal(s.labels.length,1);assert.ok(s.labels[0].text.length>62,'a colliding middle-length candidate must not rule out the longer candidate above the node');s.bounds();assert.equal(s.frames,0);}finally{s.close();}
});
