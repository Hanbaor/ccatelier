const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function harness(root='/'){
 const {cacheableURL}=await import('../source/atelier/js/offline-core.mjs');const {articleResources}=await import('../source/atelier/js/offline-resources.mjs');const stores=new Map(),events={},origin='https://ccatelier.top';let puts=0,failAt=Infinity,revision='old',pageHTML=null,failedURL=null,networkDown=false;const fetched=[];
 const key=k=>typeof k==='string'?new URL(k,origin).href:k.url;
 const caches={async open(name){if(!stores.has(name))stores.set(name,new Map());const data=stores.get(name);return {async put(k,r){puts++;if(puts===failAt)throw Error('QuotaExceededError');data.set(key(k),r.clone());},async match(k){return data.get(key(k))?.clone();},async delete(k){return data.delete(key(k));},async keys(){return [...data.keys()].map(url=>({url}));}};},async delete(name){return stores.delete(name);},async keys(){return [...stores.keys()];}};
 const fetch=async input=>{const url=key(input);fetched.push(url);if(networkDown||url===failedURL)throw Error('Network unavailable');if(url.endsWith('/archive.json'))return new Response(JSON.stringify({posts:[{path:root+'a/',title:'A',text:revision+' 正文 SQL'},{path:root+'b/',title:'B',text:'unsaved unique'},{path:root+'draft/',title:'draft',text:'private',published:false},...['api/private/','admin/','../escape/','./api/private','./admin/'].map(path=>({path:root+path,title:'bad path',text:'private'}))]}));if(url.endsWith('/offline-shell.json'))return new Response(JSON.stringify([root+'atelier/js/main.js',root+'atelier/css/a.css']));if(url.endsWith('/a/'))return new Response(pageHTML||'<script src="'+root+'atelier/js/main.js"></script>');if(url.endsWith('.js'))return new Response(revision);return new Response('body{}');};
 const self={location:{origin},addEventListener:(name,fn)=>events[name]=fn,clients:{claim:async()=>{},get:async()=>({url:origin+'/a/'})},skipWaiting:async()=>{}};
 const context=vm.createContext({self,caches,fetch,URL,Response,Request,crypto,cacheableURL,articleResources,console});vm.runInContext(fs.readFileSync('custom/live-sw.template','utf8').replace(/^import[^\n]+\n/gm,'').replaceAll('__ROOT__',JSON.stringify(root)),context);
 return {stores,caches,context,events,fetched,setHTML(html){pageHTML=html;},failURL(path){failedURL=origin+path;},goOffline(){networkDown=true;},failNextPut(){failAt=puts+1;},failMeta(){failAt=puts+5;},handle:data=>context.handle(data),failNext(){failAt=puts+2;},revise(){revision='new';},async request(path,mode='cors'){let result;events.fetch({request:{url:origin+path,method:'GET',mode},clientId:'client',respondWith:p=>result=p});return result?await result:null;}};
}
test('a failed first save leaves no snapshot, rows, or stranded assets',async()=>{const h=await harness();h.failNext();await assert.rejects(h.handle({type:'save',path:'/a/'}));const state=await h.handle({type:'list'});assert.equal(state.rows.length,0);assert.equal(state.bytes,0);});
test('failed update preserves previous article snapshot and online fetch sees new scripts',async()=>{const h=await harness();await h.handle({type:'save',path:'/a/'});const before=await h.handle({type:'list'});h.revise();h.failNext();await assert.rejects(h.handle({type:'save',path:'/a/'}));const after=await h.handle({type:'list'});assert.deepEqual(JSON.parse(JSON.stringify(after.rows)),JSON.parse(JSON.stringify(before.rows)));assert.equal(after.bytes,before.bytes);const response=await h.request('/atelier/js/main.js');assert.equal(await response.text(),'new');assert.equal(await h.request('/api/comments'),null);});

