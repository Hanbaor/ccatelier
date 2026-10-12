const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=process.env.SECTION_SEARCH_ROOT||path.resolve(__dirname,'..');
const {JSDOM}=require(require.resolve('jsdom',{paths:[root]}));
const source=fs.readFileSync(process.env.SECTION_SEARCH_SOURCE||path.join(root,'source/atelier/js/search.js'),'utf8');
// Read the actual runtime declaration without booting UI, networking or storage.
function sectionRecords(prefix='/'){
 const declaration=source.match(/const sections = ([^\n]+);/);assert.ok(declaration);
 return JSON.parse(JSON.stringify(vm.runInNewContext(declaration[0]+'; sections',{root:prefix})));
}
const pieces={
 'projects/':[
  ['.project-experiment-list h3','SQLite 查询实验','exact'],
  ['.project-coursework h3','EduRAG','exact'],
  ['.project-coursework-body > p','Transformer 练习德英翻译','substring']
 ],
 'research/':[
  ['.personal-research-opening .personal-intro','Database · Text-to-SQL','exact'],
  ['.personal-research-caption','SQL 教学示例','substring']
 ]
};
function verifyEvidence(directory,portable=false){
 const sections=sectionRecords();
 for(const [route,fragments] of Object.entries(pieces)){
  const file=portable?route.replace('/','.html'):route+'index.html';
  const dom=new JSDOM(fs.readFileSync(path.join(directory,file),'utf8'));
  for(const [selector,text,mode] of fragments){
   const nodes=[...dom.window.document.querySelectorAll(selector)];
   const matches=nodes.filter(node=>{const visible=node.textContent.replace(/\s+/g,' ').trim();return mode==='substring'?visible.includes(text):visible===text;});
   assert.ok(matches.length,route+' '+text);
   for(const node of matches)assert.equal(node.closest('[hidden],[aria-hidden=true],dialog,script,style'),null);
  }
  assert.equal(sections.find(section=>section.url==='/'+route).content,fragments.map(([,text])=>text).join('；'));dom.window.close();
 }
}
test('section excerpts equal visible scoped destination copy; no new routes or invented terms',()=>{
 verifyEvidence(path.join(root,'public'));
 const sections=sectionRecords('/blog/');assert.equal(sections.length,7);
 assert.deepEqual(sections.map(s=>s.url),['/blog/notes/','/blog/projects/','/blog/research/','/blog/life/','/blog/about/','/blog/studio/','/blog/studio/practice/']);
 assert.equal(sections.filter(s=>s.content).length,2);assert.ok(sections.every(s=>s.section===true));assert.ok(!sections.some(s=>/seekdb/i.test(s.content)));
});
test('production articles plus seven sections retain literal AND and article ranking',async()=>{
 const {findEntries}=await import(path.join(root,'source/atelier/js/search-core.mjs'));
 const articles=JSON.parse(fs.readFileSync(path.join(root,'public/search.json'),'utf8'));
 const entries=[...articles,...sectionRecords()];
 const sectionURLs=q=>findEntries(q,entries).filter(s=>s.section).map(s=>s.url);
 assert.deepEqual(sectionURLs('SQL'),['/projects/','/research/']);
 assert.deepEqual(sectionURLs('Transformer'),['/projects/']);
 assert.deepEqual(sectionURLs('Transformer 德英翻译'),['/projects/']);
 assert.deepEqual(sectionURLs('EduRAG'),['/projects/']);
 assert.deepEqual(sectionURLs('SQL 教学'),['/research/']);
 assert.equal(sectionURLs('Transformer SQL').length,1,'all terms really occur in the project excerpt');
 assert.equal(sectionURLs('Transformer 不存在').length,0);
 for(const q of ['vector','全排列','全排列 dfs','PyTorch'])assert.deepEqual(findEntries(q,entries).filter(s=>!s.section),findEntries(q,articles),q+' article ordering');
 assert.equal(findEntries('研究',entries)[0].url,'/research/');
});
if(process.env.SECTION_SEARCH_PREVIEW)test('portable 9 articles plus 7 sections use the same visible copy and keep allowed destinations',async()=>{
 const preview=process.env.SECTION_SEARCH_PREVIEW;verifyEvidence(path.join(preview,'site'),true);
 const {findEntries}=await import(path.join(root,'source/atelier/js/search-core.mjs'));
 const articles=JSON.parse(fs.readFileSync(path.join(preview,'search/entries.json'),'utf8')),targets=JSON.parse(fs.readFileSync(path.join(preview,'search/targets.json'),'utf8'));
 assert.equal(articles.length,9);const entries=[...articles,...sectionRecords()];assert.equal(entries.length,16);
 for(const q of ['SQL','Transformer','EduRAG','vector','全排列 dfs','PyTorch']){const results=findEntries(q,entries);assert.ok(results.length,q);assert.ok(results.every(s=>Object.hasOwn(targets,s.url)),q);}
});


