const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
test('published discovery uses real local article URLs and safe default forms',()=>{
  const posts=JSON.parse(read('public/atelier/data/discovery.json'));
  assert.equal(posts.length,JSON.parse(read('public/search.json')).length);
  assert.ok(posts.some(p=>p.group==='writing'));assert.ok(posts.some(p=>p.group==='hot100'));
  for(const post of posts){assert.ok(post.path.startsWith('/')&&!post.path.startsWith('//'));assert.ok(fs.existsSync(path.join(root,'public',decodeURI(post.path),'index.html')));}
  for(const route of ['admin','guestbook']){const html=read('public/'+route+'/index.html');assert.match(html,/<form[^>]+method="post"[^>]*><fieldset data-form-guard disabled>/);}
  assert.match(read('public/atom.xml'),/<feed xmlns="http:\/\/www.w3.org\/2005\/Atom">/);
});
test('local storage fallback handles both blocked access and write-only quota errors without stale successful values',()=>{
  const code=read('source/atelier/js/ui.js').split('let toastTimer;')[0].replaceAll('export ','')+';globalThis.testStorage=storage;';
  for(const mode of ['denied','quota']){
    const localStorage={getItem(){if(mode==='denied')throw Error('denied');return null;},setItem(){throw Error('quota');}};
    const context={localStorage};vm.runInNewContext(code,context);const storage=context.testStorage;
    assert.equal(storage.set('key','value'),false);assert.equal(storage.get('key'),'value');assert.equal(storage.persistent,false);
  }
  let value='one';const context={localStorage:{getItem:()=>value,setItem:(k,v)=>{value=v;}}};vm.runInNewContext(code,context);
  context.testStorage.set('key','two');value='changed in another page';assert.equal(context.testStorage.get('key'),'changed in another page');
});
