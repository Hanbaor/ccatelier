const test=require('node:test'),assert=require('node:assert/strict');
const core=()=>import('../source/atelier/js/studio-core.mjs');
test('swing delays offbeats while each beat and loop keep their exact duration',async()=>{
 const {stepTime,loopDuration}=await core();
 assert.equal(stepTime(0,120,.4),0);assert.equal(stepTime(1,120,.4),.175);assert.equal(stepTime(2,120,.4),.25);assert.equal(stepTime(4,120,.4),.5);assert.equal(loopDuration(16,120),2);
});
test('studio import rejects dangerous and out-of-range projects and preserves velocities',async()=>{
 const {preset,validateProject}=await core();const p=preset('indie');p.tracks[0].steps[0]=.6;assert.equal(validateProject(p).tracks[0].steps[0],.6);
 for(const override of [{bpm:0},{steps:64},{swing:2},{name:'x'.repeat(100)}])assert.throws(()=>validateProject({...p,...override}));
 p.tracks[0].steps[0]=9;assert.throws(()=>validateProject(p));
});
test('history restores deep edits and discards redo after a new branch',async()=>{
 const {History}=await core(),h=new History({x:[1]});h.push({x:[2]});assert.deepEqual(h.undo(),{x:[1]});assert.deepEqual(h.redo(),{x:[2]});h.undo();h.push({x:[3]});assert.equal(h.canRedo,false);assert.deepEqual(h.current,{x:[3]});
});
test('WAV export interleaves stereo PCM and writes a valid RIFF header',async()=>{
 const {encodeWav}=await core();const b=encodeWav([new Float32Array([1,-1]),new Float32Array([.5,0])],48000),v=new DataView(b);
 assert.equal(Buffer.from(b).toString('ascii',0,4),'RIFF');assert.equal(v.getUint32(4,true),44);assert.equal(v.getUint16(22,true),2);assert.equal(v.getUint32(24,true),48000);assert.equal(v.getUint32(40,true),8);assert.equal(v.getInt16(44,true),32767);assert.equal(v.getInt16(46,true),16384);assert.equal(v.getInt16(48,true),-32768);
});
