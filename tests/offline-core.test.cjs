const test=require('node:test'),assert=require('node:assert/strict');
test('offline whitelist excludes API, admin, foreign origins and encoded traversal',async()=>{
 const {cacheableURL}=await import('../source/atelier/js/offline-core.mjs');const base='https://ccatelier.top/lab/';
 for(const p of ['/lab/atelier/js/main.js','/lab/atelier/images/nijika.png','/lab/css/build/tailwind.css'])assert.ok(cacheableURL(p,base));
 for(const p of ['/api/stats','/lab/api/stats','/lab/admin/','/lab/atelier/../admin/','https://evil.test/lab/atelier/a.js','/lab/atelier/%2e%2e/admin/','/lab/atelier/images/a.png?secret=x','/lab/atelier/data/private.json'])assert.equal(cacheableURL(p,base),false,p);
});
