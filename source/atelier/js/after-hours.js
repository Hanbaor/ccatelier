import {$,$$,storage,toast,openDialog,motion} from './ui.js';
import {readShelf,remember,safePath,readTimer,remainingTime,pauseTimer} from './reading-state.mjs';

const root=document.body.dataset.root || '/', path=location.pathname;
const loadList=key=>readShelf(storage.get('cc-'+key));
const saveList=(key,list)=>storage.set('cc-'+key,JSON.stringify(list));
async function copy(text) {try {await navigator.clipboard.writeText(text);toast('已经复制，带走吧。');}catch{toast('复制未成功，请手动复制浏览器地址或文字。');}}

function readingTools() {
  const tools=$('[data-article-tools]');if(!tools)return;
  const item={path,title:tools.dataset.title},body=$('.article-body');
  const old=loadList('recent').find(p=>p.path===path);
  saveList('recent',remember(loadList('recent'),{...item,progress:old?.progress||0}));
  const bookmark=$('[data-bookmark]');
  function showBookmark(){const saved=loadList('saved').some(p=>p.path===path);bookmark.setAttribute('aria-pressed',String(saved));bookmark.textContent=saved?'★ 已收进歌单':'☆ 收进歌单';}
  showBookmark();bookmark.addEventListener('click',()=>{
    const list=loadList('saved'),exists=list.some(p=>p.path===path);saveList('saved',exists?list.filter(p=>p.path!==path):remember(list,item,100));showBookmark();
    toast(exists?'已移出阅读歌单':storage.persistent?'已保存在这台浏览器的阅读歌单':'浏览器禁止存储，收藏仅在当前页面有效');
  });
  $('[data-copy-link]').addEventListener('click',()=>copy(location.origin+path));
  const focus=$('[data-focus-reading]');
  function setFocus(value){document.body.classList.toggle('reading-focused',value);focus.setAttribute('aria-pressed',String(value));focus.textContent=value?'退出专注':'专注阅读';}
  focus.addEventListener('click',()=>setFocus(!document.body.classList.contains('reading-focused')));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')setFocus(false);});
  const size=$('[data-reading-size]'),sizes=['normal','large','larger'];let sizeIndex=Math.max(0,sizes.indexOf(storage.get('cc-reading-size')));
  function applySize(){document.body.dataset.readingSize=sizes[sizeIndex];size.setAttribute('aria-label','调整阅读字号，当前'+['标准','大','特大'][sizeIndex]);size.textContent=['Aa','Aa +','Aa ++'][sizeIndex];}applySize();
  size.addEventListener('click',()=>{sizeIndex=(sizeIndex+1)%3;storage.set('cc-reading-size',sizes[sizeIndex]);applySize();});
  const resume=$('[data-reading-resume]');
  if(old?.progress>.05 && old.progress<.97){resume.hidden=false;resume.textContent=`继续上次的阅读 · ${Math.round(old.progress*100)}% ↓`;resume.addEventListener('click',()=>{window.scrollTo({top:window.scrollY+body.getBoundingClientRect().top+old.progress*Math.max(0,body.scrollHeight-innerHeight*.6),behavior:motion.enabled?'smooth':'instant'});resume.hidden=true;});}
  let dirty=false;
  const persist=()=>{if(!dirty)return;dirty=false;const progress=Math.max(0,Math.min(1,-body.getBoundingClientRect().top/Math.max(1,body.scrollHeight-innerHeight*.6)));saveList('recent',remember(loadList('recent'),{...item,progress}));};
  window.addEventListener('scroll',()=>{dirty=true;},{passive:true});let interval=setInterval(persist,2000);window.addEventListener('pagehide',()=>{persist();clearInterval(interval);});window.addEventListener('pageshow',event=>{if(event.persisted){showBookmark();interval=setInterval(persist,2000);}});
}

