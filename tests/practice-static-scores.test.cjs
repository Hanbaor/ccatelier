const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const {createRequire} = require('node:module');
const {createHash} = require('node:crypto');
const {JSDOM} = require('jsdom');
const ejs = require('ejs');
const {buildPracticeScores} = require('../tools/build-practice-scores.cjs');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const hash = data => createHash('sha256').update(data).digest('hex');
const scores = buildPracticeScores();
const pageFor = assets => ({practiceScores: assets.map(({path,score}) => ({...score,path}))});
const render = (assets, prefix='/') => ejs.render(read('custom/redefine/nijika/practice.ejs'), {
  page: pageFor(assets), url_for: value => prefix + value, partial: () => '',
});

test('static assets are byte-identical to all original runtime exports with deterministic hashes', async () => {
  const [{PRACTICE_DEMOS}, {renderPracticeScoreSvg}] = await Promise.all([
    import('../source/atelier/js/practice-core.mjs'), import('../source/atelier/js/practice-score-export.mjs'),
  ]);
  const assets = await scores;
  assert.equal(assets.length, 3);
  assert.deepEqual(await buildPracticeScores(), assets);
  for (let i=0;i<assets.length;i++) {
    const {data,score,path: route} = assets[i], demo=PRACTICE_DEMOS[i];
    assert.equal(data, renderPracticeScoreSvg(demo));
    assert.equal(score.sha256, hash(data));
    assert.equal(route, `atelier/scores/${demo.id}.svg`);
    for (const key of ['id','title','description','bpm']) assert.equal(score[key], demo[key]);
    assert.equal(score.bars, demo.bars.length);
    const dom = new JSDOM(data, {contentType:'image/svg+xml'});
    try {
      assert.equal(dom.window.document.documentElement.getAttribute('width'), String(score.width));
      assert.equal(dom.window.document.documentElement.getAttribute('height'), String(score.height));
      assert.equal(score.width,800);
      assert.equal(dom.window.document.querySelectorAll('script,foreignObject,image,a,animate').length,0);
      assert.match(data,/非官方乐谱/);
    } finally {dom.window.close();}
  }
});

