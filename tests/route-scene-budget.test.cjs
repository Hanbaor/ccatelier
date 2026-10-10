const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const scenes=['backstage','live-art','rooms-v2'];
const bytes=file=>fs.statSync(path.join(root,'source/atelier/css',file+'.css')).size;
const cases=[
  ['index.html',['live-art'],53611,17],
  ['atelier/index.html',['backstage'],31806,17],
  ['notes/index.html',[],63440,16],
  ['projects/index.html',['rooms-v2'],41463,16],
  ['research/index.html',['rooms-v2'],41463,17],
  ['about/index.html',['rooms-v2'],41463,16]
];
function styles(route){
  const html=fs.readFileSync(path.join(root,'public',route),'utf8');
  const head=html.match(/<head>[\s\S]*?<\/head>/)?.[0];
  assert.ok(head,route+' complete server-rendered head');
  return [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match=>match[1]);
}
test('generated personal routes select fewer stylesheet source bytes without a client-side loader',()=>{
  for(const [route,keep,saved,count] of cases){
    const links=styles(route);
    const selected=scenes.filter(file=>links.some(link=>link.endsWith('/atelier/css/'+file+'.css')));
    assert.deepEqual(selected,keep,route+' scenes');
    assert.equal(links.length,count,route+' stylesheet count');
    assert.equal(new Set(links).size,count,route+' no duplicates');
    const removed=scenes.filter(file=>!keep.includes(file));
    assert.equal(removed.reduce((sum,file)=>sum+bytes(file),0),saved,route+' omitted uncompressed source bytes');
    // Read the actual emitted assets. This is a reference-byte budget, not transfer size or load-time measurement.
    const emittedBytes=links.reduce((sum,url)=>{
      assert.ok(url.startsWith('/')&&!url.startsWith('//'),route+' local stylesheet');
      return sum+fs.statSync(path.join(root,'public',url.slice(1))).size;
    },0);
    assert.ok(emittedBytes>0);
    for(const file of ['archive','after-hours','stage-engine'])assert.ok(links.some(link=>link.endsWith('/atelier/css/'+file+'.css')),route+' global dialog dependencies');
  }
});
test('generated secondary rooms retain their scene stylesheet while music and articles omit it',()=>{
  for(const route of ['life/index.html','lounge/index.html','guestbook/index.html']){
    assert.deepEqual(scenes.filter(file=>styles(route).some(link=>link.endsWith('/atelier/css/'+file+'.css'))),['rooms-v2'],route);
  }
  for(const route of ['studio/index.html','studio/practice/index.html','2026/09/22/Hello-CC-Atelier/index.html']){
    const links=styles(route);
    assert.deepEqual(scenes.filter(file=>links.some(link=>link.endsWith('/atelier/css/'+file+'.css'))),[],route);
    assert.ok(links.some(link=>link.endsWith('/atelier/css/archive.css')),route+' global live dialogs');
  }
});
test('offline shell still includes all legacy CSS assets for saved and fallback documents',()=>{
  const shell=JSON.parse(fs.readFileSync(path.join(root,'public/atelier/data/offline-shell.json'),'utf8'));
  for(const file of scenes)assert.ok(shell.some(url=>url.endsWith('/atelier/css/'+file+'.css')),file+' remains available offline');
});

test('editorial index adds exactly one offline-ready stylesheet only to notes and atelier',()=>{
  const routes=fs.readdirSync(path.join(root,'public'),{recursive:true}).filter(file=>file.endsWith('.html'));
  const expected=routes.filter(route=>/^(?:atelier|notes(?:\/page\/[1-9]\d*)?)\/index\.html$/.test(route)).sort();
  assert.ok(expected.includes('atelier/index.html')&&expected.includes('notes/index.html'));
  const actual=routes.filter(route=>{
    const links=styles(route).filter(link=>link.endsWith('/atelier/css/editorial-index.css'));
    assert.ok(links.length<=1,route+' must not duplicate index styling');
    return links.length===1;
  }).sort();
  assert.deepEqual(actual,expected);
  const shell=JSON.parse(fs.readFileSync(path.join(root,'public/atelier/data/offline-shell.json'),'utf8'));
  assert.ok(shell.includes('/atelier/css/editorial-index.css'));
  assert.ok(fs.statSync(path.join(root,'public/atelier/css/editorial-index.css')).size>0);
});
