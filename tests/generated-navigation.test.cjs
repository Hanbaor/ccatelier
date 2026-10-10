'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {Parser} = require('htmlparser2');

// Parse the actual output once, without constructing hundreds of browser DOMs.
// This checks published HTML, not API form actions or links created at runtime.
function parsePage(html) {
  const ids = new Set(), references = [];
  let base, templateDepth = 0;
  const parser = new Parser({onopentag(tag, attrs) {
    // Template contents are inert fragments, not nodes in the page document.
    // The template element itself still belongs to the document.
    if (tag === 'template') {
      if (!templateDepth && attrs.id) ids.add(attrs.id);
      templateDepth++;
      return;
    }
    if (templateDepth) return;
    if (attrs.id) ids.add(attrs.id);
    if (tag === 'a' && attrs.name) ids.add(attrs.name);
    if (tag === 'base' && base === undefined && attrs.href) base = attrs.href;
    if ((tag === 'a' || tag === 'link') && 'href' in attrs)
      references.push({value:attrs.href, anchor:tag === 'a'});
    if (['img', 'script', 'source', 'audio', 'video', 'iframe', 'track', 'input'].includes(tag) && attrs.src)
      references.push({value:attrs.src});
    if (tag === 'video' && attrs.poster) references.push({value:attrs.poster});
    if (['img', 'source'].includes(tag) && attrs.srcset) {
      // A data URL can contain commas and whitespace. Leave mixed data-URL
      // candidate lists to browser/image tests rather than invent missing files.
      if (!/data:/i.test(attrs.srcset)) {
        for (const candidate of attrs.srcset.split(',')) {
          const value = candidate.trim().split(/\s+/)[0];
          if (value) references.push({value});
        }
      }
    }
  }, onclosetag(tag) {
    if (tag === 'template' && templateDepth) templateDepth--;
  }}, {decodeEntities:true});
  parser.end(html);
  return {ids, references, base};
}

function audit(files, {origin = 'https://ccatelier.top', root = '/'} = {}) {
  const pages = new Map();
  for (const [name, content] of files) if (name.endsWith('.html')) pages.set(name, parsePage(content));
  const errors = [];
  let checked = 0;
  for (const [name, page] of pages) {
    const pageURL = new URL(root + name.replace(/index\.html$/, ''), origin);
    let base = pageURL;
    try { if (page.base) base = new URL(page.base, pageURL); }
    catch { errors.push(`${name}: invalid base URL ${page.base}`); continue; }
    for (const ref of page.references) {
      let url, pathname, fragment;
      try {
        url = new URL(ref.value, base);
        if (!['http:', 'https:'].includes(url.protocol) || url.origin !== new URL(origin).origin) continue;
        pathname = decodeURIComponent(url.pathname);
        fragment = decodeURIComponent(url.hash.slice(1).split(':~:')[0]);
      } catch { errors.push(`${name}: invalid local URL ${ref.value}`); continue; }
      checked++;
      if (!pathname.startsWith(root)) {
        errors.push(`${name}: outside deployment root ${ref.value}`); continue;
      }
      let target = pathname.slice(root.length);
      if (!files.has(target) && files.has(target.replace(/\/$/, '') + '/index.html'))
        target = target.replace(/\/$/, '') + '/index.html';
      if (!target) target = 'index.html';
      if (!files.has(target)) { errors.push(`${name}: missing file ${ref.value} -> ${target}`); continue; }
      // File links need not have HTML ids (e.g. SVG, PDF or source line hashes).
      if (ref.anchor && fragment && !/^[tT][oO][pP]$/.test(fragment) && pages.has(target) && !pages.get(target).ids.has(fragment))
        errors.push(`${name}: missing fragment ${ref.value} -> ${target}#${fragment}`);
    }
  }
  return {errors, pages:pages.size, checked};
}

function fixture(root = '/') {
  return new Map([
    ['index.html', `<a href="${root}article/?q=a&amp;b=c#%E7%AB%A0%20%E8%8A%82">Read</a><a href="#">Top</a><a href="?q=one">Query</a><a href="${root}article/#legacy">Named</a><a href="${root}article/#:~:text=chapter">Text</a><a href="${root}article/#章%20节:~:text=chapter">Both</a><img src="${root}image.webp" srcset="  ${root}image.webp   1x,\n ${root}wide.webp\t2x "><source srcset="${root}wide.webp 960w"><link rel="stylesheet" href="${root}style.css?v=2"><script src="${root}app.js"></script>`],
    ['article/index.html', '<h2 id="章 节">Chapter</h2><span id="章 节"></span><a name="legacy"></a><a href="../">Home</a>'],
    ['image.webp', ''], ['wide.webp', ''], ['style.css', ''], ['app.js', '']
  ]);
}