test('repeated generation reads changed modules without stale ESM cache or file writes', async () => {
  const directory=fs.mkdtempSync(path.join(process.env.STATIC_PRACTICE_TEMP_ROOT || os.tmpdir(),'practice-static-'));
  try {
    for (const file of ['practice-core.mjs','practice-score-export.mjs']) fs.copyFileSync(path.join(root,'source/atelier/js',file),path.join(directory,file));
    const before=await buildPracticeScores(directory);
    const core=path.join(directory,'practice-core.mjs');
    fs.writeFileSync(core,fs.readFileSync(core,'utf8').replace("title: '八分音符地基 · 原创练习'", "title: '缓存更新测试 · 原创练习'"));
    const after=await buildPracticeScores(directory);
    assert.notEqual(before[0].score.sha256,after[0].score.sha256);
    assert.equal(after[0].score.title,'缓存更新测试 · 原创练习');
    assert.equal(before[1].score.sha256,after[1].score.sha256);
    assert.deepEqual(fs.readdirSync(directory).sort(),['practice-core.mjs','practice-score-export.mjs']);
  } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

test('failed original source generation rejects instead of publishing stale or invented scores', async () => {
  await assert.rejects(buildPracticeScores(path.join(root,'missing-practice-modules')));
});

test('Hexo generator atomically returns page metadata and all exact asset routes on repeated builds', async () => {
  const generators = new Map();
  const localRequire = createRequire(path.join(root,'scripts/nijika.js'));
  vm.runInNewContext(read('scripts/nijika.js'), {
    require:localRequire, hexo:{extend:{filter:{register(){}},helper:{register(){}},generator:{register:(name,fn)=>generators.set(name,fn)}}},
  });
  const generator=generators.get('nijika-practice');
  for (let i=0;i<2;i++) {
    const routes=await generator.call({source_dir:path.join(root,'source')});
    assert.equal(routes.length,4);assert.equal(new Set(routes.map(r=>r.path)).size,4);
    const page=routes.find(r=>r.path==='studio/practice/index.html');
    assert.deepEqual(JSON.parse(JSON.stringify(page.data.practiceScores)),pageFor(await scores).practiceScores);
    for (const {path:assetPath,data} of await scores) assert.equal(routes.find(r=>r.path===assetPath).data,data);
    assert.equal(page.layout[0],'nijika/practice');
    assert.doesNotMatch(JSON.stringify(page.data),/<svg/);
  }
});

for (const prefix of ['/','/lab/']) test(`native collapsed fallback resolves images and links without scripts at ${prefix}`, async () => {
  const assets=await scores,dom=new JSDOM(render(assets,prefix),{url:'https://example.test'+prefix+'studio/practice/'});
  try {
    const d=dom.window.document,details=d.querySelector('.practice-static-scores');
    assert.ok(details);assert.equal(details.open,false);assert.equal(details.closest('[hidden]'),null);
    assert.equal(details.querySelectorAll('script,button,input,select,audio,svg,object,iframe').length,0);
    assert.equal(details.querySelectorAll('.practice-static-score').length,3);
    assert.equal(d.querySelector('.practice-app').hidden,true);
    details.open=true;assert.equal(details.open,true);
    for (const [i,section] of [...details.querySelectorAll('.practice-static-score')].entries()) {
      const asset=assets[i],img=section.querySelector('img'),links=[...section.querySelectorAll('a')],scroller=section.querySelector('[role="region"]');
      assert.equal(img.getAttribute('src'),prefix+asset.path);
      assert.equal(img.getAttribute('width'),String(asset.score.width));assert.equal(img.getAttribute('height'),String(asset.score.height));
      assert.equal(img.loading || img.getAttribute('loading'),'lazy');assert.equal(img.getAttribute('decoding'),'async');
      assert.ok(img.alt.includes(asset.score.title));assert.ok(img.alt.includes(`${asset.score.bars} 小节`));
      assert.equal(links.length,2);
      for (const a of links) {assert.equal(a.getAttribute('href'),prefix+asset.path);assert.ok(a.textContent.includes(asset.score.title));}
      assert.equal(links[0].target,'_blank');assert.equal(links[0].rel,'noopener noreferrer');assert.match(links[0].textContent,/新标签页/);
      assert.equal(links[1].download,asset.score.id+'.svg');
      assert.equal(scroller.tabIndex,0);assert.ok(scroller.getAttribute('aria-label').includes(asset.score.title));
      assert.ok(d.getElementById(scroller.getAttribute('aria-describedby')));scroller.focus();assert.equal(d.activeElement,scroller);
      assert.equal(d.getElementById(section.getAttribute('aria-labelledby')).textContent,asset.score.title);
    }
    const ids=[...d.querySelectorAll('[id]')].map(n=>n.id);assert.equal(new Set(ids).size,ids.length);
    assert.match(d.querySelector('noscript').textContent,/原创谱面仍可查看与下载/);
  } finally {dom.window.close();}
});

test('bounded keyboard scroller retains 800px images against global responsive image styles', async () => {
  const css=read('source/atelier/css/practice.css').split('/* Native score reading')[1];
  const dom=new JSDOM(`<style>img{max-width:100%;width:100%;height:auto} svg{stroke:red;fill:none} /* Native score reading${css}</style>${render(await scores)}`);
  try {
    const d=dom.window.document,scroller=d.querySelector('.practice-static-scroll'),img=scroller.querySelector('img');
    const style=dom.window.getComputedStyle(img),scroll=dom.window.getComputedStyle(scroller);
    assert.equal(style.width,'800px');assert.equal(style.minWidth,'800px');assert.equal(style.maxWidth,'none');assert.equal(style.height,'auto');
    assert.equal(scroll.maxWidth,'100%');assert.equal(scroll.minWidth,'0');assert.equal(scroll.overflowX,'auto');
    for (const link of d.querySelectorAll('.practice-static-actions a')) assert.equal(dom.window.getComputedStyle(link).minHeight,'44px');
    assert.match(css,/:focus-visible[^}]*outline:3px solid var\(--ink\);outline-offset:3px/);
  } finally {dom.window.close();}
});

test('original publisher links and copyright boundaries are preserved', async () => {
  const dom=new JSDOM(render(await scores));
  try {
    const source=dom.window.document.querySelector('.practice-score-sources');
    assert.deepEqual([...source.querySelectorAll('a')].map(a=>a.href),[
      'https://sheetmusic.jp.yamaha.com/products/4947817310204',
      'https://sheetmusic.jp.yamaha.com/products/4947817305804',
    ]);
    assert.match(source.textContent,/本站不复制销售中的谱面/);
  } finally {dom.window.close();}
});
