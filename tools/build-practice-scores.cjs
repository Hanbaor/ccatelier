'use strict';
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {createHash} = require('node:crypto');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const run = promisify(execFile);

// Each generation has a fresh module cache, including during Hexo watch/rebuild.
// The child only reads the exact same original model/exporter used in the browser.
// Return metadata with the assets in one result so page rendering cannot race them.
async function buildPracticeScores(directory = path.resolve(__dirname, '../source/atelier/js')) {
  const {stdout} = await run(process.execPath, [__filename, '--render', path.resolve(directory)], {maxBuffer: 8 * 1024 * 1024});
  return JSON.parse(stdout);
}

async function render(directory) {
  const [{PRACTICE_DEMOS}, {renderPracticeScoreSvg}] = await Promise.all([
    import(pathToFileURL(path.join(directory, 'practice-core.mjs')).href),
    import(pathToFileURL(path.join(directory, 'practice-score-export.mjs')).href),
  ]);
  const ids = new Set();
  return PRACTICE_DEMOS.map(demo => {
    if (!/^original-[a-z0-9-]+$/.test(demo.id) || ids.has(demo.id)) throw Error('Expected unique original practice IDs');
    ids.add(demo.id);
    const data = renderPracticeScoreSvg(demo);
    const dimensions = data.match(/^<svg\b[^>]* width="(\d+)" height="(\d+)"/);
    if (!dimensions) throw Error('Practice exporter did not provide intrinsic dimensions');
    return {
      path: `atelier/scores/${demo.id}.svg`, data,
      score: {id: demo.id, title: demo.title, description: demo.description, bpm: demo.bpm,
        bars: demo.bars.length, width: Number(dimensions[1]), height: Number(dimensions[2]),
        sha256: createHash('sha256').update(data).digest('hex')},
    };
  });
}

module.exports = {buildPracticeScores};
if (require.main === module) {
  if (process.argv[2] !== '--render' || !process.argv[3]) throw Error('Use --render with the original module directory');
  render(process.argv[3]).then(value => process.stdout.write(JSON.stringify(value))).catch(error => {
    console.error(error); process.exitCode = 1;
  });
}
