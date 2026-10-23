import type { ReadOptions, SubmitOptions, TxResult, SignAndSubmitResult } from './types';
/** RPC response bodies vary by ledger object and command. */
export type RpcResult = Record<string, any>;
export interface ClientContext {
    treasury: string;
    signerAddress(): string | undefined;
    readState(key: string, options?: ReadOptions): Promise<Buffer | null>;
    request(request: Record<string, unknown>): Promise<RpcResult>;
    ledgerHash(): Promise<string>;
    ledgerObject(index: string, options?: ReadOptions): Promise<RpcResult | null>;
    submitNative?(tx: Record<string, unknown>): Promise<SignAndSubmitResult>;
    submit(tx: Record<string, unknown>, options: SubmitOptions): Promise<TxResult>;
}
