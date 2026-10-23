/** Optional HTTP read model. Every response retains the indexed ledger and lag; writes remain ledger-backed. */
export interface IndexerStatus {
    networkId: number;
    indexedThroughLedger: number | null;
    ledgerHash: string | null;
    observedHead: number | null;
    lag: number | null;
    lastSuccessfulSyncAt?: string | null;
    lastError?: string | null;
}
export interface IndexedDomain {
    domain: string;
    tokenId: string;
    status: 'claimed' | 'pending' | 'awaitingClaim' | 'refundPending' | 'recoveryRequired';
    owner?: string;
    nativeOwner?: string;
    recipient?: string;
    reason?: string;
    verifiedPrimary?: boolean;
    addrs?: Record<string, string>;
    texts?: Record<string, string>;
    unnamedTexts?: Record<string, string>;
    textKeysComplete?: boolean;
    offer?: {destination?: string; amount: unknown; seller: string} | null;
}
export interface IndexedResponse<T> {status: IndexerStatus; data: T}
export class IndexerReadClient {
    constructor(private options: {url: string; networkId: number; fetch?: typeof fetch}) {
        const url = new URL(options.url);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Indexer must use HTTP(S)');
    }
    private async read<T>(route: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<IndexedResponse<T>> {
        const url = new URL(this.options.url.replace(/\/$/, '') + route);
        for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
        const r = await (this.options.fetch ?? fetch)(url, {signal});
        if (!r.ok) throw new Error('Indexer request failed: HTTP ' + r.status);
        const result = await r.json() as IndexedResponse<T>;
        if (!result?.status || result.status.networkId !== this.options.networkId) throw new Error('Indexer network mismatch');
        if (result.status.indexedThroughLedger !== null && (!Number.isSafeInteger(result.status.indexedThroughLedger) || result.status.indexedThroughLedger < 1)) throw new Error('Invalid indexer checkpoint');
        return result;
    }
    describe(domain: string, signal?: AbortSignal) {return this.read<IndexedDomain | null>('/profile', {domain}, signal);}
    listOwnedDomains(address: string, signal?: AbortSignal) {return this.read<string[]>('/owned', {address}, signal);}
    listIncomingOffers(address: string, signal?: AbortSignal) {return this.read<IndexedDomain[]>('/incoming', {address}, signal);}
    getVerifiedPrimaryName(address: string, signal?: AbortSignal) {return this.read<string | null>('/primary', {address}, signal);}
    listRecovery(signal?: AbortSignal) {return this.read<IndexedDomain[]>('/recovery', {}, signal);}
    events(after = 0, limit = 100, signal?: AbortSignal) {return this.read<Array<Record<string, unknown>>>('/events', {after: String(after), limit: String(limit)}, signal);}
}
