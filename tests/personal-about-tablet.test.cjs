const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ejs=require('ejs'),{JSDOM}=require('jsdom'),{parse}=require('rrweb-cssom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function route(name,root='/'){
 const context={page:{nijika:name},config:{search:{path:'search.xml'}},theme:{nijika:{github:'https://github.com/Hanbaor',cover:'/cover.webp'}},url_for:p=>root+p.replace(/^\//,''),nijika_section:()=>name,
  nijika_art_srcset:()=>'',nijika_writing:()=>[],partial:()=>'',nijika_page_metadata:()=>({}),
  is_post:()=>false,is_home:()=>false,is_archive:()=>false,is_category:()=>false,is_tag:()=>false,is_page:()=>false,open_graph:()=>'',export_config:()=>''};
 context.body=ejs.render(read(`custom/redefine/nijika/${name}.ejs`),context);
 context.partial=name=>name==='nijika/head'?ejs.render(read('custom/redefine/nijika/head.ejs'),context):'';
 const dom=new JSDOM(ejs.render(read('custom/redefine/layout.ejs'),context));
 const sheets=[...dom.window.document.querySelectorAll('link[rel=stylesheet]')].map(link=>{
  const file=link.getAttribute('href').slice(root.length);
  return parse(read((['atelier/css/redefine.css','atelier/css/archive-global.css'].includes(file)?'public/':'source/')+file)).cssRules;
 });
 return {dom,sheets};
}
// Match the actual route's source order and responsive declarations. This is a
// CSS geometry contract, not a browser measurement of text, wrapping or pixels.
function style(sheets,node,name,width){
 let value='',weight=-1;
 function visit(rules){for(const rule of rules){
  if(rule.cssRules){
   if(rule.media){const media=rule.media.mediaText;
    if(/print|hover|prefers-/.test(media))continue;
    if([...media.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)].some(([,bound,n])=>bound==='max'?width>+n:width<+n))continue;
   }
   visit(rule.cssRules);continue;
  }
  if(!rule.selectorText||!rule.style.getPropertyValue(name))continue;
  for(const selector of rule.selectorText.split(/,(?![^()]*\))/)){
   let matches=false;try{matches=node.matches(selector);}catch{}if(!matches)continue;
   const specificity=(selector.match(/#[\w-]+/g)||[]).length*10000+(selector.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g)||[]).length*100+(selector.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|:[\w-]+/g,'').match(/\b[a-z][\w-]*\b/gi)||[]).length;
   if(specificity>=weight){weight=specificity;value=rule.style.getPropertyValue(name);}
  }
 }}sheets.forEach(visit);return value;
}
function length(value,width,percentBase=width){
 // Evaluate the authored CSS math, including nested min/calc/clamp. Percentages
 // use the containing block; vw always uses the viewport. No layout is simulated.
 const tokens=value.match(/\d*\.?\d+(?:px|vw|%)?|[a-z]+|[-+*/(),]/g)||[];
 assert.equal(tokens.join(''),value.replace(/\s/g,''),`Unsupported length: ${value}`);
 let index=0;
 function take(token){assert.equal(tokens[index++],token,value);}
 function atom(){
  const token=tokens[index++];
  if(token==='('){const result=sum();take(')');return result;}
  if(['min','max','clamp','calc'].includes(token)){
   take('(');const args=[sum()];while(tokens[index]===','){index++;args.push(sum());}take(')');
   if(token==='min')return Math.min(...args);if(token==='max')return Math.max(...args);
   if(token==='clamp'){assert.equal(args.length,3);return Math.max(args[0],Math.min(args[1],args[2]));}
   assert.equal(args.length,1);return args[0];
  }
  assert.match(token||'',/^\d*\.?\d+(?:px|vw|%)?$/,value);
  return parseFloat(token)*(token.endsWith('vw')?width/100:token.endsWith('%')?percentBase/100:1);
 }
 function product(){let result=atom();while(['*','/'].includes(tokens[index])){const op=tokens[index++],next=atom();result=op==='*'?result*next:result/next;}return result;}
 function sum(){let result=product();while(['+','-'].includes(tokens[index])){const op=tokens[index++],next=product();result=op==='+'?result+next:result-next;}return result;}
 const result=sum();assert.equal(index,tokens.length,value);return result;
}
function splitSizes(value){
 let depth=0,start=0;const parts=[];
 for(let i=0;i<value.length;i++){if(value[i]==='(')depth++;if(value[i]===')')depth--;if(value[i]===','&&!depth){parts.push(value.slice(start,i).trim());start=i+1;}}
 parts.push(value.slice(start).trim());return parts;
}
function declaredSlot(image,width){
 for(const part of splitSizes(image.sizes)){
  const conditional=part.match(/^\(max-width:(\d+)px\)\s+(.+)$/);
  if(!conditional)return length(part,width);
  if(width<=+conditional[1])return length(conditional[2],width);
 }
 assert.fail(`No sizes branch at ${width}px`);
}
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<.001,`${actual} should equal ${expected}`);
function phoneSlot({dom,sheets},width){
 const document=dom.window.document,body=document.body,main=document.querySelector('main#main-content');
 const room=document.querySelector('.personal-about'),opening=room.querySelector('.personal-about-opening'),figure=opening.querySelector('figure.personal-about-art'),image=figure.querySelector('img');
 assert.equal(main.parentElement,body);assert.equal(room.parentElement,main);assert.equal(opening.parentElement,room);assert.equal(figure.parentElement,opening);assert.equal(image.parentElement,figure);
 assert.equal(style(sheets,body,'display',width),'flex');assert.equal(style(sheets,body,'flex-direction',width),'column');
 assert.equal(style(sheets,body,'margin',width),'0');assert.equal(style(sheets,figure,'margin',width),'0');
 for(const node of [body,main,room,opening,figure,image]){
  assert.equal(style(sheets,node,'box-sizing',width),'border-box');
  assert.equal(style(sheets,node,'padding',width),node===room?'var(--page-start) 0 var(--page-end)':'');
  // Guard all horizontal physical/logical forms, including shorthands: neither
  // the real layout wrapper nor the portrait adds an unaccounted inset.
  for(const property of ['padding-inline','padding-left','padding-right','padding-inline-start','padding-inline-end',
   'border','border-width','border-inline','border-inline-width','border-left','border-right','border-left-width','border-right-width',
   'border-inline-start','border-inline-end','border-inline-start-width','border-inline-end-width'])assert.equal(style(sheets,node,property,width),'',`${node.tagName}.${node.className}: ${property}`);
 }
 for(const node of [body,main,opening]){
  assert.equal(style(sheets,node,'width',width),'');assert.equal(style(sheets,node,'max-width',width),'');
 }
 assert.equal(style(sheets,body,'--layout-width',width),'1200px');
 assert.equal(style(sheets,body,'--page-gutter',width),'clamp(20px,4vw,56px)');
 const shellWidth=style(sheets,room,'width',width);
 assert.equal(shellWidth,'min(var(--layout-width),calc(100% - 2 * var(--page-gutter)))');
 assert.equal(style(sheets,room,'max-width',width),'none');
 assert.equal(style(sheets,opening,'display',width),'grid');
 assert.equal(style(sheets,opening,'grid-template-columns',width),'minmax(0,1fr)');
 assert.equal(style(sheets,figure,'width',width),'min(70%,340px)');
 assert.equal(style(sheets,figure,'justify-self',width),'end');
 assert.equal(style(sheets,image,'width',width),'100%');assert.equal(style(sheets,image,'max-width',width),'100%');
 assert.equal(style(sheets,image,'height',width),'auto');assert.equal(style(sheets,image,'aspect-ratio',width),'2/3');assert.equal(style(sheets,image,'object-fit',width),'contain');
 const shell=length(shellWidth.replace(/var\((--[\w-]+)\)/g,(_,name)=>style(sheets,body,name,width)),width);
 const portrait=length(style(sheets,figure,'width',width),width,shell);
 return length(style(sheets,image,'width',width),width,portrait);
}
for(const root of ['/','/lab/'])test(`actual about portrait retains its attributes and tablet/desktop hints (${root})`,()=>{
 const page=route('about',root);try{
  const image=page.dom.window.document.querySelector('.personal-about-art img');
  assert.deepEqual(Object.fromEntries([...image.attributes].map(attribute=>[attribute.name,attribute.value])),{
   src:`${root}atelier/images/v3/about.webp`,srcset:`${root}atelier/images/v3/about-960.webp 960w, ${root}atelier/images/v3/about.webp 1024w`,
   sizes:'(max-width:760px) min(340px, calc((100vw - 2 * clamp(20px, 4vw, 56px)) * 0.7)), (max-width:1100px) clamp(280px,40vw - 40px,400px), 400px',
   alt:'舞台灯光中的虹夏主题肖像插画',width:'1024',height:'1536',fetchpriority:'high'
  });
  assert.equal(page.dom.window.document.querySelectorAll('.personal-about-art img').length,1);
 }finally{page.dom.window.close();}
});
test('phone sizes equals the actual shell, single-column figure and uncropped image geometry',()=>{
 const page=route('about');try{
  const image=page.dom.window.document.querySelector('.personal-about-art img');
  for(const [width,expected] of [[320,196],[390,245],[457,291.9],[458,292.6],[480,308],[497,319.9],[498,320.6],
   [500,322],[501,322.644],[527,339.388],[528,340],[685,340],[686,340],[760,340]]){
   near(phoneSlot(page,width),expected);near(declaredSlot(image,width),expected);
  }
 }finally{page.dom.window.close();}
});
test('sizes switches to the retained tablet and desktop tracks exactly at their CSS boundaries',()=>{
 const {dom,sheets}=route('about');try{
  const opening=dom.window.document.querySelector('.personal-about-opening'),image=dom.window.document.querySelector('.personal-about-art img');
  near(declaredSlot(image,760),340);
  for(const width of [761,768,820,1024,1100,1101,1440]){
   const track=style(sheets,opening,'grid-template-columns',width).match(/minmax\(0,(clamp\(.+\)|400px)\)$/)?.[1];
   assert.ok(track);near(declaredSlot(image,width),length(track,width));
  }
  near(declaredSlot(image,761),280);near(declaredSlot(image,1100),400);near(declaredSlot(image,1101),400);
 }finally{dom.window.close();}
});
test('960w and 1024w demand thresholds use the corrected phone slot, without assuming browser selection',()=>{
 const {dom}=route('about');try{
  const image=dom.window.document.querySelector('.personal-about-art img');
  const candidates=image.srcset.split(',').map(candidate=>Number(candidate.trim().split(/\s+/)[1].slice(0,-1)));
  assert.deepEqual(candidates,[960,1024]);
  const demand=(width,dpr)=>declaredSlot(image,width)*dpr;
  assert.ok(.7*457*3<=960);assert.ok(.7*458*3>960);
  assert.ok(demand(497,3)<=960);assert.ok(demand(498,3)>960);
  assert.ok(.7*685*2<=960);assert.ok(.7*686*2>960);
  for(let width=458;width<=497;width++){assert.ok(.7*width*3>960);assert.ok(demand(width,3)<=960);}
  for(let width=686;width<=760;width++){assert.ok(.7*width*2>960);assert.ok(demand(width,2)<=960);}
  for(const width of [320,390,480,528,760])for(const dpr of [1,2,3])assert.ok(demand(width,dpr)<=1024);
  near(demand(760,3),1020);
  // These are slot × DPR inequalities against available descriptors. Browser
  // currentSrc, network transfer, cache behavior and bandwidth are not measured.
 }finally{dom.window.close();}
});
for(const [width,copy,art,gap] of [[768,391.68,280,34.88],[820,423.2,288,43.2],[1024,496.64,369.6,75.84],[1100,524,400,88],[1180,591.2,400,94.4]]){
 test(`about balances copy and uncropped portrait at ${width}px`,()=>{
  const {dom,sheets}=route('about');try{
   const document=dom.window.document,opening=document.querySelector('.personal-about-opening'),image=document.querySelector('.personal-about-art img');
   const columns=style(sheets,opening,'grid-template-columns',width);
   const imageTrack=columns.match(/minmax\(0,(clamp\(.+\)|400px)\)$/)?.[1];assert.ok(imageTrack,columns);
   const actualArt=length(imageTrack,width),actualGap=length(style(sheets,opening,'gap',width),width);
   const shell=Math.min(1200,width-2*Math.max(20,Math.min(.04*width,56)));
   near(actualArt,art);near(actualGap,gap);near(shell-actualArt-actualGap,copy);
   const originalCopy=shell-400-Math.max(40,Math.min(.08*width,120));
   if(width<1100)assert.ok(copy>originalCopy);else near(copy,originalCopy);
   assert.equal(style(sheets,image,'aspect-ratio',width),'2/3');
   assert.equal(style(sheets,image,'height',width),'auto');
   assert.equal(style(sheets,image,'object-fit',width),'contain');
   assert.equal(image.width,1024);assert.equal(image.height,1536);
   assert.match(image.sizes,/\(max-width:1100px\) clamp\(280px,40vw - 40px,400px\)/);
  }finally{dom.window.close();}
 });
}
test('about retains its existing phone stack and full desktop composition',()=>{
 const {dom,sheets}=route('about');try{
  const opening=dom.window.document.querySelector('.personal-about-opening');
  for(const width of [320,430,760]){
   assert.equal(style(sheets,opening,'grid-template-columns',width),'minmax(0,1fr)');
   assert.equal(style(sheets,opening,'gap',width),'32px');
  }
  for(const width of [1101,1180,1440]){
   assert.equal(style(sheets,opening,'grid-template-columns',width),'minmax(0,1fr) minmax(0,400px)');
   assert.equal(style(sheets,opening,'gap',width),'clamp(40px,8vw,120px)');
  }
 }finally{dom.window.close();}
});
test('research keeps its own later route cascade, independent of the about tablet change',()=>{
 const {dom,sheets}=route('research');try{
  const opening=dom.window.document.querySelector('.personal-research-opening');
  for(const width of [768,820,1024,1100,1180]){
   assert.equal(style(sheets,opening,'grid-template-columns',width),'minmax(0,1.1fr) minmax(0,.9fr)');
   assert.equal(style(sheets,opening,'gap',width),'clamp(30px,6vw,80px)');
  }
 }finally{dom.window.close();}
});
