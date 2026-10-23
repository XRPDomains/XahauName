import {ResolverModule, util, encodeAddress, canonicalAddressBytes, domainFields, type ClientContext} from '@xahauname/sdk';
import {decodeAccountID} from 'xahau';
import {canonicalName} from './decoder';
import type {Change, Deployment, Json, Materialized} from './types';

export function applyChanges(state: Materialized, changes: Change[]) {
    for (const c of changes) {
        if (c.value === null) delete state[c.table][c.key];
        else state[c.table][c.key] = c.value;
    }
}
export function knownNames(state: Materialized): Set<string> {
    const names = new Set(Object.keys(state.domains));
    for (const [key, value] of Object.entries(state.state)) {
        const prefix = Buffer.from(key, 'hex').subarray(0, 4).toString();
        if (prefix !== 'lof:' && prefix !== 'uri:') continue;
        const name = canonicalName(Buffer.from(value, 'hex').toString());
        if (name) names.add(name);
    }
    // Legacy bare-domain URIs, without interpreting an HTTP URL as authority.
    for (const token of Object.values(state.tokens)) {
        const name = canonicalName(Buffer.from(token.URI ?? '', 'hex').toString());
        if (name) names.add(name);
    }
    return names;
}
export function localResolver(state: Materialized, cfg: Deployment, ledgerHash: string) {
    const ctx: ClientContext = {
        treasury: cfg.treasury, signerAddress: () => undefined, ledgerHash: async () => ledgerHash,
        readState: async key => state.state[key.toUpperCase()] === undefined ? null : Buffer.from(state.state[key.toUpperCase()], 'hex'),
        ledgerObject: async key => state.tokens[key.toUpperCase()] ?? null,
        request: async request => {
            if (request.command !== 'account_objects') throw new Error('Unsupported local projection request');
            return {account_objects: Object.values(state.tokens).filter(t => t.Owner === request.account)};
        },
        submit: async () => {throw new Error('Indexer never signs or submits');},
    };
    return new ResolverModule(ctx);
}
/** Safe read model: a mismatch is quarantined individually, never hides unrelated healthy domains. */
export async function projectDomain(name: string, state: Materialized, cfg: Deployment, hash: string): Promise<Json | null> {
    const resolver = localResolver(state, cfg, hash), {label, tld} = util.splitDomain(name);
    domainFields(label, tld);
    const idHex = state.state[util.tokenKey(label, tld)];
    if (idHex && !/^[A-F0-9]{64}$/.test(idHex)) return {domain: name, status: 'recoveryRequired', reason: 'Invalid domain token mapping'};
    const id = idHex ?? util.computeUritokenId(cfg.treasury, label, tld), token = state.tokens[id];
    const pending = state.state[util.pendingKey(id)];
    if (pending && pending.length !== 64) return {domain: name, tokenId: id, status: 'recoveryRequired', reason: 'Malformed pending state'};
    const recipient = pending?.length === 64 ? util.hexToAddress(pending.slice(0, 40)) : undefined;
    const base = {domain: name, tokenId: id, nativeOwner: token?.Owner, recipient,
        offer: token?.Amount !== undefined ? {destination: token.Destination, amount: token.Amount, seller: token.Owner} : null};
    if (state.recovery[name]) return {...base, status: 'recoveryRequired', reason: state.recovery[name]};
    if (token && (typeof token.URI !== 'string' || !/^(?:[a-f0-9]{2})+$/i.test(token.URI) ||
        util.computeUritokenIdFromURI(cfg.treasury, Buffer.from(token.URI, 'hex').toString()) !== id))
        return {...base, status: 'recoveryRequired', reason: 'Native token URI/ID mismatch'};
    let root;
    try {root = await resolver.getRoot(name);} catch {return {...base, status: 'recoveryRequired', reason: 'Malformed root state'};}
    if (!root) {
        if (pending) {
            if (token && token.Owner !== cfg.treasury) return {...base, status: 'recoveryRequired', reason: 'Claim changed native owner without finalized root'};
            const refund = state.state[util.asyncKey('rfd', id)];
            return {...base, status: refund ? 'refundPending' : token?.Amount !== undefined ? 'awaitingClaim' : 'pending',
                amountDrops: Buffer.from(pending, 'hex').readBigUInt64BE(20).toString()};
        }
        if (token) return {...base, status: 'recoveryRequired', reason: 'Native token exists without finalized root or pending registration'};
        if (idHex) return {...base, status: 'recoveryRequired', reason: 'Reserved token mapping without token or pending registration'};
        return null;
    }
    try {
        const profile = await resolver.describe(name, {verifyOwner: true});
        if (!profile) throw new Error('Profile missing');
        let verifiedPrimary = false;
        const receiving = profile.addrs[21337];
        if (profile.primary && receiving && state.state[util.primaryOfKey(profile.owner)] === util.rootKey(label, tld)) {
            try {verifiedPrimary = canonicalAddressBytes(21337, receiving).equals(encodeAddress(21337, profile.owner));} catch { /* Not a forward-confirmed primary. */ }
        }
        return {...base, ...profile, addrs: Object.fromEntries(Object.entries(profile.addrs).map(([coin, bytes]) => [coin, bytes.toString('hex').toUpperCase()])),
            status: 'claimed', verifiedPrimary};
    } catch (e) {
        return {...base, status: 'recoveryRequired', reason: e instanceof Error ? e.message : 'Invalid domain state'};
    }
}
export function cleanupComplete(old: Json, state: Materialized): boolean {
    const {label, tld} = util.splitDomain(old.domain), keys = [util.recordsKey(label, tld),
        ...Object.keys(old.addrs ?? {}).map(coin => util.addrKey(label, tld, Number(coin))),
        ...Object.keys(old.texts ?? {}).map(key => util.textKey(label, tld, key)),
        ...Object.keys(old.unnamedTexts ?? {})];
    for (let slot = 0; slot < 15; slot++) keys.push(util.textSlotKey(label, tld, slot));
    return keys.every(key => state.state[key] === undefined) &&
        (!old.owner || state.state[util.primaryOfKey(old.owner)] !== util.rootKey(label, tld));
}
export function assertAddress(address: string) {decodeAccountID(address);}
