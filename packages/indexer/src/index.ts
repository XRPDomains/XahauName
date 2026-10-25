import {createHash} from 'node:crypto';
import type {XahauNameConfig} from '@xahauname/sdk';
import {canonicalName, decodeTransaction, hex64, nameFromParameters, reconciliationToken} from './decoder';
import {util} from '@xahauname/sdk';
import {applyChanges, assertAddress, cleanupComplete, knownNames, projectDomain} from './projection';
import {XahauLedgerSource} from './source';
import {DomainDependencies,DomainCollections,overlayState} from './incremental';
import type {Change, Checkpoint, Deployment, Event, LedgerSource, Materialized, Storage} from './types';
export * from './types';
export * from './decoder';
export * from './source';
export * from './storage';

export interface IndexerOptions {network: XahauNameConfig; storage: Storage; source?: LedgerSource; /** Archive all network receipts only when explicitly requested. */ retainAllReceipts?:boolean}
export class XahauNameIndexer {
    readonly source: LedgerSource;
    private config: Deployment;
    private state: Materialized;
    private dependencies:DomainDependencies;
    private collections:DomainCollections;
    private running = false;
    private locked = false;
    private target: Checkpoint | null = null;
    private lastSuccessfulSyncAt: string | null = null;
    private lastError: string | null = null;
    constructor(private options: IndexerOptions) {
        const c = options.network;
        if (!Number.isSafeInteger(c.expectedNetworkId) || c.expectedNetworkId! < 1 || c.expectedNetworkId! > 0xffffffff ||
            !c.namespaceId || !c.hookHashes || !Object.keys(c.hookHashes).length) throw new Error('Explicit network ID, namespace and known hook hashes required');
        if (c.wallet || c.signer) throw new Error('Indexer configuration must not include a wallet or signer');
        assertAddress(c.treasury); hex64(c.namespaceId); Object.values(c.hookHashes).forEach(hex64);
        this.config = {...c, hookHashes: {...c.hookHashes}, namespaceId: hex64(c.namespaceId), expectedNetworkId: c.expectedNetworkId!};
        const identity = JSON.stringify({decoderVersion: 1, networkId: c.expectedNetworkId, treasury: c.treasury,
            namespace: this.config.namespaceId, hashes: Object.entries(c.hookHashes).sort()});
        options.storage.bind(createHash('sha256').update(identity).digest('hex'));
        this.state = options.storage.load();
        this.dependencies=new DomainDependencies(this.state);
        this.collections=new DomainCollections(this.state);
        this.source = options.source ?? new XahauLedgerSource(this.config);
    }
    /** Must be called explicitly on an empty DB. Snapshot history has no invented events. */
    async bootstrap(checkpoint?: Checkpoint) {
        if (this.locked || this.options.storage.checkpoint()) throw new Error('Bootstrap requires an empty idle database');
        this.locked = true;
        try {
            await this.source.connect(); const cp = checkpoint ?? await this.source.latest();
            const next = await this.source.snapshot(cp), changes: Change[] = [];
            for (const name of knownNames(next)) {
                const profile = await projectDomain(name, next, this.config, cp.ledgerHash);
                if (profile) next.domains[name] = profile;
            }
            for (const table of ['state', 'tokens', 'domains', 'recovery'] as const)
                for (const [key, value] of Object.entries(next[table])) changes.push({table, key, value});
            this.options.storage.commit({checkpoint: cp, receipts: [], events: [], changes}); this.state = next;
            this.dependencies=new DomainDependencies(next);
            this.collections=new DomainCollections(next);
            return this.status();
        } finally {this.locked = false;}
    }
    async applyLedger(ledger: Awaited<ReturnType<LedgerSource['ledger']>>): Promise<Event[]> {
        if (this.locked) throw new Error('Concurrent indexer operation'); this.locked = true;
        const touched=new Set<string>();
        try {
            const cp = this.options.storage.checkpoint();
            if (!cp) throw new Error('Bootstrap a pinned snapshot first');
            if (ledger.checkpoint.ledgerIndex === cp.ledgerIndex && hex64(ledger.checkpoint.ledgerHash) === cp.ledgerHash) return [];
            if (ledger.checkpoint.ledgerIndex !== cp.ledgerIndex + 1 || hex64(ledger.parentHash) !== cp.ledgerHash) throw new Error('Ledger gap or hash mismatch; checkpoint unchanged');
            hex64(ledger.checkpoint.ledgerHash);
            const next=overlayState(this.state), changes: Change[] = [], events: Event[] = [], relevant:typeof ledger.receipts=[];
            const ordered = [...ledger.receipts].sort((a, b) => a.meta.TransactionIndex - b.meta.TransactionIndex);
            if (new Set(ordered.map(r => r.hash)).size !== ordered.length) throw new Error('Duplicate transaction');
            for (const [i, r] of ordered.entries()) {
                if (r.meta.TransactionIndex !== i || r.ledgerIndex !== ledger.checkpoint.ledgerIndex || r.ledgerHash !== ledger.checkpoint.ledgerHash) throw new Error('Incomplete or mixed ledger');
                const decoded = decodeTransaction(r, this.config, next);
                const repairedId=reconciliationToken(r,this.config);
                if (!decoded.changes.length && !decoded.failedWeak && !repairedId) {events.push(...decoded.events);if(decoded.events.length)relevant.push(r);continue;}
                relevant.push(r);
                const names=this.dependencies.affected(decoded.changes),paramName = nameFromParameters(r.tx); if (paramName) names.add(paramName);
                const changed={state:{},tokens:{},domains:{},recovery:{}} as Materialized;
                applyChanges(changed,decoded.changes);
                for(const name of knownNames(changed))names.add(name);
                const previous=new Map([...names].map(name=>[name,next.domains[name]]));
                applyChanges(next, decoded.changes); changes.push(...decoded.changes);
                const txEvents = [...decoded.events];
                const add = (type: string, domain: string, data: Record<string, unknown>, tokenId?: string) => {
                    const ordinal = txEvents.length;
                    txEvents.push({schemaVersion: 1, id: `${this.config.expectedNetworkId}:${r.hash}:${ordinal}`,
                        networkId: this.config.expectedNetworkId, ledgerIndex: r.ledgerIndex, ledgerHash: r.ledgerHash,
                        transactionIndex: r.meta.TransactionIndex, txHash: r.hash, ordinal, type, domain, tokenId, data});
                };
                // No mutation inference from failed transactions or unrelated account traffic.
                if (decoded.changes.length || decoded.failedWeak || repairedId) for (const name of names) {
                    touched.add(name);
                    const old = previous.get(name);
                    let recoveryChanged=false;
                    if(repairedId&&old?.tokenId===repairedId&&paramName===name&&!decoded.failedWeak&&next.recovery[name]) {
                        const {label,tld}=util.splitDomain(name);
                        const candidateState=overlayState(next);delete candidateState.recovery[name];
                        const candidate=await projectDomain(name,candidateState,this.config,r.ledgerHash);
                        const noTracking=[util.recoveryKey(label,tld),util.pendingKey(repairedId),...['mnt','ofr','rfd'].map(t=>util.asyncKey(t as 'mnt'|'ofr'|'rfd',repairedId))].every(k=>next.state[k]===undefined);
                        const completedBurn=!candidate&&!next.tokens[repairedId]&&next.state[util.tokenKey(label,tld)]===undefined&&
                            next.state[util.uriKey(repairedId)]===undefined&&next.state[util.labelOfKey(repairedId)]===undefined;
                        if(noTracking&&(candidate?.status==='claimed'||completedBurn)&&cleanupComplete(old.recoverySnapshot??old,next)) {
                            const change:Change={table:'recovery',key:name,value:null};changes.push(change);applyChanges(next,[change]);
                            add('DomainRecoveryCompleted',name,{status:candidate?.status??'burned'},repairedId);
                        }
                    }
                    const current = await projectDomain(name, next, this.config, r.ledgerHash);
                    const tokenId = old?.tokenId ?? current?.tokenId;
                    const affected = (tokenId && decoded.tokenIds.includes(tokenId)) || paramName === name;
                    if (decoded.failedWeak && affected) {
                        const change: Change = {table: 'recovery', key: name, value: 'Failed hook execution after native success; operator reconciliation required'};
                        changes.push(change); applyChanges(next, [change]);
                        recoveryChanged=true;
                    }
                    if (old?.status === 'claimed' && affected &&
                        (!current || (current.status === 'claimed' && current.owner !== old.owner) ||
                            (current.status === 'recoveryRequired' && decoded.tokenIds.includes(old.tokenId))) && !cleanupComplete(old, next)) {
                        const change: Change = {table: 'recovery', key: name, value: 'Transfer/burn cleanup incomplete; operator reconciliation required'};
                        changes.push(change); applyChanges(next, [change]);
                        recoveryChanged=true;
                    }
                    const value = recoveryChanged?await projectDomain(name, next, this.config, r.ledgerHash):current;
                    // Dependencies are staged as well; restored on any failed commit.
                    if(JSON.stringify(old??null)!==JSON.stringify(value))applyChanges(next,[{table:'domains',key:name,value}]);
                    this.dependencies.update(name,next);
                    if (JSON.stringify(old ?? null) === JSON.stringify(value)) continue;
                    const change: Change = {table: 'domains', key: name, value}; changes.push(change); applyChanges(next, [change]);
                    if (value?.status === 'recoveryRequired') add('DomainRecoveryRequired', name, value, value.tokenId);
                    else if (old?.status === 'claimed' && !value) add('DomainBurned', name, {}, old.tokenId);
                    else if (value?.status === 'claimed' && old?.status !== 'claimed') add('DomainClaimed', name, value, value.tokenId);
                    else if (value?.status === 'claimed' && old?.owner !== value.owner) add('DomainTransferred', name, value, value.tokenId);
                    else add('DomainUpdated', name, {before: old ?? null, after: value}, value?.tokenId ?? old?.tokenId);
                }
                events.push(...txEvents);
            }
            this.options.storage.commit({checkpoint: ledger.checkpoint, receipts: this.options.retainAllReceipts?ordered:relevant, events, changes,
                ledgerEvidence:{transactionCount:ordered.length,receiptHashesSha256:createHash('sha256').update(ordered.map(receipt=>receipt.hash).join('')).digest('hex')}});
            applyChanges(this.state,changes);
            for(const name of touched)this.collections.update(name,this.state.domains[name]);
            return events;
        } catch(error) {for(const name of touched)this.dependencies.update(name,this.state);throw error;}
        finally {this.locked = false;}
    }
    async syncOnce() {
        try {await this.syncToHead(); this.lastSuccessfulSyncAt = new Date().toISOString(); this.lastError = null; return this.status();}
        catch (e) {this.lastError = e instanceof Error ? e.message : String(e); throw e;}
    }
    private async syncToHead() {
        await this.source.connect();
        const cp = this.options.storage.checkpoint(); if (!cp) throw new Error('Call bootstrap() explicitly before syncing');
        this.target = await this.source.latest();
        if (cp.ledgerIndex > this.target.ledgerIndex) throw new Error('Server is behind local checkpoint');
        // Validate the stored checkpoint even if no new ledger has closed.
        const anchor = this.source.header?await this.source.header(cp.ledgerIndex):await this.source.ledger(cp.ledgerIndex);
        if (hex64(anchor.checkpoint.ledgerHash) !== cp.ledgerHash) throw new Error('Stored checkpoint hash differs from server');
        for (let i = cp.ledgerIndex + 1; i <= this.target.ledgerIndex; i++) await this.applyLedger(await this.source.ledger(i));
        return this.status();
    }
    /** Ledger-close wake-ups plus polling fallback; reconnect/backfill from the committed checkpoint. */
    async start(options: {signal: AbortSignal; intervalMs?: number; onError?: (e: unknown) => void}) {
        if (this.running) throw new Error('Indexer is already running'); this.running = true;
        const interval = options.intervalMs ?? 4000;
        if (!Number.isFinite(interval) || interval < 100) {this.running = false; throw new Error('Invalid polling interval');}
        try {
            while (!options.signal.aborted) {
                try {await this.syncOnce();} catch (e) {if (!options.onError) throw e; options.onError(e);}
                if (!options.signal.aborted&&this.source.waitForLedger) {
                    try{await this.source.waitForLedger(options.signal,interval);}catch(error){if(!options.onError)throw error;options.onError(error);await pollingDelay(options.signal,interval);}
                } else if (!options.signal.aborted) await new Promise<void>(resolve => {
                    const done = () => {clearTimeout(timer); options.signal.removeEventListener('abort', done); resolve();};
                    const timer = setTimeout(done, interval); options.signal.addEventListener('abort', done, {once: true});
                    if(options.signal.aborted)done();
                });
            }
        } finally {this.running = false; await this.source.disconnect();}
    }
    status() {const cp = this.options.storage.checkpoint(); return {networkId: this.config.expectedNetworkId,
        indexedThroughLedger: cp?.ledgerIndex ?? null, ledgerHash: cp?.ledgerHash ?? null,
        observedHead: this.target?.ledgerIndex ?? null, lag: cp && this.target ? Math.max(0, this.target.ledgerIndex - cp.ledgerIndex) : null,
        lastSuccessfulSyncAt: this.lastSuccessfulSyncAt, lastError: this.lastError};}
    describe(domain: string) {if (!canonicalName(domain)) throw new Error('Use a canonical domain such as alice.xah'); return structuredClone(this.state.domains[domain] ?? null);}
    listOwnedDomains(owner: string) {assertAddress(owner);return this.collections.owned(owner);}
    listOwnedDomainsPage(owner:string,options:{after?:string;limit?:number}={}){
        const limit=options.limit??50;if(!Number.isSafeInteger(limit)||limit<1||limit>200)throw new Error('Page limit must be 1..200');
        const names=this.listOwnedDomains(owner).filter(name=>!options.after||name>options.after),items=names.slice(0,limit);
        return {items,nextCursor:names.length>limit?items.at(-1)!:null,checkpoint:this.options.storage.checkpoint(),source:'indexer' as const};
    }
    listIncomingOffers(destination: string) {assertAddress(destination);return this.collections.incoming(destination).map(name=>structuredClone(this.state.domains[name]));}
    listRecovery() {return this.collections.recovery().map(name=>structuredClone(this.state.domains[name]));}
    getVerifiedPrimaryName(owner: string) {assertAddress(owner);return this.collections.owned(owner).find(name=>this.state.domains[name].verifiedPrimary)??null;}
    events(after = 0, limit = 100) {return this.options.storage.events(after, limit);}
}
export function createIndexer(options: IndexerOptions) {return new XahauNameIndexer(options);}
function pollingDelay(signal:AbortSignal,ms:number){
    if(signal.aborted)return Promise.resolve();
    return new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,ms);signal.addEventListener('abort',done,{once:true});if(signal.aborted)done();});
}
