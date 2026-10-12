const test=require('node:test'),assert=require('node:assert/strict');
const moduleReady=import('../source/atelier/js/reading-context.mjs');
const searchFor=href=>'?notes='+encodeURIComponent(href);

for(const root of ['/','/lab/'])test(`Notes context round-trips every filter in native URLs (${root})`,async()=>{
 const {notesEntryHref,readNotesContext}=await moduleReady;
 const returning=root+'notes/?q=set+%E8%BE%B9%E7%95%8C&group=all&tag=C%2B%2B+STL&duration=medium&sort=oldest&view=grid#notes-catalog';
 const href=notesEntryHref(root+'writing/set/#%E8%BE%B9%E7%95%8C',returning,root),url=new URL(href,'https://atelier.test');
 assert.equal(url.pathname,root+'writing/set/');assert.equal(url.hash,'#%E8%BE%B9%E7%95%8C');assert.equal(url.searchParams.get('notes'),returning);
 assert.deepEqual(readNotesContext(url.search,root),{href:returning,label:'返回筛选结果',section:'catalog'});
 assert.deepEqual(readNotesContext(searchFor(root+'notes/'),root),{href:root+'notes/#notes-catalog',label:'返回笔记目录',section:'catalog'});
 const path=readNotesContext(searchFor(root+'notes/?view=graph#reading-paths'),root);
 assert.equal(path.href,root+'notes/?view=graph#reading-paths');assert.equal(path.section,'paths');assert.equal(path.label,'返回选读路径');
});

test('direct visits are neutral and independent links never leak context between journeys',async()=>{
 const {notesEntryHref,readNotesContext}=await moduleReady;
 const first=notesEntryHref('/writing/a/','/notes/?q=first#notes-catalog'),second=notesEntryHref('/writing/a/','/notes/?q=second#notes-catalog');
 assert.equal(readNotesContext(''),null);assert.equal(readNotesContext('?q=first'),null);
 assert.equal(readNotesContext(new URL(first,'https://test.invalid').search).href,'/notes/?q=first#notes-catalog');
 assert.equal(readNotesContext(new URL(second,'https://test.invalid').search).href,'/notes/?q=second#notes-catalog');
 assert.equal(notesEntryHref(first,'/notes/#reading-paths').split('notes=').length,2);
 assert.equal(notesEntryHref('/writing/a/?resume=.5&redirect=https://evil.test#heading','https://evil.test/'),'/writing/a/#heading');
});

test('return URLs reject open redirects, route escape, unknown or repeated filters and malformed input',async()=>{
 const {readNotesContext}=await moduleReady;
 const invalid=[
  'https://evil.test/notes/','https://reading.invalid/notes/','//evil.test/notes/','javascript:alert(1)','notes/','/outside/','/notes','/notes/extra/',
  '/x/../notes/','/%2e/notes/','/%2fnotes/','/notes/\\evil','/notes/\n','/notes/#arbitrary','/notes/#%72eading-paths',
  '/notes/?redirect=//evil.test','/notes/?notes=/notes/','/notes/?q=one&q=two','/notes/?tag=a&tag=b','/notes/?view=unknown','/notes/?sort=__proto__',
  '/notes/?duration=year','/notes/?group=other','/notes/?constructor=all','/notes/?q=%00','/notes/?tag=%0a','/notes/?q=%E0%A4%A','/notes/?q=%zz',
  '/notes/?q='+'a'.repeat(201),'/notes/?tag='+'a'.repeat(81),'/notes/?q='+'a'.repeat(5000)
 ];
 for(const href of invalid)assert.equal(readNotesContext(searchFor(href)),null,href);
 assert.equal(readNotesContext(searchFor('/notes/')+'&notes='+encodeURIComponent('/notes/')),null);
 for(const value of [null,{},7,'?notes='+'x'.repeat(16385)])assert.equal(readNotesContext(value),null);
 assert.equal(readNotesContext(searchFor('/notes/'),'/lab/'),null);assert.equal(readNotesContext(searchFor('/lab2/notes/'),'/lab/'),null);
 for(const root of ['lab/','//evil/','/lab/../','/lab'])assert.equal(readNotesContext(searchFor('/notes/'),root),null);
});

test('destination validation rejects unsafe and out-of-root article links while preserving valid source anchors',async()=>{
 const {notesEntryHref}=await moduleReady;
 for(const href of ['https://example.test/lab/writing/a/','//evil/a/','javascript:alert(1)','/outside/','/lab2/a/','/lab/../a/','/lab/%2e%2e/a/','/lab/%2fa/','/lab/\\evil','/lab/a\n',null])assert.equal(notesEntryHref(href,'/lab/notes/','/lab/'),null,String(href));
 assert.equal(new URL(notesEntryHref('/lab/writing/a/#real%20heading','/lab/notes/','/lab/'),'https://test.invalid').hash,'#real%20heading');
});

test('maximum Unicode filters remain bounded and default filter values canonicalize away',async()=>{
 const {readNotesContext,notesEntryHref}=await moduleReady;
 const p=new URLSearchParams({q:'边'.repeat(200),tag:'界'.repeat(80),group:'writing',duration:'all',sort:'newest',view:'list'});
 const href=notesEntryHref('/writing/a/','/notes/?'+p),context=readNotesContext(new URL(href,'https://test.invalid').search);
 assert.ok(href.length<16384);assert.ok(context);const query=new URL(context.href,'https://test.invalid').searchParams;
 assert.equal(query.get('q'),'边'.repeat(200));assert.equal(query.get('tag'),'界'.repeat(80));assert.deepEqual([...query.keys()],['q','tag']);
});
