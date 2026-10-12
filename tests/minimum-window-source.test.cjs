'use strict';

// Source-only guard for the two-declaration UB fix, not an algorithm proof.
// No generated site, compiler, Git checkout history or temporary audit files required.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '../source/_posts/hot100/012.md'), 'utf8');
const implementations = [...source.matchAll(/^```cpp\n([\s\S]*?)^```\s*$/gm)];

test('minimum-window implementation value-initializes both frequency arrays', () => {
  assert.equal(implementations.length, 1, 'extract the single real C++ implementation');
  const code = implementations[0][1];
  const declarations = [...code.matchAll(/^        int cnt_[st]\[128\].*;$/gm)].map(match => match[0]);
  assert.deepEqual(declarations, ['        int cnt_s[128]{};', '        int cnt_t[128]{};']);
  assert.match(code, /string minWindow\(string s, string t\) \{\n        int cnt_s\[128\]\{\};\n        int cnt_t\[128\]\{\};/);
});

test('reversing exactly the two initializers restores the original article bytes', () => {
  assert.equal(implementations.length, 1);
  const [fence, code] = implementations[0];
  let replacements = 0;
  const originalCode = code.replace(/^        int (cnt_[st])\[128\]\{\};$/gm, (_, name) => {
    replacements++;
    return `        int ${name}[128];`;
  });
  assert.equal(replacements, 2);
  const original = source.replace(fence, fence.replace(code, originalCode));
  // Baseline captured before this narrow fix; includes front matter, prose and code.
  assert.equal(createHash('sha256').update(original).digest('hex'),
    '52cbed1e5e249cd898e2aaaf01dba647965652fd150004a31f0143184071be3c',
    'only the two {} initializers may differ from the audited original article');
});
