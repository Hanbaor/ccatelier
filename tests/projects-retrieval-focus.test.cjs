'use strict';
// Static authored cascade + sRGB contrast; not browser rendering or layout QA.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=process.env.REPO_ROOT||path.resolve(__dirname,'..');
const {JSDOM}=require(require.resolve('jsdom',{paths:[root]}));
const {parse}=require(require.resolve('rrweb-cssom',{paths:[root]}));
const {expandStylesheetURLs}=require(path.join(root,'tools/build-shared-stylesheets.cjs'));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const candidate=process.env.CC_RETRIEVAL_FOCUS_CSS;
const original=read('source/atelier/css/projects.css');
const projects=candidate?fs.readFileSync(candidate,'utf8'):original;
// Commas inside functional pseudos/attribute selectors are not selector-list separators.
function split(s){let depth=0,quote='',start=0,out=[];for(let i=0;i<s.length;i++){const c=s[i];if(quote){if(c===quote&&s[i-1]!=='\\')quote='';continue;}if(c==='"'||c==="'"){quote=c;continue;}if(c==='('||c==='[')depth++;if(c===')'||c===']')depth--;if(c===','&&!depth){out.push(s.slice(start,i).trim());start=i+1;}}return [...out,s.slice(start).trim()];}
const add=(a,b)=>a.map((n,i)=>n+b[i]);
const cmp=(a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2];
// Bounded Selectors-4 specificity, supporting the functional pseudos used here.
function specificity(selector){
 let s=selector,v=[0,0,0];
 s=s.replace(/\[[^\]]*\]/g,()=>{v[1]++;return '';});
 while(/:[\w-]+\(/.test(s)){
  const m=/(:[\w-]+)\(/.exec(s),start=m.index;let end=start+m[0].length,depth=1;
  for(;depth;end++){if(s[end]==='(')depth++;if(s[end]===')')depth--;assert.ok(end<s.length,'balanced functional pseudo');}
  const name=m[1],inner=s.slice(start+m[0].length,end-1);
  assert.ok([':is',':not',':has',':where',':nth-child',':nth-last-child'].includes(name),'unsupported specificity pseudo '+name);
  if([':is',':not',':has'].includes(name))v=add(v,split(inner).map(specificity).sort(cmp).at(-1));
  else if(name!==':where'){assert.ok(!/\bof\b/.test(inner),'nth-child(of ...) needs explicit support');v[1]++;}
  s=s.slice(0,start)+s.slice(end);
 }
 s=s.replace(/::[\w-]+/g,()=>{v[2]++;return '';}).replace(/#[\w-]+/g,()=>{v[0]++;return '';}).replace(/\.[\w-]+|:[\w-]+/g,()=>{v[1]++;return '';});
 v[2]+=(s.match(/(?:^|[\s>+~])([a-zA-Z][\w-]*)/g)||[]).length;return v;
}
function fixture(theme){
 const dom=new JSDOM(read('public/projects/index.html')),doc=dom.window.document;
 doc.body.classList.toggle('light',theme==='light');doc.documentElement.classList.toggle('dark',theme==='dark');
 const urls=[...doc.querySelectorAll('link[rel=stylesheet]')].map(n=>n.getAttribute('href'));
 const rules=[];let order=0;
 for(const url of expandStylesheetURLs(urls)){
  const relative=url.slice(url.indexOf('atelier/css/')),file=path.basename(relative),source=path.join(root,'source',relative);
  const css=file==='projects.css'?projects:fs.existsSync(source)?fs.readFileSync(source,'utf8'):read('public/'+relative);
  function visit(list,conditions=[]){for(const r of list){if(r.selectorText)for(const selector of split(r.selectorText))rules.push({selector,style:r.style,order:order++,file,conditions});else if(r.cssRules)visit(r.cssRules,[...conditions,r.conditionText||r.media?.mediaText||'unknown']);}}
  visit(parse(css).cssRules);
 }
 return {dom,doc,urls,rules};
}
function matches(node,selector){if(selector.includes('::'))return false;return node.matches(selector.replace(/:focus-visible\b/g,'[data-focus-audit]'));}
function candidates(f,node,property){
 const out=[];
 for(const r of f.rules){const value=r.style.getPropertyValue(property);if(!value||!matches(node,r.selector))continue;
  // Focus and palette rules are currently unconditional. Fail closed if a new
  // conditional override appears instead of pretending to evaluate media/layout.
  if(r.conditions.length){if(r.conditions.every(x=>/\bprint\b/.test(x)))continue;assert.fail(`Conditional ${property} needs audit support: ${r.file} ${r.conditions} ${r.selector}`);}
  out.push({...r,specificity:specificity(r.selector),value,important:r.style.getPropertyPriority(property)==='important'});
 }
 return out.sort((a,b)=>Number(a.important)-Number(b.important)||cmp(a.specificity,b.specificity)||a.order-b.order);
}
const precedence=(a,b)=>Number(a.important)-Number(b.important)||cmp(a.specificity,b.specificity)||a.order-b.order;
function winner(f,node,property){return candidates(f,node,property).at(-1);}
function resolve(value,vars){let result=value;for(let i=0;i<12&&result.includes('var(');i++)result=result.replace(/var\((--[\w-]+)(?:,\s*([^()]+))?\)/g,(_,key,fallback)=>vars[key]||fallback||'UNRESOLVED');assert.ok(!/var\(|UNRESOLVED/.test(result),'resolved CSS variable '+value);return result;}
function variables(f,node){let vars={};const ancestry=[];for(let n=node;n;n=n.parentElement)ancestry.unshift(n);for(const n of ancestry){const keys=['--yellow','--accent','--focus-ring','--bg'];const current={...vars};for(const k of keys){const w=winner(f,n,k);if(w)current[k]=w.value;}for(const k of Object.keys(current))current[k]=resolve(current[k],current);vars=current;}return vars;}
const lum=h=>{assert.match(h,/^#[\da-f]{6}$/i);return [1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);};
const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
const targets=['.project-retrieval > summary','.project-retrieval input','.project-retrieval select'];
test('specificity accounts for shared focus selector, retrieval override and stronger unaffected controls',()=>{
 assert.deepEqual(specificity(':is(button,a,input,select,textarea,summary):focus-visible'),[0,1,1]);
 assert.deepEqual(specificity('.project-retrieval :focus-visible'),[0,2,0]);
 assert.deepEqual(specificity('.atelier-room button:focus-visible'),[0,2,1]);
 assert.deepEqual(specificity('body.nijika:not(.light)'),[0,2,1]);
});
test('actual emitted Projects route supplies three controls and authoritative stylesheet order',()=>{
 const f=fixture('light');try{
  for(const selector of targets)assert.equal(f.doc.querySelectorAll(selector).length,1,selector);
  const index=name=>f.urls.findIndex(url=>url.endsWith('/'+name));
  assert.ok(index('delivery-editorial.css')>=0);assert.ok(index('delivery-immersive.css')>index('delivery-editorial.css'));assert.ok(index('projects.css')>index('delivery-immersive.css'));
  if(candidate)assert.equal(projects,original.replace('.project-retrieval :focus-visible{outline:2px solid var(--accent);','.project-retrieval :focus-visible{outline:2px solid var(--yellow);'),'candidate is one focus token only');
 }finally{f.dom.window.close();}
});
for(const theme of ['light','dark'])for(const selector of targets)test(`${theme}: ${selector} has an authored focus ring with at least 3:1 surface contrast`,t=>{
 const f=fixture(theme);try{
  const node=f.doc.querySelector(selector);node.setAttribute('data-focus-audit','');
  const outlines=candidates(f,node,'outline'),w=outlines.at(-1);assert.ok(w,'authored outline');
  const vars=variables(f,node),outline=resolve(w.value,vars);
  assert.match(outline,/^2px solid #[\da-f]{6}$/i);
  for(const prop of ['outline-color','outline-style','outline-width']){const longhand=winner(f,node,prop);assert.ok(!longhand||precedence(longhand,w)<0,`later/stronger ${prop} needs explicit evaluation`);}
  const color=outline.split(/\s+/).at(-1),bg=vars['--bg'];
  assert.equal(winner(f,node,'outline-offset').value,'4px');
  const bodyVars=variables(f,f.doc.body);assert.equal(resolve(winner(f,f.doc.body,'background').value,bodyVars),bg,'actual body fill agrees with inherited surface token');
  // The disclosure/body wrappers are transparent on the page surface. Detect
  // new authored fills rather than keeping a stale white-background assumption.
  for(let n=node.parentElement;n&&n!==f.doc.body;n=n.parentElement)for(const prop of ['background','background-color','background-image']){const fill=winner(f,n,prop);if(fill)assert.ok(['none','transparent','rgba(0, 0, 0, 0)'].includes(resolve(fill.value,variables(f,n))),`new ancestor fill needs explicit evaluation: ${fill.selector} ${fill.value}`);}
  t.diagnostic(JSON.stringify({winner:{selector:w.selector,file:w.file,specificity:w.specificity},competing:outlines.map(r=>({selector:r.selector,file:r.file,specificity:r.specificity,value:r.value})),color,bg,contrast:contrast(color,bg)}));
  assert.ok(contrast(color,bg)>=3,`${color} on ${bg}: ${contrast(color,bg).toFixed(2)}:1`);
 }finally{f.dom.window.close();}
});
