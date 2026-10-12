import {root} from './archive-store.js';
let registration;
async function worker(signal){
 if(!('serviceWorker' in navigator)||!window.isSecureContext)throw Error('离线保存需要 HTTPS 或本地 localhost，并支持 Service Worker');
 registration ||= navigator.serviceWorker.register(root+'live-sw.js',{scope:root,type:'module'}).catch(error=>{registration=null;throw error;});
 const reg=await registration;if(signal.aborted)throw Error('离线操作已结束');if(reg.active)return reg.active;
 return new Promise((resolve,reject)=>{
  const sw=reg.installing||reg.waiting;if(!sw){reject(Error('离线服务尚未就绪'));return;}
  let settled=false,timer;
  function finish(error){if(settled)return;settled=true;clearTimeout(timer);sw.removeEventListener('statechange',change);signal.removeEventListener('abort',cancel);error?reject(error):resolve(sw);}
  function change(){if(sw.state==='activated')finish();else if(sw.state==='redundant')finish(Error('离线服务安装失败'));}
  function cancel(){finish(Error('离线操作已结束'));}
  sw.addEventListener('statechange',change);signal.addEventListener('abort',cancel,{once:true});
  timer=setTimeout(()=>finish(Error('离线服务启动超时')),15000);if(signal.aborted)cancel();else change();
 });
}
const changed=()=>document.dispatchEvent(new CustomEvent('atelier:offline'));
if(typeof navigator!=='undefined')navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='atelier:offline')changed();});
export async function offlineMessage(data){
 const searching=data.type==='search-index',controller=new AbortController();let port,timer,expired=false;
 try{return await Promise.race([
  new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;port?.close();reject(Error(searching?'读取离线副本超时；如有保存正在进行，请稍后重试。':'离线操作超时，请保持页面打开并稍后检查书架'));},searching?8000:120000);}),
  (async()=>{const sw=await worker(controller.signal);if(expired)return;return new Promise((resolve,reject)=>{const channel=new MessageChannel();port=channel.port1;port.onmessage=({data:result})=>{if(!result.ok){reject(Error(searching&&result.error==='未知离线操作'?'当前离线服务暂不支持搜索，请联网刷新后重试。':result.error));return;}if(searching&&(result.version!==1||!Array.isArray(result.entries))){reject(Error('当前离线服务暂不支持搜索，请联网刷新后重试。'));return;}resolve(result);};sw.postMessage(data,[channel.port2]);});})()
 ]);}finally{clearTimeout(timer);controller.abort();port?.close();if(['save','remove','clear'].includes(data.type))changed();}
}
