import {$,$$,storage,toast} from './ui.js';
import {articleText,textRange,revealRange} from './text-anchors.js';
import {nextMatch,findMatches} from './reader-search.mjs';
export function initReader(){
 const article=$('.article-body'),studio=$('.reading-studio');if(!article||!studio)return;
 const input=$('#reader-find'),status=$('[data-find-status]');let ranges=[],current=-1,timer,lastQuery=null;
 const highlight=()=>{if(!globalThis.CSS?.highlights||!globalThis.Highlight)return;CSS.highlights.set('reader-search',new Highlight(...ranges));CSS.highlights.set('reader-active',new Highlight(...(ranges[current]?[ranges[current]]:[])));};
 function move(delta){search();if(!ranges.length)return;current=nextMatch(current,ranges.length,delta);highlight();revealRange(ranges[current]);if(!globalThis.CSS?.highlights){getSelection().removeAllRanges();getSelection().addRange(ranges[current]);}status.textContent=(current+1)+' / '+ranges.length;}
 function search(){const q=input.value;if(q===lastQuery)return;lastQuery=q;ranges=[];current=-1;if(q){const snap=articleText(article);ranges=findMatches(snap.text,q).map(m=>textRange(snap,m.start,m.end)).filter(Boolean);}status.textContent=q?(ranges.length?ranges.length+' 处匹配':'没有匹配'):'输入关键词';highlight();}
 input.addEventListener('input',e=>{if(e.isComposing)return;clearTimeout(timer);timer=setTimeout(search,150);});input.addEventListener('compositionend',search);input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search();move(e.shiftKey?-1:1);}});$('[data-find-next]').addEventListener('click',()=>move(1));$('[data-find-prev]').addEventListener('click',()=>move(-1));$('[data-find-clear]').addEventListener('click',()=>{input.value='';search();input.focus();});
 let prefs={size:17,leading:19,width:'comfortable'};try{const p=JSON.parse(storage.get('cc-reader'));if(p&&Number.isInteger(p.size)&&p.size>=14&&p.size<=23&&Number.isInteger(p.leading)&&p.leading>=16&&p.leading<=23&&['narrow','comfortable'].includes(p.width))prefs=p;}catch{}
 const sizeShortcut=$('button[data-reader-size-cycle]',studio);
 function apply(save=false){studio.style.setProperty('--reader-size',prefs.size+'px');studio.style.setProperty('--reader-leading',prefs.leading/10);studio.style.setProperty('--reader-width',prefs.width==='narrow'?'580px':'100%');$('[data-reader-size]').value=prefs.size;$('[data-reader-leading]').value=prefs.leading;$('[data-reader-width]').value=prefs.width;$('[data-size-output]').textContent=prefs.size;$('[data-leading-output]').textContent=(prefs.leading/10).toFixed(1);if(sizeShortcut){sizeShortcut.innerHTML='Aa <span>'+prefs.size+'</span>';sizeShortcut.setAttribute('aria-label','调整阅读字号，当前 '+prefs.size+' 像素');}if(save&&!storage.set('cc-reader',JSON.stringify(prefs)))toast('阅读设置仅在当前页面有效');}
 $('[data-reader-size]').addEventListener('input',e=>{prefs.size=Number(e.target.value);apply(true);});$('[data-reader-leading]').addEventListener('input',e=>{prefs.leading=Number(e.target.value);apply(true);});$('[data-reader-width]').addEventListener('change',e=>{prefs.width=e.target.value;apply(true);});apply();
 // Only this explicit button can cycle size; body state attributes are never event hooks.
 sizeShortcut?.addEventListener('click',()=>{prefs.size=prefs.size>=21?17:prefs.size+2;apply(true);});
 $$('.article-body h2,.article-body h3').forEach(h=>{if(!h.id)return;const button=document.createElement('button');button.className='chapter-copy';button.dataset.readerExclude='';button.textContent='↗';button.setAttribute('aria-label','复制章节链接：'+h.textContent);button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(location.origin+location.pathname+'#'+encodeURIComponent(h.id));toast('已复制章节链接');}catch{toast('复制失败，可从左侧目录打开章节并复制地址');}});h.append(button);});
 const meter=$('.chapter-meter i');let frame=0;function progress(){frame=0;const value=Math.max(0,Math.min(1,-article.getBoundingClientRect().top/Math.max(1,article.scrollHeight-innerHeight*.6)));if(meter)meter.style.transform='scaleX('+value+')';}window.addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(progress);},{passive:true});progress();
 const details=$('.reader-workbench details');if(matchMedia('(max-width:680px)').matches)details.open=false;
 speech(article,details);
}
function speech(article,details){
 const status=$('[data-speech-status]'),play=$('[data-speech-play]'),pause=$('[data-speech-pause]'),stopButton=$('[data-speech-stop]'),rate=$('[data-speech-rate]');
 if(!('speechSynthesis'in window)||!('SpeechSynthesisUtterance'in window)){status.textContent='此浏览器未提供朗读功能。';[play,pause,stopButton,rate].forEach(b=>{b.disabled=true;});return;}
 let chunks=[],at=0,running=false,generation=0,utterance;
 function stop(){generation++;running=false;speechSynthesis.cancel();pause.textContent='暂停';play.textContent='朗读';status.textContent='朗读已停止。';}
 function say(token){if(token!==generation||!running)return;if(at>=chunks.length){stop();status.textContent='这一篇，读完了。';return;}utterance=new SpeechSynthesisUtterance(chunks[at]);utterance.lang='zh-CN';utterance.rate=Number(rate.value);utterance.onend=()=>{if(token!==generation)return;at++;say(token);};utterance.onerror=e=>{if(token!==generation||e.error==='interrupted'||e.error==='canceled')return;stop();status.textContent='当前设备没有可用语音，或朗读被浏览器中断。';};status.textContent='正在朗读 '+(at+1)+' / '+chunks.length;speechSynthesis.speak(utterance);}
 play.addEventListener('click',()=>{stop();chunks=[];const text=articleText(article).text;for(const sentence of text.split(/(?<=[。！？.!?\n])/)){for(let i=0;i<sentence.length;i+=180){const part=sentence.slice(i,i+180).trim();if(part)chunks.push(part);}}at=0;running=true;play.textContent='从头朗读';say(generation);});
 pause.addEventListener('click',()=>{if(!running)return;if(speechSynthesis.paused){speechSynthesis.resume();pause.textContent='暂停';}else{speechSynthesis.pause();pause.textContent='继续';}});stopButton.addEventListener('click',stop);
 details.addEventListener('toggle',()=>{if(!details.open&&running)stop();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)stop();});window.addEventListener('pagehide',stop);
}
