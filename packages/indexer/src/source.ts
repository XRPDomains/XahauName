import {Client} from 'xahau';
import {hex64, stateLedgerIndex} from './decoder';
import {emptyState} from './storage';
import type {Checkpoint, Deployment, Json, LedgerSource, Receipt, Rpc} from './types';

export class XahauLedgerSource implements LedgerSource {
    private client: Client;
    private subscribed=false;
    constructor(private config: Deployment, client?: Client) {
        this.client = client ?? new Client(config.wss);
        this.client.on?.('disconnected',()=>{this.subscribed=false;});
    }
    async connect() {
        if (!this.client.isConnected()) await this.client.connect();
        if (this.client.networkID !== this.config.expectedNetworkId) {
            await this.client.disconnect(); throw new Error('RPC network does not match deployment');
        }
    }
    async disconnect() {this.subscribed=false;await this.client.disconnect();}
    async waitForLedger(signal:AbortSignal,timeoutMs:number) {
        if(signal.aborted)return;
        await new Promise<void>((resolve,reject)=>{
            const done=(error?:unknown)=>{clearTimeout(timer);signal.removeEventListener('abort',abort);this.client.removeListener('ledgerClosed',closed);error?reject(error):resolve();};
            const abort=()=>done(),closed=()=>done();
            const timer=setTimeout(closed,timeoutMs);
            signal.addEventListener('abort',abort,{once:true});this.client.on('ledgerClosed',closed);
            if(signal.aborted){abort();return;}
            if(!this.subscribed)void this.request({command:'subscribe',streams:['ledger']}).then(()=>{this.subscribed=true;},done);
        });
    }
    private async request(request: Json): Promise<Json> {return (await this.client.request(request as any)).result;}
    async latest(): Promise<Checkpoint> {
        const r = await this.request({command: 'ledger', ledger_index: 'validated', transactions: false});
        return checkedHeader(r).checkpoint;
    }
    async ledger(index: number) {
        const r = await this.request({command: 'ledger', ledger_index: index, transactions: true, expand: true, binary: false});
        return decodeLedger(r, index);
    }
    async header(index:number) {
        const result=checkedHeader(await this.request({command:'ledger',ledger_index:index,transactions:false,expand:false}));
        if(result.checkpoint.ledgerIndex!==index)throw new Error('Ledger header index mismatch');
        return result;
    }
    /** Explicit full-ledger scan at one pinned hash; potentially expensive on public RPC. */
    async snapshot(checkpoint: Checkpoint) {
        const header = await this.request({command: 'ledger', ledger_hash: checkpoint.ledgerHash, transactions: false});
        const checked = checkedHeader(header).checkpoint;
        if (checked.ledgerIndex !== checkpoint.ledgerIndex || checked.ledgerHash !== hex64(checkpoint.ledgerHash)) throw new Error('Snapshot header mismatch');
        const hooks = await this.request({command: 'account_objects', account: this.config.treasury, type: 'hook', ledger_hash: checked.ledgerHash});
        const installed = (hooks.account_objects ?? []).flatMap((o: Json) => (o.Hooks ?? []).map((h: Json) => h.Hook?.HookHash));
        const expected = Object.values(this.config.hookHashes);
        if (installed.filter(Boolean).length !== expected.length || expected.some(h => !installed.includes(h)))
            throw new Error('Snapshot hook hashes do not match the reviewed deployment');
        const out = emptyState(); let marker: unknown;
        const markers = new Set<string>();
        do {
            const r = await this.request({command: 'ledger_data', ledger_hash: checkpoint.ledgerHash, binary: false, limit: 2048, ...(marker ? {marker} : {})});
            if (hex64(r.ledger_hash) !== checked.ledgerHash || !Array.isArray(r.state)) throw new Error('Incomplete pinned snapshot');
            for (const node of r.state) {
                if (node.LedgerEntryType === 'HookState' && typeof node.HookStateKey === 'string' &&
                    stateLedgerIndex(this.config, node.HookStateKey) === hex64(node.index)) {
                    if (typeof node.HookStateData !== 'string' || !/^(?:[a-f0-9]{2})*$/i.test(node.HookStateData)) throw new Error('Malformed snapshot state');
                    out.state[hex64(node.HookStateKey)] = node.HookStateData.toUpperCase();
                } else if (node.LedgerEntryType === 'URIToken' && node.Issuer === this.config.treasury) out.tokens[hex64(node.index)] = node;
            }
            marker = r.marker;
            if (marker) {
                const encoded = JSON.stringify(marker);
                if (markers.has(encoded)) throw new Error('Repeated snapshot pagination marker'); markers.add(encoded);
            }
        } while (marker);
        return out;
    }
}
function checkedHeader(r: Json) {
    const l = r.ledger;
    if (r.validated !== true || !l || !Number.isSafeInteger(Number(l.ledger_index)) || Number(l.ledger_index) < 1) throw new Error('Missing validated ledger header');
    return {checkpoint: {ledgerIndex: Number(l.ledger_index), ledgerHash: hex64(r.ledger_hash ?? l.ledger_hash)}, parentHash: hex64(l.parent_hash)};
}
/** Exported for deterministic tests against expanded ledger fixtures. */
export function decodeLedger(r: Json, expectedIndex: number) {
    const header = checkedHeader(r), txs = r.ledger.transactions;
    if (header.checkpoint.ledgerIndex !== expectedIndex || !Array.isArray(txs)) throw new Error('Incomplete expanded ledger');
    const receipts: Receipt[] = txs.map((row: Json) => {
        const tx = row.tx_json ?? row.tx ?? row;
        const meta = row.metaData ?? row.meta;
        if (!meta || typeof meta !== 'object') throw new Error('Expanded ledger metadata missing; archival node required');
        return {validated: true, hash: hex64(row.hash ?? tx.hash), ledgerIndex: expectedIndex,
            ledgerHash: header.checkpoint.ledgerHash, tx, meta};
    });
    receipts.sort((a, b) => a.meta.TransactionIndex - b.meta.TransactionIndex);
    if (new Set(receipts.map(r => r.hash)).size !== receipts.length || receipts.some((r, i) => r.meta.TransactionIndex !== i))
        throw new Error('Missing or duplicate ledger transaction positions');
    return {...header, receipts};
}
