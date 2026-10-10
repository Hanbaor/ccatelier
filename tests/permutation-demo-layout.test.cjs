const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),ejs=require('ejs');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8'),css=read('source/atelier/css/permutation-demo.css');
function fixture(){return new JSDOM(`<style>${read('source/atelier/css/content.css')}</style><style>${read('source/atelier/css/reader.css')}</style><style>${css}</style><div class="article-body markdown-body">${ejs.render(read('custom/redefine/nijika/permutation-demo.ejs'),{url_for:p=>'/'+p})}</div>`,{pretendToBeVisual:true});}
test('all component CSS stays scoped, has focus/touch affordances and does not add animation',()=>{
 const dom=fixture();try{const sheet=dom.window.document.styleSheets[2];for(const rule of sheet.cssRules)assert.match(rule.selectorText,/permutation-demo/);assert.match(css,/:focus-visible\{outline:2px solid currentColor;outline-offset:3px\}/);assert.match(css,/min-height:44px/);assert.doesNotMatch(css,/(?:animation|transition)\s*:/);assert.match(css,/\.dark \.permutation-demo/);}finally{dom.window.close();}
});
test('narrow reader layout confines the tree and results, while fallback and native summary stay readable',async()=>{
 const {mountPermutationDemo}=await import('../source/atelier/js/permutation-demo-view.js'),dom=fixture(),doc=dom.window.document,host=doc.querySelector('details'),style=selector=>dom.window.getComputedStyle(doc.querySelector(selector));
 try{assert.equal(style('summary').display,'list-item');assert.equal(style('summary').minHeight,'44px');assert.equal(style('summary').backgroundColor,'rgba(0, 0, 0, 0)');assert.notEqual(style('[data-permutation-fallback]').display,'none');assert.equal(style('[data-permutation-app]').display,'none');host.open=true;assert.equal(style('summary').backgroundColor,'rgba(0, 0, 0, 0)');mountPermutationDemo(host);assert.equal(style('.permutation-tree-window').overflowX,'auto');assert.equal(style('.permutation-tree-window').maxWidth,'100%');assert.equal(style('.permutation-timeline').width,'100%');assert.equal(style('.permutation-output ol').overflowY,'auto');assert.equal(doc.querySelector('svg').getAttribute('aria-hidden'),'true');assert.equal(doc.querySelector('svg').querySelectorAll('[tabindex]').length,0);}finally{dom.window.close();}
});
test('new modules stay outside the global initial graph and page-only script is discoverable offline',async()=>{
 const {graph}=require('../tools/module-graph.cjs'),result=graph(path.resolve(__dirname,'../source'),['atelier/js/main.js']);
 assert.ok(result.files.every(file=>!file.path.includes('permutation-demo')));
 const {articleResources}=await import('../source/atelier/js/offline-resources.mjs');
 const html=ejs.render(read('custom/redefine/nijika/permutation-demo.ejs'),{url_for:p=>'/lab/'+p});
 assert.ok(articleResources(html,'https://test.invalid/lab/writing/csdn-124338541/','https://test.invalid/lab/').includes('https://test.invalid/lab/atelier/js/permutation-demo.js'));
 assert.doesNotMatch(html,/<link|modulepreload/);assert.doesNotMatch(read('source/atelier/js/permutation-demo.js'),/^import\s/m);
});
test('existing offline shell collector includes all lazy trace assets for prefixed installations',()=>{
 const generators=new Map(),previous=globalThis.hexo;
 try{globalThis.hexo={extend:{generator:{register:(name,fn)=>generators.set(name,fn)},helper:{register(){}}}};const modulePath=require.resolve('../scripts/live-archive.js');delete require.cache[modulePath];require(modulePath);
 for(const root of ['/','/preview/']){const output=generators.get('live-archive').call({config:{root},base_dir:path.resolve(__dirname,'..')},{posts:{sort:()=>({toArray:()=>[]})},data:{}}),shell=JSON.parse(output.find(file=>file.path==='atelier/data/offline-shell.json').data);for(const file of ['js/permutation-demo.js','js/permutation-demo-view.js','js/permutation-demo-core.mjs','css/permutation-demo.css'])assert.ok(shell.includes(root+'atelier/'+file),file);}
 }finally{if(previous===undefined)delete globalThis.hexo;else globalThis.hexo=previous;}
});
test('trace anchor stays collapsed and reader text extraction excludes both static and interactive copies',async()=>{
 const {articleText}=await import('../source/atelier/js/text-anchors.js'),{mountPermutationDemo}=await import('../source/atelier/js/permutation-demo-view.js'),dom=fixture(),doc=dom.window.document,host=doc.querySelector('details');
 const oldDoc=globalThis.document,oldFilter=globalThis.NodeFilter;
 try{globalThis.document=doc;globalThis.NodeFilter=dom.window.NodeFilter;const article=doc.querySelector('.article-body');article.append(doc.createTextNode('唯一的作者原文'));assert.equal(host.id,'permutation-trace');assert.equal(host.style.scrollMarginTop,'6rem');assert.equal(host.open,false);assert.equal(articleText(article).text.trim(),'唯一的作者原文');mountPermutationDemo(host);assert.equal(articleText(article).text.trim(),'唯一的作者原文');assert.equal(host.open,false);assert.match(css,/scroll-margin-top:6rem/);}finally{if(oldDoc===undefined)delete globalThis.document;else globalThis.document=oldDoc;if(oldFilter===undefined)delete globalThis.NodeFilter;else globalThis.NodeFilter=oldFilter;dom.window.close();}
});
test('residual numeric values retain opaque muted text rather than low-contrast faded data',async()=>{
 const {mountPermutationDemo}=await import('../source/atelier/js/permutation-demo-view.js'),dom=fixture();try{mountPermutationDemo(dom.window.document.querySelector('details'));const slot=dom.window.document.querySelector('.permutation-slot[data-active=false] b');assert.equal(dom.window.getComputedStyle(slot).opacity,'');assert.doesNotMatch(css,/opacity\s*:\s*\.56/);assert.match(css,/\.permutation-slot\{[^}]*color:var\(--muted/);}finally{dom.window.close();}
});
test('result chips suppress theme decimal markers on li while preserving the semantic ol and ordinary lists',async()=>{
 const {mountPermutationDemo}=await import('../source/atelier/js/permutation-demo-view.js');
 // The real theme assigns list-style to li itself, overriding a reset only on ol.
 const themeSource=read('node_modules/hexo-theme-redefine/source/css/common/markdown.styl');
 assert.match(themeSource,/ol:not\(\.not-markdown\)[\s\S]*?\n    li\n      list-style decimal/);
 const themeRule='.markdown-body ol:not(.not-markdown) li{list-style:decimal}';
 const dom=new JSDOM(`<style>${themeRule}</style><style>${css}</style><div class="article-body markdown-body"><ol id="ordinary"><li>Author list</li></ol>${ejs.render(read('custom/redefine/nijika/permutation-demo.ejs'),{url_for:p=>'/'+p})}</div>`,{pretendToBeVisual:true});
 try{const doc=dom.window.document;mountPermutationDemo(doc.querySelector('details'));const seek=doc.querySelector('[data-permutation-seek]');seek.value=seek.max;seek.dispatchEvent(new dom.window.Event('input'));const results=doc.querySelector('[data-permutation-results]');assert.equal(results.tagName,'OL');assert.equal(results.children.length,6);for(const item of results.children){assert.equal(item.tagName,'LI');assert.equal(dom.window.getComputedStyle(item).listStyle,'none');assert.equal(item.firstElementChild.tagName,'BUTTON');}assert.equal(dom.window.getComputedStyle(doc.querySelector('#ordinary li')).listStyle,'decimal');}finally{dom.window.close();}
});
