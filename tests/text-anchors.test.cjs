const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {JSDOM} = require('jsdom');
const code = '<figure class="iseeu highlight text"><table><tbody><tr><td class="gutter"><pre><span class="line">1</span><br><span class="line">2</span><br></pre></td><td class="code"><pre><span class="line">输入：12</span><br><span class="line">输出：34</span><br></pre></td></tr></tbody></table></figure>';
function setup(t,html) {
  const dom = new JSDOM(html);
  const saved = new Map();
  for (const [name,value] of Object.entries({document:dom.window.document,NodeFilter:dom.window.NodeFilter})) {
    saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));
    Object.defineProperty(globalThis,name,{configurable:true,writable:true,value});
  }
  t.after(()=>{dom.window.close();for(const [name,d] of saved){if(d)Object.defineProperty(globalThis,name,d);else delete globalThis[name];}});
  return dom.window.document.querySelector('article');
}
test('only structural Hexo line-number decoration is excluded; real digits and similarly named prose survive',async t=>{
  const article=setup(t,`<article><p class="gutter">正文12</p><p class="line">34</p><div class="highlight"><span class="gutter">56</span></div><table><tr><td class="gutter">78</td><td class="code">90</td></tr></table>${code}<figure class="highlight"><table><tr><td class="gutter">合法数字99</td><td>正文</td></tr></table></figure><button>忽略</button><span data-reader-exclude>装饰</span><script>script</script><style>style</style></article>`);
  const {articleText}=await import('../source/atelier/js/text-anchors.js');
  assert.equal(articleText(article).text,'正文1234567890输入：12输出：34合法数字99正文');
  assert.equal(articleText(article,{legacyCodeGutter:true}).text,'正文123456789012输入：12输出：34合法数字99正文');
});
test('clean offsets map to exact text nodes and DOM Range offsets inside actual code',async t=>{
  const article=setup(t,`<article><p>前言12</p>${code}<p>尾声56</p></article>`);
  const {articleText,textRange}=await import('../source/atelier/js/text-anchors.js');
  const snapshot=articleText(article),lines=article.querySelectorAll('td.code .line');
  assert.equal(snapshot.text,'前言12输入：12输出：34尾声56');
  let offset=0;for(const entry of snapshot.nodes){assert.equal(entry.start,offset);offset+=entry.node.textContent.length;assert.equal(entry.end,offset);assert.equal(entry.node.parentElement.closest('td.gutter'),null);}
  const start=snapshot.text.indexOf('12输出')+1,end=snapshot.text.indexOf('34')+1;
  const range=textRange(snapshot,start,end);
  assert.equal(range.startContainer,lines[0].firstChild);assert.equal(range.startOffset,4);
  assert.equal(range.endContainer,lines[1].firstChild);assert.equal(range.endOffset,4);
  assert.equal(range.toString(),snapshot.text.slice(start,end));
  const digits=textRange(snapshot,2,4);assert.equal(digits.toString(),'12');
});
test('real generated Hot100 036 contains three old phantom matches but no clean 12 matches',async t=>{
  const article=setup(t,fs.readFileSync(path.join(__dirname,'../public/hot100/036/index.html'),'utf8'));
  // The page contains other article elements; select the actual reading body explicitly.
  const body=document.querySelector('.article-body');assert.ok(article&&body);
  const {articleText,textRange}=await import('../source/atelier/js/text-anchors.js');
  const {findMatches}=await import('../source/atelier/js/reader-search.mjs');
  const legacy=articleText(body,{legacyCodeGutter:true}),clean=articleText(body);
  assert.equal(findMatches(legacy.text,'12').length,3);assert.equal(findMatches(clean.text,'12').length,0);
  const matches=findMatches(clean.text,'输入：root');assert.equal(matches.length,3);
  for(const m of matches){const range=textRange(clean,m.start,m.end);assert.equal(range.toString(),'输入：root');assert.ok(range.startContainer.parentElement.closest('td.code'));}
});
test('new and ordinary existing notebook anchors retain exact context and offsets after gutter removal',async t=>{
  const article=setup(t,`<article><p>${'前'.repeat(50)}普通旧摘录${'后'.repeat(50)}</p>${code}<p>${'尾'.repeat(50)}另一旧摘录${'声'.repeat(50)}</p></article>`);
  const {articleText,textRange}=await import('../source/atelier/js/text-anchors.js');
  const {anchorQuote,locateQuote}=await import('../source/atelier/js/notebook-core.mjs');
  const clean=articleText(article),legacy=articleText(article,{legacyCodeGutter:true});
  for(const quote of ['普通旧摘录','另一旧摘录']) {
    const start=legacy.text.indexOf(quote),record=anchorQuote(legacy.text,start,start+quote.length),saved=structuredClone(record);
    const at=locateQuote(clean.text,record);assert.equal(at,clean.text.indexOf(quote));
    assert.equal(textRange(clean,at,at+quote.length).toString(),quote);assert.deepEqual(record,saved);
  }
  const start=clean.text.indexOf('输入：12'),record=anchorQuote(clean.text,start,start+5);
  assert.equal(record.quote,'输入：12');assert.ok(!record.prefix.endsWith('12'));
  assert.equal(locateQuote(clean.text,record),start);assert.equal(textRange(clean,start,start+5).toString(),record.quote);
});
