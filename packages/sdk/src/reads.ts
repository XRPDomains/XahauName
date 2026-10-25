import {readProfileSnapshot} from './profile-read';
import type {ClientContext} from './context';
import type {ReadOptions,DescribeOptions} from './types';
import {ResolverModule,decodeNamesCursor} from './resolver';
import {RegistrarModule} from './registrar';
import {ControllerModule} from './controller';
import {snapshotContext} from './read-snapshot';
import {beforeDeadline,positiveMilliseconds} from './deadline';
import {decodeAddress} from './addresses';
import {splitDomain,rootKey} from './util';
import {domainFields} from './protocol';
import {XahauNameError} from './errors';
import {encodeContentHash,normalizeContentURI} from './content';

export interface ReadRequest extends Omit<ReadOptions,'verifyOwner'> {timeoutMs?:number}
export interface NameRequest extends ReadRequest {name:string}
export interface RecordsRequest extends NameRequest {addresses?:number[];texts?:string[];contentHash?:boolean}

/** Verified reads with named arguments. A session pins all its calls to one ledger. */
export class ReadModule {
    constructor(private ctx:ClientContext,private ready:()=>Promise<void>,private tlds:readonly string[],private pinned?:string) {}
    private async run<T>(options:ReadRequest,read:(ctx:ClientContext,opts:ReadOptions)=>Promise<T>):Promise<T> {
        const deadline=Date.now()+positiveMilliseconds(options.timeoutMs??15000,'read timeout');
        return beforeDeadline(async()=>{
            await this.ready();
            const hash=(this.pinned??options.ledgerHash??await this.ctx.ledgerHash()).toUpperCase();
            // snapshotContext also rejects a different explicitly requested ledger.
            const ctx=this.pinned?this.ctx:snapshotContext(this.ctx,hash);
            if(options.ledgerHash&&options.ledgerHash.toUpperCase()!==hash.toUpperCase())throw new XahauNameError('Snapshot ledger mismatch','INVALID_ARGUMENT');
            return read(ctx,{...options,ledgerHash:hash,verifyOwner:true});
        },deadline,options.signal);
    }
    snapshot(options:ReadRequest={}) {
        return this.run(options,async(ctx,opts)=>new ReadModule(ctx,this.ready,this.tlds,opts.ledgerHash));
    }
    getOwner(args:NameRequest){return this.run(args,(ctx,opts)=>new ResolverModule(ctx).getOwner(args.name,opts));}
    getAddress(args:NameRequest&{coinType?:number}){return this.run(args,(ctx,opts)=>new ResolverModule(ctx).resolveAddress(args.name,args.coinType??21337,opts));}
    getText(args:NameRequest&{key:string}){return this.run(args,async(ctx,opts)=>{
        const resolver=new ResolverModule(ctx);
        return await resolver.getOwner(args.name,opts)?resolver.getText(args.name,args.key,opts):null;
    });}
    getRecords(args:RecordsRequest){return this.run(args,async(ctx,opts)=>{
        const texts=args.texts===undefined?undefined:[...new Set([...args.texts,...(args.contentHash?['contenthash']:[])])];
        const profile=await new ResolverModule(ctx).describe(args.name,{...opts,addrs:args.addresses,texts});
        if(!profile)return null;
        const contentURI=args.contentHash&&profile.texts.contenthash?normalizeContentURI(profile.texts.contenthash):null;
        return {name:profile.domain,owner:profile.owner,addresses:Object.fromEntries(Object.entries(profile.addrs).map(([coin,bytes])=>[coin,decodeAddress(Number(coin),bytes)])),
            ...(args.contentHash?{contentURI,contentHash:contentURI?encodeContentHash(contentURI).toString('hex'):null}:{}),
            texts:profile.texts,unnamedTexts:profile.unnamedTexts,complete:args.addresses===undefined&&args.texts===undefined&&profile.textKeysComplete,
            ledgerHash:opts.ledgerHash!,source:'ledger' as const};
    });}
    getProfile(args:NameRequest&Pick<DescribeOptions,'addrs'|'texts'>){return this.run(args,(ctx,opts)=>readProfileSnapshot(ctx,args.name,{...opts,addrs:args.addrs,texts:args.texts}));}
    getName(args:ReadRequest&{address:string;name?:string}){return this.run(args,async(ctx,opts)=>{
        const resolver=new ResolverModule(ctx);
        if(!args.name)return resolver.getVerifiedPrimaryName(args.address,opts);
        const {label,tld}=splitDomain(args.name);domainFields(label,tld);
        if(await resolver.getPrimaryHash(args.address,opts)!==rootKey(label,tld))return null;
        const root=await resolver.getRoot(args.name,opts);
        return root?.primary&&await resolver.getOwner(args.name,opts)===args.address&&await resolver.resolveAddress(args.name,21337,opts)===args.address?label+'.'+tld:null;
    });}
    getDomain(args:NameRequest){return this.run(args,(ctx,opts)=>new RegistrarModule(ctx).getRegistrationStatus(args.name,opts));}
    getQuote(args:NameRequest){return this.run(args,async(ctx,opts)=>{
        const {label,tld}=splitDomain(args.name);domainFields(label,tld);
        const registrar=new RegistrarModule(ctx),controller=new ControllerModule(ctx,this.tlds);
        const [status,priceDrops,tldEnabled]=await Promise.all([registrar.getRegistrationStatus(args.name,opts),registrar.getPriceForDomain(args.name,opts),controller.isTldEnabled(tld,opts)]);
        return {status,priceDrops,tldEnabled,ledgerHash:opts.ledgerHash!};
    });}
    async getNames(args:ReadRequest&{address:string;cursor?:string;limit?:number}){
        const hash=args.cursor?decodeNamesCursor(args.cursor,args.address).hash:args.ledgerHash;
        if(args.ledgerHash&&hash&&args.ledgerHash.toUpperCase()!==hash.toUpperCase())throw new XahauNameError('Cursor ledger mismatch','INVALID_ARGUMENT');
        return this.run({...args,ledgerHash:hash},(ctx,opts)=>new ResolverModule(ctx).listOwnedDomainsPage(args.address,{...opts,cursor:args.cursor,limit:args.limit}));
    }
}
