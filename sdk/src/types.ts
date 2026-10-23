import type { Wallet } from 'xahau';
export type HookHandler = 'authorization' | 'issuance' | 'set-address' | 'clear-address' | 'set-text' | 'clear-text' | 'control' | 'admin' | 'claim' | 'burn' | 'profile';
export interface XahauNameConfig {
    wss: string;
    treasury: string;
    wallet?: Wallet;
    signer?: TxSigner;
    /** Explicit deployment namespace: provide namespaceId OR namespaceSeed. */
    namespaceId?: string;
    namespaceSeed?: string;
    expectedNetworkId?: number;
    hookHashes?: Partial<Record<HookHandler, string>>;
    cacheTtlMs?: number;
    hardcodedTlds?: readonly string[];
    maxFeeXAH?: string;
}
/** External signer must support Xahau and wait for validated ledger metadata. */
export interface TxSigner {
    readonly address: string;
    signAndSubmit(tx: Record<string, unknown>): Promise<SignAndSubmitResult>;
}
export interface SignAndSubmitResult {
    txHash: string;
    engineResult: string;
    meta: unknown;
    validated?: boolean;
}
export interface ReadOptions {
    bypassCache?: boolean;
    ledgerHash?: string;
    /** Public client owner/profile reads default true; false explicitly requests unverified state. Low-level APIs retain documented defaults. */
    verifyOwner?: boolean;
}
export interface RootRecord {
    owner: string;
    primary: boolean;
    locked: boolean;
    mintedAt: number;
}
export interface PriceTable {
    version: number;
    prices: Record<string, bigint>;
}
export interface DescribeOptions extends ReadOptions {
    addrs?: number[];
    texts?: string[];
}
export interface FullProfile extends RootRecord {
    label: string;
    tld: string;
    domain: string;
    addrs: Record<number, Buffer>;
    texts: Record<string, string>;
    /** Legacy custom records lacking a stored name, indexed by full state-key hex. */
    unnamedTexts: Record<string, string>;
    /** False when legacy custom key names cannot be discovered from current state. */
    textKeysComplete: boolean;
}
export interface RecordKeys {
    addrs: number[];
    texts: string[];
    unnamedTextStateKeys: string[];
}
export interface HookExecutionResult {
    account: string;
    hash: string;
    result: number;
    flags: number;
    returnCode: string;
    returnString: string;
    raw: unknown;
}
export interface SubmitOptions {
    handler: HookHandler;
    returns: readonly string[];
    status?: 'applied' | 'pending';
}
export interface TxResult {
    txHash: string;
    engineResult: string;
    hookReturnCode: number;
    hookReturnString: string;
    status: 'applied' | 'pending';
    hookExecutions: HookExecutionResult[];
    rawMeta: unknown;
}
export interface SetAddrArgs {
    label: string;
    tld: string;
    coinType: number;
    addr: Buffer;
}
export interface ClearAddrArgs {
    label: string;
    tld: string;
    coinType: number;
}
export interface SetTextArgs {
    label: string;
    tld: string;
    key: string;
    value: string;
}
export interface ClearTextArgs {
    label: string;
    tld: string;
    key: string;
}
export interface SetPrimaryArgs {
    label: string;
    tld: string;
    flag: boolean;
}
export interface LabelTldArgs {
    label: string;
    tld: string;
}
export interface BuyArgs extends LabelTldArgs {
    recipient?: string;
    /** URI is constructed by the hook from its on-chain URIBase. */
    uri?: never;
    URI?: never;
    customURI?: never;
    uriBase?: never;
    URIBase?: never;
}
export interface RegisterArgs extends LabelTldArgs {
    recipient: string; /** Required if recipient is treasury. */
    paymentDestination?: string;
    uri?: never;
    URI?: never;
    customURI?: never;
    uriBase?: never;
    URIBase?: never;
}
export interface SetRoleArgs {
    role: string;
    address: string;
    enabled: boolean;
}
export interface SplitDomain {
    label: string;
    tld: string;
}
export type RegistrationStage = 'available' | 'pending' | 'awaitingClaim' | 'claimed' | 'refundPending' | 'recoveryRequired';
export interface RegistrationStatus {
    domain: string;
    uritokenId: string;
    stage: RegistrationStage;
    ledgerHash: string;
    owner?: string;
    tokenOwner?: string;
    recipient?: string;
    amountDrops?: bigint;
}
export interface WaitOptions {
    timeoutMs?: number;
    pollIntervalMs?: number;
    signal?: AbortSignal;
}

export interface SetProfileArgs extends LabelTldArgs {
    set?: Partial<Record<import('./protocol').ProfileTextKey,string>>;
    clear?: import('./protocol').ProfileTextKey[];
}

export interface IncomingDomain {
    domain:string;
    uritokenId:string;
    sender:string;
    recipient:string;
    kind:'registration'|'transfer';
}
export interface IncomingDomains {
    offers:IncomingDomain[];
    ledgerHash:string;
    /** Earliest ledger covered by the RPC node's available account history. */
    historyMinLedger:number;
}
