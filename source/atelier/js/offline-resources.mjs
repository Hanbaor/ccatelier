import {cacheableURL} from './offline-core.mjs';

// A small, DOM-free tokenizer for resource attributes in generated article HTML.
// Do not scan arbitrary text for "src=": datasets, comments and script examples
// are not resource requests. In particular, navigation previews remain lazy.
const entities={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',sol:'/',colon:':',period:'.',lowbar:'_',percnt:'%',num:'#',equals:'=',quest:'?',semi:';',Tab:'\t',NewLine:'\n'};
Object.assign(entities,{AMP:'&',QUOT:'"',LT:'<',GT:'>'});
function decodeAttribute(value){
 return value.replace(/&(#(?:x[\da-f]+|\d+));?|&([a-z][a-z\d]*);|&(amp|quot|lt|gt)(?![a-z\d=;])/gi,(match,numeric,named,legacy)=>{
  if(legacy)return entities[legacy]??match;
  const entity=numeric||named;
  if(entity[0]!=='#')return entities[entity]??match;
  const number=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1));
  return number>0&&number<=0x10ffff&&!(number>=0xd800&&number<=0xdfff)?String.fromCodePoint(number):'\ufffd';
 });
}

function srcsetURLs(value){
 const urls=[];let at=0;
 while(at<value.length){
  while(/[\s,]/.test(value[at]||'')&&at<value.length)at++;
  const start=at;while(at<value.length&&!/\s/.test(value[at]))at++;
  let url=value.slice(start,at);if(!url)break;
  if(url.endsWith(',')){urls.push(url.replace(/,+$/,''));continue;}
  const descriptorStart=at;while(at<value.length&&value[at]!==',')at++;
  const descriptors=value.slice(descriptorStart,at).trim();at++;
  if(!descriptors||/^\d+w$/.test(descriptors)&&parseInt(descriptors)>0||/^(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?x$/i.test(descriptors)&&Number.isFinite(Number(descriptors.slice(0,-1)))&&Number(descriptors.slice(0,-1))>0)urls.push(url);
 }
 return urls;
}

function rawTextEnd(lower,at,tag){
 if(tag!=='script'){const end=new RegExp('</'+tag+'(?=[\\s/>])','g');end.lastIndex=at;return end.exec(lower)?.index??lower.length;}
 // HTML's legacy escaped-script states can contain a literal </script> without
 // ending the element. Treating that text as markup would invent image requests.
 const tokens=/<!--|-->|<\/?script(?=[\s/>])/g;tokens.lastIndex=at;let state='data',match;
 while((match=tokens.exec(lower))){
  const token=match[0];
  if(token==='<!--'&&state==='data')state='escaped';
  else if(token==='-->')state='data';
  else if(token==='<script'&&state==='escaped')state='double';
  else if(token==='</script'){if(state==='double')state='escaped';else return match.index;}
 }
 return lower.length;
}

export function articleResources(html,documentURL,base){
 const urls=new Set(),lower=html.toLowerCase();let at=0,templateDepth=0;
 function add(value,decoded=false){
  value=(decoded?value:decodeAttribute(value)).trim();
  // Check the unnormalized spelling before URL resolves dot segments away.
  if(!value||/[\\\u0000-\u0020]/.test(value)||/%2e|%2f|%5c/i.test(value)||value.split('/').includes('..'))return;
  try{const url=new URL(value,documentURL).href;if(cacheableURL(url,base))urls.add(url);}catch{}
 }
 while(at<html.length){
  const start=html.indexOf('<',at);if(start<0)break;at=start+1;
  if(html.startsWith('!--',at)){
   if(html[at+3]==='>'){at+=4;continue;}
   if(html.startsWith('->',at+3)){at+=5;continue;}
   const end=/--!?>/g;end.lastIndex=at+3;const match=end.exec(html);at=match?end.lastIndex:html.length;continue;
  }
  if(html[at]==='!'||html[at]==='?'){const end=html.indexOf('>',at);at=end<0?html.length:end+1;continue;}
  const closing=html[at]==='/';if(closing)at++;
  const name=/^[a-z][a-z\d:-]*/i.exec(html.slice(at));if(!name)continue;
  const tag=name[0].toLowerCase();at+=name[0].length;
  const attributes=new Map();let complete=false;
  while(at<html.length){
   while(/\s/.test(html[at]||'')&&at<html.length)at++;
   if(html[at]==='>'){at++;complete=true;break;}
   if(html[at]==='/'){at++;continue;}
   const attr=/^[^\s=/>]+/.exec(html.slice(at));if(!attr){at++;continue;}
   const key=attr[0].toLowerCase();at+=attr[0].length;
   while(/\s/.test(html[at]||'')&&at<html.length)at++;
   let value='';
   if(html[at]==='='){
    at++;while(/\s/.test(html[at]||'')&&at<html.length)at++;
    const quote=html[at];
    if(quote==='"'||quote==="'"){at++;const end=html.indexOf(quote,at);if(end<0){at=html.length;break;}value=html.slice(at,end);at=end+1;}
    else{const begin=at;while(at<html.length&&!/[\s>]/.test(html[at]))at++;value=html.slice(begin,at);}
   }
   if(!attributes.has(key))attributes.set(key,value); // HTML keeps the first duplicate.
  }
  if(!complete)break;
  if(tag==='template'){templateDepth=Math.max(0,templateDepth+(closing?-1:1));continue;}
  if(!closing&&!templateDepth){
   if(/^(?:img|script|source|video|audio|track|input|iframe|embed)$/.test(tag)&&attributes.has('src'))add(attributes.get('src'));
   if(/^(?:link|a|image|use)$/.test(tag)&&attributes.has('href'))add(attributes.get('href'));
   if((tag==='img'||tag==='source')&&attributes.has('srcset'))for(const url of srcsetURLs(decodeAttribute(attributes.get('srcset'))))add(url,true);
   if(tag==='link'&&attributes.has('imagesrcset'))for(const url of srcsetURLs(decodeAttribute(attributes.get('imagesrcset'))))add(url,true);
  }
  // These elements contain text, not child tags. A script's own src was handled.
  if(!closing&&/^(?:script|style|textarea|title|xmp|iframe|noembed|noframes|noscript|plaintext)$/.test(tag)){
   if(tag==='plaintext')break;
   at=rawTextEnd(lower,at,tag);
  }
 }
 return [...urls];
}