test('offline search reads only committed article snapshots, without fetching or returning unsaved posts',async()=>{
 for(const root of ['/','/lab/']){const h=await harness(root);await h.handle({type:'save',path:root+'a/'});h.fetched.length=0;
 const result=await h.handle({type:'search-index'});assert.equal(result.version,1);assert.equal(result.entries.length,1);assert.equal(result.entries[0].url,root+'a/');assert.equal(result.entries[0].content,'old 正文 SQL');assert.equal(result.unavailable,0);assert.equal(h.fetched.length,0);
 await h.handle({type:'remove',path:root+'a/'});assert.equal((await h.handle({type:'search-index'})).entries.length,0);
 }
});
test('metadata commit failure preserves searchable old copy; update and clear switch search membership',async()=>{
 const h=await harness();await h.handle({type:'save',path:'/a/'});h.revise();h.failMeta();await assert.rejects(h.handle({type:'save',path:'/a/'}));assert.equal((await h.handle({type:'search-index'})).entries[0].content,'old 正文 SQL');
 await h.handle({type:'save',path:'/a/'});assert.equal((await h.handle({type:'search-index'})).entries[0].content,'new 正文 SQL');await h.handle({type:'clear'});assert.equal((await h.handle({type:'search-index'})).entries.length,0);
});
test('missing HTML, malformed index and foreign snapshot references are reported instead of invented results',async()=>{
 const h=await harness();await h.handle({type:'save',path:'/a/'});const row=(await h.handle({type:'list'})).rows[0],snapshot=await h.caches.open(row.snapshot);await snapshot.delete('https://ccatelier.top/a/');let result=await h.handle({type:'search-index'});assert.equal(result.entries.length,0);assert.equal(result.unavailable,1);
 await snapshot.put('https://ccatelier.top/a/',new Response('page'));await snapshot.put('https://ccatelier.top/atelier/data/archive.json',new Response('{'));result=await h.handle({type:'search-index'});assert.equal(result.unavailable,1);
 const meta=await h.caches.open('cc-live-shelf-v1-%2F');await meta.put('https://ccatelier.top/atelier/offline-records.json',new Response(JSON.stringify([{...row,snapshot:'other-private-cache'}])));result=await h.handle({type:'search-index'});assert.equal(result.entries.length,0);assert.equal(result.unavailable,1);assert.equal(h.stores.has('other-private-cache'),false);
});
test('legacy shared snapshots remain searchable and published false is never saved or searched',async()=>{
 const h=await harness();await assert.rejects(h.handle({type:'save',path:'/draft/'}));assert.ok(!h.fetched.some(url=>url.endsWith('/draft/')));
 const cache=await h.caches.open('cc-live-shelf-v1-%2F');await cache.put('https://ccatelier.top/atelier/offline-records.json',new Response(JSON.stringify([{path:'/a/',title:'A'}])));await cache.put('https://ccatelier.top/a/',new Response('page'));await cache.put('https://ccatelier.top/atelier/data/archive.json',new Response(JSON.stringify({posts:[{path:'/a/',title:'legacy',text:'saved text'}]})));
 assert.equal((await h.handle({type:'search-index'})).entries[0].title,'legacy');await cache.put('https://ccatelier.top/atelier/data/archive.json',new Response(JSON.stringify({posts:[{path:'/a/',title:'private',text:'secret',published:false}]})));const result=await h.handle({type:'search-index'});assert.equal(result.entries.length,0);assert.equal(result.unavailable,1);
});

test('failed remove keeps prior searchable copy and unsafe public-index paths are rejected before article fetch',async()=>{
 const h=await harness('/lab/');for(const path of ['api/private/','admin/','../escape/','./api/private','./admin/'])await assert.rejects(h.handle({type:'save',path:'/lab/'+path}));assert.ok(h.fetched.every(url=>url.endsWith('/archive.json')));
 await h.handle({type:'save',path:'/lab/a/'});h.failNextPut();await assert.rejects(h.handle({type:'remove',path:'/lab/a/'}));assert.equal((await h.handle({type:'search-index'})).entries.length,1);
});

test('responsive article resources are atomic, stay readable offline, and never fetch inert previews',async()=>{
 for(const root of ['/','/lab/']){
  const h=await harness(root),image=root+'atelier/images/article.webp',small=root+'atelier/images/article-480.webp';
  h.setHTML(`<img src="${image}" srcset="${small} 480w, ${image} 960w"><a data-scene-src="${root}atelier/images/inert.webp"></a>`);
  await h.handle({type:'save',path:root+'a/'});
  assert.ok(h.fetched.includes('https://ccatelier.top'+small));assert.ok(!h.fetched.some(url=>url.endsWith('/inert.webp')));
  const before=(await h.handle({type:'list'})).rows;
  h.revise();h.setHTML(`<img src="${image}" srcset="${root}atelier/images/missing.webp 480w">`);h.failURL(root+'atelier/images/missing.webp');
  await assert.rejects(h.handle({type:'save',path:root+'a/'}));
  assert.deepEqual(JSON.parse(JSON.stringify((await h.handle({type:'list'})).rows)),JSON.parse(JSON.stringify(before)));
  assert.equal((await h.handle({type:'search-index'})).entries[0].content,'old 正文 SQL');
  // Point the request client at this prefixed article, independently of HTTP cache.
  h.context.self.clients.get=async()=>({url:'https://ccatelier.top'+root+'a/'});h.goOffline();
  assert.ok((await (await h.request(root+'a/','navigate')).text()).includes(small));
  assert.equal(await (await h.request(small)).text(),'body{}');
  assert.equal(await (await h.request(root+'atelier/js/main.js')).text(),'old');
 }
});

test('metadata-only status reads do not open snapshots, scan resources or clean caches',async()=>{
 const h=await harness();await h.handle({type:'save',path:'/a/'});const expected=(await h.handle({type:'list'})).rows;
 const open=h.caches.open;let reads=0;
 h.caches.open=async name=>{assert.equal(name,'cc-live-shelf-v1-%2F');const cache=await open(name);return {async match(key){reads++;assert.equal(key,'https://ccatelier.top/atelier/offline-records.json');return cache.match(key);}};};
 h.caches.keys=async()=>{assert.fail('metadata-only reads must not enumerate or clean caches');};
 const result=await h.handle({type:'list',metadataOnly:true});assert.equal(reads,1);assert.deepEqual(result.rows,expected);assert.equal('bytes' in result,false);
});

test('unsaved offline navigation keeps 503 and back action with neutral, accurate guidance',async()=>{
 const h=await harness();h.goOffline();const response=await h.request('/unsaved/','navigate'),html=await response.text();
 assert.equal(response.status,503);assert.match(response.headers.get('Content-Type'),/text\/html/);
 assert.ok(html.includes('background:#111114;color:#f5f5f7'));assert.ok(html.includes('文章文末展开「阅读工具」，选择「离线保存」'));assert.ok(html.includes('onclick="history.back()"'));
 assert.ok(!html.includes('文章工作台'));assert.ok(!html.includes('#151613'));assert.ok(!html.includes('#e6dbba'));
});
