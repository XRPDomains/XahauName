// Read-only deployment check. No signer, seed or transaction submission.
const assert=require('node:assert/strict');
const {XahauNameClient,TESTNET}=require('../dist');
(async()=>{const c=new XahauNameClient(TESTNET);try{
 await c.connect();assert.equal(c.rawClient.networkID,21338);
 assert(await c.registrar.getPricing());assert(await c.registrar.getURIBase());
 assert((await c.getAccountBalance(TESTNET.treasury)).activated);
 if(process.env.SDK_READ_DOMAIN)console.log(JSON.stringify(await c.describe(process.env.SDK_READ_DOMAIN,{verifyOwner:true}),(_k,v)=>typeof v==='bigint'?v.toString():v));
 console.log('Read-only testnet deployment: PASS');
}finally{await c.disconnect();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
