const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const yaml = require('js-yaml');
const {JSDOM} = require('jsdom');
const {parse} = require('rrweb-cssom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const theme = yaml.load(read('_config.redefine.yml'));
const posts = [{title:'Example',path:'hot100/001/',topic:'数组',series_order:1,difficulty:'简单',date:'2025-08-03'}, {title:'Second',path:'hot100/002/',topic:'链表',series_order:2,difficulty:'简单',date:'2025-08-04'}];
// Evaluate declared source cascade, not browser pixels. Render the real route head
// and partials so selector specificity, inline defaults and route order participate.
function fixture(name, prefix, before=false) {
  const page = {nijika:name === 'series' ? 'notes' : name === 'stage' ? 'atelier' : name, posts:{each:fn=>posts.forEach(fn)},seriesPosts:posts};
  if (name === 'permutation-demo') delete page.nijika;
  const context = {page,theme,url_for:p=>prefix+String(p).replace(/^\//,''),nijika_art_srcset:()=>'',nijika_page_metadata:()=>({}),nijika_writing:()=>posts,nijika_count:String,live_catalog_counts:()=>({withCode:0,analysisPending:2}),live_metadata:()=>({excerpt:'Example',topics:[],exercise:{hasCode:false,hasAnalysis:false}}),date_xml:d=>d,date:d=>d,is_post:()=>name==='permutation-demo',is_home:()=>false,is_archive:()=>false,is_category:()=>false,is_tag:()=>false,is_page:()=>name!=='permutation-demo',open_graph:()=>'',export_config:()=>''};
  context.partial = (name, vars={}) => name==='nijika/pagination' ? '' : ejs.render(read('custom/redefine/'+name+'.ejs'), {...context,...vars});
  const head = ejs.render(read('custom/redefine/nijika/head.ejs'),context);
  let body = ejs.render(read(`custom/redefine/nijika/${name}.ejs`),context);
  if (name==='permutation-demo') body = '<main class="reading-studio"><article class="article-body markdown-body">'+body+'</article></main>';
  if(before) body=body.replace('style="scroll-margin-top:0px"','style="scroll-margin-top:6rem"');
  const dom = new JSDOM(head+`<body class="nijika light" data-section="${page.nijika || 'post'}"><header class="site-header"></header>${body}</body>`);
  const files = [...dom.window.document.querySelectorAll('link[rel="stylesheet"]')].map(link=>link.getAttribute('href').slice(prefix.length)).filter(file=>file.startsWith('atelier/css/'));
  if (name==='permutation-demo') files.push('atelier/css/permutation-demo.css');
  return {dom, sheets:files.map(file=>{
    let css=read((['atelier/css/redefine.css','atelier/css/archive-global.css'].includes(file)?'public/':'source/')+file);
    // Reconstruct precisely the removed declarations as a negative source control.
    if(before) {
      const old={'editorial-index':'100px',studio:'100px','content-catalog':'90px','permutation-demo':'6rem'}[path.basename(file,'.css')];
      if(old)css=css.replaceAll('scroll-margin-top:0px','scroll-margin-top:'+old);
      if(file.endsWith('/refinement.css'))css=css.replace('.series-group {scroll-margin-top:0px}', '.series-group {scroll-margin-top:110px}');
    }
    return {file,rules:parse(css).cssRules};
  })};
}
function parts(value) {
  let depth=0,start=0,result=[];
  for(let i=0;i<value.length;i++) {if('(['.includes(value[i]))depth++;if(')]'.includes(value[i]))depth--;if(value[i]===','&&!depth){result.push(value.slice(start,i).trim());start=i+1;}}
  result.push(value.slice(start).trim()); return result;
}
function specificity(selector) {
  let score=0;
  selector=selector.replace(/:(is|not|has)\(([^()]*)\)/g,(_,name,args)=>{score+=Math.max(...parts(args).map(specificity));return '';}).replace(/:where\([^()]*\)/g,'');
  return score+(selector.match(/#[\w-]+/g)||[]).length*10000+(selector.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g)||[]).length*100+(selector.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|:[\w-]+/g,'').match(/\b[a-z][\w-]*\b/gi)||[]).length;
}
function cascade(sheets,node,property,width,reduced) {
  let answer={value:'',priority:-1,weight:-1};
  function visit(rules,file) {for(const rule of rules) {
    if(rule.cssRules) {if(rule.media) {const query=rule.media.mediaText;if(/print|hover|pointer|height/.test(query))continue;if(/prefers-reduced-motion/.test(query)&&!reduced)continue;if([...query.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)].some(([,bound,n])=>bound==='max'?width>+n:width<+n))continue;}visit(rule.cssRules,file);continue;}
    if(!rule.selectorText||!rule.style.getPropertyValue(property))continue;
    for(const selector of parts(rule.selectorText)) {let matches=false;try{matches=node.matches(selector);}catch{}if(!matches)continue;
      const priority=rule.style.getPropertyPriority(property)==='important'?1:0,weight=specificity(selector);
      if(priority>answer.priority||priority===answer.priority&&weight>=answer.weight)answer={value:rule.style.getPropertyValue(property),priority,weight,file};
    }
  }}
  for(const sheet of sheets)visit(sheet.rules,sheet.file);
  if(node.style.getPropertyValue(property)&&answer.priority<1)answer.value=node.style.getPropertyValue(property);
  return answer.value;
}
const routes = {notes:'#reading-paths,#notes-catalog',stage:'#creation-works,#creation-traces',studio:'#rhythm-desk',series:'.series-group','permutation-demo':'#permutation-trace'};
for(const prefix of ['/','/lab/']) for(const [name,selector] of Object.entries(routes)) {
  test(`${name} native targets use one shared header clearance (${prefix})`,()=>{
    const {dom,sheets}=fixture(name,prefix),doc=dom.window.document,previous=fixture(name,prefix,true);
    try {
      const targets=[...doc.querySelectorAll(selector)];assert.equal(targets.length,['notes','stage','series'].includes(name)?2:1);
      for(const target of targets) {
        assert.ok(target.id);assert.equal(target.getAttribute('onclick'),null);
        if(name!=='permutation-demo')assert.ok(doc.querySelector(`a[href="#${target.id}"]`),'real native link targets this element');
        for(const width of [320,390,760,761,1170]) for(const reduced of [false,true]) {
          const value=property=>cascade(sheets,target,property,width,reduced);
          const padding=cascade(sheets,doc.documentElement,'scroll-padding-top',width,reduced);
          assert.equal(padding,'110px');assert.equal(value('scroll-margin-top'),'0px');
          const header=doc.querySelector('.site-header');assert.equal(cascade(sheets,header,'position',width,reduced),'sticky');
          const height=parseFloat(cascade(sheets,header,'height',width,reduced));assert.equal(height,width<=760?64:76);assert.ok(+parseFloat(padding)>=height+24);
          if(reduced)assert.equal(cascade(sheets,doc.documentElement,'scroll-behavior',width,reduced),'auto');
          const old=cascade(previous.sheets,previous.dom.window.document.getElementById(target.id),'scroll-margin-top',width,reduced);
          assert.equal(old,name==='series'?'90px':name==='permutation-demo'?'6rem':'100px');
          if(old.endsWith('px'))assert.equal(parseFloat(padding)+parseFloat(old),name==='series'?200:210);
        }
      }
      // No client script is executed: links and collapsed demo are server-rendered.
      for(const link of doc.querySelectorAll('a[href^="#"]'))assert.equal(link.getAttribute('onclick'),null);
      if(name==='permutation-demo') {assert.equal(targets[0].open,false);assert.ok(targets[0].querySelector('summary'));assert.equal(targets[0].style.scrollMarginTop,'0px');}
    } finally {dom.window.close();previous.dom.window.close();}
  });
}
test('cross-page entry points, focus, reduced motion and home exception remain source-owned',()=>{
  const projects=read('custom/redefine/nijika/projects.ejs');
  assert.match(projects,/url_for\('writing\/csdn-124338541\/'\) %>#permutation-trace/);
  assert.match(projects,/url_for\('studio\/'\) %>#rhythm-desk/);
  assert.match(read('scripts/nijika.js'),/nijika:'notes', title:'LeetCode Hot100', seriesPosts/);
  for(const file of ['editorial-index','content-catalog','permutation-demo','refinement'])assert.match(read(`source/atelier/css/${file}.css`),/:focus-visible/);
  assert.match(read('source/atelier/css/personal-home.css'),/html:has\(body\.on-cover\) \{scroll-padding-top:24px\}/);
  assert.doesNotMatch(read('source/atelier/js/series-filter.js'),/scrollTo|scrollIntoView/);
});
