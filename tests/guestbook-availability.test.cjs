const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),ejs=require('ejs'),{parse}=require('rrweb-cssom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const template=read('custom/redefine/nijika/comments.ejs');
const markup=page=>ejs.render(template,{page:{nijika:page}});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const ready=()=>json({items:[],total:0,next:null});
const closed=()=>json({code:'not_configured'},503);
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function setup(load,pagePath='/guestbook/'){
 const dom=new JSDOM(`<body data-section="guestbook">${markup('guestbook')}</body>`,{url:'https://ccatelier.test'+pagePath});
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,location:dom.window.location,FormData:dom.window.FormData,matchMedia:()=>({matches:false,addEventListener(){}})});
 let posts=0;
 globalThis.fetch=async(url,options)=>{
  if(url.startsWith('/api/comments?'))return load(url);
  if(url==='/api/comments'){posts++;throw new Error('This test must never submit');}
  return json({site:{views:0,visitors:0,applause:0},page:{views:0,applause:0},reacted:false});
 };
 (await import('../source/atelier/js/community.js')).initCommunity();await tick();
 const doc=dom.window.document;
 return {dom,doc,connection:doc.querySelector('[data-comment-connection]'),status:doc.querySelector('[data-comment-status]'),form:doc.querySelector('form'),button:doc.querySelector('[type=submit]'),posts:()=>posts};
}
for(const page of ['guestbook','post'])test(`${page} actual template exposes status before inputs and guards no-JS form`,()=>{
 const dom=new JSDOM(markup(page)),doc=dom.window.document,form=doc.querySelector('form');
 try{
  assert.equal(form.querySelector('[data-form-guard]').disabled,true);
  for(const selector of ['[data-comment-connection]','[data-comment-status]']){
   const status=doc.querySelector(selector);assert.equal(status.getAttribute('role'),'status');
   assert.ok(status.compareDocumentPosition(form)&dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
   assert.equal(form.contains(status),false);
  }
  assert.match(doc.querySelector('[data-comment-connection]').textContent,/尚未连接/);
  assert.ok(doc.querySelector('noscript').compareDocumentPosition(form)&dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
 }finally{dom.window.close();}
});
test('top status transitions from loading to closed to open without losing an editable draft',async()=>{
 let resolve,reads=0;
 const s=await setup(()=>++reads===1?new Promise(r=>{resolve=r;}):ready());
 try{
  assert.match(s.connection.textContent,/正在连接/);
  s.form.elements.nickname.value='听众';s.form.elements.message.value='正在写的内容';
  resolve(closed());await tick();
  assert.equal(s.connection.textContent,'');assert.equal(s.button.disabled,true);
  assert.match(s.status.textContent,/留言暂未开放。/);assert.doesNotMatch(s.status.textContent,/内容仍在|草稿/);
  assert.equal(s.form.elements.message.disabled,false);
  s.form.dispatchEvent(new s.dom.window.Event('submit',{cancelable:true}));assert.equal(s.posts(),0);
  s.status.querySelector('button').click();await tick();
  assert.equal(s.connection.textContent,'留言已开放。');assert.equal(s.status.textContent,'');assert.equal(s.button.disabled,false);
  assert.equal(s.form.elements.message.value,'正在写的内容');assert.equal(s.form.elements.nickname.value,'听众');assert.equal(s.posts(),0);
 }finally{s.dom.window.close();}
});
for(const failure of [()=>{throw new TypeError('offline');},()=>new Response('<html>fallback</html>'),()=>json({code:'unavailable'},503)])test('temporary/protocol failure stays recoverable and does not claim permanent closure',async()=>{
 let reads=0;const s=await setup(()=>++reads===1?failure():ready());
 try{
  assert.match(s.connection.textContent,/暂时无法确认/);assert.doesNotMatch(s.status.textContent+s.connection.textContent,/暂未开放|已开放/);
  assert.equal(s.button.disabled,false);s.form.elements.message.value='保留输入';
  s.doc.querySelector('[data-comment-list] button').click();await tick();
  assert.equal(s.connection.textContent,'留言已开放。');assert.equal(s.form.elements.message.value,'保留输入');assert.equal(s.posts(),0);
 }finally{s.dom.window.close();}
});
for(const pagePath of ['/guestbook/','/preview/guestbook/','/2026/09/22/Hello-CC-Atelier/'])test(`availability reads preserve page identity at ${pagePath}`,async()=>{
 let requested;const s=await setup(url=>{requested=url;return ready();},pagePath);
 try{assert.equal(new URL(requested,'https://ccatelier.test').searchParams.get('page'),pagePath);assert.equal(s.connection.textContent,'留言已开放。');assert.equal(s.posts(),0);}finally{s.dom.window.close();}
});
test('a hidden view cannot replace its connection indicator with late availability',async()=>{
 let resolve;const s=await setup(()=>new Promise(r=>{resolve=r;}));
 try{const before=s.connection.textContent;s.doc.querySelector('[data-comments]').hidden=true;resolve(ready());await tick();assert.equal(s.connection.textContent,before);assert.equal(s.posts(),0);}finally{s.dom.window.close();}
});
// Select actual route stylesheet order; evaluate viewport media rules explicitly.
// JSDOM verifies cascade contracts, while the separate browser pass owns geometry.
function screenRules(rules,width){return [...rules].flatMap(rule=>{
 if(!rule.cssRules)return [rule.cssText];
 if(rule.media){const condition=rule.media.mediaText;if(/print|prefers-|hover/.test(condition))return [];
  if([...condition.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)].some(([,bound,value])=>bound==='max'?width>+value:width<+value))return [];
 }
 return screenRules(rule.cssRules,width);
}).join('\n');}
for(const route of ['guestbook/index.html','2026/09/22/Hello-CC-Atelier/index.html'])for(const width of [393,1280])for(const theme of ['light','dark'])test(`${route} important controls remain readable at ${width}px ${theme} in the real stylesheet cascade`,()=>{
 const links=[...read('public/'+route).matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match=>match[1].replace(/^\//,''));
 const styles=links.filter(file=>file.startsWith('atelier/css/')).map(file=>{const source='source/'+file;const css=read(fs.existsSync(path.join(__dirname,'..',source))?source:'public/'+file);return '<style>'+screenRules(parse(css).cssRules,width)+'</style>';}).join('');
 const dom=new JSDOM(`${styles}<body class="nijika ${theme}"><section class="atelier-room ${route.startsWith('guestbook')?'room-guestbook':'reading-studio'}">${markup('guestbook')}</section></body>`);
 try{
  const doc=dom.window.document;doc.querySelector('[data-comment-status]').innerHTML='留言暂未开放。<button class="community-retry">重新检查</button>';
  for(const selector of ['.comment-status','.community-retry','.comment-form-bottom button','.comment-stamps legend']){
   const size=parseFloat(dom.window.getComputedStyle(doc.querySelector(selector)).fontSize);assert.ok(size>=13,`${selector}: ${size}px`);
  }
  const retry=doc.querySelector('[data-comment-status] .community-retry'),retryStyle=dom.window.getComputedStyle(retry);
  assert.equal(retryStyle.display,'inline-flex');assert.equal(retryStyle.verticalAlign,'middle');assert.equal(retryStyle.alignItems,'center');
  assert.equal(retryStyle.marginInlineStart,'12px');assert.equal(retryStyle.marginTop,'0px');assert.equal(retryStyle.marginBottom,'0px');assert.equal(retryStyle.marginRight,'0px');
  assert.ok(parseFloat(retryStyle.minHeight)>=44);
  const status=doc.querySelector('[data-comment-status]');status.firstChild.textContent='投递结果尚未确认。内容仍在当前表单中，可手动重试。 留言暂未开放。';
  assert.notEqual(dom.window.getComputedStyle(status).whiteSpace,'nowrap','long status can wrap before its inline retry');
  const listRetry=doc.createElement('button');listRetry.className='community-retry';listRetry.textContent='再试一次';doc.querySelector('[data-comment-list] .community-empty').append(listRetry);
  const listStyle=dom.window.getComputedStyle(listRetry);assert.equal(listStyle.display,'block');assert.equal(listStyle.marginTop,'12px');assert.equal(listStyle.marginLeft,'auto');assert.equal(listStyle.marginRight,'auto');
  assert.ok(links.includes('atelier/css/refinement.css'));
  assert.equal(links.includes('atelier/css/rooms-v2.css'),route.startsWith('guestbook'));
 }finally{dom.window.close();}
});
