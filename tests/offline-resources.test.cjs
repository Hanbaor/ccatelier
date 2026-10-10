const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const origin='https://ccatelier.top';
async function collect(html,root='/',page=root+'article/'){const {articleResources}=await import('../source/atelier/js/offline-resources.mjs');return articleResources(html,origin+page,origin+root).map(url=>new URL(url).pathname);}

test('collects real attributes only, with HTML whitespace, quoting and duplicate rules',async()=>{
 const html=`<IMG SRC = '/atelier/images/one.webp' src="/atelier/images/ignored.webp" data-src="/atelier/images/data.webp">
 <link HREF=/atelier/css/a.css><script src="/atelier/js/a.js"></script>
 <a data-scene-src="/atelier/images/lazy.webp" href="/notes/">Menu</a>
 <div src="/atelier/images/not-an-image.webp" title='src="/atelier/images/fake.webp"'>src="/atelier/images/text.webp"</div>`;
 assert.deepEqual(await collect(html),['/atelier/images/one.webp','/atelier/css/a.css','/atelier/js/a.js']);
});

test('comments, raw text, inert templates and truncated tags cannot create requests',async()=>{
 const fake='<img src="/atelier/images/fake.webp">';
 for(const html of [`<!--${fake}-->`,`<!--${fake}--!>`,`<!doctype html>`,`<script>const example='${fake}';</SCRIPT >`,`<style>/*${fake}*/</style>`,`<textarea>${fake}</textarea>`,`<title>${fake}</title>`,`<xmp>${fake}</xmp>`,`<iframe>${fake}</iframe>`,`<noembed>${fake}</noembed>`,`<noframes>${fake}</noframes>`,`<template><template>${fake}</template>${fake}</template>`,`<!--${fake}`,`<img src="/atelier/images/fake.webp"`,`<img src="/atelier/images/fake.webp>`,`<plaintext>${fake}`])assert.deepEqual(await collect(html),[],html);
 assert.deepEqual(await collect(`<script src='/atelier/js/real.js'>"${fake}"</script><img src='/atelier/images/real.webp'>`),['/atelier/js/real.js','/atelier/images/real.webp']);
 assert.deepEqual(await collect(`<template><script>"</template>${fake}"</script></template><img src='/atelier/images/real.webp'>`),['/atelier/images/real.webp']);
 assert.deepEqual(await collect(`<script><!--<script></script>${fake}--></script><img src='/atelier/images/real.webp'>`),['/atelier/images/real.webp']);
 for(const comment of ['<!-->','<!--->'])assert.deepEqual(await collect(comment+`<img src='/atelier/images/real.webp'>`),['/atelier/images/real.webp']);
});

test('responsive images keep all valid candidates, deduplicate, and reject malformed descriptors',async()=>{
 const html=`<picture><source srcset='/atelier/images/a.webp 480w, /atelier/images/b.webp 960w'><img src='/atelier/images/b.webp' srcset='/atelier/images/c.webp 1x, /atelier/images/d.webp 2x, /atelier/images/e.webp, /atelier/images/no.webp nonsense, /atelier/images/zero.webp 0w'></picture>
 <link imagesrcset='/atelier/images/a.webp 1x, /atelier/images/f.webp 2x'>
 <img srcset='data:image/svg+xml,content 1x, /atelier/images/g.webp 2x, /atelier/images/h.webp 1e1x, /atelier/images/no.webp 1e999x'>`;
 assert.deepEqual(await collect(html),['a','b','c','d','e','f','g','h'].map(name=>'/atelier/images/'+name+'.webp'));
});

test('decodes attribute entities once and resolves relative paths against article, with root isolation',async()=>{
 for(const root of ['/','/lab/']){
  const prefix=root+'atelier/images/';
  const html=`<img src=' ${prefix}a&#46;webp '><img src='${prefix}b&#x2e;webp'><img src='${prefix}c&period;webp'>
   <img src='./local.webp'><img src=plain.webp><img src='${prefix}semi&#46webp'>
   <img srcset='${prefix}d&#46;webp 1x, ${prefix}e&period;webp 2x'>
   <img src='${prefix}double&amp;period;webp'><img srcset='${prefix}double&amp;period;webp 2x'>`;
  assert.deepEqual(await collect(html,root,prefix+'article/'),['a','b','c'].map(name=>prefix+name+'.webp').concat([prefix+'article/local.webp',prefix+'article/plain.webp',prefix+'semi.webp',prefix+'d.webp',prefix+'e.webp']));
 }
});

test('all extracted attributes retain the same public-static security boundary',async()=>{
 const bad=['/api/private.js','/lab/api/private.js','/lab/admin/a.js','/lab/atelier/data/private.json','/lab/atelier/vendor/three/a.js','/lab/atelier/images/a.webp?secret=x','/lab/atelier/images/a.webp?x=1&amp;y=2','https://evil.test/lab/atelier/images/a.webp','//evil.test/lab/atelier/images/a.webp','/atelier/images/outside.webp','/lab/atelier/images/../images/a.webp','/lab/atelier/images/%2e%2e/images/a.webp','/lab/atelier/images/&#46;&#46;/images/a.webp','/lab/atelier/images/a&#9;.webp','/lab/atelier/images/a\\b.webp','javascript:alert(1)','data:image/png,abc','/lab/atelier/images/a&quest;secret=x'];
 for(const value of bad)for(const attr of [`src="${value}"`,`srcset="${value} 2x"`])assert.deepEqual(await collect(`<img ${attr}>`,'/lab/'),[],attr);
});

test('built article drops inert navigation scenes but preserves default image and responsive candidate',async()=>{
 const html=fs.readFileSync('public/2026/09/22/Hello-CC-Atelier/index.html','utf8'),urls=await collect(html);
 assert.ok(urls.includes('/atelier/images/v3/about.webp'));
 assert.ok(urls.includes('/atelier/images/v3/about-960.webp'));
 for(const image of ['v2/hero','v2/notes','v3/projects','v2/research','v2/life','v2/lounge','v2/stage','v3/guestbook'])assert.ok(!urls.includes('/atelier/images/'+image+'.webp'),image);
});
