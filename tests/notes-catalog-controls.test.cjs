const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ejs=require('ejs'),yaml=require('js-yaml'),{JSDOM}=require('jsdom'),{parse}=require('rrweb-cssom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
function render(){return new JSDOM(ejs.render(read('custom/redefine/nijika/notes.ejs'),{theme:yaml.load(read('_config.redefine.yml')),url_for:p=>'/'+p,nijika_art_srcset:()=>'',page:{posts:{each(){}}},partial:()=>''}),{url:'https://ccatelier.test/notes/'});}
function sheets(document){
 const head=ejs.render(read('custom/redefine/nijika/head.ejs'),{page:{nijika:'notes'},theme:{nijika:{cover:'/cover.webp'}},nijika_page_metadata:()=>({}),is_post:()=>false,is_home:()=>false,is_archive:()=>false,is_category:()=>false,is_tag:()=>false,is_page:()=>false,url_for:p=>'/'+p,open_graph:()=>'',export_config:()=>''});
 const dom=new JSDOM(head),links=[...dom.window.document.querySelectorAll('link[rel=stylesheet]'),...document.querySelectorAll('link[rel=stylesheet]')];
 const result=links.map(link=>{const file=link.getAttribute('href').slice(1);return parse(read((file==='atelier/css/redefine.css'?'public/':'source/')+file)).cssRules;});dom.window.close();return result;
}
// Inspect matching layout declarations in the actual route cascade, including media
// queries. This checks the inherited column-direction regression without claiming
// JSDOM measures rendered widths or browser reflow.
function property(sheets,node,name,width){
 let value='',weight=-1;
 function visit(rules){for(const rule of rules){
  if(rule.cssRules){if(rule.media){const media=rule.media.mediaText;if(/print|prefers-reduced-motion/.test(media))continue;if([...media.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)].some(([,bound,n])=>bound==='max'?width>+n:width<+n))continue;}visit(rule.cssRules);continue;}
  if(!rule.selectorText||!rule.style.getPropertyValue(name))continue;
  for(const selector of rule.selectorText.split(/,(?![^()]*\))/)){let match=false;try{match=node.matches(selector);}catch{}if(!match)continue;
   const specificity=(selector.match(/#[\w-]+/g)||[]).length*10000+(selector.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g)||[]).length*100+(selector.replace(/#[\w-]+|\.[\w-]+|\[[^\]]*\]|:[\w-]+/g,'').match(/\b[a-z][\w-]*\b/gi)||[]).length;
   if(specificity>=weight){weight=specificity;value=rule.style.getPropertyValue(name);}
  }
 }}sheets.forEach(visit);return value;
}
for(const width of [320,393,600,601,900,1180])test(`catalog browsing and filters retain compact responsive layout at ${width}px`,()=>{
 const dom=render(),d=dom.window.document;d.body.className='nijika light';d.body.dataset.section='notes';const css=sheets(d),$=s=>d.querySelector(s);
 assert.equal($('.archive-options').open,false);
 assert.equal($('.archive-options summary').textContent,'筛选与排序');
 for(const button of d.querySelectorAll('[data-view],.archive-queue-link')){assert.equal(button.closest('details'),null);assert.equal(property(css,button,'min-height',width),'44px');}
 assert.equal($('.archive-toolbar').parentElement,$('.archive-controls'));
 assert.equal($('.archive-filter-tags').parentElement,$('.archive-options-body'));
 assert.equal($('.archive-filter-tags').closest('.archive-filters'),null,'topic chips have their own wrapping row');
 assert.equal($('.archive-filters').children.length,3);
 for(const selector of ['[data-duration]','[data-tag]','#archive-sort']){assert.ok($(selector).closest('.archive-filters'));assert.ok($(selector).closest('label'));}
 assert.equal(property(css,$('.archive-filters'),'flex-direction',width),'row','override legacy sidebar column direction');
 assert.equal(property(css,$('.archive-filters'),'display',width),width<=600?'grid':'flex');
 assert.equal(property(css,$('.archive-controls'),'grid-template-columns',width),width<=600?'minmax(0,1fr)':'132px minmax(0,1fr)');
 assert.equal(property(css,$('.archive-toolbar'),'grid-area',width),width<=600?'auto':'1 / 2 / 2 / -1');
 assert.equal(property(css,$('.archive-toolbar'),'flex-wrap',width),'wrap');
 assert.equal(property(css,$('.archive-filters'),'position',width),'static');
 assert.equal($('.archive-app').hidden,true);assert.equal($('.archive-fallback').hidden,false);
 dom.window.close();
});
test('closed filters leave all browse modes operable through repeated transitions and history',async()=>{
 const dom=render(),{window}=dom;Object.assign(globalThis,{window,document:window.document,location:window.location,history:window.history,CustomEvent:window.CustomEvent,localStorage:window.localStorage,matchMedia:()=>({matches:false,addEventListener(){}}),fetch:async()=>({ok:true,json:async()=>JSON.parse(read('public/atelier/data/archive.json'))}),Worker:class{constructor(){throw Error('pure fallback');}}});
 document.body.dataset.root='/';let graphCalls=0,pauses=0;const {initArchive}=await import('../source/atelier/js/archive.js');await initArchive({loadConstellation:async()=>({createConstellation:()=>({setPosts(){graphCalls++;},pause(){pauses++;}})})});
 const $=s=>document.querySelector(s);
 for(const view of ['grid','list','graph','list','graph','grid']){
  $('[data-view='+view+']').click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal($('.archive-options').open,false);assert.equal($('[data-view='+view+']').getAttribute('aria-pressed'),'true');assert.equal($('.constellation').hidden,view!=='graph');
  if(view!=='graph')assert.equal($('[data-archive-results]').dataset.mode,view);
 }
 assert.ok(graphCalls>=2);assert.ok(pauses>=2);
 history.pushState({},'','?view=list');window.dispatchEvent(new window.PopStateEvent('popstate'));assert.equal($('[data-view=list]').getAttribute('aria-pressed'),'true');assert.equal($('.archive-options').open,false);
 const slash=new window.KeyboardEvent('keydown',{key:'/',bubbles:true,cancelable:true});document.body.dispatchEvent(slash);assert.equal(document.activeElement,$('#archive-q'));
 window.dispatchEvent(new window.Event('pagehide'));window.close();
});
