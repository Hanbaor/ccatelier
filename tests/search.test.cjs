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
