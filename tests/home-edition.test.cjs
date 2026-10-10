const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ejs=require('ejs'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
function render(posts){
 return new JSDOM(ejs.render(read('custom/redefine/nijika/cover.ejs'),{
  nijika_writing:()=>posts,url_for:value=>'/'+value.replace(/^\//,''),
  nijika_art_srcset:value=>`${value.replace('.webp','-960.webp')} 960w, ${value} 1916w`,
  theme:{nijika:{github:'https://github.com/Hanbaor'}},partial:()=>'<svg aria-hidden="true"></svg>',
  date_xml:()=> '2026-01-01',date:()=> '2026.01.01',live_metadata:()=>({excerpt:'真实文章摘要',topics:['算法','C++']})
 }));
}
const posts=[{title:'Hello CC Atelier',path:'hello/'},...['分治','PyTorch','蓝桥杯','vector'].map((title,i)=>({title,path:`writing/${i}/`}))];
test('home curates technical writing, with native paths and one readable page heading',()=>{
 const dom=render(posts),d=dom.window.document;
 try{
  assert.equal(d.querySelectorAll('h1').length,1);
  assert.deepEqual([...d.querySelectorAll('.personal-note h3')].map(node=>node.textContent.trim()),['分治','PyTorch','蓝桥杯']);
  assert.equal(d.querySelector('.home-note-feature a').getAttribute('href'),'/writing/0/');
  assert.equal(d.querySelectorAll('a a').length,0);
  for(const link of d.querySelectorAll('.home-directory a'))assert.ok(d.querySelector(link.getAttribute('href')));
  assert.equal(d.querySelectorAll('.home-reading-topics a[href^="/notes/?q="]').length,3);
  assert.equal(d.querySelectorAll('script').length,0,'no initial JavaScript is added by the home');
 }finally{dom.window.close();}
});
test('SQL teaser is an accessible native disclosure with real no-script explanation and a runnable destination',()=>{
 const dom=render(posts),d=dom.window.document;
 try{
  const details=d.querySelector('.home-query-preview');
  assert.ok(details);assert.equal(details.firstElementChild.tagName,'SUMMARY');assert.equal(details.open,false);
  assert.deepEqual([...details.querySelectorAll('code')].map(node=>node.textContent),['COUNT(*)','COUNT(t.id)']);
  assert.deepEqual([...details.querySelectorAll('b')].map(node=>node.textContent),['1','0']);
  assert.match(details.textContent,/LEFT JOIN/);
  assert.equal(d.querySelector('.home-research-foot').getAttribute('href'),'/research/#sql-lab-title');
  details.open=true;assert.equal(details.open,true);
 }finally{dom.window.close();}
});
test('home handles an empty writing archive without an empty featured link',()=>{
 const dom=render([]);try{assert.ok(dom.window.document.querySelector('.personal-empty'));assert.equal(dom.window.document.querySelectorAll('.personal-note').length,0);}finally{dom.window.close();}
});
test('home composition parses and keeps focus and reduced-motion styles',()=>{
 const css=read('source/atelier/css/personal-home.css'),dom=new JSDOM(`<style>${css}</style>`);
 try{assert.ok(dom.window.document.styleSheets[0].cssRules.length>100);assert.match(css,/\.home-query-preview summary:focus-visible/);assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);}finally{dom.window.close();}
});
test('final homepage cascade keeps information and links readable at narrow and wide widths',()=>{
 const css=read('source/atelier/css/personal-home.css');
 // jsdom does not evaluate viewport media queries. Flatten active width rules in
 // original order, then inspect the final cascade rather than stale declarations.
 const sheetDOM=new JSDOM(`<style>${css}</style>`),rules=sheetDOM.window.document.styleSheets[0].cssRules;
 function activeCSS(width,items=rules){return [...items].map(rule=>{
  if(rule.type===4){const condition=rule.conditionText;if(/prefers-|hover/.test(condition))return '';
   const max=condition.match(/max-width:\s*(\d+)px/),min=condition.match(/min-width:\s*(\d+)px/);
   return (!max||width<=Number(max[1]))&&(!min||width>=Number(min[1]))?activeCSS(width,rule.cssRules):'';
  }
  return rule.cssText;
 }).join('\n');}
 const required=['.personal-intro .personal-kicker','.personal-actions>a','.home-understage','.home-understage p>span','.home-understage>a','.personal-section-head>a','.personal-note time','.personal-note p','.home-note-topics','.home-series-link small','.home-series-link p','.home-project-description .personal-kicker','.home-project-description>p','.home-project-stack','.home-project-stack>a','.home-research-feature .personal-kicker','.home-research-summary','.home-query-example code','.home-query-preview summary','.home-query-preview>p','.home-research-foot','.home-reading-topics>a','.home-afterhours-copy nav>a','.home-afterhours-copy>p:not(.personal-kicker)','.home-colophon','.home-colophon a'];
 try{for(const width of [320,390,760,1170]){
  const dom=render(posts),d=dom.window.document;try{
   const style=d.createElement('style');style.textContent=activeCSS(width);d.head.append(style);
   for(const selector of required){const nodes=d.querySelectorAll(selector);assert.ok(nodes.length,selector+' exists');for(const node of nodes){const size=parseFloat(dom.window.getComputedStyle(node).fontSize);assert.ok(size>=13,`${width}px ${selector}: ${size}px`);}}
  }finally{dom.window.close();}
 }}finally{sheetDOM.window.close();}
});
