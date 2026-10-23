export function mediaURL(value:unknown):string|null {
    if(typeof value!=='string'||value.length>2048)return null;
    if(value.startsWith('ipfs://')){const path=value.slice(7).replace(/^ipfs\//,'');if(!/^[a-zA-Z0-9]+(?:\/[^?#]*)?$/.test(path)||path.split('/').some(p=>p==='..'||p==='.'))return null;return 'https://ipfs.io/ipfs/'+path;}
    try {const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
export function metadataURL(uri:string,domain:string,legacyBase?:string|null){return mediaURL(uri)??(uri===domain&&legacyBase?mediaURL(legacyBase+domain):null);}
export type Metadata = {image:string|null;url:string;name?:string};
const cache=new Map<string,{until:number;value:Promise<Metadata|null>}>();
export function fetchMetadata(uri:string, options:{fetch?:typeof fetch}={}):Promise<Metadata|null>{
    const url=mediaURL(uri);if(!url)return Promise.resolve(null);const cacheKey=options.fetch?null:url;const old=cacheKey?cache.get(cacheKey):undefined;if(old&&old.until>Date.now())return old.value;
    const value=(async()=>{const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);try{
        const response=await (options.fetch??fetch)(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});if(!response.ok)throw new Error('Metadata unavailable');
        if(Number(response.headers.get('content-length'))>262144)throw new Error('Metadata too large');
        const reader=response.body?.getReader();if(!reader)throw new Error('No metadata body');let size=0;const chunks:Uint8Array[]=[];
        while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>262144){await reader.cancel();throw new Error('Metadata too large');}chunks.push(value);}
        const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}const json=JSON.parse(new TextDecoder().decode(all));
        return {image:mediaURL(json.image),url,name:typeof json.name==='string'?json.name:undefined};
    }catch{return null;}finally{clearTimeout(timeout);}})();
    if(cacheKey){if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(cacheKey,{until:Date.now()+300000,value});}return value;
}
