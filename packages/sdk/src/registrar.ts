import { decodeAccountID, encodeAccountID } from 'xahau';
import { pricingKey, pausedKey, decodePricing, priceForLength, splitDomain, joinDomain, computeUritokenIdFromURI, rootKey, pendingKey, asyncKey, decodeRoot, uriBaseKey } from './util';
import { parameters, domainFields, recipientAddress, recipientBytes, priceBytes, invalid, rejectCustomURI, uriBaseBytes } from './protocol';
import { domainIdentity, tokenMatchesDomain, domainOfToken } from './identity';
import type { ClientContext } from './context';
import type { BuyArgs, RegisterArgs, PriceTable, ReadOptions, WaitOptions, RegistrationStatus } from './types';
import { fetchMetadata, metadataURL } from './metadata';
import { XahauNameError } from './errors';
export class RegistrarModule {
    constructor(private ctx: ClientContext) {
    }
    async getPricing(options?: ReadOptions): Promise<PriceTable | null> {
        const buf = await this.ctx.readState(pricingKey(), options);
        if (!buf)
            return null;
        if (buf[0] !== 1)
            throw new XahauNameError('Unsupported pricing version', 'BAD_STATE');
        return { version: 1, prices: decodePricing(buf) };
    }
    async getPrice(length: number): Promise<bigint> {
        if (!Number.isInteger(length) || length < 1 || length > 57)
            invalid('Invalid label length');
        const table = await this.getPricing({ bypassCache: true });
        if (!table)
            throw new XahauNameError('Pricing is not set', 'PRICING_NOT_SET');
        return priceForLength(table.prices, length);
    }
    getPriceForDomain(domain: string) {
        const { label, tld } = splitDomain(domain);
        domainFields(label, tld);
        return this.getPrice(label.length);
    }
    async isPaused(options?: ReadOptions) {
        const buf = await this.ctx.readState(pausedKey(), options);
        return !!buf && buf[0] === 1;
    }
    private signer() {
        const address = this.ctx.signerAddress();
        if (!address)
            throw new XahauNameError('Signer required', 'NO_SIGNER');
        return address;
    }
    async buy(args: BuyArgs) {
        rejectCustomURI(args);
        const signer = this.signer(), fields = domainFields(args.label, args.tld);
        if (signer === this.ctx.treasury)
            throw new XahauNameError('Treasury must use register, not self Payment', 'INVALID_ARGUMENT');
        const price = await this.getPrice(fields.label.length);
        if (price === 0n)
            throw new XahauNameError('Zero-price buy cannot be sent as a native Payment; use treasury register', 'INVALID_ARGUMENT');
        return this.ctx.submit({ TransactionType: 'Payment', Destination: this.ctx.treasury, Amount: price.toString(), HookParameters: parameters('buy', { ...fields, ...(args.recipient ? { recipient: recipientBytes(args.recipient) } : {}) }) }, { handler: 'issuance', returns: ['minting'], status: 'pending' });
    }
    async register(args: RegisterArgs) {
        rejectCustomURI(args);
        if (this.signer() !== this.ctx.treasury)
            throw new XahauNameError('Treasury owner required', 'NOT_ADMIN');
        if (!args.recipient)
            invalid('register requires an explicit recipient');
        const recipient = recipientAddress(args.recipient), destination = recipientAddress(args.paymentDestination ?? recipient);
        if (destination === this.ctx.treasury)
            invalid('register Payment destination must differ from treasury; provide paymentDestination');
        return this.ctx.submit({ TransactionType: 'Payment', Destination: destination, Amount: '12', HookParameters: parameters('register', { ...domainFields(args.label, args.tld), recipient: recipientBytes(recipient) }) }, { handler: 'issuance', returns: ['minting'], status: 'pending' });
    }
    async setPricing(prices: bigint[]) {
        if (this.signer() !== this.ctx.treasury)
            throw new XahauNameError('Treasury owner required', 'NOT_ADMIN');
        return this.ctx.submit({ TransactionType: 'Invoke', HookParameters: parameters('setPricing', { prices: priceBytes(prices) }) }, { handler: 'admin', returns: ['pricing set'] });
    }
    async getURIBase(options?: ReadOptions): Promise<string | null> {
        const value = await this.ctx.readState(uriBaseKey(), options);
        return value ? value.toString('utf8') : null;
    }
    async setURIBase(base: string) {
        if (this.signer() !== this.ctx.treasury)
            throw new XahauNameError('Treasury owner required', 'NOT_ADMIN');
        return this.ctx.submit({ TransactionType: 'Invoke', HookParameters: parameters('setURIBase', {uri_base: uriBaseBytes(base)}) }, {handler:'admin', returns:['uri base set']});
    }
    async getTokenId(domain: string, options: ReadOptions = {}): Promise<string | null> {
        const status = await this.getRegistrationStatus(domain, options);
        return status.stage === 'available' ? null : status.uritokenId;
    }
    async getTokenURI(domain: string, options: ReadOptions = {}): Promise<string | null> {
        const opts = {...options, ledgerHash: options.ledgerHash ?? await this.ctx.ledgerHash()};
        const identity = await domainIdentity(this.ctx, domain, opts), token = await this.ctx.ledgerObject(identity.id, opts);
        if (!token) return null;
        if (!await tokenMatchesDomain(this.ctx, token, identity, opts))
            throw new XahauNameError('Token identity does not match domain', 'OWNERSHIP_MISMATCH');
        return Buffer.from(token.URI, 'hex').toString('utf8');
    }
    /** Metadata is display-only. Identity is verified against one validated ledger first. */
    async getMetadata(domain: string, options: ReadOptions & {fetch?:typeof fetch} = {}) {
        const opts = {...options, ledgerHash:options.ledgerHash ?? await this.ctx.ledgerHash()};
        const uri = await this.getTokenURI(domain, opts);
        if (!uri) return null;
        const {label,tld} = splitDomain(domain), name = joinDomain(label,tld);
        const base = uri === name ? await this.getURIBase(opts) : null;
        const url = metadataURL(uri, name, base);
        return url ? fetchMetadata(url, {fetch:options.fetch}) : null;
    }
    async getRegistrationStatus(domain: string, options: ReadOptions = {}): Promise<RegistrationStatus> {
        const { label, tld } = splitDomain(domain);
        domainFields(label, tld);
        const opts = { ...options, bypassCache: true, ledgerHash: options.ledgerHash ?? await this.ctx.ledgerHash() };
        const identity = await domainIdentity(this.ctx, domain, opts), {name} = identity;
        let id = identity.id;
        const [root, pending, refund, token] = await Promise.all([this.ctx.readState(rootKey(label, tld), opts), this.ctx.readState(pendingKey(id), opts), this.ctx.readState(asyncKey('rfd', id), opts), this.ctx.ledgerObject(id, opts)]);
        if (!identity.mapped && !root && !pending && !refund && !token) {
            const base = await this.getURIBase(opts);
            if (base) id = computeUritokenIdFromURI(this.ctx.treasury, base + name);
        }
        const status: RegistrationStatus = { domain: name, uritokenId: id, stage: 'available', ledgerHash: opts.ledgerHash };
        if (pending) {
            if (pending.length !== 32)
                throw new XahauNameError('Invalid pending record', 'BAD_STATE');
            status.recipient = encodeAccountID(pending.subarray(0, 20));
            status.amountDrops = pending.readBigUInt64BE(20);
        }
        if (token) {
            status.tokenOwner = token.Owner;
            if (!await tokenMatchesDomain(this.ctx, token, identity, opts)) {
                status.stage = 'recoveryRequired';
                return status;
            }
        }
        if (root) {
            const decoded = decodeRoot(root);
            status.owner = decoded.owner;
            status.stage = token?.Owner === decoded.owner && !pending ? 'claimed' : 'recoveryRequired';
            return status;
        }
        if (refund) {
            status.stage = 'refundPending';
            return status;
        }
        if (pending) {
            status.stage = token?.Owner === this.ctx.treasury && token.Destination === status.recipient && token.Amount === '0' ? 'awaitingClaim' : token && token.Owner !== this.ctx.treasury ? 'recoveryRequired' : 'pending';
            return status;
        }
        if (token || identity.mapped)
            status.stage = 'recoveryRequired';
        return status;
    }
    private async wait(domain: string, stage: 'awaitingClaim' | 'claimed', options: WaitOptions): Promise<RegistrationStatus> {
        const timeout = options.timeoutMs ?? 60000, interval = options.pollIntervalMs ?? 1000;
        if (!Number.isFinite(timeout) || timeout <= 0 || !Number.isFinite(interval) || interval <= 0)
            invalid('Invalid polling timeout/interval');
        const deadline = Date.now() + timeout;
        while (true) {
            if (options.signal?.aborted)
                throw new XahauNameError('Polling aborted', 'ABORTED');
            const state = await this.getRegistrationStatus(domain);
            if (state.stage === stage)
                return state;
            if (state.stage === 'recoveryRequired' || state.stage === 'refundPending')
                throw new XahauNameError('Registration requires recovery or refund', 'REGISTRATION_FAILED', state);
            if (Date.now() >= deadline)
                throw new XahauNameError('Timed out waiting for ' + stage, 'TIMEOUT', state);
            await new Promise<void>((resolve, reject) => {
                const signal = options.signal;
                const abort = () => {
                    clearTimeout(timer);
                    signal?.removeEventListener('abort', abort);
                    reject(new XahauNameError('Polling aborted', 'ABORTED'));
                };
                const timer = setTimeout(() => {
                    signal?.removeEventListener('abort', abort);
                    resolve();
                }, Math.min(interval, deadline - Date.now()));
                signal?.addEventListener('abort', abort, { once: true });
                if (signal?.aborted)
                    abort();
            });
        }
    }
    waitForOffer(domain: string, options: WaitOptions = {}) {
        return this.wait(domain, 'awaitingClaim', options);
    }
    waitForClaimed(domain: string, options: WaitOptions = {}) {
        return this.wait(domain, 'claimed', options);
    }
    async claim(domain: string) {
        const signer = this.signer(), state = await this.getRegistrationStatus(domain);
        if (state.stage !== 'awaitingClaim')
            throw new XahauNameError('No claimable zero-price offer', 'NOT_CLAIMABLE', state);
        if (state.recipient !== signer)
            throw new XahauNameError('Only the designated recipient can claim', 'NOT_RECIPIENT');
        const tx = await this.ctx.submit({ TransactionType: 'URITokenBuy', URITokenID: state.uritokenId, Amount: '0' }, { handler: 'claim', returns: ['claimed', 'transferred'] });
        const final = await this.getRegistrationStatus(domain);
        if (final.stage !== 'claimed' || final.owner !== signer)
            throw new XahauNameError('Token claim did not finalize root ownership', 'CLAIM_NOT_FINALIZED', { tx, state: final });
        return tx;
    }
    /** Discover directed free offers from validated account history, then verify current ledger state.
     * History availability depends on the RPC server. Never treats an offer as ownership. */
    async listIncomingDomains(address: string, options: ReadOptions = {}): Promise<import('./types').IncomingDomains> {
        decodeAccountID(address);
        const opts = {...options, bypassCache:true, ledgerHash:options.ledgerHash ?? await this.ctx.ledgerHash()};
        const ledger = await this.ctx.request({command:'ledger',ledger_hash:opts.ledgerHash,transactions:false,expand:false});
        const max = Number(ledger.ledger_index ?? ledger.ledger?.ledger_index);
        if (!Number.isSafeInteger(max) || max < 1) throw new XahauNameError('Invalid validated ledger index','BAD_RESPONSE');
        const ids = new Set<string>(), markers = new Set<string>();
        let marker: unknown, historyMinLedger = 0;
        for (let page=0; ; page++) {
            if(page>=100) throw new XahauNameError('Incoming offer history exceeds pagination limit','HISTORY_LIMIT');
            const result = await this.ctx.request({command:'account_tx',account:address,ledger_index_min:-1,ledger_index_max:max,binary:false,forward:false,limit:200,...(marker?{marker}:{})});
            if(!Array.isArray(result.transactions)) throw new XahauNameError('Invalid account history response','BAD_RESPONSE');
            historyMinLedger = Math.max(historyMinLedger, Number(result.ledger_index_min)||0);
            for(const item of result.transactions) {
                if(item.validated !== true) continue;
                const tx=item.tx_json ?? item.tx ?? {}, meta=item.meta;
                if(!meta || meta.TransactionResult!=='tesSUCCESS')continue;
                if(tx.Destination===address && typeof tx.URITokenID==='string' && /^[a-f0-9]{64}$/i.test(tx.URITokenID))ids.add(tx.URITokenID.toUpperCase());
                for(const node of meta.AffectedNodes ?? []) {
                    const n=node.CreatedNode ?? node.ModifiedNode, fields=n?.NewFields ?? n?.FinalFields;
                    if(n?.LedgerEntryType==='URIToken' && fields?.Destination===address && typeof n.LedgerIndex==='string' && /^[a-f0-9]{64}$/i.test(n.LedgerIndex))ids.add(n.LedgerIndex.toUpperCase());
                }
            }
            marker=result.marker;
            if(!marker)break;
            const key=JSON.stringify(marker);
            if(markers.has(key))throw new XahauNameError('Repeated account history marker','BAD_RESPONSE');
            markers.add(key);
        }
        const offers:import('./types').IncomingDomain[]=[];
        for(const id of ids) {
            const token=await this.ctx.ledgerObject(id,opts);
            if(!token || token.Issuer!==this.ctx.treasury || token.Destination!==address || token.Amount!=='0' || token.Owner===address)continue;
            const domain=await domainOfToken(this.ctx,{...token,index:id},opts);
            if(!domain)continue;
            const state=await this.getRegistrationStatus(domain,opts);
            const kind=state.stage==='awaitingClaim' && state.recipient===address ? 'registration' : state.stage==='claimed' && state.owner===token.Owner ? 'transfer' : null;
            if(kind)offers.push({domain,uritokenId:id,sender:token.Owner,recipient:address,kind});
        }
        offers.sort((a,b)=>a.domain.localeCompare(b.domain));
        return {offers,ledgerHash:opts.ledgerHash,historyMinLedger};
    }
    /** Revalidates the offer immediately before requesting one recipient signature. */
    async claimIncoming(domain:string) {
        const state=await this.getRegistrationStatus(domain);
        return state.stage==='awaitingClaim' ? this.claim(domain) : this.acceptTransfer(domain);
    }
    private async ownedToken(domain: string) {
        const signer = this.signer(), status = await this.getRegistrationStatus(domain);
        if (status.stage !== 'claimed' || status.owner !== signer || status.tokenOwner !== signer)
            throw new XahauNameError('Only the current verified owner can manage this domain', 'NOT_OWNER');
        return status.uritokenId;
    }
    async createTransferOffer(domain: string, recipient: string) {
        decodeAccountID(recipient);
        if (recipient === this.signer()) invalid('Recipient must differ from owner');
        const id = await this.ownedToken(domain);
        if (!this.ctx.submitNative) throw new XahauNameError('Native submission unavailable', 'UNSUPPORTED');
        return this.ctx.submitNative({TransactionType:'URITokenCreateSellOffer', URITokenID:id, Amount:'0', Destination:recipient});
    }
    async cancelTransferOffer(domain: string) {
        const id = await this.ownedToken(domain);
        if (!this.ctx.submitNative) throw new XahauNameError('Native submission unavailable', 'UNSUPPORTED');
        return this.ctx.submitNative({TransactionType:'URITokenCancelSellOffer', URITokenID:id});
    }
    async acceptTransfer(domain: string) {
        const signer = this.signer(), status = await this.getRegistrationStatus(domain);
        if (status.stage !== 'claimed') throw new XahauNameError('Domain is not transferable', 'NOT_CLAIMABLE');
        const token = await this.ctx.ledgerObject(status.uritokenId, {ledgerHash:status.ledgerHash, bypassCache:true});
        if (token?.Destination !== signer || token.Amount !== '0' || token.Owner === signer)
            throw new XahauNameError('No free transfer offer for this wallet', 'NOT_RECIPIENT');
        const tx = await this.ctx.submit({TransactionType:'URITokenBuy', URITokenID:status.uritokenId, Amount:'0'}, {handler:'claim',returns:['transferred']});
        const final = await this.getRegistrationStatus(domain);
        if (final.stage !== 'claimed' || final.owner !== signer)
            throw new XahauNameError('Transfer ownership not finalized', 'CLAIM_NOT_FINALIZED', {tx,state:final});
        return tx;
    }
    async burn(domain: string) {
        const id = await this.ownedToken(domain);
        return this.ctx.submit({TransactionType:'URITokenBurn', URITokenID:id}, {handler:'burn',returns:['burned']});
    }
    async buyAndClaim(args: BuyArgs, options: WaitOptions = {}) {
        const signer = this.signer();
        if (args.recipient && recipientAddress(args.recipient) !== signer)
            throw new XahauNameError('buyAndClaim requires the recipient signer', 'NOT_RECIPIENT');
        const purchase = await this.buy(args), domain = joinDomain(args.label, args.tld);
        await this.waitForOffer(domain, options);
        const claim = await this.claim(domain);
        return { purchase, claim, status: await this.getRegistrationStatus(domain) };
    }
}
