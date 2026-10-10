const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ejs=require('ejs'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const render=(name,extra={})=>new JSDOM(ejs.render(read(`custom/redefine/nijika/${name}.ejs`),{
 url_for:v=>'/'+String(v).replace(/^\//,''),partial:()=>'<svg aria-hidden="true"></svg>',...extra
}));
test('practice starts with the score, keeping optional controls and explanations available',()=>{
 const dom=render('practice'),d=dom.window.document;
 const before=(a,b)=>Boolean(d.querySelector(a).compareDocumentPosition(d.querySelector(b))&4);
 assert.ok(before('[data-practice-sheet]','.practice-options'));
 assert.ok(before('[data-practice-sheet]','[data-challenge]'));
 assert.ok(d.querySelector('details:not([open]) [data-practice-description]'));
 assert.ok(d.querySelector('details [data-practice-import]'));
 assert.ok(d.querySelector('details [data-practice-export]'));
 assert.ok(d.querySelector('details:not([open]) [data-practice-export-svg]'));
 assert.equal(d.querySelector('[data-practice-export]').textContent,'导出 JSON');
 for(const name of ['play','stop','loop','start','end','metronome','drums']) assert.equal(d.querySelectorAll(`[data-practice-${name}]`).length,1);
 dom.window.close();
});
test('SQL run control precedes the examples without duplicating a live status or editor',()=>{
 const dom=render('research'),d=dom.window.document;
 assert.equal(d.querySelectorAll('[data-sql-run]').length,1);
 assert.equal(d.querySelectorAll('[data-sql-status]').length,1);
 assert.ok(d.querySelector('[data-sql-run-bar]').compareDocumentPosition(d.querySelector('[data-sql-case]'))&4);
 assert.equal(d.querySelectorAll('[data-sql-editor]').length,3);
 dom.window.close();
});
test('header exposes the real music destination and marks rehearsal as its current section',()=>{
 const dom=render('header',{nijika_section:()=> 'practice'}),d=dom.window.document;
 assert.deepEqual([...d.querySelectorAll('.header-navigation a')].map(a=>a.getAttribute('href')),['/atelier/','/notes/','/studio/','/projects/','/research/']);
 assert.equal(d.querySelector('.header-navigation [aria-current]').getAttribute('href'),'/studio/');
 dom.window.close();
});
test('shared layout and route styles parse without fixed offsets or a forced cover height',()=>{
 const styles=['immersive','rooms-v2','practice','projects','research-sql'].map(n=>read(`source/atelier/css/${n}.css`));
 const dom=new JSDOM(styles.map(s=>`<style>${s}</style>`).join(''));
 assert.equal(dom.window.document.styleSheets.length,5);
 for(const sheet of dom.window.document.styleSheets) assert.ok(sheet.cssRules.length>10);
 assert.match(styles[0],/--layout-width:1200px/);
 assert.doesNotMatch(styles[0],/\.hub-(?:studio|projects)\s*\{[^}]*margin-top/);
 assert.doesNotMatch(styles[0],/\.cover\.cinema-v3\s*\{[^}]*min-height:(?:650|670|710)px/);
 assert.match(styles[0],/\.header-navigation a\[aria-current=page\]/);
 dom.window.close();
});
