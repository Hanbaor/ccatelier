'use strict';
// Bounded source contracts, not a browser rendering/cascade conformance test.
// The independent ordered-sheet audit also reviews Tailwind's cascade layers.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=process.env.PRINT_PALETTE_ROOT||path.resolve(__dirname,'..');
const {parse}=require(require.resolve('rrweb-cssom',{paths:[root]}));
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const css=process.env.PRINT_PALETTE_CSS?fs.readFileSync(process.env.PRINT_PALETTE_CSS,'utf8'):read('source/atelier/css/refinement.css');
const sheet=parse(css),print=sheet.cssRules.find(rule=>rule.media?.mediaText==='print');
function rule(selector){const r=[...print.cssRules].find(r=>r.selectorText===selector);assert.ok(r,selector);return r.style;}
function value(style,key,expected){assert.equal(style.getPropertyValue(key),expected,key);assert.equal(style.getPropertyPriority(key),'important',`${key} must survive later theme palettes`);}
const expected={'--bg':'#fff','--surface':'#f6f6f6','--text':'#222','--ink':'#111','--muted':'#595959','--yellow':'#493616','--line':'#ccc'};
test('print uses a complete priority-safe paper palette and a light root color scheme',()=>{
 assert.ok(print);value(rule(':root'),'color-scheme','light');const body=rule('body.nijika');
 value(body,'background','#fff');value(body,'color','#111');value(body,'color-scheme','light');
 for(const [key,v] of Object.entries(expected))value(body,key,v);
 assert.deepEqual([...Array(body.length)].map((_,i)=>body[i]).sort(),['background','color','color-scheme',...Object.keys(expected)].sort(),'body reset remains palette-only');
});
test('later light/night and atelier palettes cannot beat the print token importance',()=>{
 let count=0;
 for(const file of ['daylight.css','editorial.css','immersive.css'])for(const r of parse(read('source/atelier/css/'+file)).cssRules){
  if(!r.selectorText?.includes('body.nijika'))continue;
  for(const key of Object.keys(expected))if(r.style.getPropertyValue(key)){count++;assert.notEqual(r.style.getPropertyPriority(key),'important',`${file}: ${r.selectorText} ${key} needs cascade review`);}
  if(r.style.getPropertyValue('color-scheme'))assert.notEqual(r.style.getPropertyPriority('color-scheme'),'important');
 }
 assert.ok(count>=35,'both later theme palettes were reviewed');
});
test('print neutralizes every imported syntax foreground token, including function and meta',()=>{
 const highlight=[...print.cssRules].find(r=>r.selectorText==='.reading-studio .article-body.markdown-body'&&r.style.getPropertyValue('--highlight-subst'));
 assert.ok(highlight,'article syntax palette');
 const tokens=['foreground','keyword','link','built-in','number','string','regexp','subst','doctag','meta','variable','attr','section','bullet','addition','deletion'];
 for(const token of tokens)value(highlight.style,'--highlight-'+token,'var(--text)');
 value(highlight.style,'--highlight-comment','var(--muted)');value(highlight.style,'--highlight-background','var(--surface)');
 for(let i=0;i<highlight.style.length;i++)assert.match(highlight.style[i],/^--highlight-/,'syntax rule changes no layout or content');
 const upstream=parse(read('public/atelier/css/redefine.css'));
 const consumed=new Set();for(const r of upstream.cssRules){if(!r.selectorText||!/(?:pre|highlight)/.test(r.selectorText))continue;for(const match of r.style.getPropertyValue('color').matchAll(/var\((--highlight-[\w-]+)\)/g))consumed.add(match[1]);}
 assert.ok(consumed.has('--highlight-subst'));assert.ok(consumed.has('--highlight-meta'));
 for(const token of consumed){if(token==='--highlight-gutter-color')continue;assert.ok(highlight.style.getPropertyValue(token),`${token} needs neutral print mapping`);}
 // The gutter's upstream variable is bypassed by the existing stronger pre rule.
 assert.match(css,/\.reading-studio \.article-body\.markdown-body :is\(pre,code\)\s*\{color:var\(--text\)\}/);
});
function luminance(hex){assert.match(hex,/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i,'Expected an explicit print color');hex=hex.slice(1);if(hex.length===3)hex=[...hex].map(c=>c+c).join('');const v=hex.match(/../g).map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];}
function ratio(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('print foregrounds meet normal-text contrast with backgrounds kept or omitted',()=>{
 const body=rule('body.nijika');for(const token of ['--text','--ink','--muted','--yellow'])for(const bg of ['#fff','#f6f6f6'])assert.ok(ratio(body.getPropertyValue(token),bg)>=4.5,`${token} on ${bg}`);
});
