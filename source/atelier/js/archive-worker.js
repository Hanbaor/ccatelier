import {queryArchive} from './archive-core.mjs';
let posts=[];
self.onmessage=({data})=>{if(data.posts)posts=data.posts;try{self.postMessage({id:data.id,paths:queryArchive(posts,data.query).map(p=>p.path)});}catch{self.postMessage({id:data.id,error:true});}};
