const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ejs=require('ejs'),yaml=require('js-yaml'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const data=JSON.parse(read('public/atelier/data/archive.json'));
function render(prefix='/') {
 const writing=data.posts.filter(p=>p.group==='writing');
 const context={theme:yaml.load(read('_config.redefine.yml')),after_hours_counts:()=>({}),url_for:p=>prefix+String(p).replace(/^\//,''),nijika_art_srcset:()=>'',page:{posts:{each:fn=>writing.forEach(fn)}},live_metadata:p=>p,date_xml:p=>p,date:p=>p,nijika_count:n=>String(n).padStart(2,'0')};
 context.partial=(name,vars={})=>name==='nijika/pagination'?'':ejs.render(read('custom/redefine/'+name+'.ejs'),{...context,...vars});
 return ejs.render(read('custom/redefine/nijika/notes.ejs'),context);
}
for(const prefix of ['/','/lab/'])test(`Notes defaults to an article index with native optional tools (${prefix})`,()=>{
 const dom=new JSDOM(render(prefix)),d=dom.window.document;
 assert.equal(d.querySelector('.archive-options').open,false);
 assert.equal(d.querySelectorAll('.archive-options').length,1);
 assert.ok(!d.querySelector('#archive-q').closest('details'));
 for(const selector of ['[data-duration]','[data-tag]','#archive-sort','[data-view=graph]','.queue-open']) assert.ok(d.querySelector(selector).closest('.archive-options'));
 assert.deepEqual([...d.querySelectorAll('[data-group]')].map(b=>b.dataset.group),['writing','hot100','all']);
 assert.equal(d.querySelectorAll('.archive-fallback .archive-record').length,9);
 assert.equal(d.querySelectorAll('.archive-fallback .record-top').length,0);
 for(const row of d.querySelectorAll('.archive-fallback .archive-record')){assert.ok(row.querySelector('h2>a').getAttribute('href').startsWith(prefix));assert.ok(row.querySelector('p').textContent.trim());}
 assert.equal(d.querySelector('.archive-app').hidden,true);assert.equal(d.querySelector('.archive-fallback').hidden,false);
 assert.equal(d.querySelector('input[type=search]').maxLength,200);
 assert.doesNotMatch(d.querySelector('.catalog-heading-v3').textContent,/篇技术|篇手记/);
 dom.window.close();
});
test('advanced deep links reveal controls once while search, reset and manual collapse remain coherent',async()=>{
 const dom=new JSDOM(render()+'<div id="toast"></div>',{url:'https://ccatelier.test/notes/?tag=C%2B%2B%20STL&sort=oldest'}),{window}=dom;
 Object.assign(globalThis,{window,document:window.document,location:window.location,history:window.history,CustomEvent:window.CustomEvent,localStorage:window.localStorage,matchMedia:()=>({matches:false,addEventListener(){}}),fetch:async()=>({ok:true,json:async()=>data}),Worker:class{constructor(){throw Error('use pure query fallback');}}});
 document.body.dataset.root='/';
 const {initArchive}=await import('../source/atelier/js/archive.js');
 globalThis.fetch=async()=>{throw Error('offline');};
 await initArchive();
 assert.equal(document.querySelector('.archive-app').hidden,true);
 assert.equal(document.querySelector('.archive-fallback').hidden,false);
 assert.match(document.querySelector('.archive-fallback .live-status').textContent,/仍可使用下方目录/);
 globalThis.fetch=async()=>({ok:true,json:async()=>data});
 await initArchive();
 const $=s=>document.querySelector(s),options=$('.archive-options');
 assert.equal(options.open,true);assert.equal($('[data-tag]').value,'C++ STL');assert.equal($('#archive-sort').value,'oldest');
 assert.equal($('[data-archive-count]').classList.contains('sr-only'),false);assert.equal($('.archive-search [type=reset]').hidden,false);
 assert.equal(document.querySelectorAll('[data-archive-results] .record-top').length,0);
 options.open=false;
 history.pushState({},'','?q=set');window.dispatchEvent(new window.PopStateEvent('popstate'));
 assert.equal(options.open,false,'query updates do not force manually closed tools back open');
 const slash=new window.KeyboardEvent('keydown',{key:'/',bubbles:true,cancelable:true});document.body.dispatchEvent(slash);assert.equal(document.activeElement,$('#archive-q'));
 $('.archive-search').dispatchEvent(new window.Event('reset',{bubbles:true,cancelable:true}));
 assert.equal(location.search,'');assert.equal(options.open,false);assert.equal($('[data-archive-count]').classList.contains('sr-only'),true);assert.equal($('.archive-search [type=reset]').hidden,true);
 assert.equal(document.querySelectorAll('[data-archive-results] .archive-record').length,9);
 options.open=true;const queueButton=$('[data-queue-path]');queueButton.click();assert.equal(queueButton.getAttribute('aria-pressed'),'true');queueButton.click();assert.equal(queueButton.getAttribute('aria-pressed'),'false');options.open=false;
 history.pushState({},'','?q=zzzz-no-results');window.dispatchEvent(new window.PopStateEvent('popstate'));
 assert.ok($('.archive-empty'));assert.equal($('[data-archive-count]').classList.contains('sr-only'),false);
 $('[data-group=hot100]').click();$('.archive-search').dispatchEvent(new window.Event('reset',{bubbles:true,cancelable:true}));$('[data-group=hot100]').click();
 assert.equal(document.querySelectorAll('[data-archive-results] .record-top').length,18);
 assert.ok([...document.querySelectorAll('[data-archive-results] .record-top')].every(n=>/^\d{3}$/.test(n.textContent)));
 assert.ok($('.record-context').textContent.includes('解析待补'));
 await new Promise(resolve=>setTimeout(resolve,2250)); // Let the user-visible queue toast finish before replacing the document.
 window.dispatchEvent(new window.Event('pagehide'));dom.window.close();
});
test('default list uses space, legible type, and non-focusable hidden queue controls',()=>{
 const css=read('source/atelier/css/content-catalog.css'),immersive=read('source/atelier/css/immersive.css');
 const dom=new JSDOM('<style>'+css+'</style>');assert.ok(dom.window.document.styleSheets[0].cssRules.length>20);
 assert.match(css,/\.catalog-v3 \.archive-layout \{display:block\}/);
 assert.match(css,/\.catalog-v3 \.archive-results\[data-mode=list\] \{[^}]*gap:32px;border-top:0\}/);
 assert.match(css,/\.catalog-v3 \.archive-results:is\(\[data-mode=list\],\[data-mode=grid\]\) \.archive-record \{[^}]*border:0/);
 assert.match(css,/\.catalog-v3 \.record-bottom \[data-queue-path\] \{display:none\}/);
 assert.match(css,/\.catalog-v3:has\(\.archive-options\[open\]\) \.record-bottom \[data-queue-path\] \{display:inline-flex/);
 assert.match(css,/h2 \{[^}]*22px\/1\.5/);assert.match(css,/p \{[^}]*15px\/1\.8/);
 assert.doesNotMatch(immersive,/\.catalog-v3 \.archive-layout/);
 dom.window.close();
});

test('a search-only deep link keeps advanced tools closed and the active search visible',async()=>{
 const dom=new JSDOM(render(),{url:'https://ccatelier.test/notes/?q=set'}),{window}=dom;
 Object.assign(globalThis,{window,document:window.document,location:window.location,history:window.history,CustomEvent:window.CustomEvent,localStorage:window.localStorage,matchMedia:()=>({matches:false,addEventListener(){}}),fetch:async()=>({ok:true,json:async()=>data}),Worker:class{constructor(){throw Error('fallback');}}});
 document.body.dataset.root='/';const {initArchive}=await import('../source/atelier/js/archive.js');await initArchive();
 assert.equal(document.querySelector('.archive-options').open,false);
 assert.equal(document.querySelector('#archive-q').value,'set');
 assert.equal(document.querySelector('[data-archive-count]').classList.contains('sr-only'),false);
 assert.equal(document.querySelector('.archive-search [type=reset]').hidden,false);
 window.dispatchEvent(new window.Event('pagehide'));dom.window.close();
});
