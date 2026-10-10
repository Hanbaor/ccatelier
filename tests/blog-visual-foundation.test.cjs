const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const css=read('source/atelier/css/immersive.css');
function palette(selector){const start=css.indexOf(selector);assert.ok(start>=0);const body=css.slice(css.indexOf('{',start)+1,css.indexOf('}',start));return Object.fromEntries([...body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6,8})/g)].map(m=>[m[1],m[2]]));}
function luminance(hex){const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a,b){const [lo,hi]=[luminance(a),luminance(b)].sort((x,y)=>x-y);return(hi+.05)/(lo+.05);}
const day=palette('body.nijika.light,body.nijika.light[data-section="atelier"]'),night=palette('body.nijika:not(.light),body.nijika[data-section="atelier"]:not(.light)');
test('neutral day and night palettes keep normal text above 7:1 and small labels above 4.5:1',()=>{
 assert.equal(day.bg,'#ffffff');assert.equal(night.bg,'#111114');
 for(const [mode,p] of [['day',day],['night',night]]){
  for(const surface of ['bg','surface']){
   for(const token of ['ink','text'])assert.ok(contrast(p[token],p[surface])>=7,`${mode} ${token}/${surface}`);
   for(const token of ['muted','yellow','sage'])assert.ok(contrast(p[token],p[surface])>=4.5,`${mode} ${token}/${surface}`);
  }
  assert.ok(contrast(p.muted,p.bg)>=7,`${mode} secondary text remains clearly legible`);
  assert.ok(contrast(p['accent-ink'],p.accent)>=7,`${mode} saturated accent uses deep text`);
 }
});
test('reading pages install no cursor listeners, particles, light controls or GPU canvas',()=>{
 for(const [module,name] of [['effects','initEffects'],['stage-engine','initStageEngine']]){
  const calls=[];
  const document={querySelector(selector){calls.push(selector);return selector==='.reading-page'?{}:null;}};
  const script=read(`source/atelier/js/${module}.js`).replace(/^import .*;\s*$/gm,'').replace(`export function ${name}`,`function ${name}`);
  const context={document};vm.runInNewContext(script+`\n${name}();`,context);
  assert.deepEqual(calls,['.reading-page'],`${module} returns before any DOM or event setup`);
 }
 const effects=read('source/atelier/css/effects.css');
 assert.match(effects,/body\[data-cursor=true\]:not\(:has\(\.reading-page\)\)/);
 assert.match(effects,/body:has\(\.reading-page\) :is\(\.cursor-ring,\.click-effects\) \{display:none\}/);
});
test('common chrome is opaque and quiet while the illustrated cover retains its own contrast layer',()=>{
 const dom=new JSDOM(`<style>${css}</style><style>${read('source/atelier/css/effects.css')}</style>`);
 assert.equal(dom.window.document.styleSheets.length,2);
 assert.match(css,/\.nijika \.surface-noise \{display:none\}/);
 assert.match(css,/body.nijika:not\(\.on-cover\) \.site-header \{background:var\(--bg\);backdrop-filter:none;border-bottom:0/);
 assert.match(css,/\.header-navigation a \{[^}]*font-size:14px[^}]*color:var\(--text\)/);
 assert.match(css,/\.on-cover \.site-header \{[^}]*background:#fffffff2/);
 assert.match(css,/\.on-cover:not\(\.light\) \.site-header \{background:#111114ed/);
 assert.match(css,/\.cinema-v3 \.cinema-enter:hover \{background:var\(--accent\);color:var\(--accent-ink\)\}/);
 for(const file of ['source/atelier/js/theme.js','custom/redefine/nijika/head.ejs']){
  const content=read(file);assert.match(content,/#ffffff/);assert.match(content,/#111114/);assert.doesNotMatch(content,/#f5f0e6|#101110/);
 }
 dom.window.close();
});
