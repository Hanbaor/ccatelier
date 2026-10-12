const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const bridge=()=>import('../source/atelier/js/practice-studio.mjs');
const practice=()=>import('../source/atelier/js/practice-core.mjs');
const codec=()=>import('../source/atelier/js/studio-share.mjs');
const score=(overrides={})=>({id:'bridge-test',title:'原创小节 🎼',description:'Original rhythm.',bpm:112,bars:[{hits:[{step:0,type:'kick',velocity:.12345678901234568},{step:15,type:'tom',velocity:.8200000000000001}]},{hits:[]}],...overrides});

test('every original demo and every valid one/two-bar range maps exactly with immutable source',async()=>{
 const {practiceToStudio}=await bridge(),{PRACTICE_DEMOS}=await practice(),{decodeShare,encodeShare}=await codec(),{preset}=await import('../source/atelier/js/studio-core.mjs');
 for(const source of PRACTICE_DEMOS)for(let start=0;start<source.bars.length;start++)for(const count of [1,2]){
  if(start+count>source.bars.length)continue;
  const before=JSON.stringify(source),p=practiceToStudio(source,start,start+count-1,source.bpm);
  assert.equal(p.name,source.title);assert.equal(p.steps,count*16);assert.equal(p.swing,0);assert.equal(p.master,preset('blank').master);
  for(const [i,track] of p.tracks.entries()){
   const expected=Array(count*16).fill(0);for(let b=start;b<start+count;b++)for(const hit of source.bars[b].hits)if(hit.type===track.type)expected[(b-start)*16+hit.step]=hit.velocity;
   assert.deepEqual(track.steps,expected);const defaults=preset('blank').tracks[i];assert.deepEqual({...track,steps:[]},{...defaults,steps:[]});
  }
  assert.deepEqual(decodeShare(encodeShare(p)),p);p.tracks[0].steps[0]=.9;assert.equal(JSON.stringify(source),before);
 }
});

test('tempo boundaries, fractions, exact floating velocities and all trailing silent bars survive codec',async()=>{
 const {practiceToStudio}=await bridge(),{decodeShare,encodeShare}=await codec();
 for(const bpm of [60,180,123.45678901234567])for(const range of [[0,0],[0,1],[1,1]]){
  const p=practiceToStudio(score(),...range,bpm);assert.equal(p.bpm,bpm);assert.equal(p.steps,(range[1]-range[0]+1)*16);assert.deepEqual(decodeShare(encodeShare(p)),p);
  if(range[0]===0){assert.equal(p.tracks[0].steps[0],.12345678901234568);assert.equal(p.tracks[4].steps[15],.8200000000000001);}
  if(range[1]===1)assert.ok(p.tracks.every(t=>t.steps.slice(range[0]===0?16:0).every(v=>v===0)));
 }
 assert.equal(practiceToStudio(score({title:'x'.repeat(60)}),0,0,112).name.length,60);
 assert.throws(()=>practiceToStudio(score({title:'x'.repeat(61)}),0,0,112),/60/);
});

test('converter rejects unsupported ranges, tempos and nonrepresentable events instead of coercing',async()=>{
 const {practiceToStudio}=await bridge();
 for(const bpm of [undefined,null,'112',NaN,Infinity,59.999,180.001,40,220])assert.throws(()=>practiceToStudio(score(),0,1,bpm),/60–180/);
 for(const range of [[-1,0],[0,2],[1,0],[0,1.5],['0',1],[0,undefined],[NaN,1],[0,3]])assert.throws(()=>practiceToStudio(score({bars:[{hits:[]},{hits:[]},{hits:[]},{hits:[]}]}),...range,112),/1–2/);
 for(const velocity of [0,-0])assert.throws(()=>practiceToStudio(score({bars:[{hits:[{step:0,type:'kick',velocity}]}]}),0,0,112),/零力度/);
 // A silent event outside the chosen range is not converted or destroyed.
 const outside=score();outside.bars[1].hits.push({step:0,type:'hat',velocity:0});assert.equal(practiceToStudio(outside,0,0,112).steps,16);
});

