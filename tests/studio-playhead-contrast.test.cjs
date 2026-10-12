const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parse}=require('rrweb-cssom');
const read=file=>fs.readFileSync(path.join(__dirname,'..','source/atelier/css',file),'utf8');
const rules=[...parse(read('studio.css')).cssRules];
const cursor=rules.findLast(rule=>rule.selectorText==='.studio-editorial .track-steps button.playing::after').style;
function contrast(a,b){
 const luminance=hex=>{
  const rgb=hex.replace('#','').match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
 };
 const x=luminance(a),y=luminance(b);
 return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
test('two-tone playhead has a visible edge on every dark and daylight pad gradient',()=>{
 const ink=cursor.background,edge=cursor['box-shadow'].match(/#[\da-f]{6}/i)?.[0];
 assert.ok(ink&&edge);
 assert.ok(contrast(ink,edge)>=7,'cursor layers have a clear inner boundary');
 let gradients=0;
 for(const file of ['studio.css','daylight.css'])for(const rule of parse(read(file)).cssRules){
  if(!rule.selectorText?.includes('.track-steps button')||!rule.style.background?.startsWith('linear-gradient'))continue;
  const endpoints=rule.style.background.match(/#[\da-f]{6}/gi);
  assert.equal(endpoints.length,2);
  // One continuous layer must contrast against both ends of each actual gradient.
  assert.ok([ink,edge].some(layer=>endpoints.every(fill=>contrast(layer,fill)>=3)),rule.selectorText);
  gradients++;
 }
 assert.equal(gradients,8,'covers empty, alternating, strong and soft pads in both themes');
 assert.equal(cursor['box-shadow'],`0 0 0 1px ${edge}`,'no blur obscures the short timing mark');
});
test('cursor remains playback-only, inside the pad, and separate from the velocity dot',()=>{
 const geometry=rules.find(rule=>rule.selectorText==='.track-steps button.playing:after').style;
 const dot=rules.find(rule=>rule.selectorText?.startsWith('.studio-editorial .track-steps button.on::before')).style;
 assert.equal(geometry.left,'15%');assert.equal(geometry.right,'15%');
 assert.equal(geometry.bottom,'4px');assert.equal(geometry.height,'2px');
 assert.equal(cursor['pointer-events'],'none');
 assert.equal(cursor.getPropertyValue('animation'),'');assert.equal(cursor.getPropertyValue('transition'),'');
 const ring=1,dotRadius=parseFloat(dot.height)/2;
 // Existing 32-step desktop minimum and 44px coarse-pointer pads.
 for(const [width,height] of [[24,24/.72],[44,48]]){
  assert.ok(width*.15-ring>0,'outer cursor stays horizontally inset');
  assert.ok(parseFloat(geometry.bottom)-ring>0,'outer cursor stays above lower pad edge');
  const cursorTop=height-parseFloat(geometry.bottom)-parseFloat(geometry.height)-ring;
  assert.ok(cursorTop>height/2+dotRadius,'play position does not overwrite note strength');
 }
 const forced=rules.find(rule=>rule.media?.mediaText==='(forced-colors:active)');
 const systemCursor=[...forced.cssRules].find(rule=>rule.selectorText==='.studio-editorial .track-steps button.playing::after').style;
 assert.equal(systemCursor.background,'Highlight');assert.equal(systemCursor['box-shadow'],'none');
});
