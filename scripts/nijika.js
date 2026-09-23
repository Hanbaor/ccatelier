'use strict';
const fs = require('node:fs');
const path = require('node:path');
let searchPatched = false;

hexo.extend.filter.register('stylus:renderer', style => style.include(hexo.base_dir));

// Keep the upstream npm theme intact. Load tracked customizations after its views.
hexo.extend.filter.register('before_generate', function () {
  if (this.config.theme !== 'redefine') return;
  // SearchDB joins root + post.path literally. Hexo 8 custom permalinks can
  // start with '/', producing //post/ on root deployments. Normalize only
  // those server-generated local paths; keep the upstream content indexing.
  if (!searchPatched && path.extname(this.config.search.path) === '.json') {
    const generateSearch = hexo.extend.generator.get('json');
    if (generateSearch) {
      hexo.extend.generator.register('json', async function (locals) {
        const route = await generateSearch.call(this, locals);
        const entries = JSON.parse(route.data);
        for (const entry of entries) {
          if (entry.url?.startsWith('/')) entry.url = entry.url.replace(/\/{2,}/g, '/');
        }
        return {...route, data:JSON.stringify(entries)};
      });
      searchPatched = true;
    }
  }
  const root = path.join(this.base_dir, 'custom/redefine');
  function load(directory) {
    for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) load(filename);
      else if (entry.name.endsWith('.ejs')) {
        hexo.theme.setView(path.relative(root, filename).replaceAll('\\', '/'), fs.readFileSync(filename, 'utf8'));
      }
    }
  }
  load(root);
}, 100);

hexo.extend.generator.register('nijika-cover', function () {
  return {path:'index.html', layout:['nijika/cover'], data:{nijika:'cover', title:'CC Atelier'}};
});

hexo.extend.helper.register('nijika_count', count => String(count).padStart(2, '0'));
hexo.extend.helper.register('nijika_label', function () {
  if (this.is_post()) return '笔记 / 阅读';
  if (this.is_archive()) return '归档';
  if (this.is_category()) return `分类 / ${this.page.category}`;
  if (this.is_tag()) return `标签 / ${this.page.tag}`;
  return '';
});
hexo.extend.helper.register('nijika_section', function () {
  if (this.is_post() || this.is_home() || this.is_archive() || this.is_category() || this.is_tag()) return 'notes';
  return this.page.nijika || '';
});
hexo.extend.helper.register('nijika_list_title', function () {
  if (this.is_category()) return this.page.category;
  if (this.is_tag()) return `# ${this.page.tag}`;
  if (this.is_archive()) return this.page.year ? String(this.page.year) + (this.page.month ? ` / ${this.page.month}` : '') : '归档';
  return '笔记';
});
