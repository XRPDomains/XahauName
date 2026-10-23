import {XahauNameError} from './errors';
import {mediaURL} from './metadata';
/** ENSIP-5 final Global Keys, deliberately separate from the immutable profile-v1 wire order. */
export const ENS_GLOBAL_TEXT_KEYS = ['avatar','description','display','email','keywords','mail','notice','location','phone','url'] as const;
export type GlobalTextKey = typeof ENS_GLOBAL_TEXT_KEYS[number];
export const ENS_SERVICE_TEXT_KEYS = ['com.github','com.peepeth','com.linkedin','com.twitter','io.keybase','org.telegram'] as const;
/** The ten Global Keys match profile-v2 batch order. */
export const GLOBAL_PROFILE_FIELDS = [
    {key:'avatar',label:'Avatar URL',placeholder:'https://... or ipfs://...'},
    {key:'description',label:'Bio',placeholder:'A short introduction',multiline:true},
    {key:'display',label:'Domain display name',placeholder:'Alice.xah'},
    {key:'email',label:'Email',placeholder:'hello@example.com'},
    {key:'keywords',label:'Keywords',placeholder:'design, development'},
    {key:'mail',label:'Mailing address',placeholder:'Physical mailing address',multiline:true},
    {key:'notice',label:'Notice',placeholder:'A public notice',multiline:true},
    {key:'location',label:'Location',placeholder:'City, country'},
    {key:'phone',label:'Phone',placeholder:'+84901234567'},
    {key:'url',label:'Website',placeholder:'https://example.com'},
] as const;
/** ENSIP-5 display is only a casing of the canonical domain, not a personal alias. */
export function getDomainDisplayName(domain:string,records:Record<string,string>):string {
    const value=records.display;
    return typeof value==='string'&&value.toLowerCase()===domain.toLowerCase()?value:domain;
}

/** Validation for typed profile writes. Generic text records remain opaque strings. */
export function validateProfileValue(domain:string,key:string,value:string):void {
    const fail=(message:string):never=>{throw new XahauNameError(message,'INVALID_ARGUMENT');};
    if(typeof value!=='string'||!value.length||Buffer.byteLength(value)>128)fail('Profile values must be 1..128 UTF-8 bytes');
    if(key==='display'&&value.toLowerCase()!==domain.toLowerCase())fail('Display must match the domain, allowing casing changes only');
    if(key==='phone'&&!/^\+[1-9]\d{1,14}$/.test(value))fail('Phone must use E.164 format, for example +84901234567');
    if(key==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))fail('Enter a valid email address');
    if(key==='avatar'&&!mediaURL(value))fail('Avatar must be a supported HTTPS or IPFS image URI');
    if(key==='url'){
        try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)fail('Website must be an HTTP or HTTPS URL');}
        catch{fail('Website must be an HTTP or HTTPS URL');}
    }
}
