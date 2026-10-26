// Explicit read-only native-ledger simulations. No wallet, seed or submit API.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {XahauNameClient,TESTNET,parameters,explainError}=require('../dist');
const repo=path.resolve(__dirname,'../../..');
const planPath=process.env.P2_LIVE_PLAN,output=process.env.P2_BOUNDARY_OUTPUT;
async function main(){
 assert(planPath&&output,'Set explicit P2_LIVE_PLAN and P2_BOUNDARY_OUTPUT paths');
 assert(!fs.existsSync(output),'Do not overwrite boundary evidence');
 const plan=JSON.parse(fs.readFileSync(planPath,'utf8'));assert.equal(plan.networkID,21338);
 const client=new XahauNameClient(TESTNET),checks=[],sourceAccount=process.env.P2_BOUNDARY_ACCOUNT??plan.b;
 assert([plan.a,plan.b].includes(sourceAccount),'Boundary account must be one of the explicit test wallets');
 const report={networkID:21338,readOnly:true,account:sourceAccount,result:'IN_PROGRESS',source:'native RPC simulate, not consensus fault injection',checks};
 const save=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 try{
  await client.connect();assert.equal(client.rawClient.networkID,21338);
  const original=client.rawClient.request.bind(client.rawClient);
  client.rawClient.request=async(q,...rest)=>{assert(!['submit','submit_multisigned','sign','sign_for','wallet_propose'].includes(q.command),'Read-only boundary runner');return original(q,...rest);};
  const account=(await client.rawClient.request({command:'account_info',account:sourceAccount,ledger_index:'validated'})).result.account_data;
  const state=(await client.rawClient.request({command:'server_state'})).result.state;
  const reserve=state.validated_ledger;
  const name='boundary'+String(Date.now()).slice(-10);
  async function simulate(label,tx,expected){
   const prepared=await client.rawClient.autofill({...tx,Account:sourceAccount,NetworkID:21338});
   if(label==='fee below current base')prepared.Fee='1';
   const result=(await client.rawClient.simulate({...prepared,SigningPubKey:''})).result;
   const engine=result.engine_result??result.meta?.TransactionResult;
   if(expected)assert(expected.includes(engine),label+': unexpected '+engine);
   const hookStateChanges=(result.meta?.AffectedNodes??[]).filter(n=>(n.CreatedNode??n.ModifiedNode??n.DeletedNode)?.LedgerEntryType==='HookState').length;
   assert.equal(hookStateChanges,0,'Rejected/dry-run native cases must not include HookState mutation');
   const explanation=explainError({code:engine});
   const check={name:label,engineResult:engine,simulated:true,broadcast:false,feeDrops:prepared.Fee,
    hookExecutions:result.meta?.HookExecutions??[],hookStateChanges,explanation,
    covered:engine!=='tesSUCCESS'};
   checks.push(check);save();return check;
  }
  await simulate('purchase above wallet balance',{TransactionType:'Payment',Destination:TESTNET.treasury,
   Amount:(BigInt(account.Balance)+1000000n).toString(),HookParameters:parameters('buy',{label:Buffer.from(name),tld:Buffer.from('xah')})},['tecUNFUNDED_PAYMENT']);
  const count=Number((BigInt(account.Balance)-BigInt(reserve.reserve_base))/BigInt(reserve.reserve_inc))-account.OwnerCount+1;
  if(count>=1&&count<=250)await simulate('owner reserve boundary',{TransactionType:'TicketCreate',TicketCount:count},['tecINSUFFICIENT_RESERVE','tecINSUF_RESERVE']);
  else checks.push({name:'owner reserve boundary',covered:false,reason:'No valid TicketCount can exceed this account reserve within protocol limits; requires a dedicated low-balance account'});
  const fee=await simulate('fee below current base',{TransactionType:'Payment',Destination:sourceAccount===plan.a?plan.b:plan.a,Amount:'1'});
  if(fee.engineResult==='tesSUCCESS')fee.reason='This simulation did not enforce the low-fee boundary; not proof of submission acceptance';
  Object.assign(report,{result:'PASS',reserveBaseDrops:reserve.reserve_base,reserveIncrementDrops:reserve.reserve_inc,baseFeeDrops:reserve.base_fee});save();
  console.log(JSON.stringify({output,checks:checks.map(c=>({name:c.name,engineResult:c.engineResult,covered:c.covered}))}));
 }catch(error){Object.assign(report,{result:'FAIL',error:error.message});save();throw error;}finally{await client.disconnect();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
