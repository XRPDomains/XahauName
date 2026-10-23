import { rootKey, addrKey, textKey, primaryOfKey, decodeRoot, splitDomain, joinDomain, recoveryKey, recordsKey, textSlotKey } from './util';
import { parameters, domainFields, coinBytes, boolBytes, addressBytes, textKeyBytes, textValueBytes, HANDLERS, profilePatchFields, PROFILE_TEXT_KEYS } from './protocol';
import type { Operation } from './protocol';
import type { ClientContext } from './context';
import type { RootRecord, SetProfileArgs, ReadOptions, DescribeOptions, FullProfile, RecordKeys, SetPrimaryArgs, SetAddrArgs, ClearAddrArgs, SetTextArgs, ClearTextArgs, LabelTldArgs } from './types';
import { XahauNameError } from './errors';
import { encodeAddress,decodeAddress,canonicalAddressBytes } from './addresses';
import {validateProfileValue} from './text-records';
import {normalizeContentURI,encodeContentHash} from './content';
import { decodeAccountID } from 'xahau';
import { domainIdentity, tokenMatchesDomain, domainOfToken } from './identity';
import {snapshotContext,mapReads} from './read-snapshot';
import type {OwnedDomainSummary,PortfolioSnapshot} from './types';
export class ResolverModule {
    constructor(private ctx: ClientContext) {
    }
    async exists(domain: string, options?: ReadOptions) {
        return (await this.getRoot(domain, options)) !== null;
    }
    async getRoot(domain: string, options: ReadOptions = {}): Promise<RootRecord | null> {
        const { label, tld } = splitDomain(domain);
        domainFields(label, tld);
        const [recovery,buf]=await Promise.all([this.ctx.readState(recoveryKey(label,tld),options),this.ctx.readState(rootKey(label,tld),options)]);
        if(recovery)throw new XahauNameError('Domain lifecycle requires reconciliation','OWNERSHIP_MISMATCH');
        if (!buf)
            return null;
        return decodeRoot(buf);
    }
    async getOwner(domain: string, options: ReadOptions = {}): Promise<string | null> {
        const opts = options.verifyOwner ? { ...options, ledgerHash: options.ledgerHash ?? await this.ctx.ledgerHash() } : options, root = await this.getRoot(domain, opts);
        if (!root)
            return null;
        if (options.verifyOwner) {
            const identity = await domainIdentity(this.ctx, domain, opts), token = await this.ctx.ledgerObject(identity.id, opts);
            if (!token || token.Owner !== root.owner || !await tokenMatchesDomain(this.ctx, token, identity, opts))
                throw new XahauNameError('Root and URIToken owner differ', 'OWNERSHIP_MISMATCH');
        }
        return root.owner;
    }
    getAddr(domain: string, coinType: number, options?: ReadOptions) {
        coinBytes(coinType);
        const { label, tld } = splitDomain(domain);
        domainFields(label, tld);
        return this.ctx.readState(addrKey(label, tld, coinType), options);
    }
    /** ENS-like missing-address semantics; getAddr retains its existing null result. */
    async addr(domain:string,coinType:number,options?:ReadOptions):Promise<Buffer> {
        return await this.getAddr(domain,coinType,options) ?? Buffer.alloc(0);
    }
    /** A receiving record is separate from native domain ownership. No owner fallback. */
    async resolveAddress(domain:string,coinType=21337,options?:ReadOptions):Promise<string|null> {
        const opts={...options,ledgerHash:options?.ledgerHash??await this.ctx.ledgerHash(),verifyOwner:true};
        if(!await this.getOwner(domain,opts))return null;
        const bytes=await this.getAddr(domain,coinType,opts);
        if(!bytes)return null;
        const result=decodeAddress(coinType,bytes);
        if(result.format!=='address')throw new XahauNameError('Address record requires an unsupported or invalid codec','BAD_ADDRESS');
        return result.value;
    }
    setAddress(a:import('./types').LabelTldArgs & {coinType:number;address:string}) {
        return this.setAddr({...a,addr:encodeAddress(a.coinType,a.address)});
    }
    async text(domain:string,key:string,options?:ReadOptions):Promise<string> {
        return await this.getText(domain,key,options) ?? '';
    }
    setContentURI(a:LabelTldArgs & {uri:string}) {
        return this.setText({...a,key:'contenthash',value:normalizeContentURI(a.uri)});
    }
    clearContentURI(a:LabelTldArgs) {return this.clearText({...a,key:'contenthash'});}
    async getContentURI(domain:string,options:ReadOptions={}):Promise<string|null> {
        const opts={...options,ledgerHash:options.ledgerHash??await this.ctx.ledgerHash(),verifyOwner:true};
        if(!await this.getOwner(domain,opts))return null;
        const value=await this.getText(domain,'contenthash',opts);
        return value===null?null:normalizeContentURI(value);
    }
    async getContentHash(domain:string,options?:ReadOptions):Promise<Buffer|null> {
        const uri=await this.getContentURI(domain,options);return uri?encodeContentHash(uri):null;
    }
    async getText(domain: string, key: string, options?: ReadOptions) {
        textKeyBytes(key);
        const { label, tld } = splitDomain(domain);
        domainFields(label, tld);
        const buf = await this.ctx.readState(textKey(label, tld, key), options);
        if(!buf)return null;
        try{return new TextDecoder('utf-8',{fatal:true}).decode(buf);}catch{throw new XahauNameError('Invalid UTF-8 text record','BAD_STATE');}
    }
    async getPrimaryHash(address: string, options?: ReadOptions): Promise<string | null> {
        const buf = await this.ctx.readState(primaryOfKey(address), options);
        if (!buf)
            return null;
        if (buf.length !== 32)
            throw new XahauNameError('Invalid primary record', 'BAD_STATE');
        return buf.toString('hex').toUpperCase();
    }
    /** Kept for compatibility: returns root hash, not a domain name. */
    getPrimary(address: string, options?: ReadOptions) {
        return this.getPrimaryHash(address, options);
    }
    async listOwnedDomains(address: string, options: ReadOptions = {}): Promise<string[]> {
        decodeAccountID(address);
        const opts={...options,ledgerHash:options.ledgerHash??await this.ctx.ledgerHash()};
        const scoped=new ResolverModule(snapshotContext(this.ctx,opts.ledgerHash));
        return(await scoped.ownedRecords(address,opts)).map(record=>record.domain);
    }
    async getPortfolio(address:string,options:ReadOptions={}):Promise<PortfolioSnapshot> {
        decodeAccountID(address);
        const opts={...options,ledgerHash:options.ledgerHash??await this.ctx.ledgerHash()};
        const scoped=new ResolverModule(snapshotContext(this.ctx,opts.ledgerHash));
        const [domains,primaryHash]=await Promise.all([scoped.ownedRecords(address,opts),scoped.getPrimaryHash(address,opts)]);
        const primary=primaryHash?domains.find(record=>{const {label,tld}=splitDomain(record.domain);return rootKey(label,tld)===primaryHash&&record.primary;})?.domain:null;
        if(primaryHash&&!primary)throw new XahauNameError('Primary reverse map does not match an owned primary domain','OWNERSHIP_MISMATCH');
        return{address,ledgerHash:opts.ledgerHash,domains,primary:primary??null};
    }
    private async ownedRecords(address:string,options:ReadOptions):Promise<OwnedDomainSummary[]> {
        decodeAccountID(address);
        const opts=options,records=new Map<string,OwnedDomainSummary>();
        let marker: unknown, pages = 0;
        do {
            const r = await this.ctx.request({
                command: 'account_objects', account: address, ledger_hash: opts.ledgerHash, limit: 200, ...(marker ? { marker } : {})
            });
            const tokens=(r.account_objects??[]).filter((token:any)=>token.LedgerEntryType==='URIToken'&&token.Issuer===this.ctx.treasury&&token.Owner===address);
            await mapReads(tokens,async(token:any)=>{
                const name = await domainOfToken(this.ctx, token, opts);
                if (!name) return;
                const {label,tld}=splitDomain(name);
                const [journal,bytes]=await Promise.all([this.ctx.readState(recoveryKey(label,tld),opts),this.ctx.readState(rootKey(label,tld),opts)]);
                if(journal)throw new XahauNameError('Domain lifecycle requires reconciliation','OWNERSHIP_MISMATCH');
                const root=bytes?decodeRoot(bytes):null;
                if (!root && address === this.ctx.treasury)
                    return;
                if (!root || root.owner !== address)
                    throw new XahauNameError('Native token ownership is not finalized in root: ' + name, 'OWNERSHIP_MISMATCH');
                records.set(name,{domain:name,tokenId:token.index.toUpperCase(),uri:Buffer.from(token.URI,'hex').toString('utf8'),primary:root.primary});
            });
            marker = r.marker;
            if (++pages > 100)
                throw new XahauNameError('Owner enumeration pagination limit', 'RPC_LIMIT');
        } while (marker);
        return [...records.values()].sort((a,b)=>a.domain.localeCompare(b.domain));
    }
    async getPrimaryName(address: string, options: ReadOptions = {}): Promise<string | null> {
        const opts = { ...options, ledgerHash: options.ledgerHash ?? await this.ctx.ledgerHash() };
        const scoped=new ResolverModule(snapshotContext(this.ctx,opts.ledgerHash)),hash=await scoped.getPrimaryHash(address,opts);
        if (!hash)
            return null;
        for (const name of await scoped.listOwnedDomains(address, opts)) {
            const { label, tld } = splitDomain(name);
            if (rootKey(label, tld) === hash) {
                const root = await scoped.getRoot(name, opts);
                if (root?.primary)
                    return name;
            }
        }
        throw new XahauNameError('Primary reverse map does not match an owned primary domain', 'OWNERSHIP_MISMATCH');
    }
    /** XNIP-0004 draft: native XAH primary, forward-confirmed at one validated ledger.
     * The historical getPrimaryName remains an owned-domain identity lookup. */
    async getVerifiedPrimaryName(address:string,options:ReadOptions={}):Promise<string|null> {
        decodeAccountID(address);
        const opts={...options,ledgerHash:options.ledgerHash??await this.ctx.ledgerHash(),verifyOwner:true};
        const name=await this.getPrimaryName(address,opts);
        if(!name)return null;
        if(await this.getOwner(name,opts)!==address)return null;
        const receiving=await this.getAddr(name,21337,opts);
        if(!receiving)return null;
        let canonical:Buffer;
        try {canonical=canonicalAddressBytes(21337,receiving);}catch{return null;}
        // Full canonical bytes preserve tag differences; never compare just AccountID.
        return canonical.equals(encodeAddress(21337,address))?name:null;
    }
    async getRecordKeys(domain: string, options: ReadOptions = {}): Promise<RecordKeys> {
        const {label, tld} = splitDomain(domain); domainFields(label, tld);
        const opts = {...options, ledgerHash: options.ledgerHash ?? await this.ctx.ledgerHash()};
        const idx = await this.ctx.readState(recordsKey(label, tld), opts);
        const out: RecordKeys = {addrs: [], texts: [], unnamedTextStateKeys: []};
        if (!idx) return out;
        const bad = () => {throw new XahauNameError('Invalid records index', 'BAD_STATE');};
        if (idx.length !== 124 || idx[0] !== 1 || idx.readUInt16BE(1) > 15 || idx[3] > 15) bad();
        for (let i = 0; i < idx.readUInt16BE(1); i++) {
            const coin = idx.readUInt16BE(4 + i * 2);
            if (out.addrs.includes(coin)) bad();
            out.addrs.push(coin);
        }
        const standard = ['avatar','description','url','email','notice','keywords','com.twitter','com.github','com.discord','com.reddit','com.linkedin','org.telegram','name','location','contenthash','display','mail','phone'];
        // Descriptor slots are independent; avoid a round trip per custom key in series.
        const customSlots:number[]=[];
        for(let i=0;i<idx[3];i++)if(idx[34+i*6]===255){
            const slot=idx[35+i*6];if(slot>=15||customSlots.includes(slot))bad();customSlots.push(slot);
        }
        const slotValues=new Map(await mapReads(customSlots,async slot=>[slot,await this.ctx.readState(textSlotKey(label,tld,slot),opts)] as const));
        const slots = new Set<number>(), stateKeys = new Set<string>();
        for (let i = 0; i < idx[3]; i++) {
            const off = 34 + i * 6, tag = idx[off];
            let name: string | undefined, stateKey: string;
            if (tag === 255) {
                const slot = idx[off + 1];
                if (slot >= 15 || slots.has(slot)) bad();
                slots.add(slot);
                const stored = slotValues.get(slot);
                if (!stored || stored.length < 32 || stored.length > 72) bad();
                stateKey = stored!.subarray(0, 32).toString('hex').toUpperCase();
                if (stored!.length > 32) {
                    const raw = stored!.subarray(32);
                    name = raw.toString('ascii');
                    if (!/^[a-z0-9._-]{1,40}$/.test(name) || !Buffer.from(name).equals(raw) || textKey(label, tld, name) !== stateKey) bad();
                }
            } else {
                if (tag >= standard.length) bad();
                name = standard[tag]; stateKey = textKey(label, tld, name);
            }
            if (stateKeys.has(stateKey)) bad();
            stateKeys.add(stateKey);
            if (name !== undefined) out.texts.push(name);
            else out.unnamedTextStateKeys.push(stateKey);
        }
        out.addrs.sort((a,b) => a-b); out.texts.sort(); out.unnamedTextStateKeys.sort();
        return out;
    }
    async describe(domain: string, options: DescribeOptions = {}): Promise<FullProfile | null> {
        const opts={...options,ledgerHash:options.ledgerHash??await this.ctx.ledgerHash()};
        return new ResolverModule(snapshotContext(this.ctx,opts.ledgerHash)).describeSnapshot(domain,opts);
    }
    private async describeSnapshot(domain:string,options:DescribeOptions):Promise<FullProfile|null> {
        const opts = { ...options, ledgerHash: options.ledgerHash ?? await this.ctx.ledgerHash() }, root = await this.getRoot(domain, opts);
        if (!root)
            return null;
        const { label, tld } = splitDomain(domain), addrs: Record<number, Buffer> = {}, texts: Record<string, string> = {}, unnamedTexts: Record<string, string> = {};
        const [keys]=await Promise.all([this.getRecordKeys(domain, opts),options.verifyOwner?this.getOwner(domain,opts):Promise.resolve()]);
        await Promise.all([...(options.addrs ?? keys.addrs).map(async (ct) => {
                const v = await this.getAddr(domain, ct, opts);
                if (v)
                    addrs[ct] = v;
            }), ...(options.texts ?? keys.texts).map(async (key) => {
                const v = await this.getText(domain, key, opts);
                if (v !== null)
                    Object.defineProperty(texts, key, {value: v, enumerable: true, writable: true, configurable: true});
            }), ...(options.texts === undefined ? keys.unnamedTextStateKeys : []).map(async key => {
                const value = await this.ctx.readState(key, opts);
                if (value !== null) unnamedTexts[key] = new TextDecoder('utf-8',{fatal:true}).decode(value);
            })]);
        return {
            ...root, label, tld, domain: joinDomain(label, tld), addrs, texts, unnamedTexts,
            textKeysComplete: keys.unnamedTextStateKeys.length === 0
        };
    }
    private write(op: Operation, fields: Record<string, Buffer>, ack: string, handler: import('./types').HookHandler = HANDLERS[op]) {
        const signer = this.ctx.signerAddress();
        if (!signer)
            throw new XahauNameError('Signer required', 'NO_SIGNER');
        return this.ctx.submit({ TransactionType: 'Invoke', ...(signer === this.ctx.treasury ? {} : { Destination: this.ctx.treasury }), HookParameters: parameters(op, fields) }, { handler, returns: [ack] });
    }
    setPrimary(a: SetPrimaryArgs) {
        return this.write('setPrimary', { ...domainFields(a.label, a.tld), flag: boolBytes(a.flag) }, 'primary');
    }
    setAddr(a: SetAddrArgs) {
        return this.write('setAddr', { ...domainFields(a.label, a.tld), coinType: coinBytes(a.coinType), addr: addressBytes(a.addr) }, 'addr set');
    }
    clearAddr(a: ClearAddrArgs) {
        return this.write('clearAddr', { ...domainFields(a.label, a.tld), coinType: coinBytes(a.coinType) }, 'addr cleared');
    }
    setText(a: SetTextArgs) {
        return this.write('setText', { ...domainFields(a.label, a.tld), key: textKeyBytes(a.key), value: textValueBytes(a.value) }, 'text set');
    }
    /** One atomic Invoke; returns null without signing when the patch is already applied. */
    async setProfile(a: SetProfileArgs): Promise<import('./types').TxResult|null> {
        if(!this.ctx.signerAddress())throw new XahauNameError('Signer required','NO_SIGNER');
        const domain=domainFields(a.label,a.tld);
        for(const [key,value]of Object.entries(a.set??{}))validateProfileValue(joinDomain(a.label,a.tld),key,value);
        const wire=profilePatchFields(a.set,a.clear);
        const ledgerHash=await this.ctx.ledgerHash(), opts={ledgerHash,bypassCache:true};
        const header=wire.profile, changedSet:Record<string,string>={}, changedClear:import('./protocol').ProfileTextKey[]=[];
        const setMask=header.readUInt16BE(1),clearMask=header.readUInt16BE(3);
        await Promise.all(PROFILE_TEXT_KEYS.map(async(key,i)=>{
            if(!((setMask|clearMask)&(1<<i)))return;
            const current=await this.getText(joinDomain(a.label,a.tld),key,opts);
            if(setMask&(1<<i)){const value=wire['p'+i].toString('utf8');if(current!==value)changedSet[key]=value;}
            else if(current!==null)changedClear.push(key);
        }));
        if(!Object.keys(changedSet).length&&!changedClear.length)return null;
        return this.write('setText',{...domain,...profilePatchFields(changedSet,changedClear)},'profile set','profile');
    }
    clearText(a: ClearTextArgs) {
        return this.write('clearText', { ...domainFields(a.label, a.tld), key: textKeyBytes(a.key) }, 'text cleared');
    }
    /** @deprecated Owner profile locking is retired. Opcode 8 is also rejected on-chain. */
    async lock(_a: LabelTldArgs): Promise<import('./types').TxResult> {
        throw new XahauNameError('Owner profile locking is disabled by SDK policy', 'UNSUPPORTED_OPERATION');
    }
    reset(a: LabelTldArgs) {
        return this.write('reset', domainFields(a.label, a.tld), 'reset');
    }
}
