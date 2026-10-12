import {validatePractice} from './practice-core.mjs';

// A portable rendering of the site's original sixteen-step exercise model.
// No page DOM, theme, external assets, or professional notation dependency.
export const SCORE_SVG_LIMITS = Object.freeze({width:800, maxHeight:6100, maxBytes:2*1024*1024});
const names={kick:'底鼓',snare:'军鼓',hat:'踩镲',tom:'通鼓'};
const positions={kick:82,snare:58,hat:34,tom:46};
function xmlText(value){
 return Array.from(value,char=>{const n=char.codePointAt(0);if(!(n===9||n===10||n===13||(n>=32&&n<=0xd7ff)||(n>=0xe000&&n<=0xfffd)||(n>=0x10000&&n<=0x10ffff)))throw new TypeError('标题包含 SVG 不支持的字符');return char;}).join('').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
}
function titleLines(value){
 const trimmed=value.trim(),chars=typeof Intl.Segmenter==='function'?Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(trimmed),part=>part.segment):Array.from(trimmed),lines=[];let index=0;
 for(let line=0;line<2&&index<chars.length;line++){
  let content='',width=0;
  // Budget every code point conservatively, including wide Latin glyphs.
  // A pathological oversized grapheme is elided, never split or rendered wide.
  while(index<chars.length){const char=chars[index],size=Array.from(char).length*1.2;if(width+size>27)break;content+=char;width+=size;index++;}
  if(index<chars.length&&(line===1||!content)){content+='…';lines.push(content);break;}
  lines.push(content);
 }
 return lines;
}

const text=(x,y,value,extra='')=>`<text x="${x}" y="${y}" ${extra}>${xmlText(value)}</text>`;
function barSvg(bar,index,x,y){
 const out=[`<g transform="translate(${x} ${y})"><title>第 ${index+1} 小节</title><rect width="352" height="164" rx="4" fill="#fff" stroke="#aaa"/>`,text(12,19,String(index+1).padStart(2,'0'),'font-size="12"'),'<g transform="translate(6 24)">'];
 for(let line=0;line<5;line++)out.push(`<line x1="24" y1="${40+line*12}" x2="329" y2="${40+line*12}" stroke="#777" stroke-width=".65"/>`);
 for(let beat=0;beat<=4;beat++)out.push(`<line x1="${30+beat*72}" y1="20" x2="${30+beat*72}" y2="99" stroke="#888" stroke-width=".65"${beat>0&&beat<4?' stroke-dasharray="2 4"':''}/>`);
 for(let step=0;step<16;step++)out.push(text(39+step*18,121,step%4===0?String(step/4+1):step%4===2?'&':step%4===1?'e':'a','text-anchor="middle" font-size="10"'));
 const audible=bar.hits.filter(hit=>hit.velocity>0);
 for(const hit of audible){
  const nx=39+hit.step*18,ny=positions[hit.type],color=hit.velocity<.6?'#555':'#111';
  out.push(`<g fill="${color}" stroke="${color}" stroke-width="1.2"><title>${names[hit.type]} · 第 ${hit.step+1} 格 · 力度 ${hit.velocity}</title>`);
  if(hit.type==='hat')out.push(`<path d="M${nx-3.5} ${ny-3.5}l7 7m-7 0 7-7" fill="none"/>`);
  else out.push(`<ellipse cx="${nx}" cy="${ny}" rx="4.7" ry="3.1" transform="rotate(-20 ${nx} ${ny})"/>`);
  out.push(hit.type==='kick'?`<line x1="${nx-4}" y1="${ny}" x2="${nx-4}" y2="107"/>`:`<line x1="${nx+4}" y1="${ny}" x2="${nx+4}" y2="17"/>`,'</g>');
 }
 if(!audible.length)out.push(text(176,109,'整小节休止','text-anchor="middle" font-size="12"'));
 out.push('</g></g>');return out.join('');
}

export function renderPracticeScoreSvg(value){
 const project=validatePractice(value),lines=titleLines(project.title),top=174+(lines.length-1)*32,height=top+Math.ceil(project.bars.length/2)*180+32;
 if(height>SCORE_SVG_LIMITS.maxHeight)throw new RangeError('谱面尺寸超出限制');
 const out=[`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${height}" viewBox="0 0 800 ${height}" role="img" aria-labelledby="score-title score-description">`,
 `<title id="score-title">${xmlText(project.title)}</title>`,
 '<desc id="score-description">本站 16 格练习谱，非官方乐谱，非标准专业打谱。每小节四拍，每格十六分音符；力度为零不发声。仅供原创或已获授权的节奏练习。</desc>',
 `<rect width="800" height="${height}" fill="#fff"/>`,
 '<g fill="#111" font-family="sans-serif">',text(40,32,'CC ATELIER · 节奏练习','font-size="12" letter-spacing="1"')];
 lines.forEach((line,index)=>out.push(text(40,68+index*32,line,'font-size="24" font-weight="600"')));
 const offset=(lines.length-1)*32;
 out.push(text(40,98+offset,`${project.bpm} BPM  ·  4/4  ·  ${project.bars.length} 小节`,'font-size="14"'),
 text(40,123+offset,'每小节四拍 / 16 格 · 每格十六分音符 · 力度 0 休止','font-size="12"'),
 text(40,147+offset,'× 踩镲（上） · ● 通鼓 / 军鼓 / 底鼓（从上到下） · 灰色为弱音','font-size="12"'));
 project.bars.forEach((bar,index)=>out.push(barSvg(bar,index,40+(index%2)*368,top+Math.floor(index/2)*180)));
 out.push(text(40,height-16,'本站 16 格练习谱，非官方乐谱；非标准专业打谱。','font-size="12"'),'</g></svg>');
 const svg=out.join('');
 if(new TextEncoder().encode(svg).byteLength>SCORE_SVG_LIMITS.maxBytes)throw new RangeError('谱面文件超出限制');
 return svg;
}
