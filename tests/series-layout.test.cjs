const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ejs=require('ejs'),yaml=require('js-yaml'),{JSDOM}=require('jsdom');
const {exerciseState}=require('../tools/content-catalog.cjs');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const posts=fs.readdirSync(path.join(root,'source/_posts/hot100')).filter(n=>n.endsWith('.md')).map(name=>{
 const raw=read('source/_posts/hot100/'+name),front=yaml.load(raw.split('---')[1]);
 return {...front,path:front.permalink,raw};
}).sort((a,b)=>a.series_order-b.series_order);
const intro='<p>完整原题单说明 <a href="https://leetcode.cn/studyplan/top-100-liked/">来源与许可</a></p>';
function render(prefix){return new JSDOM(ejs.render(read('custom/redefine/nijika/series.ejs'),{
 page:{seriesPosts:posts,introHtml:intro},url_for:p=>prefix+p,
 live_catalog_counts:()=>({withCode:30,analysisPending:100}),
 live_metadata:p=>({exercise:exerciseState(p)}),nijika_count:n=>String(n).padStart(2,'0'),
 partial:()=>read('custom/redefine/nijika/editorial-arrow.ejs')
}));}
for(const prefix of ['/','/lab/']) test(`compact series retains 100 source exercises and 17 native anchor destinations (${prefix})`,()=>{
 const dom=render(prefix),d=dom.window.document,groups=[...d.querySelectorAll('.series-group')];
 assert.equal(groups.length,17);
 assert.equal(new Set(groups.map(n=>n.id)).size,17);
 assert.deepEqual([...d.querySelectorAll('.series-track')].map(n=>n.getAttribute('href')),posts.map(p=>prefix+p.path));
 assert.equal(d.querySelectorAll('.series-track').length,100);
 assert.equal(d.querySelector('.series-topline a').getAttribute('href'),prefix+'notes/');
 assert.match(d.querySelector('.series-header').textContent,/100 道题 · 30 题已有代码 · 100 题解析待补/);
 assert.match(d.querySelector('.series-status-note').textContent,/已有代码尚未做正确性校验/);
 assert.equal(d.querySelector('.series-intro .article-body').innerHTML,intro);
 assert.equal(d.querySelector('.series-intro').open,false);
 const mobile=d.querySelector('.series-topic-disclosure');
 assert.equal(mobile.open,false,'mobile topics are natively collapsed without JavaScript');
 assert.equal(mobile.firstElementChild.tagName,'SUMMARY');
 const desktop=[...d.querySelectorAll('.series-topics>a')],compact=[...mobile.querySelectorAll('nav>a')];
 assert.equal(compact.length,17);
 assert.deepEqual(compact.map(n=>n.textContent),desktop.map(n=>n.textContent));
 for(const link of [...desktop,...compact]){
  assert.ok(d.querySelector(link.getAttribute('href')),'every native hash points to a retained group');
  assert.equal(link.hasAttribute('tabindex'),false,'native links remain keyboard focusable');
 }
 mobile.open=true;assert.equal(mobile.open,true);mobile.open=false;assert.equal(mobile.open,false);
 assert.equal(d.querySelectorAll('script').length,0,'no script required to open the index or follow anchors');
 dom.window.close();
});
test('series layout has one compact owner with mobile disclosure and full-sized targets',()=>{
 const css=read('source/atelier/css/content-catalog.css'),stage=read('source/atelier/css/stage.css');
 const dom=new JSDOM(`<style>${css}</style><style>${stage}</style>`);
 assert.equal(dom.window.document.styleSheets.length,2);
 assert.doesNotMatch(stage,/\.series-(?:header|topics|layout|intro|track)\b/,'legacy series declarations moved out of the early global sheet');
 assert.match(css,/\.series-page \.series-header h1 \{font:600 clamp\(72px,7\.5vw,96px\)/);
 assert.match(css,/@media\(max-width:640px\)[\s\S]*\.series-page \.series-header h1 \{font-size:clamp\(56px,15vw,64px\)/);
 assert.match(css,/\.series-page \.series-topic-disclosure \{display:none\}/);
 assert.match(css,/@media\(max-width:640px\)[\s\S]*\.series-page \.series-topics \{display:none\}/);
 assert.match(css,/@media\(max-width:640px\)[\s\S]*\.series-page \.series-topic-disclosure \{display:block/);
 assert.match(css,/\.series-page \.series-topic-disclosure>summary \{[^}]*min-height:44px/);
 assert.match(css,/\.series-page \.series-mobile-topics>a \{[^}]*min-height:44px/);
 assert.match(css,/\.series-page :is\(a,summary\):focus-visible \{outline:2px/);
 dom.window.close();
});
