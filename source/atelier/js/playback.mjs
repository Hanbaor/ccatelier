export class PlaybackController{
 constructor(engine,onState=()=>{},onError=()=>{}){this.engine=engine;this.onState=onState;this.onError=onError;this.state='stopped';this.generation=0;}
 setState(value){this.state=value;this.onState(value);}
 stop(){this.generation++;this.engine.stop();this.setState('stopped');}
 async toggle(project){
  if(this.state!=='stopped'){this.stop();return;}const token=++this.generation;this.setState('starting');
  try{const started=await this.engine.start(project);if(token!==this.generation)return;if(started)this.setState('playing');else this.stop();}
  catch(error){if(token!==this.generation)return;this.stop();this.onError(error);}
 }
}
