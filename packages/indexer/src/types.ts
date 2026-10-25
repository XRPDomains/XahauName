import type {XahauNameConfig} from '@xahauname/sdk';
export type Json = Record<string, any>;
export interface Deployment extends XahauNameConfig {namespaceId: string; expectedNetworkId: number; hookHashes: NonNullable<XahauNameConfig['hookHashes']>}
export interface Receipt {validated: true; hash: string; ledgerIndex: number; ledgerHash: string; tx: Json; meta: Json}
export interface Checkpoint {ledgerIndex: number; ledgerHash: string}
export interface Event {
    schemaVersion: 1; id: string; networkId: number; ledgerIndex: number; ledgerHash: string;
    transactionIndex: number; txHash: string; ordinal: number; type: string;
    domain?: string; tokenId?: string; data: Json;
}
export type Table = 'state' | 'tokens' | 'domains' | 'recovery';
export interface Change {table: Table; key: string; value: any | null}
export interface Batch {
    checkpoint: Checkpoint; receipts: Receipt[]; events: Event[]; changes: Change[];
    /** Local ordered-replay evidence, not a consensus transaction-root proof. */
    ledgerEvidence?:{transactionCount:number;receiptHashesSha256:string};
}
export interface Materialized {
    state: Record<string, string>; tokens: Record<string, Json>; domains: Record<string, Json>; recovery: Record<string, string>;
}
/** All methods are synchronous; commit must atomically persist the entire ledger. */
export interface Storage {
    bind(identity: string): void;
    checkpoint(): Checkpoint | null;
    load(): Materialized;
    commit(batch: Batch): void;
    events(after?: number, limit?: number): Array<Event & {cursor: number}>;
    close(): void;
}
export interface Rpc {
    request(request: Json): Promise<{result: Json}>;
}
export interface LedgerSource {
    connect(): Promise<void>; disconnect(): Promise<void>;
    latest(): Promise<Checkpoint>;
    /** Header-only checkpoint verification; custom sources can retain the ledger fallback. */
    header?(index:number):Promise<{checkpoint:Checkpoint;parentHash:string}>;
    /** A wake-up hint only. Replay always validates complete contiguous ledgers. */
    waitForLedger?(signal:AbortSignal,timeoutMs:number):Promise<void>;
    ledger(index: number): Promise<{checkpoint: Checkpoint; parentHash: string; receipts: Receipt[]}>;
    snapshot(checkpoint: Checkpoint): Promise<Materialized>;
}
