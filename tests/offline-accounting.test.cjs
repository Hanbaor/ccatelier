const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function harness(root='/'){
 const {cacheableURL}=await import('../source/atelier/js/offline-core.mjs'),{articleResources}=await import('../source/atelier/js/offline-resources.mjs');
 const origin='https://ccatelier.top',name='cc-live-shelf-v1-'+encodeURIComponent(root),meta=origin+root+'atelier/offline-records.json',stores=new Map(),events={},fetched=[];let bodyReads=0,offline=false,profile=null,html='<script src="'+root+'atelier/js/main.js"></script><p>文章</p>';
 const key=k=>typeof k==='string'?new URL(k,origin).href:k.url;
 const caches={async keys(){return [...stores.keys()];},async delete(n){return stores.delete(n);},async open(n){if(!stores.has(n))stores.set(n,new Map());const store=stores.get(n);return {async keys(){return [...store.keys()].map(url=>({url}));},async put(k,r){store.set(key(k),r.clone());},async delete(k){return store.delete(key(k));},async match(k){const response=store.get(key(k))?.clone();if(response&&key(k)!==meta){const read=response.arrayBuffer.bind(response);response.arrayBuffer=()=>{bodyReads++;return read();};}return response;}};}};
 const fetch=async input=>{const url=key(input);fetched.push(url);if(offline)throw Error('offline');if(url.endsWith('/archive.json'))return new Response(JSON.stringify({posts:[{path:root+'a/',title:'A',text:'article'},{path:root+'b/',title:'B',text:'article B'}]}));if(url.endsWith('/offline-profile.json'))return new Response(profile===null?'invalid JSON':JSON.stringify(profile));if(url.endsWith('/offline-shell.json'))return new Response(JSON.stringify([root+'atelier/js/main.js']));if(url.endsWith('/a/')||url.endsWith('/b/'))return new Response(html);return new Response('resource');};
 const self={location:{origin},addEventListener:(n,f)=>events[n]=f,clients:{claim:async()=>{},get:async()=>({url:origin+root+'a/'})},skipWaiting:async()=>{}};
 const context=vm.createContext({self,caches,fetch,URL,URLSearchParams,Response,Request,crypto,cacheableURL,articleResources,console});vm.runInContext(fs.readFileSync('custom/live-sw.template','utf8').replace(/^import[^\n]+\n/gm,'').replaceAll('__ROOT__',JSON.stringify(root)),context);
 return {root,origin,name,meta,stores,caches,fetched,handle:data=>context.handle(data),reads:()=>bodyReads,reset:()=>{bodyReads=0;fetched.length=0;},setProfile:p=>profile=p,setHTML:s=>html=s,goOffline:()=>offline=true,async rows(){return (await (await caches.open(name)).match(meta)).json();},async setRows(rows){await (await caches.open(name)).put(meta,new Response(JSON.stringify(rows)));},async actual(n){let total=0;for(const [url,r] of stores.get(n)||[])if(url!==meta)total+=(await r.clone().arrayBuffer()).byteLength;return total;},async request(path,mode='navigate'){let response;events.fetch({request:{url:origin+path,method:'GET',mode},clientId:'c',respondWith:p=>response=p});return response?await response:null;}};
}
for(const root of ['/','/lab/'])test(`modern listing reads no bodies; validates keys and preserves metadataOnly (${root})`,async()=>{
 const h=await harness(root);await h.handle({type:'save',path:root+'a/'});const rows=await h.rows(),expected=await h.actual(rows[0].snapshot);h.reset();
 const listed=await h.handle({type:'list'});assert.equal(listed.bytes,expected);assert.equal(h.reads(),0);assert.equal(h.fetched.length,0);assert.ok(rows[0].resources.length>0);
 const asset=rows[0].resources.find(([url])=>url.endsWith('main.js'))[0];await (await h.caches.open(rows[0].snapshot)).delete(asset);h.reset();
 assert.equal((await h.handle({type:'list',metadataOnly:true})).rows[0].bytes,expected);assert.equal(h.reads(),0);
 const broken=await h.handle({type:'list'});assert.equal(broken.rows[0].unavailable,true);assert.equal(broken.bytes,await h.actual(rows[0].snapshot));assert.ok(h.reads()>0);assert.equal(h.stores.has(rows[0].snapshot),true);assert.deepEqual(await h.rows(),rows);
});
test('corrupt byte counts use actual bodies, absent or foreign caches never get created',async()=>{
 const h=await harness();await h.handle({type:'save',path:'/a/'});const rows=await h.rows(),expected=await h.actual(rows[0].snapshot);
 for(const bytes of [-1,null,'99',Number.MAX_SAFE_INTEGER,rows[0].bytes+7]){await h.setRows([{...rows[0],bytes}]);h.reset();const result=await h.handle({type:'list'});assert.equal(result.bytes,expected);assert.equal(result.rows[0].bytes,expected);assert.ok(h.reads()>0);}
 for(const snapshot of ['foreign-private-cache',h.name+'-snapshot-missing']){await h.setRows([{...rows[0],snapshot}]);h.reset();const result=await h.handle({type:'list'});assert.equal(result.bytes,0);assert.equal(result.rows[0].unavailable,true);assert.equal(h.stores.has(snapshot),false);assert.equal(h.reads(),0);}
});
test('missing page and malformed records remain removable without claiming healthy bytes',async()=>{
 const h=await harness();await h.handle({type:'save',path:'/a/'});const rows=await h.rows();await (await h.caches.open(rows[0].snapshot)).delete(h.origin+'/a/');
 const result=await h.handle({type:'list'});assert.equal(result.rows[0].unavailable,true);assert.equal(result.bytes,await h.actual(rows[0].snapshot));
 await h.setRows([null,rows[0],{path:'/api/private/',snapshot:'foreign'}]);await h.handle({type:'remove',path:'/a/'});assert.equal((await h.handle({type:'list'})).bytes,0);assert.equal(h.stores.has('foreign'),false);
});
test('legacy shared snapshots count bodies accurately once; legacy immutable snapshots also fall back',async()=>{
 const h=await harness(),cache=await h.caches.open(h.name);await cache.put(h.origin+'/a/',new Response('A'));await cache.put(h.origin+'/b/',new Response('BB'));await cache.put(h.origin+'/atelier/js/main.js',new Response('shared'));
 await h.setRows([{path:'/a/',bytes:999},{path:'/b/',bytes:999}]);h.reset();assert.equal((await h.handle({type:'list'})).bytes,9);assert.ok(h.reads()>0);
 await h.handle({type:'save',path:'/a/'});const rows=await h.rows(),row=rows.find(r=>r.path==='/a/');delete row.resources;await h.setRows([row]);h.reset();assert.equal((await h.handle({type:'list'})).bytes,await h.actual(row.snapshot));assert.ok(h.reads()>0);
});
for(const root of ['/','/lab/'])test(`only validated Notes navigation context falls back to canonical page (${root})`,async()=>{
 const h=await harness(root);await h.handle({type:'save',path:root+'a/'});h.goOffline();const good='?notes='+encodeURIComponent(root+'notes/?group=writing&q=SQL#notes-catalog');
 assert.equal((await h.request(root+'a/'+good)).status,200);
 for(const query of [good+'&other=1',good+'&notes=x','?other=1','?notes=%ZZ','?notes='+encodeURIComponent(root+'notes/?group=bad'),'?notes='+encodeURIComponent(root+'notes/?q=a&q=b'),'?notes='+encodeURIComponent('https://evil.test/notes/'),'?notes='+encodeURIComponent(root+'notes/?q=%ZZ')])assert.equal(await h.request(root+'a/'+query),null,query);
 assert.equal(await h.request(root+'atelier/js/main.js'+good,'cors'),null);assert.equal(await h.request(root+'api/private/'+good),null);assert.equal((await h.request(root+'unsaved/'+good)).status,503);
 const row=(await h.rows())[0];assert.ok([...h.stores.get(row.snapshot).keys()].every(url=>!url.includes('?')));
});
for(const root of ['/','/lab/'])test(`profile v2 follows transitive dependencies and real conditional attributes (${root})`,async()=>{
 const h=await harness(root),js=n=>root+'atelier/js/'+n+'.js';
 h.setProfile({version:2,entries:[js('main')],dependencies:{[js('main')]:[js('reader'),{url:js('practice'),when:'data-practice'},{url:js('studio'),when:'data-studio'},{url:js('archive'),when:'data-archive'},{url:js('live'),when:'data-live-open'}],[js('reader')]:[js('reader-core'),js('main')],[js('article')]:[js('article-core')],[js('practice')]:[js('practice-core')],...Object.fromEntries(['reader-core','article-core','practice-core','studio','archive','live'].map(n=>[js(n),[]]))}});
 h.setHTML(`<script src="${js('main')}"></script><script src="${js('article')}"></script><div DATA-PRACTICE=""></div><!-- <i data-studio> --><template><div data-archive></div></template><script>const example='<b data-live-open>';</script><textarea><i data-studio></textarea>`);
 await h.handle({type:'save',path:root+'a/'});
 for(const n of ['main','reader','reader-core','article','article-core','practice','practice-core'])assert.ok(h.fetched.includes(h.origin+js(n)),n);
 for(const n of ['studio','archive','live'])assert.ok(!h.fetched.includes(h.origin+js(n)),n);
 assert.ok(!h.fetched.some(url=>url.endsWith('/offline-shell.json')));
 h.reset();assert.equal((await h.handle({type:'list'})).rows.length,1);assert.equal(h.reads(),0);
});
test('unknown, malformed and incomplete profiles safely use legacy shell before downloads',async()=>{
 const h=await harness();await h.handle({type:'save',path:'/a/'});assert.ok(h.fetched.some(url=>url.endsWith('/offline-shell.json')));const before=await h.rows();
 for(const profile of [{version:2,entries:[],dependencies:{}},{version:2,entries:['/atelier/js/main.js'],dependencies:{'/atelier/js/main.js':['/atelier/js/missing.js?bad=1']}},{version:2,entries:['/atelier/js/main.js'],dependencies:{'/atelier/js/main.js':['/atelier/js/missing.js']}},{version:3,entries:[],dependencies:{}},{version:2,entries:[],dependencies:null},{version:2,entries:['/atelier/js/main.js'],dependencies:{'/atelier/js/main.js':'bad'}}]){
  h.setProfile(profile);h.reset();await h.handle({type:'save',path:'/a/'});assert.equal((await h.rows()).length,1);assert.ok(h.fetched.some(url=>url.endsWith('/offline-shell.json')));
 }
});
test('skewed discovered scripts and ambiguous DOM markers select the complete legacy fallback',async()=>{
 for(const html of ['<script src="/atelier/js/new-entry.js"></script>','<svg><title><i data-practice></title></svg>','<select><div data-practice></div></select>']){
  const h=await harness();h.setProfile({version:2,entries:['/atelier/js/main.js'],dependencies:{'/atelier/js/main.js':[]}});h.setHTML(html);await h.handle({type:'save',path:'/a/'});assert.ok(h.fetched.some(url=>url.endsWith('/offline-shell.json')),html);
 }
});
test('HTML attribute whitespace is ASCII; ordinary select and SVG icons keep the lean profile',async()=>{
 const h=await harness();h.setProfile({version:2,entries:['/atelier/js/main.js'],dependencies:{'/atelier/js/main.js':[{url:'/atelier/js/practice.js',when:'data-practice'}],'/atelier/js/practice.js':[]}});
 h.setHTML('<svg><path d="x"></path></svg><select><option>One</option></select><div data-practice\u00a0></div><div data-practice\u000b></div>');await h.handle({type:'save',path:'/a/'});
 assert.ok(!h.fetched.some(url=>url.endsWith('/offline-shell.json')));assert.ok(!h.fetched.some(url=>url.endsWith('/practice.js')));
});
