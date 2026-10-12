/** Deterministic policy and geometry inputs for the optional visual layer. */
export const STAGE_LIMITS=Object.freeze({fps:30,maxWidth:1024,maxPixels:1000000,bleed:38,settleMs:700});
const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||0));
export function stageResolution(width,height,dpr=1,narrow=false){
 width=Math.max(1,Number(width)||1);height=Math.max(1,Number(height)||1);
 const scale=Math.min(clamp(dpr,1,narrow?1.25:1.5),STAGE_LIMITS.maxWidth/width,Math.sqrt(STAGE_LIMITS.maxPixels/(width*height)));
 return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale)),scale};
}
export function stagePadLayout(container,pad,bleed=STAGE_LIMITS.bleed){
 const width=Math.max(1,Number(pad.width)||1),height=Math.max(1,Number(pad.height)||1);
 const tilt=Math.asin(clamp(height/width,.35,.94));
 return {x:pad.left-container.left+width/2+bleed,y:pad.top-container.top+height/2+bleed,radius:width/2,tilt,depthScale:height/(width*Math.sin(tilt)),roll:0};
}
/** Project the native CSS ellipse through its 3×3 planar homography. */
export function stageEllipseLayout(h){
 const [a,b,c,d,e,f,g,j,k]=h,det=a*(e*k-f*j)-b*(d*k-f*g)+c*(d*j-e*g);
 if(!Number.isFinite(det)||Math.abs(det)<1e-10)return null;
 const m=[e*k-f*j,c*j-b*k,b*f-c*e,f*g-d*k,a*k-c*g,c*d-a*f,d*j-e*g,b*g-a*j,a*e-b*d].map(value=>value/det);
 const dot=(x,y)=>m[x]*m[y]+m[x+3]*m[y+3]-m[x+6]*m[y+6];
 const A=dot(0,0),B=dot(0,1),D=dot(1,1),U=dot(0,2),V=dot(1,2),C=dot(2,2),q=A*D-B*B;
 if(!Number.isFinite(q)||Math.abs(q)<1e-18)return null;
 const x=(B*V-D*U)/q,y=(B*U-A*V)/q,norm=-(C+U*x+V*y),delta=Math.hypot(A-D,2*B),large=(A+D+delta)/2,small=(A+D-delta)/2;
 let rx=Math.sqrt(norm/small),ry=Math.sqrt(norm/large),roll=.5*Math.atan2(2*B,A-D)+Math.PI/2;
 if(![x,y,rx,ry,roll].every(Number.isFinite)||rx<=0||ry<=0)return null;
 while(roll>Math.PI/2)roll-=Math.PI;while(roll< -Math.PI/2)roll+=Math.PI;
 // Keep the first axis approximately horizontal, including tall phone pads.
 if(Math.abs(roll)>Math.PI/4){[rx,ry]=[ry,rx];roll+=roll>0?-Math.PI/2:Math.PI/2;}
 const tilt=Math.asin(clamp(ry/rx,.35,.94));
 return {x,y,radius:rx,tilt,depthScale:ry/(rx*Math.sin(tilt)),roll};
}
export function strikeEnvelope(elapsed,velocity=.7){
 if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=STAGE_LIMITS.settleMs)return {head:0,tilt:0};
 const strength=clamp(velocity,0,1);
 return {head:Math.sin(elapsed/48)*Math.exp(-elapsed/110)*strength,tilt:Math.sin(elapsed/34)*Math.exp(-elapsed/180)*.031*strength};
}
export function canStageAnimate({open,visible,motion,disposed=false,lost=false}){return !!(open&&visible&&motion&&!disposed&&!lost);}
