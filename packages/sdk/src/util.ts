/**
 * @xahauname/sdk — Hashing, key builders, codecs
 *
 * All state key formulas MUST match hook/src/common.h
 * state key builders byte-for-byte.
 */

import { sha512 } from '@noble/hashes/sha512';
import { encodeAccountID, decodeAccountID } from 'xahau';
import {
    NAMESPACE_SEED,
    URITOKEN_PREFIX,
    ROOT_LEN,
    ROOT_FLAG_PRIMARY,
    ROOT_FLAG_LOCKED,
} from './constants';
import type { RootRecord, SplitDomain } from './types';

/** SHA-512 half (first 32 bytes), with identical Node and browser output. */
export function sha512Half(input: Buffer | string): Buffer {
    const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
    return Buffer.from(sha512(buf)).subarray(0, 32);
}

/** Custom-text slot: state-key32 followed by its canonical plaintext name. */
export function textSlotKey(label: string, tld: string, slot: number): string {
    if (!Number.isInteger(slot) || slot < 0 || slot >= 15) throw new Error('Invalid text slot');
    return sha512Half(Buffer.concat([Buffer.from('txi:'), Buffer.from(rootKey(label, tld), 'hex'), Buffer.from([slot])])).toString('hex').toUpperCase();
}

/** Split "alice.xah" → { label, tld } */
export function splitDomain(fullName: string): SplitDomain {
    const i = fullName.lastIndexOf('.');
    if (i < 1 || i >= fullName.length - 1) {
        throw new Error(`Invalid domain: ${fullName}`);
    }
    return {
        label: fullName.slice(0, i).toLowerCase(),
        tld: fullName.slice(i + 1).toLowerCase(),
    };
}

export function joinDomain(label: string, tld: string): string {
    return `${label.toLowerCase()}.${tld.toLowerCase()}`;
}

// -----------------------------------------------------------------
// State key builders
// -----------------------------------------------------------------

/** Compute HookNamespace from seed */
export function namespaceId(seed: string = NAMESPACE_SEED): string {
    return sha512Half(seed).toString('hex').toUpperCase();
}

export function rootKey(label: string, tld: string): string {
    return sha512Half(`${label.toLowerCase()}.${tld.toLowerCase()}:root`)
        .toString('hex').toUpperCase();
}

export function addrKey(label: string, tld: string, coinType: number): string {
    return sha512Half(`${label.toLowerCase()}.${tld.toLowerCase()}:addr:${coinType}`)
        .toString('hex').toUpperCase();
}

export function textKey(label: string, tld: string, key: string): string {
    return sha512Half(`${label.toLowerCase()}.${tld.toLowerCase()}:text:${key.toLowerCase()}`)
        .toString('hex').toUpperCase();
}

export function recordsKey(label: string, tld: string): string {
    return sha512Half(`${label.toLowerCase()}.${tld.toLowerCase()}:records`)
        .toString('hex').toUpperCase();
}

export function roleKey(role: string, address: string): string {
    const addrBytes = decodeAccountID(address);
    const payload = Buffer.concat([
        Buffer.from(`_role:${role.toLowerCase()}:`, 'utf8'),
        Buffer.from(addrBytes),
    ]);
    return sha512Half(payload).toString('hex').toUpperCase();
}

export function tldKey(tld: string): string {
    return sha512Half(`_tld:${tld.toLowerCase()}`)
        .toString('hex').toUpperCase();
}

export function pricingKey(): string {
    return sha512Half('_pricing_v1').toString('hex').toUpperCase();
}

export function pausedKey(): string {
    return sha512Half('_paused').toString('hex').toUpperCase();
}

export function primaryOfKey(address: string): string {
    const addrBytes = decodeAccountID(address);
    const payload = Buffer.concat([
        Buffer.from('primary_of:', 'utf8'),
        Buffer.from(addrBytes),
    ]);
    return sha512Half(payload).toString('hex').toUpperCase();
}

/** uri: + first 28 bytes of URITokenID (literal prefix, no hash) */
export function uriKey(uritokenIdHex: string): string {
    const buf = Buffer.alloc(32);
    buf.write('uri:', 0, 'ascii');
    Buffer.from(uritokenIdHex, 'hex').copy(buf, 4, 0, 28);
    return buf.toString('hex').toUpperCase();
}

/** lof: + first 28 bytes of URITokenID */
export function labelOfKey(uritokenIdHex: string): string {
    const buf = Buffer.alloc(32);
    buf.write('lof:', 0, 'ascii');
    Buffer.from(uritokenIdHex, 'hex').copy(buf, 4, 0, 28);
    return buf.toString('hex').toUpperCase();
}

// -----------------------------------------------------------------
// URITokenID (XLS-45)
// URITokenID = sha512h(0x0055 || issuer || uri)[:32]
// -----------------------------------------------------------------

