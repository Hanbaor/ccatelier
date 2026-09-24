// A transaction succeeds only after IDB commits, never on a request's early success.
let database;
function open(){return database ||= new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB){reject(Error('浏览器不支持本地资料库'));return;}
  const request=indexedDB.open('cc-live-archive',1);
  request.onupgradeneeded=()=>{request.result.createObjectStore('notes',{keyPath:'id'});request.result.createObjectStore('projects',{keyPath:'id'});};
  request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();database=null;};resolve(db);};
  request.onerror=()=>{database=null;reject(Error('浏览器无法打开本地资料库'));};
  request.onblocked=()=>{database=null;reject(Error('请关闭其他旧版本网页后再试'));};
});}
async function transact(store,mode,work){const db=await open();return new Promise((resolve,reject)=>{
  const tx=db.transaction(store,mode),table=tx.objectStore(store);let result,reason;
  tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(reason||Error('本地存储失败，请检查浏览器权限与空间'));tx.onabort=()=>reject(reason||Error('本地保存未完成'));
  try{work(table,value=>{result=value;},message=>{reason=Error(message);tx.abort();});}catch(error){tx.abort();reject(error);}
});}
function writeRecords(store,records){return transact(store,'readwrite',(table,set,fail)=>{if(store!=='notes'){records.forEach(record=>table.put(record));return;}table.getAllKeys().onsuccess=e=>{if(new Set([...e.target.result,...records.map(r=>r.id)]).size>2000){fail('本机批注已达到 2000 条，请先导出并整理后再保存');return;}records.forEach(record=>table.put(record));};});}
export const vault={
  all:store=>transact(store,'readonly',(table,set)=>{table.getAll().onsuccess=e=>set(e.target.result);}),
  put:(store,record)=>writeRecords(store,[record]),
  remove:(store,id)=>transact(store,'readwrite',table=>table.delete(id)),
  merge:(store,records)=>writeRecords(store,records)
};
