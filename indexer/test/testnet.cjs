// Read-only transport/expanded-ledger check. Does not bootstrap a database or submit a transaction.
const assert=require('node:assert/strict');const {resolveNetworkConfig}=require('@xahauname/sdk');const {XahauLedgerSource}=require('../dist');
async function main(){const c=resolveNetworkConfig({network:'testnet',wss:process.env.XAHAU_WSS||undefined}),source=new XahauLedgerSource(c);try{await source.connect();const cp=await source.latest();const l=await source.ledger(cp.ledgerIndex);assert.deepEqual(l.checkpoint,cp);console.log(JSON.stringify({networkId:c.expectedNetworkId,validated:true,ledger:cp.ledgerIndex,transactions:l.receipts.length,readOnly:true}));}finally{await source.disconnect();}}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
