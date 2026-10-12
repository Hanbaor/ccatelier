const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),{parse}=require('rrweb-cssom'),ejs=require('ejs'),yaml=require('js-yaml');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
// Source cascade and recorded Canvas calls only. No native pixels or compliance claim.
// Ratios use nominal opaque stroke colors; 1px antialiasing/device rasterization is unverified.
function fixture(){
 const options={page:{nijika:'notes',posts:{each(){}}},theme:yaml.load(read('_config.redefine.yml')),url_for:p=>'/'+p,nijika_art_srcset:()=>'',partial:()=>'',nijika_page_metadata:()=>({}),is_post:()=>false,is_home:()=>false,is_archive:()=>false,is_category:()=>false,is_tag:()=>false,is_page:()=>false,open_graph:()=>'',export_config:()=>''};
 const dom=new JSDOM(ejs.render(read('custom/redefine/nijika/head.ejs'),options)+ejs.render(read('custom/redefine/nijika/notes.ejs'),options),{url:'https://example.test/notes/',pretendToBeVisual:true});
 dom.window.document.body.className='nijika light';dom.window.document.body.dataset.section='notes';dom.window.document.body.dataset.root='/';
 const sheets=[...dom.window.document.querySelectorAll('link[rel=stylesheet]')].map(link=>{const file=link.getAttribute('href').slice(1);return parse(read((file==='atelier/css/redefine.css'?'public/':'source/')+file)).cssRules;});
 return {dom,sheets};
}
function value(sheets,node,property,width){
 let result='',weight=-1;
 function visit(rules,conditions=[]){for(const rule of rules){
  if(rule.cssRules){visit(rule.cssRules,[...conditions,rule]);continue;}
  if(!rule.selectorText||!rule.style.getPropertyValue(property))continue;
  for(const selector of rule.selectorText.split(/,(?![^()]*\))/)){
   if(/::[\w-]+/.test(selector))continue; // Pseudo-elements do not paint these actual elements.
   let matches;try{matches=node.matches(selector);}catch(error){assert.fail('Unsupported selector in audited property: '+selector);}
   if(!matches)continue;
   let enabled=true;
   for(const condition of conditions){assert.ok(condition.media,'Extend bounded cascade for applicable non-media grouping');const media=condition.media.mediaText;
    if(media==='print'){enabled=false;continue;}
    const m=media.match(/^\((min|max)-width:\s*(\d+)px\)$/);assert.ok(m,'Extend bounded cascade for applicable media: '+media);
    if(m[1]==='max'?width>+m[2]:width<+m[2])enabled=false;
   }
   if(!enabled)continue;
   // :not itself contributes zero specificity; its argument contributes normally.
   const simple=selector.replace(/:not\(([^()]*)\)/g,'$1');
   assert.ok(!/[()]/.test(simple),'Extend bounded specificity for '+selector);
   const stripped=simple.replace(/\[[^\]]*\]/g,'').replace(/#[\w-]+|\.[\w-]+|:[\w-]+/g,'');
   assert.match(stripped,/^[\w\s*>+~-]*$/,'Unsupported applicable selector');
   const specificity=(simple.match(/#[\w-]+/g)||[]).length*10000+(simple.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g)||[]).length*100+(stripped.match(/\b[a-z][\w-]*\b/gi)||[]).length+(rule.style.getPropertyPriority(property)==='important'?1e6:0);
   if(specificity>=weight){weight=specificity;result=rule.style.getPropertyValue(property);}
  }
 }}sheets.forEach(sheet=>visit(sheet));return result;
}
const rgb=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16));
const mix=(a,b,t)=>a.map((x,i)=>x*t+b[i]*(1-t));
const luminance=a=>a.map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
function backgrounds(sheets,d,theme){
 d.body.classList.toggle('light',theme==='light');
 for(const width of [393,1180]){
  assert.equal(value(sheets,d.body,'--bg',width),theme==='light'?'#ffffff':'#111114');
  assert.equal(value(sheets,d.querySelector('.constellation'),'background',width),'radial-gradient(ellipse at 50% 45%,#39332633,transparent 60%),var(--bg)');
  for(let node=d.querySelector('.constellation canvas');node!==d.body;node=node.parentElement)assert.equal(value(sheets,node,'--bg',width),'');
  for(const property of ['background','background-color','background-image'])assert.equal(value(sheets,d.querySelector('canvas'),property,width),'');
  for(const property of ['background-color','background-image'])assert.equal(value(sheets,d.querySelector('.constellation'),property,width),'');
 }
 const base=rgb(value(sheets,d.body,'--bg',1180));return [base,mix(rgb('#393326'),base,.2)];
}
test('actual graph paths preserve warm fills and gain only light-mode marker boundaries across settled theme switches',async()=>{
 const {dom,sheets}=fixture(),w=dom.window,d=w.document,host=d.querySelector('.constellation'),canvas=host.querySelector('canvas');host.hidden=false;
 let calls=[],current=[],frames=0,draws=0;
 const ctx={globalAlpha:1,clearRect(){draws++;calls=[];},beginPath(){current=[];},arc(...args){current.push(args);},fill(){calls.push({kind:'fill',path:current.slice(),color:this.fillStyle,alpha:this.globalAlpha});},stroke(){calls.push({kind:'stroke',path:current.slice(),color:this.strokeStyle,alpha:this.globalAlpha,width:this.lineWidth});},fillText(){},measureText:t=>({width:Array.from(t).length*7}),setTransform(){},moveTo(){},lineTo(){}};
 canvas.getContext=()=>ctx;canvas.getBoundingClientRect=()=>({width:800,height:470,left:0,top:0});
 Object.assign(globalThis,{window:w,document:d,location:w.location,localStorage:w.localStorage,CustomEvent:w.CustomEvent,devicePixelRatio:1,matchMedia:()=>({matches:false,addEventListener(){}}),ResizeObserver:class{observe(){}},requestAnimationFrame:()=>++frames,cancelAnimationFrame(){}});
 let graph;
 try{
  const {motion}=await import('../source/atelier/js/ui.js');motion.enabled=false;
  const {createConstellation}=await import('../source/atelier/js/constellation.js');graph=createConstellation(host,()=>{});
  graph.setPosts([{path:'/a/',title:'Writing A',group:'writing',tags:['shared']},{path:'/b/',title:'Hot100 B',group:'hot100',tags:['shared']},{path:'/c/',title:'Unrelated',group:'writing',tags:['other']}]);
  const select=host.querySelector('[data-graph-select]');
  const markers=()=>calls.filter(c=>c.kind==='fill'&&c.path[0]?.[2]>1);
  const geometry=()=>markers().map(c=>c.path);
  for(const selected of ['', 'tag:shared','/a/']){
   select.value=selected;select.dispatchEvent(new w.Event('change'));const positions=geometry();let darkCalls;
   for(const theme of ['dark','light','dark','light','dark']){
    const bg=backgrounds(sheets,d,theme),before=draws;d.dispatchEvent(new w.CustomEvent('atelier:theme'));
    assert.equal(draws,before+1);assert.equal(frames,0);assert.deepEqual(geometry(),positions);
    const dots=markers();assert.equal(dots.length,5);assert.equal(dots.filter(c=>c.alpha===1).length,selected==='tag:shared'?3:selected?2:5);assert.deepEqual(new Set(dots.map(c=>c.color)),new Set(['#d78c76','#ad8466','#eac065']));
    const strokes=calls.filter(c=>c.kind==='stroke'&&c.path.length),outlines=strokes.filter(c=>dots.some(n=>JSON.stringify(n.path)===JSON.stringify(c.path))),rings=strokes.filter(c=>!outlines.includes(c));
    assert.equal(outlines.length,theme==='light'?dots.length:0);assert.equal(rings.length,selected?1:0);
    for(const dot of dots){
     assert.ok(dot.alpha===1||dot.alpha===.22);if(!selected)assert.equal(dot.alpha,1);
     if(theme==='light'){const outline=outlines.find(c=>JSON.stringify(c.path)===JSON.stringify(dot.path));assert.equal(outline.color,'#805000');assert.equal(outline.width,1);assert.equal(outline.alpha,dot.alpha);}
     // Unrelated dimmed nodes and noncircular decorative grid/edges are deliberately excluded.
     if(dot.alpha===1)for(const background of bg)assert.ok(contrast(rgb(theme==='light'?'#805000':dot.color),background)>4.7);
    }
    if(selected){assert.ok(dots.some(c=>c.alpha===.22));for(const ring of rings){assert.equal(ring.color,theme==='light'?'#805000':'#efc66c');assert.equal(ring.width,1);assert.equal(ring.alpha,1);assert.ok(dots.some(c=>c.path[0][0]===ring.path[0][0]&&c.path[0][1]===ring.path[0][1]&&c.path[0][2]+6===ring.path[0][2]));for(const background of bg)assert.ok(contrast(rgb(ring.color),background)>4.7);}}
    if(theme==='dark'){if(darkCalls)assert.deepEqual(calls,darkCalls,'light paints must leave no drawing-state residue in dark mode');darkCalls=structuredClone(calls);}
   }
  }
  const light=backgrounds(sheets,d,'light');assert.ok(light.every(bg=>contrast(rgb('#eac065'),bg)<1.8));assert.ok(light.every(bg=>contrast(rgb('#efc66c'),bg)<1.7));
 }finally{graph?.pause();dom.window.close();}
});
