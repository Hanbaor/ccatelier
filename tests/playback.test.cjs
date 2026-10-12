const test=require('node:test'),assert=require('node:assert/strict');
test('an older asynchronous play cannot stop or overwrite a newer playback',async()=>{
 const {PlaybackController}=await import('../source/atelier/js/playback.mjs');
 const pending=[];let stops=0;const states=[];
 const engine={start:()=>new Promise(resolve=>pending.push(resolve)),stop:()=>stops++};
 const control=new PlaybackController(engine,s=>states.push(s));
 const a=control.toggle({});control.stop();const b=control.toggle({});pending[1](true);await b;assert.equal(control.state,'playing');pending[0](false);await a;assert.equal(control.state,'playing');assert.equal(stops,1);assert.deepEqual(states,['starting','stopped','starting','playing']);
});
