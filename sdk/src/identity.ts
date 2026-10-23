import type { ClientContext, RpcResult } from './context';
import type { ReadOptions } from './types';
import { domainFields } from './protocol';
import { computeUritokenId, computeUritokenIdFromURI, tokenKey, labelOfKey, uriKey, splitDomain, joinDomain } from './util';
import { XahauNameError } from './errors';

export async function domainIdentity(ctx: ClientContext, domain: string, options: ReadOptions) {
    const {label, tld} = splitDomain(domain);
    domainFields(label, tld);
    const name = joinDomain(label, tld), mapped = await ctx.readState(tokenKey(label, tld), options);
    if (mapped && mapped.length !== 32)
        throw new XahauNameError('Invalid domain token mapping', 'BAD_STATE');
    return {name, id: mapped ? mapped.toString('hex').toUpperCase() : computeUritokenId(ctx.treasury, label, tld), mapped: !!mapped};
}

export async function tokenMatchesDomain(ctx: ClientContext, token: RpcResult, identity: {name: string; id: string; mapped: boolean}, options: ReadOptions) {
    if (token.LedgerEntryType !== 'URIToken' || token.Issuer !== ctx.treasury ||
        typeof token.URI !== 'string' || !/^(?:[a-f0-9]{2})+$/i.test(token.URI)) return false;
    const uri = Buffer.from(token.URI, 'hex').toString('utf8');
    if (computeUritokenIdFromURI(ctx.treasury, uri) !== identity.id) return false;
    if (!identity.mapped) return uri === identity.name; // Only pre-upgrade bare-domain tokens.
    const reverse = await ctx.readState(labelOfKey(identity.id), options) ?? await ctx.readState(uriKey(identity.id), options);
    return reverse?.toString('utf8') === identity.name;
}

/** Discover canonical identity from the chain's reverse map, never an HTTP response. */
export async function domainOfToken(ctx: ClientContext, token: RpcResult, options: ReadOptions): Promise<string | null> {
    if (typeof token.index !== 'string' || !/^[a-f0-9]{64}$/i.test(token.index)) return null;
    const id = token.index.toUpperCase();
    const reverse = await ctx.readState(labelOfKey(id), options) ?? await ctx.readState(uriKey(id), options);
    const name = reverse ? reverse.toString('utf8') : Buffer.from(token.URI ?? '', 'hex').toString('utf8');
    try {
        const {label, tld} = splitDomain(name); domainFields(label, tld);
        if (name !== joinDomain(label, tld)) return null;
    } catch {return null;}
    const identity = await domainIdentity(ctx, name, options);
    return identity.id === id && await tokenMatchesDomain(ctx, token, identity, options) ? name : null;
}
