import { decodeAccountID, encodeAccountID } from 'xahau';
import { XahauNameError } from './errors';
import type { HookHandler } from './types';
export {OPERATIONS,LEGACY_PROFILE_TEXT_KEYS,PROFILE_TEXT_KEYS} from "./protocol.generated";
import {OPERATIONS,LEGACY_PROFILE_TEXT_KEYS,PROFILE_TEXT_KEYS} from "./protocol.generated";
export type Operation = keyof typeof OPERATIONS;
export const HANDLERS: Record<Operation, HookHandler> = {
    noop: 'control', register: 'issuance', buy: 'issuance', setPrimary: 'control', setAddr: 'set-address', clearAddr: 'set-address', setText: 'set-text', clearText: 'clear-text', lock: 'control', reset: 'control', setPricing: 'admin', addTld: 'admin', removeTld: 'admin', pause: 'admin', unpause: 'admin', setURIBase: 'admin', reconcile: 'claim'
};

export function uriBaseBytes(value: string): Buffer {
    if (typeof value !== 'string' || Buffer.byteLength(value) > 120 ||
        !/^https:\/\/[a-z0-9.-]+\/(?:[A-Za-z0-9._-]+\/)*$/.test(value) || value.includes('..'))
        invalid('URIBase must be an HTTPS base with a trailing slash, no query/fragment, and at most 120 ASCII bytes');
    return Buffer.from(value);
}

export function rejectCustomURI(args: object): void {
    for (const field of ['uri', 'URI', 'customURI', 'URIBase', 'uriBase'])
        if (Object.hasOwn(args, field)) invalid('Custom URI is not accepted; the hook constructs it from URIBase');
}
export function invalid(message: string): never {
    throw new XahauNameError(message, 'INVALID_ARGUMENT');
}
export function parameters(op: Operation, fields: Record<string, Buffer> = {}) {
    if (!Object.hasOwn(OPERATIONS, op))
        invalid('Unsupported operation');
    if ('op' in fields || 'xn_v' in fields)
        invalid('Protocol fields cannot be overridden');
    return Object.entries({ xn_v: Buffer.from([2]), op: Buffer.from([OPERATIONS[op]]), ...fields }).map(([name, value]) => {
        if (!Buffer.isBuffer(value) || Buffer.byteLength(name) > 32 || value.length > 256)
            invalid('HookParameter exceeds protocol size');
        return { HookParameter: { HookParameterName: Buffer.from(name).toString('hex').toUpperCase(), HookParameterValue: value.toString('hex').toUpperCase() } };
    });
}
export function domainFields(label: string, tld: string) {
    if (typeof label !== 'string' || typeof tld !== 'string')
        invalid('label/tld must be strings');
    label = label.toLowerCase();
    tld = tld.toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9-]{0,55}[a-z0-9])?$/.test(label))
        invalid('label must contain 1..57 ASCII letters, digits or internal hyphens');
    if (['xahau', 'treasury', 'admin', 'root', 'www'].includes(label))
        invalid('This label is reserved by the protocol');
    if (!/^[a-z0-9]{2,8}$/.test(tld))
        invalid('tld must contain 2..8 ASCII letters or digits');
    return { label: Buffer.from(label), tld: Buffer.from(tld) };
}
export function coinBytes(value: number): Buffer {
    if (!Number.isInteger(value) || value < 0 || value > 65535)
        invalid('coinType must be an integer 0..65535');
    const b = Buffer.alloc(4);
    b.writeUInt32BE(value);
    return b;
}
export function boolBytes(value: boolean): Buffer {
    if (typeof value !== 'boolean')
        invalid('flag must be boolean');
    return Buffer.from([value ? 1 : 0]);
}
export function priceBytes(values: bigint[]): Buffer {
    if (values.length !== 10)
        invalid('Exactly 10 prices required');
    const b = Buffer.alloc(80);
    values.forEach((v, i) => {
        if (typeof v !== 'bigint' || v < 0n || v > 0xffffffffffffffffn)
            invalid('Price outside uint64 range');
        b.writeBigUInt64BE(v, i * 8);
    });
    return b;
}
export function recipientAddress(input: string): string {
    if (/^[A-Fa-f0-9]{40}$/.test(input))
        return encodeAccountID(Buffer.from(input, 'hex'));
    decodeAccountID(input);
    return input;
}
export function recipientBytes(input: string): Buffer {
    return Buffer.from(Buffer.from(decodeAccountID(recipientAddress(input))).toString('hex').toUpperCase());
}
export function addressBytes(value: Buffer): Buffer {
    if (!Buffer.isBuffer(value) || value.length < 1 || value.length > 128)
        invalid('addr must be 1..128 bytes');
    return Buffer.from(value.toString('hex').toUpperCase());
}
export function textKeyBytes(value: string): Buffer {
    if (typeof value !== 'string' || !/^[a-z0-9._-]{1,40}$/i.test(value))
        invalid('Invalid text key');
    return Buffer.from(value.toLowerCase());
}
export function textValueBytes(value: string): Buffer {
    if (typeof value !== 'string')
        invalid('Text value must be a string');
    const b = Buffer.from(value, 'utf8');
    if (b.length < 1 || b.length > 128)
        invalid('Text value must be 1..128 UTF-8 bytes');
    return b;
}

