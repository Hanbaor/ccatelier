import {$,motion} from './ui.js';
import {buildGraph} from './archive-core.mjs';
import {element,action,queueAction} from './archive-store.js';
import {createReadingConnections} from './reading-connections.js';

export function createConstellation(host,onTag,{articleHref=path=>path,readingConnections={}}={}){
 const canvas=$('canvas',host),ctx=canvas.getContext('2d'),detail=$('.constellation-detail',host),select=$('[data-graph-select]',host);
 const connections=createReadingConnections(host,{...readingConnections,articleHref});
 let nodes=[],edges=[],posts=[],selected='',neighbors=new Set(),frame=0,steps=0,active=false,width=800,height=470,pan={x:0,y:0},zoom=1,drag=null,signature='';
 const textMetrics=new Map();
 const graphemes=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
 const position=n=>({x:width/2+pan.x+n.x*zoom,y:height/2+pan.y+n.y*zoom});
 function resize(){const r=canvas.getBoundingClientRect();if(!r.width)return;width=r.width;height=r.height;const d=Math.min(devicePixelRatio||1,2);canvas.width=width*d;canvas.height=height*d;ctx?.setTransform(d,0,0,d,0,0);draw();}
 function draw(){if(!ctx)return;ctx.clearRect(0,0,width,height);const light=document.body.classList.contains('light');
  ctx.fillStyle=light?'#a39a8130':'#d2cbb220';for(let x=20;x<width;x+=32)for(let y=20;y<height;y+=32){ctx.beginPath();ctx.arc(x,y,.65,0,Math.PI*2);ctx.fill();}
  edges.forEach(e=>{const a=position(e.a),b=position(e.b),hot=selected&&(e.a.id===selected||e.b.id===selected);ctx.strokeStyle=hot?'#e5b95dbb':selected?'#887b6820':'#a99a7240';ctx.lineWidth=hot?1.3:.7;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();});
  const stars=nodes.map(n=>({n,p:position(n),r:n.kind==='tag'?6+Math.min(6,Math.sqrt(n.count)):3.5}));
  stars.forEach(({n,p,r})=>{const isTag=n.kind==='tag',hot=n.id===selected||neighbors.has(n.id);ctx.globalAlpha=selected&&!hot?.22:1;ctx.fillStyle=isTag?'#eac065':n.group==='hot100'?'#ad8466':'#d78c76';ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();if(light){ctx.strokeStyle='#805000';ctx.lineWidth=1;ctx.stroke();}if(n.id===selected){ctx.strokeStyle=light?'#805000':'#efc66c';ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x,p.y,r+6,0,Math.PI*2);ctx.stroke();}});
  // Label only themes and the chosen article. Reserve its space before quiet labels.
  const occupied=[];
  stars.filter(({n})=>n.kind==='tag'||n.id===selected).sort((a,b)=>(b.n.id===selected)-(a.n.id===selected)).forEach(star=>{
   const {n,p,r}=star,chosen=n.id===selected,hot=chosen||neighbors.has(n.id),size=chosen?14:12;
   if(p.x<0||p.x>width||p.y<0||p.y>height)return;
   ctx.font=(chosen?'500 ':'')+size+'px sans-serif';ctx.textAlign='left';ctx.textBaseline='alphabetic';
   const units=n.labelUnits??=(graphemes?Array.from(graphemes.segment(n.label),s=>s.segment):Array.from(n.label)),pad=8,gap=r+(chosen?6:0)+6;
   const measure=text=>{
    const key=ctx.font+'\0'+text;if(textMetrics.has(key))return textMetrics.get(key);
    const m=ctx.measureText(text),metric={width:Math.max(m.width,m.actualBoundingBoxRight??0)+(m.actualBoundingBoxLeft??0),left:m.actualBoundingBoxLeft??0,ascent:Math.max(size*.85,m.actualBoundingBoxAscent??0),descent:Math.max(size*.25,m.actualBoundingBoxDescent??0)};
    // Repaints reuse glyph measurements; cap storage even across repeated selections.
    if(textMetrics.size>=1024)textMetrics.delete(textMetrics.keys().next().value);
    textMetrics.set(key,metric);return metric;
   };
   const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
   let best=null;
   for(const side of ['right','left','above','below']){
    const layout=count=>{
     const text=units.slice(0,count).join('')+(count<units.length?'…':''),m=measure(text),h=m.ascent+m.descent;
     if(m.width>Math.min(chosen?300:200,width-2*pad)||h>height-2*pad)return null;
     const x=side==='right'?p.x+gap:side==='left'?p.x-gap-m.width:Math.max(pad,Math.min(width-pad-m.width,p.x-m.width/2));
     const y=side==='above'?p.y-gap-h:side==='below'?p.y+gap:Math.max(pad,Math.min(height-pad-h,p.y-h/2));
     const box={x,y,w:m.width,h};
     if(x<pad||x+m.width>width-pad||y<pad||y+h>height-pad||occupied.some(b=>overlap(box,b)))return null;
     if(stars.some(other=>{const radius=other.r+(other.n.id===selected?6:0)+3;const dx=other.p.x-Math.max(x,Math.min(x+m.width,other.p.x)),dy=other.p.y-Math.max(y,Math.min(y+h,other.p.y));return dx*dx+dy*dy<radius*radius;}))return null;
     return {text,x:x+m.left,y:y+m.ascent,box,count};
    };
    let candidate=layout(units.length);
    if(candidate){best=candidate;break;}
    const available=Math.min(chosen?300:200,side==='right'?width-pad-p.x-gap:side==='left'?p.x-gap-pad:width-2*pad);
    // Only available text width is a binary-search predicate. Collision checks
    // use bounded candidates because ink bounds/placement need not be monotonic.
    let low=1,high=units.length-1,count=0;
    while(low<=high){const mid=Math.floor((low+high)/2),text=units.slice(0,mid).join('')+'…';if(measure(text).width<=available){count=mid;low=mid+1;}else high=mid-1;}
    for(const length of new Set([count,count-1,Math.floor(count*.75),Math.floor(count*.5),Math.floor(count*.25),1])){
     if(length<1||length>count)continue;candidate=layout(length);if(candidate)break;
    }
    if(candidate&&(!best||candidate.count>best.count))best=candidate;
    if(best?.count===units.length)break;
   }
   if(best){ctx.globalAlpha=selected&&!hot?.22:1;ctx.fillStyle=light?'#413b32':'#e0d7c6';ctx.fillText(best.text,best.x,best.y);occupied.push(best.box);}
  });ctx.globalAlpha=1;
 }
 function simulate(){
  for(const n of nodes){n.fx=-n.x*.002;n.fy=-n.y*.002;}
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=nodes[i],b=nodes[j],dx=a.x-b.x||.01,dy=a.y-b.y||.01,d2=dx*dx+dy*dy+30,f=Math.min(2,160/d2);a.fx+=dx*f;a.fy+=dy*f;b.fx-=dx*f;b.fy-=dy*f;}
  for(const {a,b} of edges){const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,f=(d-75)*.012/d;a.fx+=dx*f;a.fy+=dy*f;b.fx-=dx*f;b.fy-=dy*f;}
  for(const n of nodes){if(drag?.node===n)continue;n.vx=(n.vx+n.fx)*.72;n.vy=(n.vy+n.fy)*.72;n.x+=Math.max(-8,Math.min(8,n.vx));n.y+=Math.max(-8,Math.min(8,n.vy));}
 }
 function tick(){frame=0;if(!active||host.hidden||document.hidden)return;if(steps>0){simulate();steps--;}draw();if(steps>0&&motion.enabled)frame=requestAnimationFrame(tick);}
 function wake(count=100){steps=count;cancelAnimationFrame(frame);frame=0;if(!motion.enabled){for(let i=0;i<Math.min(count,180);i++)simulate();steps=0;draw();}else if(active&&!document.hidden)frame=requestAnimationFrame(tick);}
 function choose(id){connections.select(posts,posts.some(p=>p.path===id)?id:'');selected=id;neighbors=new Set([id]);for(const e of edges){if(e.a.id===id)neighbors.add(e.b.id);if(e.b.id===id)neighbors.add(e.a.id);}select.value=id;detail.replaceChildren();const n=nodes.find(n=>n.id===id);if(!n){detail.append(element('span','','选择一颗星，循着关联继续阅读。'));draw();return;}
  detail.append(element('strong','',n.label));
  if(n.kind==='tag'){detail.append(element('span','',n.count+' 篇关联文章'),action('浏览这个主题 ↗',()=>onTag(n.label)));}
  else{const p=posts.find(p=>p.path===id),link=element('a','','开始阅读 ↗');link.href=articleHref(p.path);detail.append(link,action('＋ 阅读队列',()=>queueAction({type:'add',item:p})));}
  detail.append(action('聚焦',()=>{pan={x:-n.x*zoom,y:-n.y*zoom};draw();}));draw();
 }
 function hit(x,y){let closest=null,distance=22;for(const n of nodes){const p=position(n),d=Math.hypot(x-p.x,y-p.y);if(d<distance){closest=n;distance=d;}}return closest;}
 function local(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
 canvas.addEventListener('pointerdown',e=>{const p=local(e);drag={...p,startX:p.x,startY:p.y,node:hit(p.x,p.y),moved:false};canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!drag)return;const p=local(e),dx=p.x-drag.x,dy=p.y-drag.y;drag.moved ||= Math.hypot(p.x-drag.startX,p.y-drag.startY)>4;if(drag.node){drag.node.x+=dx/zoom;drag.node.y+=dy/zoom;wake(80);}else{pan.x+=dx;pan.y+=dy;}drag.x=p.x;drag.y=p.y;draw();});
 canvas.addEventListener('pointerup',()=>{if(drag&&!drag.moved)choose(drag.node?.id||'');drag=null;});canvas.addEventListener('pointercancel',()=>{drag=null;});canvas.addEventListener('lostpointercapture',()=>{drag=null;});
 function scale(factor){zoom=Math.max(.25,Math.min(3,zoom*factor));draw();}
 canvas.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();scale(e.deltaY<0?1.1:.9);},{passive:false});
 canvas.addEventListener('keydown',e=>{if(e.defaultPrevented||e.isComposing||e.keyCode===229||e.ctrlKey||e.metaKey||e.altKey||e.getModifierState?.('AltGraph'))return;const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'];if(!keys.includes(e.key))return;e.preventDefault();if(e.key==='+'||e.key==='=')scale(1.15);else if(e.key==='-')scale(.85);else{pan.x+=e.key==='ArrowLeft'?30:e.key==='ArrowRight'?-30:0;pan.y+=e.key==='ArrowUp'?30:e.key==='ArrowDown'?-30:0;draw();}});
 $('[data-graph-zoom=in]',host).addEventListener('click',()=>scale(1.2));$('[data-graph-zoom=out]',host).addEventListener('click',()=>scale(.8));$('[data-graph-reset]',host).addEventListener('click',()=>{zoom=Math.min(1,width/780);pan={x:0,y:0};choose('');});select.addEventListener('change',()=>choose(select.value));
 new ResizeObserver(resize).observe(canvas);document.addEventListener('visibilitychange',()=>{if(document.hidden){drag=null;cancelAnimationFrame(frame);frame=0;}else if(active)wake(steps);});document.addEventListener('atelier:motion',()=>{if(active)wake(steps);});
 // Theme changes also need a paint after the finite layout animation has settled.
 // Reuse positions; do not restart the simulation or schedule an animation loop.
 document.addEventListener('atelier:theme',()=>{if(active&&!host.hidden&&!document.hidden)draw();});
 if(!ctx){canvas.hidden=true;detail.textContent='此浏览器使用列表模式，请在下方选择文章或主题。';}
 return {setPosts(next){active=true;const key=next.map(p=>p.path).join('|');if(signature===key){connections.select(posts,posts.some(p=>p.path===selected)?selected:'');const link=$('a',detail);if(link)link.href=articleHref(selected);resize();wake(steps);return;}signature=key;textMetrics.clear();posts=next;const g=buildGraph(posts);nodes=g.nodes.map((n,i)=>{const angle=i*2.399963,r=Math.sqrt(i+1)*21;return {...n,x:Math.cos(angle)*r,y:Math.sin(angle)*r,vx:0,vy:0};});const lookup=new Map(nodes.map(n=>[n.id,n]));edges=g.edges.map(e=>({a:lookup.get(e.source),b:lookup.get(e.target)}));select.replaceChildren(element('option','','选择文章或主题'));select.firstChild.value='';nodes.filter(n=>n.kind==='tag').concat(nodes.filter(n=>n.kind==='post')).forEach(n=>{const o=element('option','',(n.kind==='tag'?'# ':'')+n.label);o.value=n.id;select.append(o);});pan={x:0,y:0};resize();zoom=Math.min(1,width/780);choose('');wake(240);},pause(){drag=null;connections.pause();active=false;cancelAnimationFrame(frame);frame=0;}};
}
