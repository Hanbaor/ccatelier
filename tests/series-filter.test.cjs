'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ejs=require('ejs'),yaml=require('js-yaml');
const {JSDOM}=require('jsdom'),{parse}=require('rrweb-cssom'),{exerciseState}=require('../tools/content-catalog.cjs');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const posts=fs.readdirSync(path.join(root,'source/_posts/hot100')).filter(n=>n.endsWith('.md')).map(name=>{
 const raw=read('source/_posts/hot100/'+name),front=yaml.load(raw.split('---')[1]);return {...front,path:front.permalink,source:'_posts/hot100/'+name,raw};
}).sort((a,b)=>a.series_order-b.series_order);
function markup(prefix='/'){return ejs.render(read('custom/redefine/nijika/series.ejs'),{
 page:{seriesPosts:posts,introHtml:'<p>原题单说明</p>'},url_for:p=>prefix+p,live_catalog_counts:()=>({withCode:posts.filter(p=>exerciseState(p).hasCode).length,analysisPending:posts.filter(p=>!exerciseState(p).hasAnalysis).length}),live_metadata:p=>({exercise:exerciseState(p)}),nijika_count:n=>String(n).padStart(2,'0'),partial:()=>read('custom/redefine/nijika/editorial-arrow.ejs')
});}
async function fixture(prefix='/',query=''){
 const dom=new JSDOM(markup(prefix),{url:'https://example.test'+prefix+'series/hot100/'+query,pretendToBeVisual:true});
 const {initSeriesFilter}=await import('../source/atelier/js/series-filter.js');initSeriesFilter({root:dom.window.document});
 const $=s=>dom.window.document.querySelector(s),all=s=>[...dom.window.document.querySelectorAll(s)],visible=()=>all('.series-track').filter(n=>!n.hidden);
 const input=value=>{$('[data-series-search]').value=value;$('[data-series-search]').dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 const change=(selector,value)=>{const n=$(selector);if(n.type==='checkbox')n.checked=value;else n.value=value;n.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
 return {dom,$,all,visible,input,change};
}
function matchingTopics(f){
 for(const group of f.all('.series-group')){
  const n=[...group.querySelectorAll('.series-track')].filter(row=>!row.hidden).length;
  assert.equal(group.hidden,n===0);
  for(const link of f.all(`a[href="#${group.id}"]`)){assert.equal(link.hidden,n===0);assert.equal(+link.querySelector('small').textContent,n);}
 }
}
for(const prefix of ['/','/lab/'])test(`real no-JS index preserves all records, source metadata, anchors and facts (${prefix})`,()=>{
 const dom=new JSDOM(markup(prefix));try{
  const d=dom.window.document,rows=[...d.querySelectorAll('.series-track')];assert.equal(rows.length,100);assert.ok(rows.every(n=>!n.hidden));assert.ok(d.querySelector('[data-series-controls]').hidden);
  assert.equal(rows.filter(n=>n.dataset.seriesHasCode==='true').length,29);
  rows.forEach((n,i)=>{assert.equal(n.dataset.seriesHasCode,String(exerciseState(posts[i]).hasCode));assert.equal(n.dataset.seriesDifficulty,posts[i].difficulty);assert.equal(n.dataset.seriesTopic,posts[i].topic);assert.equal(n.getAttribute('href'),prefix+posts[i].path);});
  assert.equal(d.querySelectorAll('.series-track-state').length,100);assert.ok(rows.every(n=>n.textContent.includes('解析待补')));
  assert.match(d.querySelector('.series-header').textContent,/100 道题 · 29 题已有代码 · 100 题解析待补/);assert.match(d.querySelector('.series-status-note').textContent,/尚未做正确性校验/);
  assert.equal(d.querySelector('.series-topic-disclosure').open,false);assert.equal(d.querySelector('.series-intro').open,false);assert.equal(d.querySelector('.series-intro .article-body').textContent,'原题单说明');
 }finally{dom.window.close();}
});
test('real DOM search handles exact normalized sequence, Chinese titles/topics, combined terms and truthful code/difficulty',async()=>{
 const f=await fixture();try{
  assert.equal(f.visible().length,100);assert.equal(f.$('[data-series-count]').textContent,'显示 100 / 100 题');
  for(const q of ['1','001','＃００１',' １ ']){f.input(q);assert.deepEqual(f.visible().map(n=>+n.dataset.seriesOrder),[1]);}
  f.input('哈希 两数');assert.deepEqual(f.visible().map(n=>+n.dataset.seriesOrder),[1]);
  f.input('');f.change('[data-series-code]',true);assert.equal(f.visible().length,29);assert.ok(f.visible().every(n=>n.textContent.includes('已有代码')));
  for(const level of ['简单','中等','困难']){f.change('select[data-series-difficulty]',level);assert.deepEqual(f.visible().map(n=>+n.dataset.seriesOrder),posts.filter(p=>exerciseState(p).hasCode&&p.difficulty===level).map(p=>p.series_order));matchingTopics(f);}
  assert.match(f.$('.series-status-note').textContent,/未做正确性校验/);assert.equal(f.all('.series-track-state').filter(n=>n.textContent.includes('解析待补')).length,100);
  f.$('[data-series-clear]').click();assert.equal(f.visible().length,100);matchingTopics(f);
 }finally{f.dom.window.close();}
});
test('IME composition, malicious literal text, empty state, clear and keyboard focus keep native controls stable',async()=>{
 const f=await fixture();try{
  const search=f.$('[data-series-search]');search.focus();search.dispatchEvent(new f.dom.window.CompositionEvent('compositionstart',{bubbles:true}));f.input('两数之和');assert.equal(f.visible().length,100);
  assert.equal(f.dom.window.location.search,'');search.dispatchEvent(new f.dom.window.CompositionEvent('compositionend',{bubbles:true}));assert.equal(f.visible().length,1);assert.equal(f.dom.window.document.activeElement,search);
  const enter=new f.dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,isComposing:true});search.dispatchEvent(enter);assert.equal(enter.defaultPrevented,false);assert.equal(f.all('form').length,0);
  f.input('<img src=x onerror=alert(1)>');assert.equal(f.visible().length,0);assert.equal(f.$('[data-series-empty]').hidden,false);assert.equal(f.$('[data-series-count]').textContent,'显示 0 / 100 题');assert.equal(f.all('img').length,0);matchingTopics(f);
  const clear=f.$('[data-series-clear]');clear.focus();clear.click();assert.equal(f.dom.window.document.activeElement,clear);assert.equal(f.visible().length,100);assert.equal(f.$('[data-series-empty]').hidden,true);assert.equal(f.$('[data-series-topic-count]').textContent,'17 个专题');
  const link=f.visible()[0],event=new f.dom.window.MouseEvent('click',{bubbles:true,cancelable:true});link.addEventListener('click',e=>{assert.equal(e.defaultPrevented,false);e.preventDefault();});link.dispatchEvent(event);
  assert.equal(link.hasAttribute('tabindex'),false);assert.equal(clear.type,'button');assert.equal(search.type,'search');
 }finally{f.dom.window.close();}
});
for(const prefix of ['/','/lab/'])test(`shareable URL and popstate preserve exact deployment path, external fields/hash/history state (${prefix})`,async()=>{
 const f=await fixture(prefix,'?keep=a%20b&keep=c&hot100_q=001&hot100_difficulty=简单&hot100_code=1#topic-01');try{
  assert.deepEqual(f.visible().map(n=>+n.dataset.seriesOrder),[1]);assert.equal(f.$('[data-series-code]').checked,true);
  f.dom.window.history.replaceState({ownedByRouter:9},'',f.dom.window.location.href);f.input('020');
  assert.equal(f.dom.window.location.pathname,prefix+'series/hot100/');assert.equal(f.dom.window.location.hash,'#topic-01');assert.deepEqual(new URL(f.dom.window.location.href).searchParams.getAll('keep'),['a b','c']);assert.deepEqual(f.dom.window.history.state,{ownedByRouter:9});
  f.$('[data-series-clear]').click();let params=new URL(f.dom.window.location.href).searchParams;assert.equal(params.has('hot100_q'),false);assert.equal(params.has('hot100_difficulty'),false);assert.equal(params.has('hot100_code'),false);assert.deepEqual(params.getAll('keep'),['a b','c']);
  f.dom.window.history.pushState(null,'',prefix+'series/hot100/?keep=1&hot100_difficulty=bogus&hot100_code=no&hot100_q=100#topic-17');f.dom.window.dispatchEvent(new f.dom.window.PopStateEvent('popstate'));
  assert.equal(f.$('select[data-series-difficulty]').value,'');assert.equal(f.$('[data-series-code]').checked,false);assert.deepEqual(f.visible().map(n=>+n.dataset.seriesOrder),[100]);assert.equal(f.dom.window.location.hash,'#topic-17');
  f.dom.window.history.pushState(null,'',prefix+'notes/?keep=else#native');f.input('001');assert.equal(f.dom.window.location.pathname,prefix+'notes/');assert.equal(f.dom.window.location.search,'?keep=else');assert.equal(f.dom.window.location.hash,'#native');
 }finally{f.dom.window.close();}
});
test('history API failure cannot break the functional index, duplicate boot cannot add handlers',async()=>{
 const f=await fixture();try{
  const {initSeriesFilter}=await import('../source/atelier/js/series-filter.js');initSeriesFilter({root:f.dom.window.document});
  let calls=0;f.dom.window.history.replaceState=()=>{calls++;throw Error('restricted');};f.input('001');assert.equal(calls,1);assert.equal(f.visible().length,1);f.$('[data-series-clear]').click();assert.equal(f.visible().length,100);
 }finally{f.dom.window.close();}
});
// Flatten actual screen media rules because JSDOM cannot evaluate viewport queries.
function screenRules(rules,width){return [...rules].flatMap(rule=>{
 if(!rule.cssRules)return [rule.cssText];if(rule.media){const q=rule.media.mediaText;if(/\bprint\b/.test(q))return [];if([...q.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)].some(([,bound,n])=>bound==='max'?width>+n:width<+n))return [];}
 return screenRules(rule.cssRules,width);
}).join('\n');}
function stylePaths(){const html=ejs.render(read('custom/redefine/nijika/head.ejs'),{page:{nijika:'notes',introHtml:'<p>Original</p>'},theme:{nijika:{cover:''}},nijika_page_metadata:()=>({}),is_post:()=>false,is_page:()=>false,is_home:()=>false,is_archive:()=>false,is_category:()=>false,is_tag:()=>false,url_for:p=>'/'+p,nijika_art_srcset:()=>'',open_graph:()=>'',export_config:()=>''});return [...html.matchAll(/<link rel="stylesheet" href="\/([^\"]+)"/g)].map(m=>m[1]);}
const sheets=stylePaths().map(file=>parse(read((['atelier/css/redefine.css','atelier/css/archive-global.css'].includes(file)?'public/':'source/')+file)).cssRules);
function contrast(a,b){const lum=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);const [x,y]=[lum(a),lum(b)].sort((a,b)=>b-a);return (x+.05)/(y+.05);}
for(const width of [360,768,1440])for(const theme of ['light','dark'])test(`real route stylesheet cascade keeps hidden/visible controls, readable type and touch targets at ${width}px ${theme}`,async()=>{
 const dom=new JSDOM(sheets.map(rules=>'<style>'+screenRules(rules,width)+'</style>').join('')+`<body class="nijika ${theme}">${markup()}</body>`,{url:'https://example.test/series/hot100/'});try{
  const d=dom.window.document,$=s=>d.querySelector(s),style=s=>dom.window.getComputedStyle($(s));
  assert.equal(style('[data-series-controls]').display,'none');assert.equal(style('[data-series-empty]').display,'none');assert.equal(style('.series-track').display,'grid');
  const {initSeriesFilter}=await import('../source/atelier/js/series-filter.js');initSeriesFilter({root:d});assert.equal(style('[data-series-controls]').display,'flex');assert.equal(style('[data-series-controls]').flexWrap,'wrap');
  for(const s of ['[data-series-search]','select[data-series-difficulty]','.series-filter-code','[data-series-clear]'])assert.equal(style(s).minHeight,'44px',s);
  for(const s of ['.series-track-state','.series-track small','.track-number','.series-topics small','.series-filter-feedback','[data-series-clear]'])assert.ok(parseFloat(style(s).fontSize)>=13,s+' 13px functional text');
  for(const s of ['.series-header p','.series-status-note','.series-intro summary','.series-filter-code'])assert.ok(parseFloat(style(s).fontSize)>=14,s+' 14px Chinese text');
  assert.equal(style('[data-series-search]').fontSize,'16px');assert.equal(style('.series-filter-search').minWidth,'0');
  const body=dom.window.getComputedStyle(d.body),surface=body.getPropertyValue('--surface').trim();for(const token of ['--ink','--text','--muted'])assert.ok(contrast(body.getPropertyValue(token).trim(),surface)>=4.5,token+' day/night contrast');
  $('[data-series-search]').value='nothing matches';$('[data-series-search]').dispatchEvent(new dom.window.Event('input'));assert.equal(style('.series-track').display,'none');assert.equal(style('.series-group').display,'none');assert.equal(style('.series-topics>a').display,'none');assert.equal(style('.series-mobile-topics>a').display,'none');assert.notEqual(style('[data-series-empty]').display,'none');
  $('[data-series-clear]').click();assert.equal(style('.series-track').display,'grid');assert.equal(style('.series-topics>a').display,'flex');assert.equal(style('[data-series-empty]').display,'none');
  assert.equal(style('.series-topic-disclosure').display,width<=640?'block':'none');assert.equal(style('.series-topics').display,width<=640?'none':'block');
 }finally{dom.window.close();}
});
test('only matching DOM loads the lazy filter; pending load leaves native navigation untouched',async()=>{
 const {initRouteFeatures,routeFeatures,startFeature}=await import('../source/atelier/js/route-features.js'),feature=routeFeatures.find(f=>f.id==='hot100-filter');assert.equal(feature.controls,undefined);
 const plain=new JSDOM('<main></main>');let calls=0;await initRouteFeatures({root:plain.window.document,loaders:{'hot100-filter':async()=>{calls++;return {initSeriesFilter(){}};}}});assert.equal(calls,0);plain.window.close();
 const dom=new JSDOM(markup(),{url:'https://example.test/series/hot100/'});try{
  let resolve;const ready=new Promise(r=>resolve=r),record=startFeature(feature,{root:dom.window.document,load:()=>ready});
  const link=dom.window.document.querySelector('.series-track'),event=new dom.window.MouseEvent('click',{bubbles:true,cancelable:true});link.addEventListener('click',e=>{assert.equal(e.defaultPrevented,false);e.preventDefault();});link.dispatchEvent(event);
  assert.equal(dom.window.document.querySelector('[data-series-controls]').hidden,true);
  resolve({initSeriesFilter(){calls++;}});await record.ready;assert.equal(calls,1);
 }finally{dom.window.close();}
});
