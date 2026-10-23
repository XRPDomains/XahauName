// Readonly browser-test fixture. No provider, signing or app wallet session is involved.
import {createWalletButton,XAHAU_TESTNET} from '@xrpl-wallet-kit/client';
import {XahauNameClient,TESTNET_V2} from '@xahauname/sdk';
import {createBalanceResolver} from '../src/wallet-balance';
export async function mountReadOnlyBalance(target:HTMLElement){
 const client=new XahauNameClient({...TESTNET_V2,cacheTtlMs:0});await client.connect();
 const address='rw5W1Ljeg7T4JionCu2hKzWeUus7XQ9qs';
 const session={adapterId:'readonly-fixture',connectedAt:Date.now(),account:{address,network:XAHAU_TESTNET}};
 const manager:any={getSession:()=>session,on:()=>()=>{},getTransactions:()=>[]};
 let refreshDelay=0;
 const resolver=createBalanceResolver(client,async()=>{});
 const button=createWalletButton({target,manager,modal:{onClose:()=>()=>{},open:()=>{}} as any,showWeb3Name:false,showBalance:true,balanceResolver:async context=>{if(refreshDelay)await new Promise(resolve=>setTimeout(resolve,refreshDelay));return resolver(context);}});
 await button.refreshBalance();
 return{balance:session as any,refreshWithDelay:async(ms:number)=>{refreshDelay=ms;try{await button.refreshBalance();}finally{refreshDelay=0;}},dispose:async()=>{button.destroy();await client.disconnect();}};
}
