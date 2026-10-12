'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const esbuild=require('esbuild'),{parseDocument}=require('htmlparser2');
// These URLs permanently identify these ordered members. Change neither when
// editing CSS; introduce a different URL if membership ever needs to change.
const groups=Object.freeze([
 ['delivery-foundation.css',['atelier.css','content.css','effects.css','stage.css']],
 ['delivery-dialogs.css',['after-hours.css','archive.css']],
 ['delivery-editorial.css',['daylight.css','refinement.css','editorial.css']],
 ['delivery-immersive.css',['immersive.css','navigation-scenes.css']]
].map(([file,members])=>Object.freeze({file,members:Object.freeze(members)})));
const variantGroup=Object.freeze({file:'delivery-dialogs-global.css',members:Object.freeze(['after-hours.css','archive-global.css'])});
const allGroups=Object.freeze([...groups,variantGroup]);
const generatedPaths=Object.freeze([...allGroups.map(group=>'atelier/css/'+group.file),'atelier/css/archive-global.css']);
const hash=data=>createHash('sha256').update(data).digest('hex');
async function prepareStylesheets(directory){
 const prepared=[];
 for(const group of groups){
  if(fs.existsSync(path.join(directory,group.file)))throw Error('Shared stylesheet output collision: '+group.file);
  const sources=[];
  for(const member of group.members){
   const data=fs.readFileSync(path.join(directory,member));
   const source=new TextDecoder('utf-8',{fatal:true}).decode(data);
   if(data.subarray(0,3).equals(Buffer.from([0xef,0xbb,0xbf])))throw Error('Unsupported shared stylesheet BOM: '+member);
   // Position-sensitive directives and source-map metadata need separate analysis.
   if(/@(?:import|charset|namespace)\b|sourceMappingURL/i.test(source))throw Error('Unsafe shared stylesheet directive: '+member);
   const result=await esbuild.transform(source,{loader:'css',logLevel:'silent'});
   if(result.warnings.length)throw Error('Malformed shared stylesheet '+member+': '+result.warnings.map(x=>x.text).join('; '));
   // Parsing decodes CSS escapes in at-keywords. An escaped late @import is
   // just as position-sensitive; inspect normalized syntax, never emit it.
   if(/@(?:import|charset|namespace)\b/i.test(result.code))throw Error('Unsafe normalized shared stylesheet directive: '+member);
   sources.push({file:member,data,sha256:hash(data)});
  }
  const data=Buffer.concat(sources.flatMap((item,index)=>index?[Buffer.from('\n'),item.data]:[item.data]));
  prepared.push({path:'atelier/css/'+group.file,data,sha256:hash(data),members:sources.map(({file,sha256})=>({file,sha256}))});
 }
 return prepared;
}
// Accept precisely two quoted attributes, not parser-normalized unknown or
// duplicated attributes. Restrict to plain local paths with no URL suffixes.
function plainLink(node,html){
 if(node.name!=='link')return null;
 const raw=html.slice(node.startIndex,node.endIndex+1);
 const match=raw.match(/^<link\s+((?:rel|href)\s*=\s*(?:"[^"]*"|'[^']*'))\s+((?:rel|href)\s*=\s*(?:"[^"]*"|'[^']*'))\s*\/?\s*>$/);
 if(!match)return null;
 const attrs={};
 for(const token of match.slice(1)){const [,key,,value]=token.match(/^(rel|href)\s*=\s*(["'])(.*?)\2$/);if(Object.hasOwn(attrs,key))return null;attrs[key]=value;}
 if(attrs.rel!=='stylesheet'||!attrs.href)return null;
 const url=attrs.href.match(/^(\/?(?:[A-Za-z0-9_-]+\/)*atelier\/css\/)([A-Za-z0-9_-]+\.css)$/);
 return url?{prefix:url[1],file:url[2]}:null;
}
function rewriteStylesheets(html){
 if(typeof html!=='string')return html;
 const document=parseDocument(html,{withStartIndices:true,withEndIndices:true});
 const heads=document.children.flatMap(node=>node.name==='head'?[node]:node.name==='html'?(node.children||[]).filter(child=>child.name==='head'):[]);
 if(heads.length!==1||!/<\/head\s*>$/i.test(html.slice(heads[0].startIndex,heads[0].endIndex+1)))return html;
 const children=heads[0].children||[],edits=[];
 for(let i=0;i<children.length;i++){
  const first=plainLink(children[i],html);if(!first)continue;
  const candidates=allGroups.filter(item=>item.members[0]===first.file);
  for(const group of candidates){
  let cursor=i,valid=true;
  for(let member=1;member<group.members.length;member++){
   cursor++;
   while(children[cursor]?.type==='text'&&/^\s*$/.test(children[cursor].data))cursor++;
   const next=children[cursor]&&plainLink(children[cursor],html);
   if(!next||next.prefix!==first.prefix||next.file!==group.members[member]){valid=false;break;}
  }
  if(valid){edits.push({start:children[i].startIndex,end:children[cursor].endIndex+1,text:`<link rel="stylesheet" href="${first.prefix}${group.file}">`});i=cursor;break;}
  }
 }
 for(const edit of edits.reverse())html=html.slice(0,edit.start)+edit.text+html.slice(edit.end);
 return html;
}
function expandStylesheetURLs(urls){return urls.flatMap(url=>{
 const group=allGroups.find(item=>url.endsWith('/atelier/css/'+item.file)||url==='atelier/css/'+item.file);
 return group?group.members.map(member=>url.slice(0,-group.file.length)+member):[url];
});}
module.exports={groups,allGroups,variantGroup,generatedPaths,prepareStylesheets,rewriteStylesheets,expandStylesheetURLs};
