import {assertWalletKitSession,createWalletKitSigner,type WalletKitSession} from '../../sdk/src/wallet-kit';
import {CHAIN} from './config';
export {waitValidated} from '../../sdk/src/confirmation';
export const NETWORK=CHAIN.walletKitId;
export const MAX_FEE='1000000';
export function assertNetwork(manager:Pick<WalletKitSession,'getAccount'|'getNetwork'>,address?:string){return assertWalletKitSession(manager,NETWORK,address);}
/** @deprecated Use assertNetwork. */
export const assertTestnet=assertNetwork;
export function createWalletSigner(manager:WalletKitSession,rpc:{request(request:any):Promise<any>},submitted:(hash:string)=>void){
    return createWalletKitSigner(manager,rpc,{network:NETWORK,networkId:CHAIN.networkId,maxFeeDrops:MAX_FEE,onSubmitted:submitted});
}
