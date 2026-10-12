'use strict';
const {createHash} = require('node:crypto');
const SOURCE_ID = '124338541';
const CODE_SHA256 = 'fd0ffdb41e0dfa4c2969ae9a53878a86557fb42c5b07cc8c342cfbcd436d4ff6';
function supportsPermutationDemo(page) {
  if (String(page.source_id) !== SOURCE_ID) return false;
  const source = String(page._content || page.raw || '').replaceAll('\r\n', '\n');
  const blocks = [...source.matchAll(/^```cpp\n([\s\S]*?)^```\s*$/gm)];
  return blocks.length === 1 && createHash('sha256').update(blocks[0][1]).digest('hex') === CODE_SHA256;
}
if (typeof hexo !== 'undefined') hexo.extend.helper.register('nijika_permutation_demo', supportsPermutationDemo);
module.exports = {supportsPermutationDemo, SOURCE_ID, CODE_SHA256};
