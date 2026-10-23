import {CID} from 'multiformats/cid';
import {create as digest} from 'multiformats/hashes/digest';
import {XahauNameError} from './errors';
function canonical(cid:CID){return CID.createV1(cid.code,digest(cid.multihash.code,cid.multihash.digest));}
/** XNIP-0002: an IPFS content root stored as canonical text, not a gateway URL. */
export function normalizeContentURI(value:string):string {
    try{
        if(typeof value!=='string'||value.length>256||!/^ipfs:\/\/[A-Za-z0-9]+$/.test(value))throw new Error();
        const uri='ipfs://'+canonical(CID.parse(value.slice(7))).toString();
        if(Buffer.byteLength(uri)>128)throw new Error();
        return uri;
    }catch{throw new XahauNameError('Use a valid IPFS content-root URI within 128 UTF-8 bytes','INVALID_CONTENT_URI');}
}
/** Optional ENSIP-7 codec. The on-chain record remains a text URI. */
export function encodeContentHash(uri:string):Buffer {
    const cid=CID.parse(normalizeContentURI(uri).slice(7));
    return Buffer.concat([Buffer.from([0xe3,0x01]),Buffer.from(cid.bytes)]);
}
export function decodeContentHash(bytes:Uint8Array):string {
    try{
        if(bytes.length<4||bytes.length>128||bytes[0]!==0xe3||bytes[1]!==1)throw new Error();
        const cid=CID.decode(bytes.subarray(2));
        if(cid.version!==1||!Buffer.from(canonical(cid).bytes).equals(Buffer.from(bytes.subarray(2))))throw new Error();
        return normalizeContentURI('ipfs://'+cid.toString());
    }catch{throw new XahauNameError('Unsupported or malformed IPFS ENSIP-7 contenthash','INVALID_CONTENT_HASH');}
}
