// Readonly browser-test fixture. No provider, signing or app wallet session is involved.
import {createWalletButton,XAHAU_TESTNET} from '@xrpl-wallet-kit/client';
import {XahauNameClient,TESTNET_V2} from '@xahauname/sdk';
import {createBalanceResolver} from '../src/wallet-balance';
export async function mountReadOnlyBalance(target:HTMLElement){
 const client=new XahauNameClient({...TESTNET_V2,cacheTtlMs:0});await client.connect();
 const address='rw5W1Ljeg7T4JionCu2hKzWeUus7XQ9qs';
 const session={adapterId:'readonly-fixture',connectedAt:Date.now(),account:{address,network:XAHAU_TESTNET}};
 const manager:any={getSession:()=>session,on:()=>()=>{},getTransactions:()=>[]};
 const button=createWalletButton({target,manager,modal:{onClose:()=>()=>{},open:()=>{}} as any,showWeb3Name:false,showBalance:true,balanceResolver:createBalanceResolver(client,async()=>{})});
 await button.refreshBalance();
 return{balance:session as any,dispose:async()=>{button.destroy();await client.disconnect();}};
}
