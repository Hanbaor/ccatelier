// Static resources allowed in the opt-in offline shelf.
export function cacheableURL(value,base){
 if(typeof value!=='string'||/[\\\u0000-\u0020]/.test(value)||/%2e|%2f|%5c/i.test(value)||value.split('/').includes('..'))return false;
 try{const root=new URL(base),url=new URL(value,root);if(url.origin!==root.origin||url.search||!url.pathname.startsWith(root.pathname))return false;const path=url.pathname.slice(root.pathname.length);
 return /^atelier\/(?:js|css|fonts|images)\/[\w./%-]+\.(?:m?js|css|woff2?|ttf|png|jpe?g|webp|svg)$/i.test(path)||path==='atelier/data/archive.json'||path==='atelier/data/discovery.json'||/^(?:css|js|fontawesome)\/[\w./%-]+\.(?:js|css|woff2?|ttf)$/i.test(path);
 }catch{return false;}
}