for (const root of ['/', '/lab/']) test(`generated navigation resolves native URLs and encoded fragments (${root})`, () => {
  const result = audit(fixture(root), {root});
  assert.deepEqual(result.errors, []);
  assert.equal(result.pages, 2);
  assert.ok(result.checked > 10);
});

test('navigation audit identifies missing pages, fragments and basic resources', () => {
  const files = fixture();
  files.set('broken.html', '<a href="/missing/">Missing</a><a href="/article/#absent">Section</a><img src="/missing.webp"><img srcset="/image.webp 1x, /absent.webp 2x">');
  const result = audit(files);
  assert.equal(result.errors.length, 4);
  assert.ok(result.errors.some(error => error.includes('missing fragment /article/#absent')));
  assert.ok(result.errors.some(error => error.includes('missing file /absent.webp')));
});

test('external protocols, runtime links and data srcsets are not local files', () => {
  const files = fixture();
  files.set('external.html', '<a href="https://example.com/no#id">External</a><a href="//example.com/no">External</a><a href="mailto:hello@example.com">Email</a><a href="tel:123">Phone</a><a href="javascript:void(0)">Legacy</a><a data-queue-next hidden></a><form action="/api/comments"></form><img src="data:image/svg+xml,%3Csvg%3E" srcset="data:image/svg+xml,%3Csvg%3E 1x, /optional.webp 2x"><a href="/image.webp#drawing">Image</a>');
  assert.deepEqual(audit(files).errors, []);
});

test('malformed local URI escapes report errors without aborting other checks', () => {
  const files = fixture();
  files.set('bad.html', '<a href="/%E0%A4%A/">Bad path</a><a href="/article/#%ZZ">Bad fragment</a><a href="/missing/">Still checked</a><a href="https://example.com/%ZZ">External</a>');
  const result = audit(files);
  assert.equal(result.errors.length, 3);
  assert.equal(result.errors.filter(error => error.includes('invalid local URL')).length, 2);
  assert.ok(result.errors.some(error => error.includes('missing file /missing/')));
});

test('relative links honor an explicit base and reject escaped deployment roots', () => {
  const files = fixture('/lab/');
  files.set('nested/page.html', '<base href="/lab/article/"><a href="#legacy">Named</a><img src="../image.webp">');
  assert.deepEqual(audit(files, {root:'/lab/'}).errors, []);
  files.set('escaped.html', '<a href="/article/">Unprefixed</a>');
  assert.match(audit(files, {root:'/lab/'}).errors.join('\n'), /outside deployment root/);
});

test('template descendants cannot create live anchors or missing-resource reports', () => {
  const files = fixture();
  files.set('templates.html', '<template id="live-template"><span id="ghost"></span><a href="/missing/">Inert</a><img src="/absent.webp"><template><a id="nested-ghost" href="/also-missing/">Nested</a></template></template><h2 id="after-template">Live</h2><a href="#live-template">Template element</a><a href="#after-template">After</a>');
  assert.deepEqual(audit(files).errors, []);
  files.set('links.html', '<a href="/templates.html#ghost">Ghost</a><a href="/templates.html#nested-ghost">Nested ghost</a>');
  const errors = audit(files).errors;
  assert.equal(errors.length, 2);
  assert.ok(errors.every(error => error.includes('missing fragment')));
});

test('native top fragments work without an id using ASCII case-insensitive matching', () => {
  const files = fixture();
  files.set('tops.html', '<a href="#top">Top</a><a href="#TOP">Upper</a><a href="/article/#tOp">Other page</a><a href="#%74%6F%70">Encoded</a>');
  assert.deepEqual(audit(files).errors, []);
  files.set('not-top.html', '<a href="#töp">Not top</a><a href="#top-section">Other section</a>');
  assert.equal(audit(files).errors.length, 2);
});

test('every generated page has resolving internal links, HTML fragments and basic assets', () => {
  const output = process.env.NIJIKA_OUTPUT || path.resolve(__dirname, '../public');
  const files = new Map();
  function visit(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, {withFileTypes:true})) {
      const name = prefix + entry.name, filename = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filename, name + '/');
      else if (entry.isFile()) files.set(name, name.endsWith('.html') ? fs.readFileSync(filename, 'utf8') : '');
    }
  }
  visit(output);
  const result = audit(files);
  assert.ok(result.pages > 0, 'generated HTML must exist');
  assert.ok(result.checked > 0, 'generated local references must exist');
  assert.deepEqual(result.errors, []);
});
