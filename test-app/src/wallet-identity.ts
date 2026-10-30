import type {WalletIdentityResolver} from '@xrpl-wallet-kit/client';
import type {XahauNameClient} from '@xahauname/sdk';
import {CHAIN} from './config';

/** Resolve identity through the app SDK and its configured deployment/transport. */
export function createIdentityResolver(client:Pick<XahauNameClient,'read'>,candidate?:(address:string)=>string|undefined):WalletIdentityResolver {
 return async(address,session,context)=>{
  const network=session.account.network;
  if(address!==session.account.address||network?.id!==CHAIN.walletKitId||network.family!=='xahau'||network.networkId!==CHAIN.networkId)return null;
  const name=await client.read.getName({address,name:context?.force?undefined:candidate?.(address),bypassCache:context?.force===true});
  return name?{name,source:'xahauname',verified:true}:null;
 };
}
