import {btc,eth,sol,trx,xrp} from '@ensdomains/address-encoder/coins';
import {decodeAccountID,encodeAccountID,xAddressToClassicAddress} from 'xahau';
import {Buffer} from 'buffer';
const coders = new Map<number,{encode:(b:Uint8Array)=>string;decode:(s:string)=>Uint8Array}>([[0,btc],[60,eth],[501,sol],[195,trx]]);
const fixedLengths = new Map([[60,20],[501,32],[195,21]]);
function networkName(coin:number){return ({0:'Bitcoin',60:'Ethereum',144:'XRP',195:'TRON',501:'Solana',21337:'Xahau'} as Record<number,string>)[coin]??`coin ${coin}`;}
function rippleBytes(address:string):Buffer {
    const bytes=Buffer.from(xrp.decode(address));
    if(bytes.length===21&&bytes[0]===0)decodeAccountID(address);
    else if(bytes.length===31)xAddressToClassicAddress(address);
    else throw new Error('Invalid Ripple address prefix or size');
    return bytes;
}
/** ENSIP-9 bytes for XRP; Xahau uses the same codec under its own SLIP-0044 ID.
 * New writes include the version byte. Existing 20-byte records remain readable. */
export function encodeAddress(coin:number,value:string):Buffer {
    const address=value.trim();
    try {if(coin===144||coin===21337)return rippleBytes(address);const coder=coders.get(coin);if(!coder)throw new Error('Use advanced hex for this coin type.');const bytes=Buffer.from(coder.decode(address));if(bytes.length<1||bytes.length>128||(fixedLengths.has(coin)&&bytes.length!==fixedLengths.get(coin))||(coin===195&&bytes[0]!==0x41))throw new Error('Invalid address bytes.');return bytes;}
    catch {throw new Error(`Invalid ${networkName(coin)} address. Check the address and selected network.`);}
}
export function decodeAddress(coin:number,bytes:Uint8Array):{value:string;format:'address'|'hex'} {
    try {
        if((fixedLengths.has(coin)&&bytes.length!==fixedLengths.get(coin))||(coin===195&&bytes[0]!==0x41))throw new Error('Legacy/raw bytes');
        if(coin===144||coin===21337){
            if(bytes.length===20)return{value:encodeAccountID(bytes),format:'address'};
            const value=xrp.encode(bytes);if(!rippleBytes(value).equals(Buffer.from(bytes)))throw new Error('Invalid address');
            return{value,format:'address'};
        }
        const coder=coders.get(coin);if(coder)return{value:coder.encode(bytes),format:'address'};
    }catch{}
    return{value:Buffer.from(bytes).toString('hex').toUpperCase(),format:'hex'};
}
/** Convert an old raw AccountID record explicitly; never changes on-chain state. */
export function canonicalAddressBytes(coin:number,bytes:Uint8Array):Buffer {
    const decoded=decodeAddress(coin,bytes);
    if(decoded.format!=='address')throw new Error('Unsupported or invalid address encoding');
    return encodeAddress(coin,decoded.value);
}
