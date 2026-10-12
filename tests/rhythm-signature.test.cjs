const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ejs=require('ejs'),{JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const mark=read('custom/redefine/nijika/rhythm-signature.ejs');
function render(name,prefix='/'){
 const ctx={url_for:p=>prefix+p.replace(/^\//,''),nijika_art_srcset:()=>'',nijika_writing:()=>[],theme:{nijika:{github:'https://github.com/Hanbaor'}},partial:n=>read('custom/redefine/'+n+'.ejs')};
 return new JSDOM(ejs.render(read(`custom/redefine/nijika/${name}.ejs`),ctx));
}
test('the drum signature is id-free, decorative, passive SVG geometry',()=>{
 const dom=new JSDOM(mark+mark),d=dom.window.document;
 try{
  assert.equal(d.querySelectorAll('svg.rhythm-signature').length,2);
  assert.equal(d.querySelectorAll('[id],a,script,style,image,use,foreignObject,animate,animateTransform,[tabindex]').length,0);
  for(const svg of d.querySelectorAll('svg')){
   assert.equal(svg.getAttribute('aria-hidden'),'true');assert.equal(svg.getAttribute('focusable'),'false');
   assert.equal(svg.getAttribute('viewBox'),'0 0 180 100');assert.equal(svg.style.pointerEvents,'none');
   assert.equal(svg.querySelectorAll('.rhythm-stick').length,2);assert.ok(svg.querySelector('ellipse'));
  }
 }finally{dom.window.close();}
});
for(const prefix of ['/','/lab/'])test(`two intentional placements preserve all native music entrances (${prefix})`,()=>{
 const home=render('cover',prefix),projects=render('projects',prefix);
 try{
  const d=home.window.document,p=projects.window.document;
  assert.equal(d.querySelectorAll('.rhythm-signature').length,1);assert.equal(p.querySelectorAll('.rhythm-signature').length,1);
  assert.ok(d.querySelector('.home-afterhours-copy > .home-rhythm-signature > svg'));
  assert.ok(p.querySelector('.project-context > svg + span'));
  assert.equal(d.querySelector('.home-afterhours-copy nav a').getAttribute('href'),prefix+'studio/');
  assert.equal(d.querySelector('.home-afterhours-art').getAttribute('href'),prefix+'studio/practice/');
  assert.equal(d.querySelectorAll('.home-afterhours img').length,1);
  assert.equal(d.querySelectorAll('.rhythm-signature a,.rhythm-signature button').length,0);
 }finally{home.window.close();projects.window.close();}
});
test('intent plays one finite phrase; motion settings suppress every animated child',()=>{
 const css=read('source/atelier/css/personal-home.css'),section=css.slice(css.indexOf('/* A two-stroke rehearsal'));
 const dom=new JSDOM('<style>'+css+'</style>');try{assert.ok(dom.window.document.styleSheets[0].cssRules.length>80);}finally{dom.window.close();}
 assert.match(section,/@media\(hover:hover\) and \(prefers-reduced-motion:no-preference\)/);
 for(const part of ['stick-left','stick-right','resonance']){
  assert.match(section,new RegExp('home-afterhours:focus-within \\.rhythm-'+part));
  assert.match(section,new RegExp('home-afterhours:hover \\.rhythm-'+part));
 }
 assert.match(section,/1\.2s ease-out 1/);assert.doesNotMatch(section,/infinite|animation-delay|!important/);
 assert.match(section,/@media\(prefers-reduced-motion:reduce\)[\s\S]*svg \* \{animation:none;transition:none;transform:none\}/);
 assert.match(section,/body\.motion-off \.personal-home \.home-afterhours \.home-rhythm-signature svg \* \{animation:none;transition:none;transform:none\}/);
 assert.match(section,/width:104px/);assert.match(section,/width:100%;height:auto;aspect-ratio:9\/5;pointer-events:none;transform:none;transition:none/);
 assert.doesNotMatch(read('source/atelier/css/projects.css').slice(read('source/atelier/css/projects.css').indexOf("/* A small static maker's mark")),/animation:/);
});
test('hero light uses local gradients under the original caption, with the LCP image untouched',()=>{
 const dom=render('cover');try{
  const d=dom.window.document,figure=d.querySelector('.personal-portrait'),beam=figure.querySelector('.home-stage-light'),image=figure.querySelector('#cover-image');
  assert.ok(beam);assert.equal(beam.previousElementSibling.tagName,'PICTURE');assert.equal(beam.nextElementSibling.tagName,'FIGCAPTION');
  assert.equal(beam.getAttribute('aria-hidden'),'true');assert.equal(beam.getAttribute('focusable'),'false');assert.equal(beam.style.pointerEvents,'none');
  assert.equal(d.querySelectorAll('#home-stage-light-warm').length,1);assert.equal(beam.querySelector('path').getAttribute('fill'),'url(#home-stage-light-warm)');assert.equal(beam.querySelector('path').getAttribute('stroke'),'none');
  assert.equal(beam.querySelectorAll('filter,image,animate,animateTransform,script,foreignObject').length,0);
  assert.equal(image.getAttribute('src'),'/atelier/images/v3/hero.webp');assert.equal(image.getAttribute('fetchpriority'),'high');assert.ok(image.hasAttribute('srcset'));assert.equal(d.querySelectorAll('.home-stage-light,.rhythm-signature').length,2);
 }finally{dom.window.close();}
 const css=read('source/atelier/css/personal-home.css'),light=css.slice(css.indexOf('/* One quiet follow-spot'));
 assert.match(light,/opacity:0;pointer-events:none/);assert.match(light,/personal-portrait:after \{z-index:1\}/);assert.match(css,/personal-portrait figcaption\{z-index:2/);
 assert.match(light,/personal-hero:focus-within \.home-stage-light \{animation:nijika-stage-light 1\.6s ease-in-out 1\}/);
 assert.match(light,/@media\(hover:hover\) and \(prefers-reduced-motion:no-preference\)/);
 assert.match(light,/@media\(prefers-reduced-motion:reduce\)[\s\S]*opacity:0;animation:none;transform:none;transition:none/);
 assert.match(light,/body\.motion-off [^{}]+\.home-stage-light \{opacity:0;animation:none;transform:none;transition:none\}/);
 assert.doesNotMatch(light,/infinite|blur\(|filter:|!important/);
});

test('two edge-normal feather masks keep every reference local and soften both slanted edges',()=>{
 const dom=render('cover');try{
  const d=dom.window.document,beam=d.querySelector('.home-stage-light'),ids=[...beam.querySelectorAll('[id]')].map(n=>n.id);
  assert.equal(ids.length,5);assert.equal(new Set(ids).size,5);
  for(const id of ids)assert.equal(d.querySelectorAll('[id="'+id+'"]').length,1);
  for(const node of beam.querySelectorAll('[fill],[mask]'))for(const attribute of ['fill','mask']){
   const value=node.getAttribute(attribute)||'',match=value.match(/^url\(#([^)]*)\)$/);
   if(value.startsWith('url(')){assert.ok(match);assert.ok(ids.includes(match[1]));}
  }
  assert.equal(beam.querySelectorAll('mask').length,2);assert.equal(beam.querySelectorAll('g[mask] > g[mask] > path').length,1);
  for(const [id,edge] of [['left',[-150,540]],['right',[140,540]]]){
   const gradient=d.getElementById('home-stage-light-'+id+'-edge');
   assert.equal(gradient.getAttribute('gradientUnits'),'userSpaceOnUse');
   const dx=+gradient.getAttribute('x2')-gradient.getAttribute('x1'),dy=+gradient.getAttribute('y2')-gradient.getAttribute('y1');
   assert.ok(Math.abs(dx*edge[0]+dy*edge[1])<4,'feather direction stays normal to the slanted edge');
   assert.ok(Math.hypot(dx,dy)>23.9&&Math.hypot(dx,dy)<24.1);
   assert.equal(gradient.firstElementChild.getAttribute('stop-color'),'#000');assert.equal(gradient.lastElementChild.getAttribute('stop-color'),'#fff');
  }
  assert.equal(beam.querySelector('path').getAttribute('d'),'M770-20h40l140 540H620Z');
  assert.equal(d.getElementById('home-stage-light-warm').firstElementChild.getAttribute('stop-opacity'),'.24');
 }finally{dom.window.close();}
});

test('print hiding wins the actual hero light display cascade',()=>{
 const dom=render('cover'),style=dom.window.document.createElement('style');
 style.textContent=read('source/atelier/css/personal-home.css');dom.window.document.head.append(style);
 try{
  const beam=dom.window.document.querySelector('.home-stage-light');
  for(const print of [false,true]){
   const declarations=[];
   function visit(rules){for(const rule of rules){
    if(rule.media){if(print&&rule.media.mediaText==='print')visit(rule.cssRules);continue;}
    if(!rule.selectorText||!rule.style.display)continue;
    for(const selector of rule.selectorText.split(',')){
     if(!beam.matches(selector))continue;
     // Matching display selectors here are plain class selectors. Count their
     // real specificity rather than trusting JSDOM's simplified CSS cascade.
     assert.match(selector.trim(),/^(?:\.[\w-]+\s*)+$/);
     declarations.push({value:rule.style.display,classes:(selector.match(/\./g)||[]).length,order:declarations.length});
    }
   }}
   visit(style.sheet.cssRules);
   declarations.sort((a,b)=>a.classes-b.classes||a.order-b.order);
   assert.equal(declarations.at(-1).value,print?'none':'block');
  }
 }finally{dom.window.close();}
});