test('complete Practice validation rejects malformed fields, accessors, sparse arrays, duplicates and off-grid notes',async()=>{
 const {practiceToStudio}=await bridge();
 for(const modify of [p=>p.extra=true,p=>p.bpm='112',p=>p.bars[0].hits.push({...p.bars[0].hits[0]}),p=>p.bars[0].hits[0].step=.5,p=>p.bars[0].hits[0].step=16,p=>p.bars[0].hits[0].type='clap',p=>p.bars[0].hits[0].velocity=NaN,p=>p.bars[0].hits[0].velocity=1.01,p=>p.bars[0].hits[0].velocity='0.8',p=>delete p.bars[1],p=>p.bars[0].hits.extra=true,p=>Object.defineProperty(p,'title',{get(){throw Error('accessor must not execute');}}),p=>Object.setPrototypeOf(p,{})]){
  const p=score();modify(p);assert.throws(()=>practiceToStudio(p,0,0,112),/无效练习数据/);
 }
});

test('bridge URL only permits exact template Studio route at root/subpath and strips Practice query',async()=>{
 const {practiceToStudio,practiceStudioURL}=await bridge(),{decodeShare,createShareURL}=await codec(),p=practiceToStudio(score(),0,1,112);
 for(const root of ['/','/preview/','/my-site/nested/']){
  const current='https://atelier.test'+root+'studio/practice/?recording=private#old',dest=root+'studio/',url=new URL(practiceStudioURL(p,dest,current));
  assert.equal(url.pathname,dest);assert.equal(url.search,'');assert.deepEqual(decodeShare(url.hash),p);
  assert.throws(()=>createShareURL(p,url.href,current),/当前页面/,'same-page sharing guard is unchanged');
  for(const bad of ['//evil.test/studio/','https://atelier.test'+dest,'https://user:pass@atelier.test'+dest,dest+'?foo=1',dest+'#x',dest+'../studio/',dest.replace('/studio/','/%73tudio/'),dest.replace('/studio/','/studio\\/'),'/elsewhere/studio/','javascript:alert(1)'])assert.throws(()=>practiceStudioURL(p,bad,current));
 }
 for(const current of ['file:///studio/practice/','https://user:pass@atelier.test/studio/practice/','https://atelier.test/other/','not a URL'])assert.throws(()=>practiceStudioURL(p,'/studio/',current));
});

test('converter and codec are absent from initial and Practice static module graphs',()=>{
 const {report}=require('../tools/module-graph.cjs'),r=report(path.resolve(__dirname,'../source'));
 for(const graph of [r.initial,r.routes.find(row=>row.route==='/studio/practice/')])for(const file of ['practice-studio.mjs','studio-share.mjs'])assert.ok(!graph.files.some(f=>f.path.endsWith(file)),file);
 assert.match(fs.readFileSync(path.resolve(__dirname,'../source/atelier/js/practice.js'),'utf8'),/loadStudioBridge=\(\)=>import\('\.\/practice-studio\.mjs'\)/);
});

