const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ejs=require('ejs');
const {JSDOM}=require('jsdom');
const {supportsPermutationDemo}=require('../scripts/permutation-demo.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8'),partial=read('custom/redefine/nijika/permutation-demo.ejs');
const raw=read('source/_posts/csdn/124338541.md'),body='<p>作者正文</p><div class="code-container" data-rel="Cpp"><figure>original code</figure></div><p>作者解析</p>';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function render(page={source_id:'124338541',_content:raw},prefix='/lab/',content=body){
 return ejs.render(read('custom/redefine/nijika/post.ejs'),{page,config:{author:'CC'},live_metadata:()=>({exercise:null}),live_reader_content:()=>content,nijika_permutation_demo:supportsPermutationDemo,toc:()=>'',url_for:p=>prefix+p,nijika_series:()=>[],partial:name=>name==='nijika/permutation-demo'?ejs.render(partial,{url_for:p=>prefix+p}):''});
}
function page(){
 const dom=new JSDOM('<body>'+ejs.render(partial,{url_for:p=>'/lab/'+p})+'</body>',{pretendToBeVisual:true,url:'https://test.invalid/lab/writing/csdn-124338541/'});
 const listeners=[],reduced={matches:false,addEventListener(type,fn){listeners.push(fn)}};dom.window.matchMedia=()=>reduced;
 const doc=dom.window.document,host=doc.querySelector('details');
 return {dom,doc,host,reduced,setReduced(value){reduced.matches=value;listeners.forEach(fn=>fn());},find:name=>doc.querySelector(`[data-permutation-${name}]`)};
}
test('only matching source receives one collapsed after-code partial and prefix-safe page script',()=>{
 const dom=new JSDOM(render());try{const doc=dom.window.document,host=doc.querySelector('[data-permutation-demo]');assert.ok(host);assert.equal(host.open,false);assert.equal(doc.querySelectorAll('[data-permutation-demo]').length,1);assert.equal(host.previousElementSibling.className,'code-container');assert.equal(host.nextElementSibling.tagName,'SCRIPT');assert.equal(host.nextElementSibling.getAttribute('src'),'/lab/atelier/js/permutation-demo.js');assert.equal(host.nextElementSibling.type,'module');assert.ok(host.hasAttribute('data-reader-exclude'));assert.equal(host.querySelector('[data-permutation-fallback]').hidden,false);assert.equal(host.querySelector('[data-permutation-app]').hidden,true);assert.match(host.textContent,/不是在浏览器里执行 C\+\+/);assert.match(host.textContent,/a 仍是 123/);}finally{dom.window.close();}
 for(const page of [{},{source_id:'055',_content:raw},{source_id:'124338541',_content:raw.replace('dfs(step+1)','dfs(step+2)')}]){const d=new JSDOM(render(page));assert.equal(d.window.document.querySelector('[data-permutation-demo]'),null);assert.equal(d.window.document.querySelector('.article-body').innerHTML,body);d.window.close();}
});
test('startup waits for first open, deduplicates slow toggles, and close during load cannot start playback',async()=>{
 const {initPermutationDemo}=await import('../source/atelier/js/permutation-demo.js'),{mountPermutationDemo}=await import('../source/atelier/js/permutation-demo-view.js'),p=page();let loads=0,styles=0,resolve;
 const pending=new Promise(done=>resolve=done),load=()=>{loads++;return pending},style=async()=>{styles++};
 try{initPermutationDemo({root:p.doc,load,style});initPermutationDemo({root:p.doc,load,style});assert.equal(loads,0);p.host.open=true;p.host.dispatchEvent(new p.dom.window.Event('toggle'));p.host.dispatchEvent(new p.dom.window.Event('toggle'));assert.equal(loads,1);assert.equal(styles,1);assert.equal(p.find('fallback').hidden,false);p.host.open=false;resolve({mountPermutationDemo});await flush();assert.equal(p.find('app').hidden,false);assert.equal(p.find('fallback').hidden,true);assert.equal(mountPermutationDemo(p.host).playing,false);p.host.open=true;p.host.dispatchEvent(new p.dom.window.Event('toggle'));await flush();assert.equal(loads,1);}finally{p.dom.window.close();}
});
test('failed import keeps static fallback readable and a retry can recover',async()=>{
 const {initPermutationDemo}=await import('../source/atelier/js/permutation-demo.js'),{mountPermutationDemo}=await import('../source/atelier/js/permutation-demo-view.js'),p=page();let fails=true,loads=0;
 try{initPermutationDemo({root:p.doc,load:async()=>{loads++;if(fails)throw Error('offline');return{mountPermutationDemo}},style:async()=>{}});p.host.open=true;p.host.dispatchEvent(new p.dom.window.Event('toggle'));await flush();assert.equal(p.find('fallback').hidden,false);assert.equal(p.find('app').hidden,true);assert.match(p.find('load-status').textContent,/静态示例/);fails=false;p.find('load-status').querySelector('button').click();await flush();assert.equal(loads,2);assert.equal(p.find('fallback').hidden,true);assert.equal(p.find('load-status').hidden,true);}finally{p.dom.window.close();}
});
test('step, seek and size switching preserve focus, historical results and old slot values',async()=>{
 const {mountPermutationDemo}=await import('../source/atelier/js/permutation-demo-view.js'),{tracePermutation}=await import('../source/atelier/js/permutation-demo-core.mjs'),p=page();
 try{const controller=mountPermutationDemo(p.host);assert.equal(controller,mountPermutationDemo(p.host));p.host.open=true;p.find('next').focus();p.find('next').click();assert.equal(controller.index,1);assert.equal(p.doc.activeElement,p.find('next'));assert.equal(p.find('prev').disabled,false);
 const model=tracePermutation(3),first=model.steps.findIndex(s=>s.phase==='emit'),seek=p.find('seek');function go(i){seek.value=i;seek.dispatchEvent(new p.dom.window.Event('input'));}
 seek.focus();go(first);assert.equal(p.doc.activeElement,seek);assert.equal(p.find('results').textContent,'123');go(first+1);assert.equal(p.find('slots').querySelectorAll('[data-active=true]').length,3);go(first+2);assert.equal(p.find('slots').querySelectorAll('[data-active=true]').length,2);assert.equal(p.find('slots').children[2].querySelector('b').textContent,'3');go(0);assert.equal(p.find('results').textContent,'');assert.equal(p.find('prev').disabled,true);go(model.steps.length-1);assert.equal(p.find('results').children.length,6);assert.equal(p.find('next').disabled,true);assert.equal(p.find('play').disabled,true);
 p.find('size').value='4';p.find('size').dispatchEvent(new p.dom.window.Event('change'));assert.equal(controller.index,0);assert.equal(p.find('seek').max,'382');assert.equal(p.find('tree').querySelectorAll('circle').length,65);assert.equal(p.find('tree').querySelectorAll('[tabindex],button,a').length,0);assert.equal(p.find('count').textContent,'0 / 24 个结果');assert.equal(p.find('results').children.length,0);
 }finally{p.dom.window.close();}
});
test('explicit playback pauses on seek, close, hidden, pagehide and both reduced-motion signals, without resuming',async()=>{
 const {mountPermutationDemo}=await import('../source/atelier/js/permutation-demo-view.js'),p=page();
 try{const timers=new Map();let id=0;p.dom.window.setTimeout=fn=>{timers.set(++id,fn);return id};p.dom.window.clearTimeout=id=>timers.delete(id);const c=mountPermutationDemo(p.host);p.host.open=true;
 const start=()=>{p.find('play').click();assert.equal(c.playing,true);assert.equal(timers.size,1)},stopped=()=>{assert.equal(c.playing,false);assert.equal(timers.size,0)};
 start();const [timer,fn]=[...timers][0];timers.delete(timer);fn();assert.equal(c.index,1);assert.equal(timers.size,1);p.find('seek').value='2';p.find('seek').dispatchEvent(new p.dom.window.Event('input'));stopped();
 start();p.host.open=false;p.host.dispatchEvent(new p.dom.window.Event('toggle'));stopped();p.host.open=true;p.host.dispatchEvent(new p.dom.window.Event('toggle'));stopped();
 start();Object.defineProperty(p.doc,'hidden',{value:true,configurable:true});p.doc.dispatchEvent(new p.dom.window.Event('visibilitychange'));stopped();Object.defineProperty(p.doc,'hidden',{value:false,configurable:true});p.doc.dispatchEvent(new p.dom.window.Event('visibilitychange'));stopped();
 start();p.dom.window.dispatchEvent(new p.dom.window.Event('pagehide'));stopped();p.dom.window.dispatchEvent(new p.dom.window.Event('pageshow'));stopped();
 start();p.setReduced(true);stopped();assert.equal(p.find('play').disabled,true);p.setReduced(false);stopped();assert.equal(p.find('play').disabled,false);
 start();p.doc.body.classList.add('motion-off');p.doc.dispatchEvent(new p.dom.window.CustomEvent('atelier:motion',{detail:false}));stopped();assert.equal(p.find('play').disabled,true);p.doc.body.classList.remove('motion-off');p.doc.dispatchEvent(new p.dom.window.CustomEvent('atelier:motion',{detail:true}));stopped();
 }finally{p.dom.window.close();}
});
test('result jump retains the clicked button and focus, and removes every future result',async()=>{
 const {mountPermutationDemo}=await import('../source/atelier/js/permutation-demo-view.js'),{tracePermutation}=await import('../source/atelier/js/permutation-demo-core.mjs'),p=page();
 try{const c=mountPermutationDemo(p.host),m=tracePermutation(3);p.host.open=true;p.find('seek').value=m.steps.length-1;p.find('seek').dispatchEvent(new p.dom.window.Event('input'));const buttons=[...p.find('results').querySelectorAll('button')],second=buttons[1];second.focus();second.click();assert.equal(c.index,m.steps.findIndex(s=>s.phase==='emit'&&s.results.length===2));assert.equal(p.doc.activeElement,second);assert.equal(p.find('results').children.length,2);assert.equal(p.find('results').children[0].firstElementChild,buttons[0]);assert.equal(p.find('results').children[1].firstElementChild,second);assert.equal(buttons[2].isConnected,false);p.find('next').click();assert.equal(p.find('results').children[1].firstElementChild,second);}finally{p.dom.window.close();}
});
test('retry reuses loaded styles, retains focus while pending and restores focus only while open',async()=>{
 const {initPermutationDemo}=await import('../source/atelier/js/permutation-demo.js'),{mountPermutationDemo}=await import('../source/atelier/js/permutation-demo-view.js'),p=page();let calls=0,resolve;
 try{initPermutationDemo({root:p.doc,load:()=>{calls++;return calls===1?Promise.reject(Error('module offline')):new Promise(done=>resolve=done)}});p.host.open=true;p.host.dispatchEvent(new p.dom.window.Event('toggle'));const link=p.doc.head.querySelector('link');assert.ok(link);link.dispatchEvent(new p.dom.window.Event('load'));await flush();const retry=p.find('load-status').querySelector('button');retry.focus();retry.click();assert.equal(p.doc.activeElement,retry);assert.equal(retry.getAttribute('aria-disabled'),'true');assert.equal(p.doc.head.querySelectorAll('link').length,1);resolve({mountPermutationDemo});await flush();assert.equal(p.doc.activeElement,p.find('size'));assert.equal(p.doc.head.querySelectorAll('link').length,1);
 }finally{p.dom.window.close();}
});
test('stylesheet errors remove their failed link, preserve fallback and can retry without focus theft when closed',async()=>{
 const {initPermutationDemo}=await import('../source/atelier/js/permutation-demo.js'),{mountPermutationDemo}=await import('../source/atelier/js/permutation-demo-view.js'),p=page();
 try{initPermutationDemo({root:p.doc,load:async()=>({mountPermutationDemo})});p.host.open=true;p.host.dispatchEvent(new p.dom.window.Event('toggle'));p.doc.head.querySelector('link').dispatchEvent(new p.dom.window.Event('error'));await flush();assert.equal(p.doc.head.querySelectorAll('link').length,0);assert.equal(p.find('fallback').hidden,false);const retry=p.find('load-status').querySelector('button');retry.focus();retry.click();assert.equal(p.doc.head.querySelectorAll('link').length,1);p.host.open=false;p.host.querySelector('summary').focus();p.doc.head.querySelector('link').dispatchEvent(new p.dom.window.Event('load'));await flush();assert.equal(p.doc.activeElement,p.host.querySelector('summary'));assert.equal(p.find('app').hidden,false);assert.equal(mountPermutationDemo(p.host).playing,false);}finally{p.dom.window.close();}
});
test('bare Hexo highlight figures also receive the trace without rewriting the author HTML',()=>{
 const figure='<figure class="highlight cpp"><table><tr><td class="code"><pre>original</pre></td></tr></table></figure>',original='<p>before</p>'+figure+'<p>after</p>';
 const dom=new JSDOM(render({source_id:'124338541',_content:raw},'/lab/',original));try{const host=dom.window.document.querySelector('[data-permutation-demo]');assert.ok(host);assert.equal(host.previousElementSibling.outerHTML,figure.replace('<tr>','<tbody><tr>').replace('</tr>','</tr></tbody>'));assert.equal(host.nextElementSibling.nextElementSibling.textContent,'after');}finally{dom.window.close();}
});
test('ambiguous or missing rendered C++ block suppresses the demonstration despite matching raw source',()=>{
 for(const content of ['<p>No rendered code</p>',body+body,body+'<figure class="highlight cpp"><pre>second</pre></figure>']){
 const dom=new JSDOM(render({source_id:'124338541',_content:raw},'/',content));try{assert.equal(dom.window.document.querySelector('[data-permutation-demo]'),null);assert.equal(dom.window.document.querySelector('script[src*=permutation-demo]'),null);}finally{dom.window.close();}
 }
});
