const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs');
const plain=parts=>parts.map(part=>part.text).join('');
const marked=parts=>parts.filter(part=>part.match).map(part=>part.text);

test('multiword excerpts show body-only evidence instead of the article opening',async()=>{
 const {searchResultText}=await import('../source/atelier/js/search-context.mjs');
 const {findEntries}=await import('../source/atelier/js/search-core.mjs');
 const entry={title:'STL容器（1）-vector',content:'前言 '.repeat(50)+'扩容、reserve 与 emplace 的说明；原始示例代码和原文日期保留。'};
 assert.equal(findEntries('ＶＥＣＴＯＲ reserve',[entry]).length,1);
 const result=searchResultText(entry,'ＶＥＣＴＯＲ reserve');
 assert.deepEqual(marked(result.title),['vector']);
 assert.ok(marked(result.excerpt).includes('reserve'));
 assert.match(plain(result.excerpt),/^…/);
 assert.deepEqual(searchResultText(entry,'reserve ＶＥＣＴＯＲ'),result);
});

test('NFKC maps expansion, composition, astral characters and emoji to whole graphemes',async()=>{
 const {searchResultText}=await import('../source/atelier/js/search-context.mjs');
 const entry={title:'ＡＢＣ ﬃ Cafe\u0301 👩🏽‍💻 🇨🇳',content:'序'.repeat(90)+'👨‍👩‍👧‍👦 ＡＢＣ ﬃ Cafe\u0301 👩🏽‍💻 🇨🇳'+'后'.repeat(90)};
 const result=searchResultText(entry,'abc fi CAFÉ 💻 🇨');
 assert.deepEqual(marked(result.title),['ＡＢＣ','ﬃ','Cafe\u0301','👩🏽‍💻','🇨🇳']);
 assert.deepEqual(marked(result.excerpt),marked(result.title));
 assert.ok(plain(result.excerpt).includes('👨‍👩‍👧‍👦'));
 const segments=new Intl.Segmenter(undefined,{granularity:'grapheme'});
 for(const parts of [result.title,result.excerpt]){
  const text=plain(parts),boundaries=new Set([0,...Array.from(segments.segment(text),p=>p.index+p.segment.length)]);
  let offset=0;for(const part of parts){assert.ok(boundaries.has(offset));offset+=part.text.length;assert.ok(boundaries.has(offset));}
 }
});

test('contextual lowercase, overlapping words and literal syntax stay faithful',async()=>{
 const {searchResultText}=await import('../source/atelier/js/search-context.mjs');
 assert.deepEqual(marked(searchResultText({title:'ΟΣ',content:''},'ος').title),['ΟΣ']);
 const entry={title:'<img src=x onerror=alert(1)> banana',content:'<script>literal</script> banana banana'};
 const result=searchResultText(entry,'<script> ana nana');
 assert.equal(plain(result.title),entry.title);
 assert.equal(plain(result.excerpt),entry.content);
 assert.deepEqual(marked(result.excerpt),['<script>','anana','anana']);
 assert.deepEqual(searchResultText(entry,'  ').excerpt,[]);
 assert.equal(plain(searchResultText({title:'Title',content:''},'Title').title),'Title');
});

test('oversized matches omit excerpts and ordinary boundaries keep complete graphemes',async()=>{
 const {searchResultText}=await import('../source/atelier/js/search-context.mjs');
 const word='a'.repeat(100),entry={title:'',content:'前'.repeat(90)+word+'👩🏽‍💻'.repeat(90)};
 const result=searchResultText(entry,word);
 assert.deepEqual(result.excerpt,[]);
 assert.equal(plain(result.title),'未命名文章');
 const unicode=searchResultText({title:'',content:'👩🏽‍💻'.repeat(100)},'💻');
 assert.equal(plain(unicode.excerpt),'👩🏽‍💻'.repeat(70)+'…');
});

test('search marks inherit readable text colors in either theme and retain a non-color cue',()=>{
 const css=fs.readFileSync('source/atelier/css/content.css','utf8');
 const rule=css.match(/\.search-result mark\{([^}]+)\}/)[1];
 assert.match(rule,/color:inherit/);assert.match(rule,/background:transparent/);
 assert.match(rule,/font-weight:600/);assert.match(rule,/text-decoration:underline/);
});