test('bridge uses existing Studio receiver: silent arrival, editable 16/32-step grid, exact share and undo',async t=>{
 const {practiceToStudio,practiceStudioURL}=await bridge(),{decodeShare,encodeShare}=await codec(),{preset}=await import('../source/atelier/js/studio-core.mjs');
 const ejs=require('ejs'),{JSDOM}=require('jsdom'),read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
 const incoming=practiceToStudio(score(),0,1,123.4567890123);
 const html=ejs.render(read('custom/redefine/nijika/studio.ejs'),{theme:{nijika:{studio_art:'/atelier/images/studio.webp'}},url_for:p=>'/'+p.replace(/^\//,''),nijika_art_srcset:()=>'',partial:()=>''});
 const dom=new JSDOM(html,{pretendToBeVisual:true,url:practiceStudioURL(incoming,'/studio/','https://atelier.test/studio/practice/')}),{window}=dom,{document}=window,previous=new Map();let audio=0,writes=0;
 for(const [name,value] of Object.entries({window,document,CustomEvent:window.CustomEvent,localStorage:window.localStorage,matchMedia:()=>({matches:true,addEventListener(){}}),devicePixelRatio:1,ResizeObserver:class{observe(){}},requestAnimationFrame:()=>0,cancelAnimationFrame(){}})){previous.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});}
 window.HTMLCanvasElement.prototype.getContext=()=>null;window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};window.AudioContext=class{constructor(){audio++;throw Error('unexpected audio');}};
 const {vault}=await import('../source/atelier/js/vault.js'),oldPut=vault.put;vault.put=async()=>{writes++;};const oldSet=window.Storage.prototype.setItem;window.Storage.prototype.setItem=function(){writes++;};
 t.after(()=>{window.dispatchEvent(new window.Event('pagehide'));vault.put=oldPut;window.Storage.prototype.setItem=oldSet;window.close();for(const [name,value] of previous){if(value)Object.defineProperty(globalThis,name,value);else delete globalThis[name];}});
 const {initStudio}=await import('../source/atelier/js/studio.js');initStudio();const q=s=>document.querySelector(s);
 const shared=()=>{q('[data-studio-share]').click();const p=decodeShare(new URL(q('#studio-share-url').value).hash);q('#studio-share').close();return p;};
 assert.equal(q('[data-share-arrival]').hidden,false);assert.equal(q('[data-project-name]').value,incoming.name);assert.equal(document.querySelectorAll('[data-studio-step]').length,32*6);assert.deepEqual(shared(),incoming);
 q('[data-studio-undo]').click();assert.equal(q('[data-project-name]').value,preset().name);q('[data-studio-redo]').click();assert.deepEqual(shared(),incoming);
 const empty=q('[data-studio-track="3"][data-studio-step="31"]');assert.equal(empty.getAttribute('aria-pressed'),'false');empty.click();const edited=shared();assert.equal(edited.tracks[3].steps[31],1);assert.equal(edited.bpm,incoming.bpm);assert.equal(edited.tracks[4].steps[15],incoming.tracks[4].steps[15]);q('[data-studio-undo]').click();assert.deepEqual(shared(),incoming);
 const single=practiceToStudio(score(),1,1,60);window.history.replaceState(null,'',encodeShare(single));window.dispatchEvent(new window.HashChangeEvent('hashchange'));assert.equal(document.querySelectorAll('[data-studio-step]').length,16*6);assert.deepEqual(shared(),single);q('[data-studio-undo]').click();assert.deepEqual(shared(),incoming);assert.equal(audio,0);assert.equal(writes,0);
});


test('bridge source declares 13px text, 44px action minimums and one privacy explanation',async()=>{
 const css=fs.readFileSync(path.resolve(__dirname,'../source/atelier/css/practice.css'),'utf8');
 assert.match(css,/\.practice-options \[data-practice-studio\] \{[^}]*min-height:44px;[^}]*font-size:13px/);
 assert.match(css,/\.practice-studio-preview p \{[^}]*font:13px\/1\.8/);
 assert.match(css,/\.practice-studio-actions a,\.practice-studio-actions button \{[^}]*min-height:44px;[^}]*font:13px/);
 const html=require('ejs').render(fs.readFileSync(path.resolve(__dirname,'../custom/redefine/nijika/practice.ejs'),'utf8'),{page:{practiceScores:(await require('../tools/build-practice-scores.cjs').buildPracticeScores()).map(({path,score})=>({...score,path}))},url_for:p=>'/'+p,partial:()=>''}),dom=new (require('jsdom').JSDOM)(html);
 try{const preview=dom.window.document.querySelector('[data-practice-studio-preview]');assert.equal(preview.querySelectorAll('p').length,2);assert.match(preview.textContent,/链接包含所选节奏，不会自动存入项目库/);assert.doesNotMatch(preview.textContent,/不会自动保存/);}finally{dom.window.close();}
});
