const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync, execFileSync} = require('node:child_process');
const repo = path.resolve(__dirname, '..');
const read = id => fs.readFileSync(path.join(repo, 'source/_posts/csdn', `${id}.md`), 'utf8');
const cpp = id => [...read(id).matchAll(/^```cpp\n([\s\S]*?)^```\s*$/gm)].map(match => match[1]);
const compiler = spawnSync('g++', ['--version'], {encoding:'utf8'}).status === 0;
const dates = {
  '124338392': ['2022-04-22 09:54:44', '2023-07-18 17:56:23'],
  '124338541': ['2022-04-22 09:59:52', '2022-04-22 22:57:33'],
  '124387071': ['2022-04-24 17:02:40', '2024-01-24 11:30:28'],
  '124460411': ['2022-04-27 20:52:57', '2023-01-10 14:08:59'],
  '124514677': ['2022-04-30 16:25:41', '2022-04-30 18:35:43'],
  '131792879': ['2023-07-18 17:43:29', '2024-01-24 11:11:29'],
  '149880710': ['2025-08-03 18:28:12', '2025-08-03 18:28:19'],
  '154834561': ['2025-11-14 19:23:15', '2025-11-14 19:38:06']
};

function compiled(code, visit, flags = []) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-notes-test-'));
  try {
    const source = path.join(directory, 'example.cpp');
    const program = path.join(directory, 'example');
    fs.writeFileSync(source, code);
    execFileSync('g++', ['-std=c++11', ...flags, source, '-o', program], {timeout:10000});
    visit(input => execFileSync(program, {input, encoding:'utf8', timeout:5000}).trim());
  } finally { fs.rmSync(directory, {recursive:true, force:true}); }
}

test('all eight migrated notes retain their original identity, publication and source update dates', () => {
  for (const [id, [date, updated]] of Object.entries(dates)) {
    const frontmatter = read(id).split('\n---\n')[0];
    for (const field of [
      `date: "${date}"`, `updated: "${updated}"`, `source_id: "${id}"`,
      `source_url: "https://blog.csdn.net/m0_68856756/article/details/${id}"`,
      `permalink: "writing/csdn-${id}/"`
    ]) assert.ok(frontmatter.includes(field), `${id}: ${field}`);
  }
});

test('PyTorch explanations match the recorded broadcasting and no_grad examples', () => {
  const source = read('149880710');
  assert.doesNotMatch(source, /TensorFlow|tf\.stop_gradient/);
  assert.match(source, /torch\.sub.*Tensor\.sub/);
  assert.match(source, /M\.sub_\(N\).*不能.*原地扩展.*报错/);
  assert.match(source, /with torch\.no_grad\(\):[^\n]*\n  y2=x\*\*3/);
  assert.match(source, /y2\.requires_grad.*False/);
  assert.match(source, /x\.grad.*2\.0/);
  assert.match(source, /未重新运行训练实验/);
});

test('vector corrections distinguish capacity guarantees and supported emplacement', () => {
  const source = read('124387071');
  assert.match(source, /标准并没有规定必须翻倍/);
  assert.match(source, /至少 a/);
  assert.match(source, /不会改变 `size\(\)`/);
  assert.match(source, /vector 没有 `emplace_front\(\)`/);
  assert.match(source, /vec\.emplace\(vec\.begin\(\), 参数\.\.\.\)/);
  assert.match(source, /不保证总比 `insert` 或 `push_back` 更快/);
});

