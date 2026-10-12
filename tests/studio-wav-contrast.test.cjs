const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=process.env.CC_CONTRAST_ROOT||path.resolve(__dirname,'..');
const {parse}=require(require.resolve('rrweb-cssom',{paths:[root]}));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const original=read('source/atelier/css/studio.css');
const css=process.env.CC_WAV_CANDIDATE?fs.readFileSync(process.env.CC_WAV_CANDIDATE,'utf8'):original;
const immersive=read('source/atelier/css/immersive.css');
const daylight=read('source/atelier/css/daylight.css');
function decl(css,selector){const result={};for(const rule of parse(css).cssRules)if(rule.selectorText===selector)for(let i=0;i<rule.style.length;i++){const p=rule.style[i];result[p]=rule.style.getPropertyValue(p).trim();}return result;}
const rgb=h=>h.replace('#','').match(/../g).slice(0,3).map(v=>parseInt(v,16));
const mix=(front,back,alpha)=>front.map((v,i)=>v*alpha+back[i]*(1-alpha));
const lum=c=>c.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
const ratio=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
const themes={light:'body.nijika.light,body.nijika.light[data-section="atelier"]',dark:'body.nijika:not(.light),body.nijika[data-section="atelier"]:not(.light)'};
test('candidate is only the WAV foreground token, leaving decoration and other controls unchanged',()=>{
 if(process.env.CC_WAV_CANDIDATE)assert.equal(css,original.replace('.studio-export .studio-wav{color:var(--studio-gold);','.studio-export .studio-wav{color:var(--yellow);'));
 assert.equal(decl(css,'.studio-export .studio-wav')['border-color'],'#8a713e');
 assert.equal(decl(css,'.studio-editorial')['--studio-gold'],'#d7ae61');
});
test('actual linked cascade establishes transparent enabled button and layered bottom fills',()=>{
 const html=read('public/studio/index.html');const links=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(x=>x[1]);
 assert.ok(links.indexOf('/atelier/css/delivery-editorial.css')>links.indexOf('/atelier/css/studio.css'));
 assert.ok(links.indexOf('/atelier/css/delivery-immersive.css')>links.indexOf('/atelier/css/delivery-editorial.css'));
 assert.equal(decl(read('public/atelier/css/delivery-foundation.css'),'button').background,'none');
 assert.equal(decl(css,'.studio-console').background,'linear-gradient(130deg,#29282255,transparent 40%),var(--surface)');
 assert.equal(decl(daylight,'.light .studio-console').background,'linear-gradient(130deg,#fff7e4aa,transparent 45%),var(--surface)');
 assert.equal(decl(css,'.studio-bottom').background,'#0001');
 assert.equal(decl(daylight,'.light .studio-pattern-bar,.light .studio-bottom').background,'#b3935f09');
 assert.equal(decl(css,'.studio-editorial .studio-console')['box-shadow'],'none');
 // Narrow tripwire, not a general-purpose CSS computed-style engine.
 for(const href of links.slice(links.indexOf('/atelier/css/studio.css')+1))assert.doesNotMatch(read(`public${href}`),/[^{}]*studio-wav[^{}]*\{[^{}]*(?:color|background|opacity|filter)\s*:/);
 assert.match(html,/<button data-wav-export class="studio-wav">/);
 assert.equal(decl(read('public/atelier/css/delivery-editorial.css'),'button:disabled').opacity,'.5');
 assert.match(read('source/atelier/js/studio.js'),/\$\('\[data-wav-export\]'\).*button.disabled=true.*finally\{button.disabled=false/);
});
for(const [theme,selector]of Object.entries(themes))test(`enabled 13px WAV text reaches 4.5 on ${theme} background reference range`,()=>{
 assert.equal(decl(css,'.studio-editorial .studio-transport label,.studio-editorial .studio-pattern-bar,.studio-editorial .studio-export button,.studio-editorial .studio-export label,.studio-editorial .studio-import')['font-size'],'13px');
 const token=decl(css,'.studio-export .studio-wav').color.match(/^var\((--[^)]+)\)$/)[1];
  const palette=decl(immersive,selector);palette['--studio-gold']=theme==='light'?decl(daylight,'.light .music-studio')['--studio-gold']:decl(css,'.studio-editorial')['--studio-gold'];
  const fg=rgb(palette[token]);const values=[];
  // Static sRGB alpha-composite references: transparent endpoint, colored
  // endpoint, and intermediate gradient coverages. No browser pixel claims.
  for(let i=0;i<=100;i++){
   const gradient=mix(rgb(theme==='light'?'#fff7e4':'#292822'),rgb(palette['--surface']),i/100*(theme==='light'?170:85)/255);
   const fill=mix(rgb(theme==='light'?'#b3935f':'#000000'),gradient,(theme==='light'?9:17)/255);
   values.push(ratio(fg,fill));
  }
  assert.ok(Math.min(...values)>=4.5,`${theme} ${palette[token]}: ${Math.min(...values).toFixed(6)}–${Math.max(...values).toFixed(6)}:1`);
});
