import {createHash} from 'node:crypto';
import {decodeAccountID} from 'xahau';
import {domainFields} from '@xahauname/sdk';
import type {Change, Deployment, Event, Json, Materialized, Receipt} from './types';

export function hex64(value: unknown): string {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) throw new Error('Invalid 256-bit hash');
    return value.toUpperCase();
}
export function stateLedgerIndex(config: Deployment, key: string): string {
    return createHash('sha512').update(Buffer.concat([Buffer.from([0, 0x76]),
        Buffer.from(decodeAccountID(config.treasury)), Buffer.from(hex64(key), 'hex'),
        Buffer.from(hex64(config.namespaceId), 'hex')])).digest().subarray(0, 32).toString('hex').toUpperCase();
}
export function canonicalName(value: string): string | null {
    const parts = value.split('.');
    try {if (parts.length !== 2) return null; domainFields(parts[0], parts[1]); return value === value.toLowerCase() ? value : null;} catch {return null;}
}
export function nameFromParameters(tx: Json): string | null {
    const fields: Json = Object.create(null);
    for (const row of tx.HookParameters ?? []) {
        const p = row.HookParameter;
        if (!p || typeof p.HookParameterName !== 'string' || typeof p.HookParameterValue !== 'string') continue;
        fields[Buffer.from(p.HookParameterName, 'hex').toString()] = Buffer.from(p.HookParameterValue, 'hex').toString();
    }
    return canonicalName(`${fields.label}.${fields.tld}`);
}
/** A reviewed handler receipt is necessary, but committed state is checked separately. */
export function reconciliationToken(receipt: Receipt, config: Deployment): string | null {
    if(receipt.meta.TransactionResult!=='tesSUCCESS'||receipt.tx.TransactionType!=='Invoke')return null;
    const fields: Record<string,string>=Object.create(null);
    for(const row of receipt.tx.HookParameters??[]) {
        const p=row.HookParameter; if(!p||typeof p.HookParameterName!=='string'||typeof p.HookParameterValue!=='string')return null;
        const key=Buffer.from(p.HookParameterName,'hex').toString();
        if(Object.hasOwn(fields,key))return null;
        fields[key]=p.HookParameterValue.toUpperCase();
    }
    if(fields.xn_v!=='02'||fields.op!=='11'||!fields.token||!/^[A-F0-9]{64}$/.test(fields.token))return null;
    const ok=(receipt.meta.HookExecutions??[]).some((r:Json)=>{const e=r.HookExecution??r;return e.HookAccount===config.treasury&&
        e.HookHash===config.hookHashes.claim&&Number(e.HookResult)===3&&/^0{1,16}$/.test(String(e.HookReturnCode))&&
        Buffer.from(e.HookReturnString??'','hex').toString().replace(/\0+$/,'')==='reconciled';});
    return ok?fields.token:null;
}
/** Pure metadata decoder. No RPC/DB calls; committed nodes, not return strings, drive mutations. */
export function decodeTransaction(receipt: Receipt, config: Deployment, before: Materialized) {
    if (receipt.validated !== true) throw new Error('Unvalidated transaction');
    const hash = hex64(receipt.hash); hex64(receipt.ledgerHash);
    if (!Number.isSafeInteger(receipt.ledgerIndex) || receipt.ledgerIndex < 1 ||
        !Number.isSafeInteger(receipt.meta.TransactionIndex) || receipt.meta.TransactionIndex < 0 ||
        typeof receipt.meta.TransactionResult !== 'string' || !Array.isArray(receipt.meta.AffectedNodes)) throw new Error('Incomplete metadata');
    if (receipt.tx.NetworkID !== undefined && receipt.tx.NetworkID !== config.expectedNetworkId) throw new Error('Transaction network mismatch');
    const executions = (receipt.meta.HookExecutions ?? []).map((r: Json) => r.HookExecution ?? r)
        .filter((e: Json) => e.HookAccount === config.treasury);
    const known = new Set(Object.values(config.hookHashes).map(h => h!.toUpperCase()));
    if (executions.some((e: Json) => !known.has(hex64(e.HookHash)))) throw new Error('Unknown hook version: update deployment and replay; checkpoint unchanged');
    const changes: Change[] = [], events: Event[] = [], tokenIds = new Set<string>();
    const add = (type: string, data: Json, tokenId?: string) => events.push({schemaVersion: 1,
        id: `${config.expectedNetworkId}:${hash}:${events.length}`, networkId: config.expectedNetworkId,
        ledgerIndex: receipt.ledgerIndex, ledgerHash: receipt.ledgerHash, transactionIndex: receipt.meta.TransactionIndex,
        txHash: hash, ordinal: events.length, type, tokenId, data});
    if (receipt.meta.TransactionResult !== 'tesSUCCESS') {
        if (executions.length || receipt.tx.Destination === config.treasury || receipt.tx.Account === config.treasury)
            add('OperationRejected', {engineResult: receipt.meta.TransactionResult, executions});
        return {changes, events, tokenIds: [] as string[], failedWeak: false};
    }
    for (const wrapper of receipt.meta.AffectedNodes) {
        const deleted = !!wrapper.DeletedNode, node = wrapper.CreatedNode ?? wrapper.ModifiedNode ?? wrapper.DeletedNode;
        if (!node) throw new Error('Invalid affected node');
        const f = node.NewFields ?? node.FinalFields;
        if (!f) throw new Error('Missing affected-node fields');
        if (node.LedgerEntryType === 'HookState') {
            const key = hex64(f.HookStateKey);
            if (stateLedgerIndex(config, key) !== hex64(node.LedgerIndex)) continue;
            if (!deleted && (typeof f.HookStateData !== 'string' || !/^(?:[a-f0-9]{2})*$/i.test(f.HookStateData))) throw new Error('Malformed HookStateData');
            const value = deleted ? null : f.HookStateData.toUpperCase();
            changes.push({table: 'state', key, value});
            add('StateChanged', {key, value});
        } else if (node.LedgerEntryType === 'URIToken') {
            const id = hex64(node.LedgerIndex);
            if (f.Issuer !== config.treasury && before.tokens[id]?.Issuer !== config.treasury) continue;
            const value = deleted ? null : {...f, index: id, LedgerEntryType: 'URIToken'};
            changes.push({table: 'tokens', key: id, value}); tokenIds.add(id);
            const prev = before.tokens[id], parent = receipt.tx.EmitDetails?.EmitParentTxnID;
            if (deleted) add('NativeTokenBurned', {previousOwner: f.Owner, parent}, id);
            else if (wrapper.CreatedNode) add('DomainMinted', {owner: f.Owner, parent}, id);
            else if (prev?.Owner && prev.Owner !== f.Owner) add('NativeOwnerChanged', {previousOwner: prev.Owner, owner: f.Owner}, id);
            if (!deleted && f.Amount !== undefined && (prev?.Amount !== f.Amount || prev?.Destination !== f.Destination))
                add('DomainOfferCreated', {owner: f.Owner, destination: f.Destination, amount: f.Amount, parent}, id);
            else if (prev?.Amount !== undefined && (deleted || f.Amount === undefined))
                add('DomainOfferRemoved', {previousOwner: prev.Owner}, id);
        } else if (node.LedgerEntryType === 'Hook' && (f.Account === config.treasury || receipt.tx.Account === config.treasury)) {
            // Configuration is fixed to a reviewed hash set. Never decode a silent upgrade with an old decoder.
            throw new Error('Hook deployment changed: stop and configure the reviewed deployment before replay');
        }
    }
    const failedWeak = executions.some((e: Json) => Number(e.HookResult) !== 3 || !/^0{1,16}$/.test(String(e.HookReturnCode)));
    if (failedWeak) add('HookExecutionFailed', {executions, nativeResult: 'tesSUCCESS'});
    if (receipt.tx.TransactionType === 'Payment' && receipt.tx.Account === config.treasury && receipt.tx.EmitDetails)
        add('RefundSettled', {destination: receipt.tx.Destination, amount: receipt.tx.Amount, parent: receipt.tx.EmitDetails.EmitParentTxnID});
    return {changes, events, tokenIds: [...tokenIds], failedWeak};
}