function discovery() {
  let indexPromise;
  const index=()=>indexPromise ||= fetch(root+'atelier/data/discovery.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(rows=>rows.filter(p=>safePath(p.path)&&p.path.startsWith(root))).catch(error=>{indexPromise=null;throw error;});
  $$('[data-random-post]').forEach(button=>button.addEventListener('click',async()=>{button.disabled=true;try{const posts=(await index()).filter(p=>p.group===button.dataset.randomPost&&p.path!==path);if(!posts.length){toast('这一面暂时还没有文章');return;}location.assign(posts[Math.floor(Math.random()*posts.length)].path);}catch{toast('歌单暂时没加载好，再试一次吧。');}finally{button.disabled=false;}}));
  const list=$('[data-reading-list]');if(!list)return;
  function render(key){const entries=loadList(key);list.replaceChildren();$('[data-saved-count]').textContent=String(loadList('saved').length).padStart(2,'0');
    if(!entries.length){const p=document.createElement('p');p.className='community-empty';p.textContent=key==='saved'?'在文章里点「收进歌单」，留待下次。':'读过的文章，会在这里留下足迹。';list.append(p);}
    entries.forEach((entry,i)=>{const row=document.createElement('div');row.className='reading-shelf-row';const number=document.createElement('span');number.textContent=String(i+1).padStart(2,'0');const link=document.createElement('a');link.href=entry.path;link.textContent=entry.title;row.append(number,link);if(key==='saved'){const remove=document.createElement('button');remove.textContent='×';remove.setAttribute('aria-label','移除收藏：'+entry.title);remove.addEventListener('click',()=>{saveList('saved',loadList('saved').filter(p=>p.path!==entry.path));render(key);});row.append(remove);}list.append(row);});
    $$('[data-reading-list-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.readingListTab===key)));
  }render('saved');$$('[data-reading-list-tab]').forEach(button=>button.addEventListener('click',()=>render(button.dataset.readingListTab)));
}

function passport() {
  let pass;try{pass=JSON.parse(storage.get('cc-pass'));}catch{}
  const sections=['atelier','notes','about','guestbook','lounge'];
  if(!pass || !/^[A-F0-9]{6}$/.test(pass.id) || !/^\d{4}-\d{2}-\d{2}$/.test(pass.date) || !Array.isArray(pass.stamps))pass={id:crypto.randomUUID().slice(0,6).toUpperCase(),date:new Date().toLocaleDateString('sv-SE'),stamps:[]};
  pass.stamps=pass.stamps.filter(s=>sections.includes(s));const section=document.body.dataset.section;
  if(sections.includes(section)&&!pass.stamps.includes(section))pass.stamps.push(section);
  storage.set('cc-pass',JSON.stringify(pass));
  if(!$('[data-pass-id]'))return;
  $('[data-pass-id]').textContent='NO. '+pass.id;$('[data-pass-date]').textContent=pass.date+' / '+pass.stamps.length+' OF 5 STAMPS';
  $$('[data-pass-stamp]').forEach(stamp=>{const stamped=pass.stamps.includes(stamp.dataset.passStamp);stamp.classList.toggle('stamped',stamped);stamp.setAttribute('aria-label',stamp.textContent.trim()+(stamped?'：已到访':'：尚未到访'));});
  $('[data-download-ticket]').addEventListener('click',()=>{
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="480" viewBox="0 0 1000 480"><rect width="1000" height="480" rx="18" fill="#e7bf4f"/><rect x="20" y="20" width="960" height="440" rx="8" fill="none" stroke="#292621"/><path d="M780 20v440" stroke="#292621" stroke-dasharray="6 6"/><g fill="#292621" font-family="Arial,sans-serif"><text x="65" y="75" font-size="18" letter-spacing="4">CC ATELIER / BACKSTAGE PASS</text><text x="58" y="230" font-size="138" font-weight="900">ADMIT ONE</text><text x="65" y="290" font-size="24">A LITTLE LIGHT. A LITTLE LOUDER.</text><text x="65" y="398" font-size="21">${pass.date} / ${pass.stamps.length} OF 5 STAMPS</text><text transform="translate(855 85) rotate(90)" font-size="32" letter-spacing="5">NO. ${pass.id}</text><text x="660" y="412" font-size="55">✦</text></g></svg>`;
    const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));const a=document.createElement('a');a.href=url;a.download='CC-Atelier-Ticket-'+pass.id+'.svg';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('这张纪念票，送给今天的你。');
  });
}

function focusTimer() {
  if(!$('[data-focus-time]'))return;
  let timer=readTimer(storage.get('cc-focus-timer'));
  const save=()=>storage.set('cc-focus-timer',JSON.stringify(timer));
  function render(){const remaining=remainingTime(timer);if(timer.endsAt&&remaining===0){timer={...timer,endsAt:0,remaining:0};save();$('[data-focus-status]').textContent='这一段完成了。伸个懒腰，再继续吧。';}
    const seconds=Math.ceil(remaining/1000);$('[data-focus-time]').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');$('[data-focus-start]').textContent=timer.endsAt?'暂停':remaining===0?'再来一段':'开始';$('.focus-amp').classList.toggle('timer-running',!!timer.endsAt);$$('[data-focus-minutes]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.focusMinutes)*60000===timer.duration)));
  }
  $('[data-focus-start]').addEventListener('click',()=>{if(timer.endsAt){timer=pauseTimer(timer);$('[data-focus-status]').textContent='暂停一下，也没关系。';}else{timer={...timer,remaining:timer.remaining||timer.duration,endsAt:Date.now()+(timer.remaining||timer.duration)};$('[data-focus-status]').textContent='计时中。把注意力留给眼前这一件事。';}save();render();});
  const reset=duration=>{timer={duration,remaining:duration,endsAt:0};save();$('[data-focus-status]').textContent='给一件小事，一段完整的时间。';render();};
  $('[data-focus-reset]').addEventListener('click',()=>reset(timer.duration));$$('[data-focus-minutes]').forEach(b=>b.addEventListener('click',()=>reset(Number(b.dataset.focusMinutes)*60000)));
  if(timer.endsAt)$('[data-focus-status]').textContent='计时中。把注意力留给眼前这一件事。';
  render();let interval=setInterval(render,500);document.addEventListener('visibilitychange',render);window.addEventListener('pagehide',()=>clearInterval(interval));window.addEventListener('pageshow',event=>{if(event.persisted){timer=readTimer(storage.get('cc-focus-timer'));render();interval=setInterval(render,500);}});
}

function atmosphere() {
  const valid=['amber','rose','moon'];function light(value){document.body.dataset.stageLight=valid.includes(value)?value:'amber';$$('[data-stage-light]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.stageLight===document.body.dataset.stageLight)));}light(storage.get('cc-light'));
  $$('[data-stage-light]').forEach(button=>button.addEventListener('click',()=>{light(button.dataset.stageLight);storage.set('cc-light',button.dataset.stageLight);}));
  const charm=$('[data-charm]');let swings=0;charm?.addEventListener('click',()=>{swings++;charm.classList.remove('swing');void charm.offsetWidth;if(motion.enabled)charm.classList.add('swing');$('[data-charm-note]').textContent=['小三角摇了摇，今天也要闪闪发光。','下一拍，就从现在开始。','给认真生活的你，一点暖黄色。','不用着急，属于你的节奏会出现。'][swings%4];});
  const note=$('[data-daily-note]');if(!note)return;
  const notes=['慢慢来也没关系，鼓点一直都在。','把喜欢的事，再多做一点。','今天的小进步，也值得一段安可。','偶尔走调，也是一段独有的旋律。','留一点时间，给没有目的的快乐。','下一拍，或许会有新的风景。','你认真写下的，终会有回声。','先开始，光会在路上亮起来。','把这一刻，收进自己的歌单。','散场以后，热爱还在。','给平凡的一天，加一点暖黄色。','今天也有值得收藏的小事。'];
  const now=new Date(),day=Math.floor(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())/86400000);note.textContent=notes[day%notes.length];$('[data-daily-date]').textContent=now.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});$('[data-copy-note]').addEventListener('click',()=>copy(note.textContent+' — CC Atelier'));
}

export function initAfterHours() {
  readingTools();discovery();passport();focusTimer();atmosphere();
  if(!storage.persistent){$$('.lounge-fine-print').forEach(node=>{if(/本机|浏览器/.test(node.textContent))node.textContent='浏览器禁止本地存储，本次操作无法跨页面保留。';});}
  $$('[data-help-open]').forEach(button=>button.addEventListener('click',()=>openDialog('help-dialog')));
  document.addEventListener('keydown',event=>{if(event.key!=='?'||event.ctrlKey||event.metaKey||event.altKey||event.target.closest('input,textarea,select,[contenteditable="true"]')||$('dialog[open]'))return;event.preventDefault();openDialog('help-dialog');});
}