test('actual initSearch renders section links, labels and matching excerpts in the DOM',async t=>{
 const dom=new JSDOM('<body data-root="/" data-search="/search.json"><button class="search-open">搜索</button><dialog id="search-dialog"><select id="search-scope"><option value="site">全站</option><option value="offline">本机离线</option></select><p id="search-status"></p><input id="search-input"><div id="search-results"></div></dialog></body>',{url:'https://ccatelier.test/'});
 const {window}=dom,globals={window,document:window.document,location:window.location,CustomEvent:window.CustomEvent,matchMedia:()=>({matches:false,addEventListener(){}})};
 const saved=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 t.after(()=>{dom.window.close();for(const [key,descriptor] of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const {pathToFileURL}=require('node:url');
 // The staged source keeps its real imports, redirected only to their actual
 // repository files. No UI/search/context implementation is mocked or replaced.
 const moduleSource=source.replace(/from '([.]\/[^']+)'/g,(_,relative)=>"from '"+pathToFileURL(path.resolve(root,'source/atelier/js',relative)).href+"'");
 const {initSearch}=await import('data:text/javascript;base64,'+Buffer.from(moduleSource).toString('base64'));
 const context=await import(pathToFileURL(path.join(root,'source/atelier/js/search-context.mjs')).href);
 const articles=JSON.parse(fs.readFileSync(path.join(root,'public/search.json'),'utf8'));let siteLoads=0,offlineLoads=0;
 initSearch({loadSite:async()=>{siteLoads++;return articles;},loadOffline:async()=>{offlineLoads++;throw Error('Unexpected offline read');},loadContext:async()=>context});
 const d=window.document,input=d.querySelector('#search-input'),box=d.querySelector('#search-results');
 d.querySelector('.search-open').click();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(d.querySelector('dialog').open,true);assert.equal(siteLoads,1);assert.equal(offlineLoads,0);
 for(const [query,paths] of [['SQL',['/projects/','/research/']],['Transformer',['/projects/']]]){
  input.value=query;input.dispatchEvent(new window.Event('input',{bubbles:true}));await new Promise(resolve=>setImmediate(resolve));
  for(const url of paths){
   const entry=sectionRecords().find(entry=>entry.url===url),link=[...box.querySelectorAll('a.search-result')].find(link=>link.getAttribute('href')===url);assert.ok(link,query+' '+url);
   assert.equal(link.origin,'https://ccatelier.test');assert.equal(link.querySelector(':scope > small').textContent,'栏目');
   const copy=link.querySelector('.result-copy'),excerpt=copy.querySelector('small');assert.ok(excerpt,query+' excerpt');
   const rendered=context.searchResultText(entry,query);assert.equal(excerpt.textContent,rendered.excerpt.map(part=>part.text).join(''));
   assert.deepEqual([...excerpt.querySelectorAll('mark')].map(mark=>mark.textContent),rendered.excerpt.filter(part=>part.match).map(part=>part.text));
   assert.ok([...excerpt.querySelectorAll('mark')].some(mark=>mark.textContent.toLowerCase().includes(query.toLowerCase())));
   assert.equal(copy.cloneNode(true).childNodes[0].textContent,entry.title);
  }
  assert.equal(box.getAttribute('aria-busy'),'false');
 }
 assert.equal(siteLoads,1);assert.equal(offlineLoads,0);
});
