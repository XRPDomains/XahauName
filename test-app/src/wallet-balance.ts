import type {WalletBalanceResolver} from '@xrpl-wallet-kit/client';
import type {XahauNameClient} from '@xahauname/sdk';
import {CHAIN} from './config';
/** Wallet Kit uses the SDK WebSocket, avoiding a separate HTTP/CORS balance path. */
export function createBalanceResolver(client:Pick<XahauNameClient,'getAccountBalance'>,ready:()=>Promise<void>):WalletBalanceResolver {
 return async({address,network,signal})=>{
  if(network?.id!==CHAIN.walletKitId)throw new Error('Wallet network does not match the configured deployment.');
  signal?.throwIfAborted();await ready();signal?.throwIfAborted();
  const balance=await client.getAccountBalance(address);signal?.throwIfAborted();
  return{value:balance.balanceXah,formatted:balance.balanceXah+' XAH',symbol:'XAH',total:balance.balanceXah,totalFormatted:balance.balanceXah+' XAH',ownerCount:balance.ownerCount,activationStatus:balance.activated?'active':'unfunded',raw:balance};
 };
}
