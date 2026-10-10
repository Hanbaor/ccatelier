/** A single monotonic beat transport. Audio scheduling uses the same position. */
export class PerformanceTransport {
 constructor(project,{now=()=>performance.now()/1000,schedule=()=>{},cancel=()=>{}}={}){this.now=now;this.schedule=schedule;this.cancel=cancel;this.project=project;this.state='stopped';this.offset=0;this.origin=now();this.cursor=0;}
 get position(){return Math.max(0,Math.min(this.project.beats,this.offset+(this.state==='playing'?(this.now()-this.origin)*this.project.bpm/60:0)));}
 invalidate(){this.cancel();this.cursor=this.project.notes.findIndex(n=>n.beat>=this.offset-1e-8);if(this.cursor<0)this.cursor=this.project.notes.length;}
 play(){if(this.state==='playing')return;if(this.offset>=this.project.beats)this.offset=0;this.origin=this.now();this.state='playing';this.invalidate();}
 pause(){this.offset=this.position;this.state='paused';this.invalidate();}
 stop(){this.state='stopped';this.offset=0;this.invalidate();}
 seek(beat){this.offset=Math.max(0,Math.min(this.project.beats,Number(beat)||0));this.origin=this.now();this.invalidate();}
 replace(project){this.pause();this.project=project;this.seek(Math.min(this.offset,project.beats));}
 /** Re-anchor when an explicitly enabled audio clock becomes available or ends. */
 clock(now){const position=this.position;this.now=now;this.offset=position;this.origin=now();this.invalidate();}
 tick(){if(this.state!=='playing')return;const beat=this.position;if(beat>=this.project.beats){this.offset=this.project.beats;this.state='ended';this.invalidate();return;}const seconds=60/this.project.bpm;while(this.cursor<this.project.notes.length){const n=this.project.notes[this.cursor];const delay=(n.beat-beat)*seconds;if(delay>.1)break;this.cursor++;if(delay>=-.025&&n.velocity>0)this.schedule(n,Math.max(0,delay));}}
}