test('set explanations distinguish union, comparator order, end iterators and schematic code', () => {
  const source = read('124460411');
  assert.match(source, /将 A 和 B 的元素取<strong>并集<\/strong>/);
  assert.match(source, /默认比较器 `std::less<int>`/);
  assert.match(source, /自定义比较器.*顺序也会随之改变/);
  assert.match(source, /st\.end\(\)`，不能解引用/);
  assert.match(source, /不是可直接编译的完整程序/);
  assert.match(source, /标准输出流 `std::cout`/);
  assert.doesNotMatch(source, /std::out|\u200b/);
  assert.equal(cpp('124460411').length, 9);
  assert.match(cpp('124460411')[0], /\.\.\./, 'the schematic example is preserved and separately labeled');
});

test('DFS array-index explanation matches the unchanged zero-based implementation', () => {
  const source = read('124338541');
  assert.match(source, /`a\[0\]`、`a\[1\]`、`a\[2\]`/);
  assert.match(source, /dfs\(0\)/);
  assert.match(source, /for\(int i=0;i<n;i\+\+\)/);
});

test('current corrections are visibly separate from the preserved source dates', () => {
  for (const id of ['124338392','124338541','124387071','124460411','131792879','149880710']) {
    assert.match(read(id), /校订记录（2026-10-09）：本页从原文迁入后/);
  }
  assert.match(read('124387071'), /https:\/\/eel\.is\/c\+\+draft\/vector\.capacity/);
  assert.match(read('124460411'), /https:\/\/eel\.is\/c\+\+draft\/set\.union/);
  assert.match(read('149880710'), /https:\/\/docs\.pytorch\.org\/docs\/stable\/generated\/torch\.no_grad\.html/);
});

test('the article set-operation example produces its union, intersection and differences', {skip:!compiler}, () => {
  compiled(cpp('124460411')[8], run => {
    assert.deepEqual(run('1 2 3 4\n2 3 4 5\n').split(/\s+/), [
      '并集：', '1','2','3','4','5', '交集：', '2','3','4', '差集：', '1', '对称差集：', '1','5'
    ]);
  });
});

test('the cleaned set erase example compiles and the DFS example enumerates n=3', {skip:!compiler}, () => {
  compiled(cpp('124460411')[3], run => assert.equal(run('1 2 3 4\n'), '1 2 3'));
  compiled(cpp('124338541')[0], run => assert.deepEqual(run('3\n').split('\n'), ['123','132','213','231','312','321']));
});


test('Li Bai DP sample and bounded cases run without undefined array access', {skip:!compiler}, () => {
  const code = cpp('124338392').find(block => block.includes('long long dp[N][N][N]'));
  assert.match(code, /if\(i>0&&k\+1<N\)/);
  function count(shops, flowers, wine = 2) {
    if (!shops && !flowers) return Number(wine === 0);
    if (!wine || wine > flowers) return 0;
    let total = flowers ? count(shops, flowers - 1, wine - 1) : 0;
    if (shops) total += count(shops - 1, flowers, wine * 2);
    return total;
  }
  compiled(code, run => {
    assert.equal(run('5 10\n'), '14');
    for (let shops = 1; shops <= 4; shops++) {
      for (let flowers = 1; flowers <= 8; flowers++) {
        assert.equal(Number(run(`${shops} ${flowers}\n`)), count(shops, flowers), `${shops} shops, ${flowers} flowers`);
      }
    }
  }, ['-fsanitize=undefined', '-fno-sanitize-recover=all']);
});

test('date-statistics example outputs its container size with the matching C++ overload', {skip:!compiler}, () => {
  const code = cpp('131792879')[0];
  assert.match(code, /cout<<st\.size\(\);/);
  assert.doesNotMatch(code, /printf\("%d",st\.size\(\)\)/);
  // 100 zero digits contain no 2023 date. This is a format/smoke check, not a judge revalidation.
  compiled(code, run => assert.equal(run(`${Array(100).fill(0).join(' ')}\n`), '0'), ['-Wall', '-Werror=format']);
});

test('46 nonschematic C++ snippets pass a syntax-only check with their documented platform context', {skip:!compiler}, () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-notes-syntax-'));
  let checked = 0;
  try {
    for (const id of Object.keys(dates).filter(id => id !== '149880710')) {
      for (const [index, block] of cpp(id).entries()) {
        if (id === '124460411' && index === 0) continue;
        const code = id === '154834561' && index === 0
          ? '#include <vector>\nusing namespace std;\n' + block // LeetCode supplies this harness context.
          : block;
        const source = path.join(directory, `${id}-${index + 1}.cpp`);
        fs.writeFileSync(source, code);
        execFileSync('g++', ['-std=c++11', '-fsyntax-only', source], {timeout:10000});
        checked++;
      }
    }
    assert.equal(checked, 46);
  } finally { fs.rmSync(directory, {recursive:true, force:true}); }
});

test('recorded PyTorch Python blocks parse without importing or running training', {
  skip: spawnSync('python3', ['--version'], {encoding:'utf8'}).status !== 0
}, () => {
  const blocks = [...read('149880710').matchAll(/^```python\n([\s\S]*?)^```\s*$/gm)].map(match => match[1]);
  assert.ok(blocks.length > 0);
  const parsed = execFileSync('python3', ['-c', 'import ast,json,sys; blocks=json.load(sys.stdin); [ast.parse(code) for code in blocks]; print(len(blocks))'], {
    input:JSON.stringify(blocks), encoding:'utf8', timeout:5000
  });
  assert.equal(Number(parsed), blocks.length);
});
