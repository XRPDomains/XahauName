import type {ClientContext} from './context';
import type {DescribeOptions,ProfileSnapshot} from './types';
import {ResolverModule} from './resolver';
import {RegistrarModule} from './registrar';
import {XahauNameError} from './errors';

/** The caller supplies an operation-local, pinned context. */
export async function readProfileSnapshot(ctx:ClientContext,domain:string,options:DescribeOptions):Promise<ProfileSnapshot|null> {
    const resolver=new ResolverModule(ctx),registrar=new RegistrarModule(ctx);
    const [profile,status]=await Promise.all([resolver.describe(domain,options),registrar.getRegistrationStatus(domain,options)]);
    if(!profile)return null;
    if(status.stage!=='claimed'||status.owner!==profile.owner)throw new XahauNameError('Domain lifecycle is not finalized','OWNERSHIP_MISMATCH');
    const token=await ctx.ledgerObject(status.uritokenId,options);
    return {ledgerHash:options.ledgerHash!,profile,tokenId:status.uritokenId,uri:Buffer.from(token!.URI,'hex').toString('utf8'),
        transferOffer:typeof token!.Destination==='string'&&typeof token!.Amount==='string'?{destination:token!.Destination,amountDrops:token!.Amount}:null};
}