test('rendered title and excerpt use inert text nodes and marks for literal markup',async()=>{
 const {JSDOM}=require('jsdom');
 const dom=new JSDOM('<body data-root="/" data-search="/search.json"><button class="search-open"></button><dialog id="search-dialog"><select id="search-scope"><option value="offline">本机离线</option></select><p id="search-status"></p><input id="search-input"><div id="search-results"></div></dialog></body>',{url:'https://ccatelier.test/'});
 const {window}=dom;Object.assign(globalThis,{window,document:window.document,location:window.location,CustomEvent:window.CustomEvent,matchMedia:()=>({matches:false,addEventListener(){}})});
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 const entry={title:'＜img src=x onerror=alert(1)＞',url:'/safe/',content:'引言'.repeat(80)+' <script>alert(1)</script> needle'};
 const {initSearch}=await import('../source/atelier/js/search.js');
 try{
  initSearch({loadOffline:async()=>({version:1,entries:[entry],unavailable:0}),loadContext:()=>import('../source/atelier/js/search-context.mjs')});
  const input=document.querySelector('input');input.value='<img needle';
  document.querySelector('.search-open').click();await new Promise(resolve=>setImmediate(resolve));
  const box=document.querySelector('#search-results');
  assert.equal(box.querySelectorAll('a').length,1);
  assert.equal(box.querySelectorAll('img,script,[onerror]').length,0);
  assert.equal(box.querySelector('.result-copy>mark').textContent,'＜img');
  assert.equal(box.querySelector('.result-copy>small>mark').textContent,'needle');
  assert.match(box.querySelector('.result-copy>small').textContent,/needle/);
  input.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowDown',isComposing:true,bubbles:true}));
  assert.notEqual(document.activeElement,box.querySelector('a'));
  input.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
  assert.equal(document.activeElement,box.querySelector('a'));
  input.value='<script>';input.dispatchEvent(new window.Event('input'));
  assert.equal(box.querySelectorAll('script').length,0);
  assert.equal(box.querySelector('.result-copy>small>mark').textContent,'<script>');
 }finally{dom.window.close();}
});

test('compatibility Hangul composing across original graphemes locates body evidence',async()=>{
 const {searchResultText}=await import('../source/atelier/js/search-context.mjs');
 const {findEntries}=await import('../source/atelier/js/search-core.mjs');
 for(const term of ['ㄱㅏ','\uFFA1\uFFC2','ㄱㅏㄱ']){
  const entry={title:'',content:'a'.repeat(100)+term+'z'.repeat(100)},query=term.normalize('NFKC');
  assert.equal(findEntries(query,[entry]).length,1);
  const result=searchResultText(entry,query);
  assert.deepEqual(marked(result.excerpt),[term]);
  assert.ok(plain(result.excerpt).startsWith('…'));
  assert.ok(plain(result.excerpt).length<100);
 }
});

test('older browsers without Segmenter retain bounded ASCII/CJK context and whole emoji',async()=>{
 const original=Intl.Segmenter;
 let searchResultText;
 try{Intl.Segmenter=undefined;({searchResultText}=await import('../source/atelier/js/search-context.mjs?without-segmenter'));}
 finally{Intl.Segmenter=original;}
 const entry={title:'ＡＢＣ 👩🏽‍💻',content:'前'.repeat(100)+'👩🏽‍💻 Cafe\u0301 needle'+'后'.repeat(100)};
 const result=searchResultText(entry,'needle');
 assert.deepEqual(marked(result.excerpt),[]);
 assert.ok(plain(result.excerpt).includes('needle'));
 assert.ok(plain(result.excerpt).includes('👩🏽‍💻 Cafe\u0301'));
 assert.ok(plain(result.excerpt).length<120);
 const enormous={title:'Still searchable',content:'👩🏽‍💻'.repeat(1000)+'needle'};
 assert.deepEqual(searchResultText(enormous,'needle').excerpt,[]);
 assert.equal(plain(searchResultText(enormous,'needle').title),enormous.title);
});
