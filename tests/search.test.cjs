const {test} = require('node:test');
const assert = require('node:assert/strict');
test('search ranks titles, matches all words, and handles literal punctuation', async () => {
  const {findEntries} = await import('../source/atelier/js/search-core.mjs');
  const entries = [{title:'SQL notes',content:'agent joins',url:'/a/'},{title:'Agent SQL',content:'research',url:'/b/'},{title:'<img onerror=alert(1)>',content:'literal',url:'/c/'}];
  assert.equal(findEntries('agent sql',entries)[0].title,'Agent SQL');
  assert.equal(findEntries('agent missing',entries).length,0);
  assert.equal(findEntries('<img',entries)[0].url,'/c/');
  assert.equal(findEntries('[',entries).length,0);
});
test('search links reject script/external protocols and retain local encoded paths', async () => {
  const {safeResultURL} = await import('../source/atelier/js/search-core.mjs');
  const base = 'https://ccatelier.top/blog/';
  assert.equal(safeResultURL('javascript:alert(1)',base),null);
  assert.equal(safeResultURL('//evil.example/path',base),null);
  assert.equal(safeResultURL('https://evil.example/',base),null);
  assert.equal(safeResultURL('/blog/中文/',base),'/blog/%E4%B8%AD%E6%96%87/');
});
test('search keyboard waits for Chinese IME composition before opening a result', async () => {
  const {searchInputAction} = await import('../source/atelier/js/search-core.mjs');
  assert.equal(searchInputAction({key:'Enter', isComposing:true}, true), null);
  assert.equal(searchInputAction({key:'Enter', keyCode:229}, true), null);
  assert.equal(searchInputAction({key:'ArrowDown', isComposing:true}, true), null);
  assert.equal(searchInputAction({key:'Enter'}, false), null);
  assert.equal(searchInputAction({key:'Enter'}, true), 'open');
  assert.equal(searchInputAction({key:'ArrowDown'}, true), 'focus');
});

test('normalized search paths cannot become external authorities when assigned to anchors', async t => {
  const {safeResultURL} = await import('../source/atelier/js/search-core.mjs');
  const {JSDOM} = require('jsdom');
  const base = 'https://ccatelier.top/blog/';
  const dom = new JSDOM('<body></body>', {url:base});
  t.after(() => dom.window.close());
  const rejected = [
    'https://ccatelier.top//evil.example/path',
    'https://ccatelier.top///evil.example/path',
    'https://ccatelier.top//evil.example/path?query=1#chapter',
    String.raw`https://ccatelier.top/\evil.example/path`,
    String.raw`https://ccatelier.top\\evil.example/path`,
    'https://ccatelier.top/blog/..//evil.example/path',
    '/blog/%2e%2e//evil.example/path',
    '/blog/.%2E//evil.example/path',
    'https://ccatelier.top/\n/evil.example/path',
    '//evil.example/path',
    String.raw`/\evil.example/path`,
    'javascript:alert(1)',
    'data:text/html,test',
    'https://ccatelier.top@evil.example/path'
  ];
  const allowed = [
    ['/blog/中文/?q=鼓#章节','/blog/%E4%B8%AD%E6%96%87/?q=%E9%BC%93#%E7%AB%A0%E8%8A%82'],
    ['notes/?q=1#chapter','/blog/notes/?q=1#chapter'],
    ['../notes/','/notes/'],
    ['/blog/a/../notes/','/blog/notes/'],
    ['/blog/%2e%2e/notes/','/notes/'],
    ['//ccatelier.top/blog/notes/','/blog/notes/'],
    ['https://CCATELIER.TOP:443/blog/notes/','/blog/notes/'],
    [String.raw`/blog\notes/`,'/blog/notes/'],
    ['/blog//notes/','/blog//notes/'],
    ['/%2F%2Fevil.example/path','/%2F%2Fevil.example/path'],
    ['/%5Cevil.example/path','/%5Cevil.example/path'],
    ['/%252Fevil.example/path','/%252Fevil.example/path'],
    ['?next=//evil.example/#//chapter','/blog/?next=//evil.example/#//chapter'],
    ['#//chapter','/blog/#//chapter']
  ];
  for (const [input,expected] of [...rejected.map(input=>[input,null]),...allowed]) {
    const path = safeResultURL(input,base);
    if (path !== null) {
      const anchor = dom.window.document.createElement('a');
      anchor.href = path;
      assert.equal(anchor.origin,new URL(base).origin,input);
      assert.equal(anchor.href,new URL(input,base).href,input);
      assert.match(path,/^\/(?!\/)/,input);
    }
    assert.equal(path,expected,input);
  }
});
