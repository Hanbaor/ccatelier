import {$,motion} from './ui.js';
import {buildGraph} from './archive-core.mjs';
import {element,action,queueAction} from './archive-store.js';

export function createConstellation(host,onTag){
 const canvas=$('canvas',host),ctx=canvas.getContext('2d'),detail=$('.constellation-detail',host),select=$('[data-graph-select]',host);
 let nodes=[],edges=[],posts=[],selected='',neighbors=new Set(),frame=0,steps=0,active=false,width=800,height=470,pan={x:0,y:0},zoom=1,drag=null,signature='';
 const position=n=>({x:width/2+pan.x+n.x*zoom,y:height/2+pan.y+n.y*zoom});
 function resize(){const r=canvas.getBoundingClientRect();if(!r.width)return;width=r.width;height=r.height;const d=Math.min(devicePixelRatio||1,2);canvas.width=width*d;canvas.height=height*d;ctx?.setTransform(d,0,0,d,0,0);draw();}
 function draw(){if(!ctx)return;ctx.clearRect(0,0,width,height);const light=document.body.classList.contains('light');
  ctx.fillStyle=light?'#a39a8130':'#d2cbb220';for(let x=20;x<width;x+=32)for(let y=20;y<height;y+=32){ctx.beginPath();ctx.arc(x,y,.65,0,Math.PI*2);ctx.fill();}
  edges.forEach(e=>{const a=position(e.a),b=position(e.b),hot=selected&&(e.a.id===selected||e.b.id===selected);ctx.strokeStyle=hot?'#e5b95dbb':selected?'#887b6820':'#a99a7240';ctx.lineWidth=hot?1.3:.7;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();});
  nodes.forEach(n=>{const p=position(n),isTag=n.kind==='tag',hot=n.id===selected||neighbors.has(n.id),r=isTag?6+Math.min(6,Math.sqrt(n.count)):3.5;ctx.globalAlpha=selected&&!hot?.22:1;ctx.fillStyle=isTag?'#eac065':n.group==='hot100'?'#ad8466':'#d78c76';ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();if(n.id===selected){ctx.strokeStyle='#efc66c';ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x,p.y,r+6,0,Math.PI*2);ctx.stroke();}
   if(isTag||n.id===selected||hot){ctx.font=(isTag?'11':'10')+'px sans-serif';ctx.fillStyle=light?'#413b32':'#e0d7c6';const label=n.label.length>23?n.label.slice(0,23)+'…':n.label;ctx.fillText(label,p.x+r+6,p.y+4);}
  });ctx.globalAlpha=1;
 }
 function simulate(){
  for(const n of nodes){n.fx=-n.x*.002;n.fy=-n.y*.002;}
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=nodes[i],b=nodes[j],dx=a.x-b.x||.01,dy=a.y-b.y||.01,d2=dx*dx+dy*dy+30,f=Math.min(2,160/d2);a.fx+=dx*f;a.fy+=dy*f;b.fx-=dx*f;b.fy-=dy*f;}
  for(const {a,b} of edges){const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,f=(d-75)*.012/d;a.fx+=dx*f;a.fy+=dy*f;b.fx-=dx*f;b.fy-=dy*f;}
  for(const n of nodes){if(drag?.node===n)continue;n.vx=(n.vx+n.fx)*.72;n.vy=(n.vy+n.fy)*.72;n.x+=Math.max(-8,Math.min(8,n.vx));n.y+=Math.max(-8,Math.min(8,n.vy));}
 }
 function tick(){frame=0;if(!active||host.hidden||document.hidden)return;if(steps>0){simulate();steps--;}draw();if(steps>0&&motion.enabled)frame=requestAnimationFrame(tick);}
 function wake(count=100){steps=count;cancelAnimationFrame(frame);frame=0;if(!motion.enabled){for(let i=0;i<Math.min(count,180);i++)simulate();draw();}else if(active&&!document.hidden)frame=requestAnimationFrame(tick);}
 function choose(id){selected=id;neighbors=new Set([id]);for(const e of edges){if(e.a.id===id)neighbors.add(e.b.id);if(e.b.id===id)neighbors.add(e.a.id);}select.value=id;detail.replaceChildren();const n=nodes.find(n=>n.id===id);if(!n){detail.append(element('span','','选择一颗星，循着关联继续阅读。'));draw();return;}
  detail.append(element('strong','',n.label));
  if(n.kind==='tag'){detail.append(element('span','',n.count+' 篇关联文章'),action('浏览这个主题 ↗',()=>onTag(n.label)));}
  else{const p=posts.find(p=>p.path===id),link=element('a','','开始阅读 ↗');link.href=p.path;detail.append(link,action('＋ 阅读队列',()=>queueAction({type:'add',item:p})));}
  detail.append(action('聚焦',()=>{pan={x:-n.x*zoom,y:-n.y*zoom};draw();}));draw();
 }
 function hit(x,y){let closest=null,distance=22;for(const n of nodes){const p=position(n),d=Math.hypot(x-p.x,y-p.y);if(d<distance){closest=n;distance=d;}}return closest;}
 function local(e){const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
 canvas.addEventListener('pointerdown',e=>{const p=local(e);drag={...p,startX:p.x,startY:p.y,node:hit(p.x,p.y),moved:false};canvas.setPointerCapture(e.pointerId);});
 canvas.addEventListener('pointermove',e=>{if(!drag)return;const p=local(e),dx=p.x-drag.x,dy=p.y-drag.y;drag.moved ||= Math.hypot(p.x-drag.startX,p.y-drag.startY)>4;if(drag.node){drag.node.x+=dx/zoom;drag.node.y+=dy/zoom;wake(80);}else{pan.x+=dx;pan.y+=dy;}drag.x=p.x;drag.y=p.y;draw();});
 canvas.addEventListener('pointerup',()=>{if(drag&&!drag.moved)choose(drag.node?.id||'');drag=null;});canvas.addEventListener('pointercancel',()=>{drag=null;});
 function scale(factor){zoom=Math.max(.25,Math.min(3,zoom*factor));draw();}
 canvas.addEventListener('wheel',e=>{if(!e.ctrlKey)return;e.preventDefault();scale(e.deltaY<0?1.1:.9);},{passive:false});
 canvas.addEventListener('keydown',e=>{const keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-'];if(!keys.includes(e.key))return;e.preventDefault();if(e.key==='+'||e.key==='=')scale(1.15);else if(e.key==='-')scale(.85);else{pan.x+=e.key==='ArrowLeft'?30:e.key==='ArrowRight'?-30:0;pan.y+=e.key==='ArrowUp'?30:e.key==='ArrowDown'?-30:0;draw();}});
 $('[data-graph-zoom=in]',host).addEventListener('click',()=>scale(1.2));$('[data-graph-zoom=out]',host).addEventListener('click',()=>scale(.8));$('[data-graph-reset]',host).addEventListener('click',()=>{zoom=Math.min(1,width/780);pan={x:0,y:0};choose('');});select.addEventListener('change',()=>choose(select.value));
 new ResizeObserver(resize).observe(canvas);document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else if(active)wake(steps);});document.addEventListener('atelier:motion',()=>{if(active)wake(steps);});
 if(!ctx){canvas.hidden=true;detail.textContent='此浏览器使用列表模式，请在下方选择文章或主题。';}
 return {setPosts(next){active=true;const key=next.map(p=>p.path).join('|');if(signature===key){resize();wake(steps);return;}signature=key;posts=next;const g=buildGraph(posts);nodes=g.nodes.map((n,i)=>{const angle=i*2.399963,r=Math.sqrt(i+1)*21;return {...n,x:Math.cos(angle)*r,y:Math.sin(angle)*r,vx:0,vy:0};});const lookup=new Map(nodes.map(n=>[n.id,n]));edges=g.edges.map(e=>({a:lookup.get(e.source),b:lookup.get(e.target)}));select.replaceChildren(element('option','','选择文章或主题'));select.firstChild.value='';nodes.filter(n=>n.kind==='tag').concat(nodes.filter(n=>n.kind==='post')).forEach(n=>{const o=element('option','',(n.kind==='tag'?'# ':'')+n.label);o.value=n.id;select.append(o);});pan={x:0,y:0};resize();zoom=Math.min(1,width/780);choose('');wake(240);},pause(){active=false;cancelAnimationFrame(frame);frame=0;}};
}
