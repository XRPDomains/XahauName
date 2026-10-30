import {STANDARD_TEXT_KEYS} from "./protocol.generated";
import { rootKey, addrKey, textKey, primaryOfKey, decodeRoot, splitDomain, joinDomain, recoveryKey, recordsKey, textSlotKey } from './util';
import { parameters, domainFields, coinBytes, boolBytes, addressBytes, textKeyBytes, textValueBytes, HANDLERS, profilePatchFields, PROFILE_TEXT_KEYS } from './protocol';
import type { Operation } from './protocol';
import type { ClientContext } from './context';
import type { RootRecord, SetProfileArgs, ReadOptions, DescribeOptions, FullProfile, RecordKeys, SetPrimaryArgs, SetAddrArgs, ClearAddrArgs, SetTextArgs, ClearTextArgs, LabelTldArgs } from './types';
import { XahauNameError } from './errors';
import { encodeAddress,decodeAddress } from './addresses';
import {validateProfileValue} from './text-records';
import {normalizeContentURI,encodeContentHash} from './content';
import { decodeAccountID } from 'xahau';
import { domainIdentity, tokenMatchesDomain, domainOfToken } from './identity';
import {snapshotContext,mapReads} from './read-snapshot';
import type {OwnedDomainSummary,PortfolioSnapshot} from './types';
export class ResolverModule {
    constructor(private ctx: ClientContext) {
    }
    /** One ledger page. A cursor binds pagination to its address and immutable ledger. */
    async listOwnedDomainsPage(address:string,options:ReadOptions&{cursor?:string;limit?:number}={}) {
        decodeAccountID(address);
        const limit=options.limit??50;
        if(!Number.isSafeInteger(limit)||limit<1||limit>200)throw new XahauNameError('Page limit must be 1..200','INVALID_ARGUMENT');
        let marker:unknown,hash=options.ledgerHash;
        if(options.cursor){
            const cursor=decodeNamesCursor(options.cursor,address);
            if(hash&&hash.toUpperCase()!==cursor.hash)throw new XahauNameError('Cursor ledger mismatch','INVALID_ARGUMENT');
            hash=cursor.hash;marker=cursor.marker;
        }
        hash??=await this.ctx.ledgerHash();
        const opts={...options,ledgerHash:hash},ctx=snapshotContext(this.ctx,hash);
        const result=await ctx.request({command:'account_objects',account:address,ledger_hash:hash,limit,...(marker!==undefined?{marker}:{})});
        if(!Array.isArray(result.account_objects))throw new XahauNameError('Invalid account objects page','BAD_RESPONSE');
        if(result.marker!==undefined&&JSON.stringify(result.marker)===JSON.stringify(marker))throw new XahauNameError('Repeated account objects marker','BAD_RESPONSE');
        const items=(await mapReads(result.account_objects,async(token:any):Promise<OwnedDomainSummary|null>=>{
            if(token.LedgerEntryType!=='URIToken'||token.Issuer!==ctx.treasury||token.Owner!==address)return null;
            const name=await domainOfToken(ctx,token,opts);if(!name)return null;
            const {label,tld}=splitDomain(name),root=await new ResolverModule(ctx).getRoot(name,opts);
            if(!root&&address===ctx.treasury)return null;
            if(!root||root.owner!==address)throw new XahauNameError('Native token ownership is not finalized in root: '+name,'OWNERSHIP_MISMATCH');
            return {domain:name,tokenId:token.index.toUpperCase(),uri:Buffer.from(token.URI,'hex').toString('utf8'),primary:root.primary,mintedAt:root.mintedAt};
        })).filter((item):item is OwnedDomainSummary=>item!==null);
        const nextCursor=result.marker===undefined?null:Buffer.from(JSON.stringify({v:1,address,hash:hash.toUpperCase(),marker:result.marker})).toString('base64url');
        if(nextCursor&&nextCursor.length>8192)throw new XahauNameError('Oversized pagination marker','BAD_RESPONSE');
        return {items,ledgerHash:hash,nextCursor,complete:nextCursor===null,source:'ledger' as const};
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
    /** Omit coinType for verified ownership; specify it for an explicit receiving record. */
    async resolveAddress(domain:string,coinType?:number,options?:ReadOptions):Promise<string|null> {
        const opts={...options,ledgerHash:options?.ledgerHash??await this.ctx.ledgerHash(),verifyOwner:true};
        const owner=await this.getOwner(domain,opts);
        if(!owner||coinType===undefined)return owner;
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
        const records=new Map<string,OwnedDomainSummary>(),cursors=new Set<string>();let cursor:string|undefined;
        for(let page=0;;page++) {
            if(page>=100)throw new XahauNameError('Owner enumeration pagination limit','RPC_LIMIT');
            const next=await this.listOwnedDomainsPage(address,{...options,cursor,limit:200});
            for(const item of next.items)records.set(item.domain,item);
            if(next.nextCursor===null)break;
            if(cursors.has(next.nextCursor))throw new XahauNameError('Repeated account objects marker','BAD_RESPONSE');
            cursors.add(next.nextCursor);cursor=next.nextCursor;
        }
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
    /** XNIP-0004: primary selection and native custody verified at one ledger. */
    async getVerifiedPrimaryName(address:string,options:ReadOptions={}):Promise<string|null> {
        decodeAccountID(address);
        const opts={...options,ledgerHash:options.ledgerHash??await this.ctx.ledgerHash(),verifyOwner:true};
        const name=await this.getPrimaryName(address,opts);
        return name&&await this.getOwner(name,opts)===address?name:null;
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
        const standard=STANDARD_TEXT_KEYS;
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
        if((options.addrs?.length??0)+(options.texts?.length??0)>64)
            throw new XahauNameError('Select at most 64 record keys per read','INVALID_ARGUMENT');
        for(const coin of options.addrs??[])coinBytes(coin);
        for(const key of options.texts??[])textKeyBytes(key);
        const opts={...options,ledgerHash:options.ledgerHash??await this.ctx.ledgerHash()};
        return new ResolverModule(snapshotContext(this.ctx,opts.ledgerHash)).describeSnapshot(domain,opts);
    }
    private async describeSnapshot(domain:string,options:DescribeOptions):Promise<FullProfile|null> {
        const opts = { ...options, ledgerHash: options.ledgerHash ?? await this.ctx.ledgerHash() }, root = await this.getRoot(domain, opts);
        if (!root)
            return null;
        const { label, tld } = splitDomain(domain), addrs: Record<number, Buffer> = {}, texts: Record<string, string> = {}, unnamedTexts: Record<string, string> = {};
        const explicit=options.addrs!==undefined&&options.texts!==undefined;
        const [keys]=await Promise.all([explicit?Promise.resolve({addrs:[],texts:[],unnamedTextStateKeys:[]}):this.getRecordKeys(domain, opts),options.verifyOwner?this.getOwner(domain,opts):Promise.resolve()]);
        const reads:Array<()=>Promise<void>>=[...[...new Set(options.addrs ?? keys.addrs)].map(ct=>async()=>{
                const v = await this.getAddr(domain, ct, opts);
                if (v)
                    addrs[ct] = v;
            }), ...[...new Set(options.texts ?? keys.texts)].map(key=>async()=>{
                const v = await this.getText(domain, key, opts);
                if (v !== null)
                    Object.defineProperty(texts, key, {value: v, enumerable: true, writable: true, configurable: true});
            }), ...(options.texts === undefined ? keys.unnamedTextStateKeys : []).map(key=>async()=>{
                const value = await this.ctx.readState(key, opts);
                if (value !== null) unnamedTexts[key] = new TextDecoder('utf-8',{fatal:true}).decode(value);
            })];
        await mapReads(reads,read=>read());
        return {
            ...root, label, tld, domain: joinDomain(label, tld), addrs, texts, unnamedTexts,
            textKeysComplete: !explicit&&keys.unnamedTextStateKeys.length === 0
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

export function decodeNamesCursor(value:string,address:string):{hash:string;marker:unknown} {
    try {
        if(value.length>8192||!value.length)throw new Error();
        const cursor=JSON.parse(Buffer.from(value,'base64url').toString());
        if(cursor.v!==1||cursor.address!==address||typeof cursor.hash!=='string'||!/^[A-F0-9]{64}$/.test(cursor.hash)||cursor.marker===undefined)throw new Error();
        return cursor;
    } catch {throw new XahauNameError('Invalid owned-domain cursor','INVALID_ARGUMENT');}
}
