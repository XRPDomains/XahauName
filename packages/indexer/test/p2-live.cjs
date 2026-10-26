// Explicit bounded read-only bootstrap/native-state comparison. Never signs or submits.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Client}=require('xahau');
const {resolveNetworkConfig,XahauNameClient}=require('@xahauname/sdk');
const {createIndexer,SqliteStorage,XahauLedgerSource}=require('../dist');
async function main(){
 assert.equal(process.env.P2_INDEXER_READONLY,'1','Explicit read-only bootstrap authorization required');
 const out=process.env.P2_INDEXER_OUTPUT,resume=process.env.P2_INDEXER_RESUME_OWNER_VERIFY==='1';
 assert(out&&(resume?fs.existsSync(out):!fs.existsSync(out)),'Choose a fresh output directory or explicit owner-check resume');fs.mkdirSync(out,{recursive:true});
 if(resume){const previous=JSON.parse(fs.readFileSync(path.join(out,'summary.json'),'utf8'));assert.equal(previous.result,'FAIL');assert.equal(previous.error,'Read deadline exceeded');fs.writeFileSync(path.join(out,'owner-deadline-first-attempt.json'),JSON.stringify(previous,null,2)+'\n',{flag:'wx'});}
 const config=resolveNetworkConfig({network:'testnet'}),rpc=new Client(config.wss,{connectionTimeout:6000,timeout:20000});
 const requests={},started=Date.now(),request=rpc.request.bind(rpc);
 rpc.request=async(q,...args)=>{assert(!['submit','sign','wallet_propose'].includes(q.command));requests[q.command]=(requests[q.command]??0)+1;
  if(q.command==='ledger_data'&&(requests.ledger_data>200||Date.now()-started>180000))throw Error('Read-only full-ledger bootstrap budget reached; no production capacity claim');
  return request(q,...args);};
 const source=new XahauLedgerSource(config,rpc),database=path.join(out,'projection.sqlite');let store=new SqliteStorage(database);
 const sdk=new XahauNameClient(config);let report={networkId:21338,readOnly:true,requests,result:'IN_PROGRESS'};
 try{
  const indexer=createIndexer({network:config,storage:store,source});
  if(resume){await source.connect();const cp=store.checkpoint();assert(cp,'Owner verification requires completed bootstrap');assert.deepEqual((await source.header(cp.ledgerIndex)).checkpoint,cp);}
  else await indexer.bootstrap();const cp=store.checkpoint(),materialized=store.load();
  const entries=[];let marker;const markers=new Set();do{
   const result=(await rpc.request({command:'account_namespace',account:config.treasury,namespace_id:config.namespaceId,ledger_hash:cp.ledgerHash,...(marker?{marker}:{})})).result;
   entries.push(...result.namespace_entries.map(e=>[e.HookStateKey.toUpperCase(),e.HookStateData.toUpperCase()]));marker=result.marker;
   if(marker){const key=JSON.stringify(marker);assert(!markers.has(key));markers.add(key);}
  }while(marker);
  assert.deepEqual(Object.entries(materialized.state).sort(),entries.sort(),'Indexer snapshot differs from independent pinned namespace');
  const claimed=Object.values(materialized.domains).filter(d=>d.status==='claimed');assert(claimed.length<=50,'Explicit owner-comparison budget');
  Object.assign(report,{checkpoint:cp,namespaceEntries:entries.length,projectedDomains:Object.keys(materialized.domains).length,verifiedClaimedOwners:0,resumedOwnerVerification:resume});
  await sdk.connect();const session=await sdk.read.snapshot({ledgerHash:cp.ledgerHash,timeoutMs:30000});
  for(let start=0;start<claimed.length;start+=2){await Promise.all(claimed.slice(start,start+2).map(async d=>assert.equal(await session.getOwner({name:d.domain,timeoutMs:30000}),d.owner,d.domain)));report.verifiedClaimedOwners=Math.min(start+2,claimed.length);console.log(JSON.stringify({phase:'owner-comparison',verified:report.verifiedClaimedOwners,total:claimed.length}));}
  const sample=claimed[0]&&indexer.describe(claimed[0].domain);store.close();store=new SqliteStorage(database);
  const restored=createIndexer({network:config,storage:store,source});assert.deepEqual(store.checkpoint(),cp);if(sample)assert.deepEqual(restored.describe(sample.domain),sample);
  report={...report,result:'PASS',checkpoint:cp,namespaceEntries:entries.length,issuedTokens:Object.keys(materialized.tokens).length,
   projectedDomains:Object.keys(materialized.domains).length,verifiedClaimedOwners:claimed.length,restartPreserved:true,elapsedMs:Date.now()-started,
   limitation:'Pinned bootstrap and restart only; not a complete historical replay or large-scale capacity benchmark'};
 }catch(error){report={...report,result:'FAIL',error:error.message,elapsedMs:Date.now()-started};throw error;}
 finally{fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));await sdk.disconnect();if(rpc.isConnected())await rpc.disconnect();store.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