export function computeUritokenId(
    issuer: string,
    label: string,
    tld: string,
): string {
    return computeUritokenIdFromURI(issuer, joinDomain(label, tld));
}

/** Native ID from exact URI bytes. computeUritokenId remains the legacy-domain helper. */
export function computeUritokenIdFromURI(issuer: string, tokenURI: string): string {
    const issuerBytes = decodeAccountID(issuer);
    const uri = Buffer.from(tokenURI, 'utf8');
    const payload = Buffer.concat([
        URITOKEN_PREFIX,
        Buffer.from(issuerBytes),
        uri,
    ]);
    return sha512Half(payload).toString('hex').toUpperCase();
}

export function tokenKey(label: string, tld: string): string {
    return sha512Half(joinDomain(label, tld) + ':token').toString('hex').toUpperCase();
}

export function uriBaseKey(): string {
    return sha512Half('_uri_base_v1').toString('hex').toUpperCase();
}

// -----------------------------------------------------------------
// Root record decode
// -----------------------------------------------------------------

export function decodeRoot(data: Buffer): RootRecord {
    if (data.length !== ROOT_LEN) {
        throw new Error(`root record must be 32 bytes, got ${data.length}`);
    }
    const ownerBinary = data.subarray(0, 20);
    const owner = encodeAccountID(ownerBinary);
    const flags = data[20];
    const mintedAt = Number(data.readBigUInt64BE(21));
    return {
        owner,
        primary: (flags & ROOT_FLAG_PRIMARY) === ROOT_FLAG_PRIMARY,
        locked: false, // Legacy bit is ignored by protocol policy.
        mintedAt,
    };
}

// -----------------------------------------------------------------
// Pricing decode (81 bytes packed)
// -----------------------------------------------------------------

export function decodePricing(data: Buffer): Record<string, bigint> {
    if (data.length !== 81) {
        throw new Error(`pricing record must be 81 bytes, got ${data.length}`);
    }
    const prices: Record<string, bigint> = {};
    for (let i = 0; i < 10; i++) {
        const off = 1 + i * 8;
        const label = i === 9 ? '10+' : String(i + 1);
        prices[label] = data.readBigUInt64BE(off);
    }
    return prices;
}

/** Lookup price for a label length */
export function priceForLength(
    pricing: Record<string, bigint>,
    length: number,
): bigint {
    if (length < 1) throw new Error(`invalid length: ${length}`);
    const key = length >= 10 ? '10+' : String(length);
    return pricing[key];
}

// -----------------------------------------------------------------
// Hex utilities
// -----------------------------------------------------------------

export function hex(input: Buffer | string): string {
    const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
    return buf.toString('hex').toUpperCase();
}

export function unhex(h: string): Buffer {
    return Buffer.from(h, 'hex');
}

/** r-address → 40-char uppercase hex AccountID */
export function addressToHex(rAddress: string): string {
    return Buffer.from(decodeAccountID(rAddress)).toString('hex').toUpperCase();
}

/** 40-char hex → r-address */
export function hexToAddress(hex40: string): string {
    return encodeAccountID(Buffer.from(hex40, 'hex'));
}

// -----------------------------------------------------------------
// Memo builder — common pattern for all invoke ops
// -----------------------------------------------------------------

import { MEMO_TYPE_STR, MEMO_FORMAT_STR } from './constants';

/** @deprecated Native-v2 operations use parameters() from protocol. */
export function buildMemo(opJson: Record<string, unknown>): {
    Memo: { MemoType: string; MemoFormat: string; MemoData: string };
} {
    return {
        Memo: {
            MemoType: hex(MEMO_TYPE_STR),
            MemoFormat: hex(MEMO_FORMAT_STR),
            MemoData: hex(JSON.stringify(opJson)),
        },
    };
}

/** Resolve "r..." or hex AccountID → 40 hex chars (for memo recipient field) */
export function recipientToHex(recipient: string | undefined, fallbackAddress: string): string {
    if (!recipient) return addressToHex(fallbackAddress);
    if (recipient.startsWith('r')) return addressToHex(recipient);
    if (recipient.length === 40) return recipient.toUpperCase();
    throw new Error(`invalid recipient: ${recipient}`);
}

/** Native-v2 pending key: eight-byte prefix + first 24 token-ID bytes. */
export function pendingKey(id: string): string {
    if (!/^[a-f0-9]{64}$/i.test(id)) throw new Error('Invalid URITokenID');
    return Buffer.concat([Buffer.from('pending:'), Buffer.from(id, 'hex').subarray(0, 24)]).toString('hex').toUpperCase();
}

export function asyncKey(kind: 'mnt' | 'ofr' | 'rfd', id: string): string {
    if (!/^[a-f0-9]{64}$/i.test(id)) throw new Error('Invalid URITokenID');
    return Buffer.concat([Buffer.from(kind + ':'), Buffer.from(id, 'hex').subarray(0, 28)]).toString('hex').toUpperCase();
}
