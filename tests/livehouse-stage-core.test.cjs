const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const core=import('../source/atelier/js/livehouse-stage-core.mjs');
test('optional stage buffers have explicit mobile, desktop and total-pixel limits',async()=>{
 const {stageResolution}=await core;
 for(const [width,height,dpr,narrow] of [[390,300,3,true],[710,250,2,false],[4000,3000,4,false],[0,0,0,false]]){
  const size=stageResolution(width,height,dpr,narrow);assert.ok(size.width>0&&size.height>0);assert.ok(size.width<=1024);assert.ok(size.width*size.height<=1000000);assert.ok(size.scale<=(narrow?1.25:1.5));
 }
 assert.equal(stageResolution(390,300,3,true).width,487);assert.equal(stageResolution(500,300,2,false).width,750);
});
test('projected geometry follows measured native target centers without rewriting their positions',async()=>{
 const {stagePadLayout}=await core,result=stagePadLayout({left:100,top:220},{left:230,top:300,width:180,height:140});
 assert.equal(result.x,258);assert.equal(result.y,188);assert.equal(result.radius,90);assert.ok(Math.abs(Math.sin(result.tilt)-140/180)<1e-9);
});
test('a tall narrow-screen native pad keeps its full projected height',async()=>{
 const {stagePadLayout}=await core;
 for(const [width,height] of [[111.3,132],[135.6,132],[180,130]]){
  const result=stagePadLayout({left:0,top:0},{left:10,top:10,width,height});assert.ok(Math.abs(2*result.radius*Math.sin(result.tilt)*result.depthScale-height)<1e-9);assert.equal(result.radius*2,width);
 }
});
test('rotated native ellipses use their painted axes rather than rectangular bounds',async()=>{
 const {stageEllipseLayout}=await core,angle=-8*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 const result=stageEllipseLayout([95*c,-61*s,230,95*s,61*c,180,0,0,1]);assert.ok(Math.abs(result.x-230)<1e-8);assert.ok(Math.abs(result.y-180)<1e-8);assert.ok(Math.abs(result.radius-95)<1e-8);assert.ok(Math.abs(result.radius*Math.sin(result.tilt)*result.depthScale-61)<1e-8);assert.ok(Math.abs(result.roll-angle)<1e-8);
 const tall=stageEllipseLayout([55.65,0,100,0,66,200,0,0,1]);assert.ok(Math.abs(tall.radius-55.65)<1e-8);assert.ok(Math.abs(tall.roll)<1e-8);assert.equal(stageEllipseLayout([0,0,0,0,0,0,0,0,0]),null);
});
test('CSS parent perspective produces the same projected conic at every sampled rim point',async()=>{
 const {stageEllipseLayout}=await core,h=[96,7,300,4,59,190,0,.018,1],result=stageEllipseLayout(h),rx=result.radius,ry=rx*Math.sin(result.tilt)*result.depthScale,c=Math.cos(result.roll),s=Math.sin(result.roll);
 for(let i=0;i<40;i++){const u=Math.cos(i/40*Math.PI*2),v=Math.sin(i/40*Math.PI*2),w=h[6]*u+h[7]*v+h[8],x=(h[0]*u+h[1]*v+h[2])/w-result.x,y=(h[3]*u+h[4]*v+h[5])/w-result.y;assert.ok(Math.abs(((x*c+y*s)/rx)**2+((-x*s+y*c)/ry)**2-1)<1e-8);}
});
test('mechanical strike envelopes are bounded and settle exactly to neutral',async()=>{
 const {strikeEnvelope}=await core;
 for(let ms=0;ms<700;ms++){const value=strikeEnvelope(ms,20);assert.ok(Math.abs(value.head)<=1);assert.ok(Math.abs(value.tilt)<2*Math.PI/180);}
 for(const elapsed of [-1,700,10000,Infinity,NaN])assert.deepEqual(strikeEnvelope(elapsed),{head:0,tilt:0});
 assert.deepEqual(strikeEnvelope(30,-2),{head:0,tilt:0});
});
test('animation requires an open visible motion-enabled healthy stage',async()=>{
 const {canStageAnimate}=await core,base={open:true,visible:true,motion:true};assert.equal(canStageAnimate(base),true);
 for(const key of ['open','visible','motion'])assert.equal(canStageAnimate({...base,[key]:false}),false);
 for(const key of ['lost','disposed'])assert.equal(canStageAnimate({...base,[key]:true}),false);
});
test('same-origin Three.js artifact is pinned, licensed and inside its byte budget',()=>{
 const dir=path.resolve(__dirname,'../source/atelier/vendor/three/0.186.0'),provenance=JSON.parse(fs.readFileSync(path.join(dir,'provenance.json'))),bytes=fs.readFileSync(path.join(dir,'livehouse-three.js'));
 assert.equal(provenance.version,'0.186.0');assert.equal(provenance.esbuild,'0.28.1');assert.equal(provenance.license,'MIT');assert.equal(bytes.length,provenance.artifact.bytes);assert.equal(zlib.gzipSync(bytes,{level:9}).length,provenance.artifact.gzipBytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),provenance.artifact.sha256);assert.ok(bytes.length<=650000);assert.ok(provenance.artifact.gzipBytes<=180000);assert.match(fs.readFileSync(path.join(dir,'LICENSE'),'utf8'),/Permission is hereby granted/);
 const stage=fs.readFileSync(path.resolve(__dirname,'../source/atelier/js/livehouse-stage.js'),'utf8');assert.match(stage,/import\('\.\.\/vendor\/three\/0\.186\.0\/livehouse-three\.js'\)/);assert.doesNotMatch(stage,/https?:\/\/|getUserMedia|requestPointerLock|AudioContext/);
 const shell=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../public/atelier/data/offline-shell.json')));assert.ok(!shell.some(url=>url.includes('/atelier/vendor/three/')),'optional GPU runtime does not inflate every saved article');
});
