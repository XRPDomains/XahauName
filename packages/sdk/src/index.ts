import { Client, Wallet, decodeAccountID } from 'xahau';
import { namespaceId as computeNamespaceId,splitDomain } from './util';
import {domainFields} from './protocol';
import type { XahauNameConfig, TxSigner, SignAndSubmitResult, ReadOptions, SubmitOptions, TxResult, DescribeOptions } from './types';
import type { ClientContext, RpcResult } from './context';
import { ResolverModule } from './resolver';
import { RegistrarModule } from './registrar';
import { ControllerModule } from './controller';
import { TreasuryModule } from './treasury';
import { XahauNameError, isTransientRpcError } from './errors';
import {mediaURL} from './metadata';
import {waitValidated} from './confirmation';
import { transactionResult } from './receipts';
import {snapshotContext} from './read-snapshot';
import type {DomainQuote,ProfileSnapshot} from './types';
export * from './types';
export * from './addresses';
export * from './text-records';
export * from './content';
export * from './wallet-kit';
export * from './diagnostics';
export * from './metadata';
export * from './purchase';
export * from './confirmation';
export type { ClientContext } from './context';
export * from './constants';
export * from './deployments';
export * from './networks';
export * from './indexer';
export * from './protocol';
export { XahauNameError, ResolverModule, RegistrarModule, ControllerModule, TreasuryModule };
export * as util from './util';
class WalletSigner implements TxSigner {
    readonly address: string;
    constructor(private wallet: Wallet, private client: Client) {
        this.address = wallet.classicAddress;
    }
    async signAndSubmit(tx: Record<string, unknown>): Promise<SignAndSubmitResult> {
        const prepared = await this.client.autofill({ ...tx, Account: this.address } as any), signed = this.wallet.sign(prepared), response = await this.client.submitAndWait(signed.tx_blob);
        const r = response.result, meta = r.meta;
        return { txHash: r.hash, engineResult: typeof meta === 'object' ? String(meta.TransactionResult) : 'unknown', meta, validated: r.validated };
    }
}
export class XahauNameClient {
    private client: Client;
    private signer: TxSigner | null;
    private context:ClientContext;
    private connecting?: Promise<void>;
    private pinnedReads=new Map<string,Promise<RpcResult>>();
    private cache = new Map<string, {
        value: Buffer | null;
        expires: number;
    }>();
    readonly namespaceId: string;
    readonly treasuryAddress: string;
    readonly resolver: ResolverModule;
    readonly registrar: RegistrarModule;
    readonly controller: ControllerModule;
    readonly treasury: TreasuryModule;
    constructor(private cfg: XahauNameConfig) {
        if (cfg.wallet && cfg.signer)
            throw new XahauNameError('Specify wallet OR signer', 'INVALID_ARGUMENT');
        if ((!cfg.namespaceId && !cfg.namespaceSeed) || (cfg.namespaceId && cfg.namespaceSeed))
            throw new XahauNameError('Provide exactly one of namespaceId or namespaceSeed for the deployment', 'INVALID_ARGUMENT');
        this.namespaceId = cfg.namespaceId?.toUpperCase() ?? computeNamespaceId(cfg.namespaceSeed);
        if (!/^[A-F0-9]{64}$/.test(this.namespaceId))
            throw new XahauNameError('Invalid namespaceId', 'INVALID_ARGUMENT');
        if (cfg.cacheTtlMs !== undefined && (!Number.isFinite(cfg.cacheTtlMs) || cfg.cacheTtlMs < 0))
            throw new XahauNameError('Invalid cacheTtlMs', 'INVALID_ARGUMENT');
        if (cfg.connectionTimeoutMs !== undefined && (!Number.isSafeInteger(cfg.connectionTimeoutMs) || cfg.connectionTimeoutMs <= 0 || cfg.connectionTimeoutMs > 2147483647))
            throw new XahauNameError('Invalid connectionTimeoutMs', 'INVALID_ARGUMENT');
        decodeAccountID(cfg.treasury);
        this.treasuryAddress = cfg.treasury;
        this.client = new Client(cfg.wss, { maxFeeXAH: cfg.maxFeeXAH ?? '1', connectionTimeout: cfg.connectionTimeoutMs ?? 15000 });
        this.signer = cfg.signer ?? (cfg.wallet ? new WalletSigner(cfg.wallet, this.client) : null);
        const ctx: ClientContext = {
            treasury: cfg.treasury, signerAddress: () => this.signer?.address, readState: this.readState.bind(this), submit: this.submit.bind(this), submitNative: this.submitNative.bind(this), request: this.request.bind(this), ledgerHash: this.getLedgerHash.bind(this), ledgerObject: this.getLedgerObject.bind(this)
        };
        this.context=ctx;
        this.resolver = new ResolverModule(ctx);
        this.registrar = new RegistrarModule(ctx);
        this.controller = new ControllerModule(ctx, cfg.hardcodedTlds ?? ['xah', 'xahau']);
        this.treasury = new TreasuryModule();
    }
    private checkNetwork() {
        if (this.cfg.expectedNetworkId !== undefined && this.client.networkID !== this.cfg.expectedNetworkId)
            throw new XahauNameError('Connected network differs from deployment', 'WRONG_NETWORK');
    }
    async connect(): Promise<void> {
        if (this.connecting) return this.connecting;
        this.connecting = this.connectAndVerify();
        try { await this.connecting; }
        finally { this.connecting = undefined; }
    }
    private async connectAndVerify(): Promise<void> {
        try {
            if (!this.client.isConnected()) {
                try { await this.client.connect(); }
                catch (cause) {
                    throw new XahauNameError(cause instanceof Error ? cause.message : String(cause), 'RPC_CONNECTION_FAILED', {
                        endpoint: this.cfg.wss, connectionTimeoutMs: this.cfg.connectionTimeoutMs ?? 15000, phase: 'connect',
                    });
                }
            }
            this.checkNetwork();
            if (this.cfg.hookHashes) {
                // Do not enter read recovery while verifying that same connection.
                const r = (await this.client.request({ command: 'account_objects', account: this.treasuryAddress, type: 'hook', ledger_index: 'validated' } as any)).result as RpcResult, hashes = (r.account_objects ?? []).flatMap((o: RpcResult) => (o.Hooks ?? []).map((s: RpcResult) => s.Hook?.HookHash));
                for (const expected of Object.values(this.cfg.hookHashes))
                    if (!hashes.includes(expected))
                        throw new XahauNameError('Deployment hook hash is not installed; refresh deployment profile', 'DEPLOYMENT_MISMATCH');
            }
        }
        catch (e) {
            // The transport also clears pending reconnect timers when already closed.
            try { await this.client.disconnect(); } catch { /* Preserve the connection error. */ }
            throw e;
        }
    }
    async disconnect(): Promise<void> {
        await this.client.disconnect();
        this.clearCache();
    }
    isConnected() {
        return this.client.isConnected();
    }
    /** Validated total balance. Reserve/spendable are intentionally not inferred. */
    async getAccountBalance(address: string) {
        decodeAccountID(address);
        this.checkNetwork();
        try {
            const result = await this.request({command:'account_info',account:address,ledger_index:'validated'});
            const data = result.account_data;
            if (result.validated !== true || !data || (typeof data.Balance !== 'string' || !/^\d+$/.test(data.Balance)) || !Number.isSafeInteger(data.OwnerCount) || data.OwnerCount < 0)
                throw new XahauNameError('Invalid validated account balance', 'BAD_RPC_RESPONSE');
            const drops = BigInt(data.Balance), fraction = (drops % 1000000n).toString().padStart(6,'0').replace(/0+$/, '');
            return {balanceDrops:drops.toString(), balanceXah:`${drops / 1000000n}${fraction ? '.'+fraction : ''}`, ownerCount:Number(data.OwnerCount), activated:true};
        } catch (error: any) {
            if (error?.data?.error === 'actNotFound')
                return {balanceDrops:'0',balanceXah:'0',ownerCount:0,activated:false};
            throw error;
        }
    }
    waitForTransaction(hash: string, options: {timeoutMs?:number;intervalMs?:number} = {}) {
        return waitValidated(this.client, hash, options);
    }
    get rawClient() {
        return this.client;
    }
    get signerAddress() {
        return this.signer?.address ?? null;
    }
    /** Attach a wallet session without creating another ledger connection. */
    setSigner(signer:TxSigner|null):void {
        if(signer)decodeAccountID(signer.address);
        this.signer=signer;this.clearCache();
    }
    get hasSigner() {
        return this.signer !== null;
    }
    /** Dynamic JSON RPC is isolated here; modules validate the fields they use. */
    private async request(request: Record<string, unknown>): Promise<RpcResult> {
        // Only immutable ledger reads may share an in-flight transport request.
        // No TTL, no moving ledger/queue/fee cache, and no signing/submit reuse.
        if(['ledger_entry','account_objects'].includes(String(request.command))&&typeof request.ledger_hash==='string'&&/^[a-f0-9]{64}$/i.test(request.ledger_hash)){
            const key=JSON.stringify(request),existing=this.pinnedReads.get(key);
            if(existing)return structuredClone(await existing);
            const pending=this.requestOnceWithRecovery(request);this.pinnedReads.set(key,pending);
            try{return structuredClone(await pending);}finally{if(this.pinnedReads.get(key)===pending)this.pinnedReads.delete(key);}
        }
        return this.requestOnceWithRecovery(request);
    }
    private async requestOnceWithRecovery(request:Record<string,unknown>):Promise<RpcResult> {
        const reads=['server_info','account_info','account_objects','account_tx','fee','ledger','ledger_entry','tx','ping'];
        try { return (await this.client.request(request as any)).result as RpcResult; }
        catch(error) {
            if(!reads.includes(String(request.command)) || !isTransientRpcError(error))throw error;
            // Retry one read after checking the network and installed deployment.
            // Keep the original ledger_hash; never replay signing or submission.
            await this.connect();
            return (await this.client.request(request as any)).result as RpcResult;
        }
    }
    async getLedgerHash(): Promise<string> {
        const r = await this.request({ command: 'ledger', ledger_index: 'validated', transactions: false }), hash = String(r.ledger_hash ?? r.ledger?.ledger_hash ?? '');
        if (!/^[a-f0-9]{64}$/i.test(hash))
            throw new XahauNameError('Invalid ledger hash', 'BAD_RPC_RESPONSE');
        return hash;
    }
    private ledgerOptions(options: ReadOptions) {
        if (options.ledgerHash && !/^[a-f0-9]{64}$/i.test(options.ledgerHash))
            throw new XahauNameError('Invalid ledger hash', 'INVALID_ARGUMENT');
        return options.ledgerHash ? { ledger_hash: options.ledgerHash } : { ledger_index: 'validated' };
    }
    async getLedgerObject(index: string, options: ReadOptions = {}): Promise<RpcResult | null> {
        if (!/^[a-f0-9]{64}$/i.test(index))
            throw new XahauNameError('Invalid ledger index', 'INVALID_ARGUMENT');
        try {
            return (await this.request({ command: 'ledger_entry', index, ...this.ledgerOptions(options) })).node;
        }
        catch (e: unknown) {
            if ((e as {
                data?: {
                    error?: string;
                };
            })?.data?.error === 'entryNotFound')
                return null;
            throw e;
        }
    }
    async readState(hexKey: string, options: ReadOptions = {}): Promise<Buffer | null> {
        if (!/^[a-f0-9]{64}$/i.test(hexKey))
            throw new XahauNameError('Invalid state key', 'INVALID_ARGUMENT');
        const key = (options.ledgerHash ?? 'validated') + ':' + hexKey.toUpperCase(), cached = this.cache.get(key);
        if (!options.bypassCache && cached && cached.expires > Date.now())
            return cached.value ? Buffer.from(cached.value) : null;
        let data: Buffer | null;
        try {
            const r = await this.request({ command: 'ledger_entry', hook_state: { account: this.treasuryAddress, key: hexKey.toUpperCase(), namespace_id: this.namespaceId }, ...this.ledgerOptions(options) });
            data = Buffer.from(r.node.HookStateData, 'hex');
        }
        catch (e: unknown) {
            if ((e as {
                data?: {
                    error?: string;
                };
            })?.data?.error !== 'entryNotFound')
                throw e;
            data = null;
        }
        if (!options.bypassCache)
            this.cache.set(key, { value: data ? Buffer.from(data) : null, expires: Date.now() + (this.cfg.cacheTtlMs ?? 30000) });
        return data;
    }
    clearCache(): void {
        this.cache.clear();
    }
    /** Native transfer offers have no registrar hook acknowledgement. Never retries a write. */
    private async submitNative(tx: Record<string, unknown>): Promise<SignAndSubmitResult> {
        if (!this.signer) throw new XahauNameError('Signer required', 'NO_SIGNER');
        if (!this.client.isConnected()) await this.connect();
        this.checkNetwork();
        if (!['URITokenCreateSellOffer','URITokenCancelSellOffer'].includes(String(tx.TransactionType)))
            throw new XahauNameError('Unsupported native operation', 'INVALID_ARGUMENT');
        const result = await this.signer.signAndSubmit({...tx, Account:this.signer.address, NetworkID:this.client.networkID});
        this.clearCache();
        if (result.validated !== true) throw new XahauNameError('Transaction confirmation is unknown; check its hash before retrying', 'NOT_VALIDATED', result);
        if (result.engineResult !== 'tesSUCCESS') throw XahauNameError.fromEngineResult(result.engineResult, result);
        return result;
    }
    async submit(tx: Record<string, unknown>, options: SubmitOptions): Promise<TxResult> {
        if (!this.signer)
            throw new XahauNameError('Signer required', 'NO_SIGNER');
        if (!options?.handler || !options.returns?.length)
            throw new XahauNameError('Expected handler acknowledgement required', 'INVALID_ARGUMENT');
        if (!this.client.isConnected()) await this.connect();
        this.checkNetwork();
        if (tx.NetworkID !== undefined && tx.NetworkID !== this.client.networkID)
            throw new XahauNameError('Transaction network differs from connection', 'WRONG_NETWORK');
        const prepared = this.client.networkID !== undefined && this.client.networkID > 1024
            ? { ...tx, NetworkID: this.client.networkID }
            : tx;
        const result = await this.signer.signAndSubmit(prepared);
        this.clearCache();
        return transactionResult(result, this.treasuryAddress, options, this.cfg.hookHashes);
    }
    /** @deprecated Historical owner lookup; use getOwner or resolver.resolveAddress explicitly. */
    resolve(domain: string, options?: ReadOptions) {
        return this.getOwner(domain, options);
    }
    getOwner(domain:string,options?:ReadOptions) {
        return this.resolver.getOwner(domain,{...options,verifyOwner:options?.verifyOwner!==false});
    }
    /** Avatar text is a direct image URI; NFT artwork is an explicit optional fallback. */
    async getAvatar(domain:string,options:ReadOptions & {fallbackToMetadata?:boolean;fetch?:typeof fetch}={}) {
        const opts={...options,ledgerHash:options.ledgerHash??await this.getLedgerHash(),verifyOwner:true};
        if(!await this.resolver.getOwner(domain,opts))return null;
        const uri=await this.resolver.getText(domain,'avatar',opts);
        const url=mediaURL(uri);
        if(url)return{uri:uri!,url,source:'avatar' as const};
        if(!options.fallbackToMetadata)return null;
        const metadata=await this.registrar.getMetadata(domain,opts);
        return metadata?.image?{uri:metadata.image,url:metadata.image,source:'token-metadata' as const}:null;
    }
    root(domain: string, options?: ReadOptions) {
        return this.resolver.getRoot(domain, options);
    }
    describe(domain: string, options?: DescribeOptions) {
        return this.resolver.describe(domain, {...options,verifyOwner:options?.verifyOwner!==false});
    }
    /** Profile, lifecycle and token display data share one operation-local snapshot. */
    async getProfileSnapshot(domain:string,options:DescribeOptions={}):Promise<ProfileSnapshot|null> {
        const opts={...options,bypassCache:true,verifyOwner:true,ledgerHash:options.ledgerHash??await this.getLedgerHash()};
        const ctx=snapshotContext(this.context,opts.ledgerHash),resolver=new ResolverModule(ctx),registrar=new RegistrarModule(ctx);
        const [profile,status]=await Promise.all([resolver.describe(domain,opts),registrar.getRegistrationStatus(domain,opts)]);
        // A rootless registration belongs to the registration/claim view, not a profile.
        if(!profile)return null;
        if(status.stage!=='claimed' || status.owner!==profile.owner)
            throw new XahauNameError('Domain lifecycle is not finalized','OWNERSHIP_MISMATCH');
        const token=await ctx.ledgerObject(status.uritokenId,opts);
        return{ledgerHash:opts.ledgerHash,profile,tokenId:status.uritokenId,uri:Buffer.from(token!.URI,'hex').toString('utf8'),
            transferOffer:typeof token!.Destination==='string'&&typeof token!.Amount==='string'?{destination:token!.Destination,amountDrops:token!.Amount}:null};
    }
    primaryOf(address: string, options?: ReadOptions) {
        return this.resolver.getPrimaryHash(address, options);
    }
    getPrimaryName(address: string, options?: ReadOptions) {
        return this.primaryRead(address,options,false);
    }
    getVerifiedPrimaryName(address:string,options?:ReadOptions) {
        return this.primaryRead(address,options,true);
    }
    private async primaryRead(address:string,options:ReadOptions={},verify=false) {
        decodeAccountID(address);
        const opts={...options,ledgerHash:options.ledgerHash??await this.getLedgerHash()};
        const resolver=new ResolverModule(snapshotContext(this.context,opts.ledgerHash));
        return verify?resolver.getVerifiedPrimaryName(address,opts):resolver.getPrimaryName(address,opts);
    }
    listOwnedDomains(address: string, options?: ReadOptions) {
        return this.resolver.listOwnedDomains(address, options);
    }
    getPortfolio(address:string,options?:ReadOptions) {
        return this.resolver.getPortfolio(address,options);
    }
    /** Quote and lifecycle state at one validated ledger; purchase still rechecks price. */
    async checkDomain(domain:string,options:ReadOptions={}):Promise<DomainQuote> {
        const {label,tld}=splitDomain(domain);domainFields(label,tld);
        const opts={...options,ledgerHash:options.ledgerHash??await this.getLedgerHash()};
        const ctx=snapshotContext(this.context,opts.ledgerHash),registrar=new RegistrarModule(ctx),controller=new ControllerModule(ctx,this.cfg.hardcodedTlds??['xah','xahau']);
        const [status,priceDrops,tldEnabled]=await Promise.all([registrar.getRegistrationStatus(domain,opts),registrar.getPriceForDomain(domain,opts),controller.isTldEnabled(tld,opts)]);
        return{status,priceDrops,tldEnabled,ledgerHash:opts.ledgerHash};
    }
    listIncomingDomains(address: string, options?: ReadOptions & {signal?:AbortSignal}) {
        return this.registrar.listIncomingDomains(address, options);
    }
    async isAvailable(domain: string) {
        return (await this.registrar.getRegistrationStatus(domain)).stage === 'available';
    }
}
export async function resolve(domain: string, cfg: XahauNameConfig): Promise<string | null> {
    const c = new XahauNameClient(cfg);
    await c.connect();
    try {
        return await c.resolve(domain);
    }
    finally {
        await c.disconnect();
    }
}
