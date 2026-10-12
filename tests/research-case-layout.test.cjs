const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const ejs=require('ejs');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
// CSS contract only: jsdom does not measure browser line wrapping or pixels.
function atWidth(css,width){
 const dom=new JSDOM(`<style>${css}</style>`);
 const flatten=rules=>Array.from(rules,rule=>{
  if(rule.type!==4)return rule.cssText;
  const min=rule.conditionText.match(/min-width:\s*(\d+)px/),max=rule.conditionText.match(/max-width:\s*(\d+)px/);
  return (!min||width>=+min[1])&&(!max||width<=+max[1])?flatten(rule.cssRules):'';
 }).join('\n');
 try{return flatten(dom.window.document.styleSheets[0].cssRules)}finally{dom.window.close()}
}
for(const width of [295,320,393,650,651,900,1180])test(`SQL case choices can wrap naturally at ${width}px`,()=>{
 const html=ejs.render(read('custom/redefine/nijika/research.ejs'),{url_for:value=>'/'+value,partial:()=>''});
 const dom=new JSDOM(html);
 try{
  const doc=dom.window.document,style=doc.createElement('style');
  style.textContent=atWidth(read('source/atelier/css/research-sql.css'),width);doc.head.append(style);
  const choices=doc.querySelector('.sql-case-switch');choices.hidden=false;
  const css=dom.window.getComputedStyle(choices);
  assert.equal(css.display,'flex');assert.equal(css.flexWrap,'wrap');
  assert.equal(css.gap,width<=650?'4px 18px':'4px 25px');
  assert.equal(css.height,'','no fixed height clips additional rows');
  for(const button of choices.querySelectorAll('button')){
   const value=dom.window.getComputedStyle(button);
   assert.equal(value.minWidth,'0');assert.equal(value.maxWidth,'100%');
   assert.equal(value.overflowWrap,'anywhere');assert.ok(parseFloat(value.minHeight)>=44);
   assert.ok(doc.getElementById(button.getAttribute('aria-controls')));
  }
  for(const table of doc.querySelectorAll('.sql-table-wrap')){
   const value=dom.window.getComputedStyle(table);
   assert.equal(value.minWidth,'0');assert.equal(value.overflow,'auto');
   if(width<=650)assert.equal(value.flexBasis,'100%');
  }
 }finally{dom.window.close()}
});