/** Friendly UI input only; explicit multi-label/unsupported names remain invalid. */
export function normalizeDomainInput(input: string, defaultTld = 'xah'): string {
    if (typeof input !== 'string') invalid('Domain must be a string');
    const cleaned = input.replace(/\s+/gu, '').toLowerCase();
    if (!cleaned) invalid('Enter a domain name');
    const full = cleaned.includes('.') ? (cleaned.endsWith('.') ? cleaned+defaultTld : cleaned) : cleaned+'.'+defaultTld;
    const parts = full.split('.');
    if (parts.length !== 2) invalid('Use a root domain such as alice.xah');
    const fields = domainFields(parts[0],parts[1]);
    return fields.label+'.'+fields.tld;
}

/** Fixed order is the on-chain profile v1 bit layout. */
export type ProfileTextKey = typeof PROFILE_TEXT_KEYS[number];
export function profilePatchFields(set: Partial<Record<ProfileTextKey,string>> = {}, clear: ProfileTextKey[] = []): Record<string,Buffer> {
    if (!set || typeof set !== 'object' || Array.isArray(set) || !Array.isArray(clear)) invalid('Invalid profile patch');
    let setMask=0,clearMask=0;
    const fields:Record<string,Buffer>={}, seen=new Set<string>();
    for (const [key,value] of Object.entries(set)) {
        const canonical=textKeyBytes(key).toString(), i=(PROFILE_TEXT_KEYS as readonly string[]).indexOf(canonical);
        if(canonical!==key)invalid('Profile keys must be canonical lowercase');
        if(i<0) invalid('Profile batch supports the ten Global Keys; use setText for service/custom records');
        if(seen.has(canonical)) invalid('Duplicate profile field'); seen.add(canonical);
        fields['p'+i]=textValueBytes(value);setMask|=1<<i;
    }
    for(const key of clear){
        const canonical=textKeyBytes(key).toString(),i=(PROFILE_TEXT_KEYS as readonly string[]).indexOf(canonical);
        if(i<0||seen.has(canonical)) invalid('Unsupported, duplicate or overlapping profile field');seen.add(canonical);clearMask|=1<<i;
    }
    if(!(setMask|clearMask)) invalid('Profile patch has no changes');
    const header=Buffer.alloc(5);header[0]=2;header.writeUInt16BE(setMask,1);header.writeUInt16BE(clearMask,3);
    return {profile:header,...fields};
}
/** Diff only supplied editable fields; unrelated/custom records are preserved. */
export function diffProfile(current: Record<string,string>, values: Partial<Record<ProfileTextKey,string>>) {
    const set:Partial<Record<ProfileTextKey,string>>={},clear:ProfileTextKey[]=[];
    for(const [key,value] of Object.entries(values)){
        if(!(PROFILE_TEXT_KEYS as readonly string[]).includes(key)||typeof value!=='string')invalid('Invalid profile field');
        if(value===(current[key]??''))continue;
        const next=value.trim()===''?'':value;
        if(next===(current[key]??''))continue;
        if(next==='')clear.push(key as ProfileTextKey);else set[key as ProfileTextKey]=next;
    }
    return {set,clear};
}
