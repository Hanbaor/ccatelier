const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),{parse}=require('rrweb-cssom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const head=read('custom/redefine/nijika/head.ejs');
const paths=[...head.matchAll(/url_for\('(atelier\/css\/[^']+\.css)'\)/g)].map(match=>match[1]);
function screenRules(rules,width,height){
 return Array.from(rules).flatMap(rule=>{
  if(!rule.cssRules)return [rule.cssText];
  if(rule.media){
   const condition=rule.media.mediaText;
   if(/\bprint\b/.test(condition))return [];
   const sizes=[...condition.matchAll(/\((min|max)-(width|height):\s*(\d+)px\)/g)];
   if(sizes.some(([,bound,dimension,value])=>bound==='max'?(dimension==='width'?width:height)>+value:(dimension==='width'?width:height)<+value))return [];
  }
  return screenRules(rule.cssRules,width,height);
 }).join('\n');
}
function fixture(width,height,theme){
 // Apply real template order, including optional route sheets, with pixel media
 // conditions selected explicitly because JSDOM does not evaluate viewports.
 // This verifies cascade contracts; browser QA owns actual wrapping/geometry.
 const styles=paths.map(file=>'<style>'+screenRules(parse(read((file==='atelier/css/redefine.css'?'public/':'source/')+file)).cssRules,width,height)+'</style>').join('');
 return new JSDOM(`${styles}<body class="nijika ${theme}"><dialog open id="search-dialog"><div id="search-results"><a href="/article/" class="search-result"><span class="result-copy"><mark>vector</mark> 容器<small>…vec.<mark>reserve</mark>(a) 当 a 大于当前容量时，将容量增加到至少 a；否则容量不变。它不会改变 size()。</small></span><small>离线副本</small></a></div></dialog></body>`);
}
for(const [width,height] of [[1280,900],[398,780],[360,640]])for(const theme of ['light','dark']){
 test(`search stays readable with full stylesheet cascade at ${width}×${height} ${theme}`,()=>{
  const dom=fixture(width,height,theme),doc=dom.window.document;
  const style=selector=>dom.window.getComputedStyle(doc.querySelector(selector));
  try{
   assert.equal(style('.search-result').fontSize,'14px');
   assert.equal(style('.result-copy small').fontSize,'13px');
   assert.equal(style('.search-result>small').fontSize,'11px');
   assert.equal(style('.result-copy small').whiteSpace,'normal');
   assert.equal(style('.result-copy small').display,'-webkit-box');
   assert.equal(style('.result-copy small').getPropertyValue('-webkit-line-clamp'),'2');
   assert.equal(style('.result-copy small').lineHeight,'1.6');
   assert.equal(style('.result-copy small').maxHeight,'3.2em');
   assert.equal(style('.result-copy small').overflow,'hidden');
   assert.equal(style('.result-copy').minWidth,'0');
   assert.equal(style('#search-results').maxHeight,'52dvh');
   assert.equal(style('#search-results').overflow,'auto');
   assert.equal(style('mark').backgroundColor,'rgba(0, 0, 0, 0)');
   assert.equal(style('mark').fontWeight,'600');
   doc.querySelector('a').focus();assert.equal(doc.activeElement,doc.querySelector('a'));
  }finally{dom.window.close();}
 });
}
test('search stylesheet order and inherited high-contrast highlight remain explicit',()=>{
 assert.ok(paths.indexOf('atelier/css/atelier.css')<paths.indexOf('atelier/css/content.css'));
 assert.ok(paths.indexOf('atelier/css/content.css')<paths.indexOf('atelier/css/refinement.css'));
 const css=read('source/atelier/css/content.css');
 assert.match(css,/\.search-result mark\{[^}]*color:inherit/);
 assert.match(css,/\.search-result mark\{[^}]*text-decoration:underline/);
 assert.match(css,/\.search-result \.result-copy small\{[^}]*color:var\(--text\)/);
});
