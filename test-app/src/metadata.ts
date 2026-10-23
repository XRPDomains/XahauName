import {fetchMetadata as readMetadata} from '../../packages/sdk/src/metadata';
export {mediaURL,metadataURL} from '../../packages/sdk/src/metadata';
export const metadataFetch:typeof fetch=(input,init)=>{const parsed=new URL(String(input)),local=typeof location!=='undefined'&&['localhost','127.0.0.1','[::1]'].includes(location.hostname);const proxy=import.meta.env?.VITE_METADATA_PROXY_BASE?.replace(/\/$/,'')||(local?'/__metadata':'');return fetch(proxy&&parsed.origin==='https://xrpdomains.xyz'&&parsed.pathname.startsWith('/api/nftdomains/metadata/')?proxy+parsed.pathname+parsed.search:input,init);};
export function fetchMetadata(uri:string){return readMetadata(uri,{fetch:metadataFetch});}
