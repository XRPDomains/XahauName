// Independent binary fixtures. Hash/record formulas are intentionally not imported from the SDK/decoder.
const crypto = require('node:crypto');
const {decodeAccountID} = require('xahau');
const {TESTNET} = require('@xahauname/sdk');
const owner = 'r3ntcoBspgWEUgC1xkyEwLS28zkCeuAFp', recipient = 'rHSypss6AqPRFvaocnYz2xnZ7k8TizLg6c';
const domain = 'fixture.xah', uri = 'https://example.com/metadata/' + domain;
const sha = value => crypto.createHash('sha512').update(value).digest().subarray(0,32).toString('hex').toUpperCase();
const key = suffix => sha(domain + ':' + suffix), hex = value => Buffer.from(value).toString('hex').toUpperCase();
const id = sha(Buffer.concat([Buffer.from([0,85]),Buffer.from(decodeAccountID(TESTNET.treasury)),Buffer.from(uri)]));
const reverse = prefix => hex(Buffer.concat([Buffer.from(prefix),Buffer.from(id,'hex').subarray(0,28)]));
const root = (account=owner, primary=1) => {const b=Buffer.alloc(32);Buffer.from(decodeAccountID(account)).copy(b);b[20]=primary;b.writeBigUInt64BE(123n,21);return hex(b);};
const stateIndex = (k, namespace=TESTNET.namespaceId) => sha(Buffer.concat([Buffer.from([0,118]),Buffer.from(decodeAccountID(TESTNET.treasury)),Buffer.from(k,'hex'),Buffer.from(namespace,'hex')]));
const hash = i => crypto.createHash('sha256').update('ledger:'+i).digest('hex').toUpperCase();
function seed() {
 const state=Object.create(null), tokens=Object.create(null), records=Buffer.alloc(124);records[0]=1;records.writeUInt16BE(1,1);records[3]=2;records.writeUInt16BE(21337,4);records[34]=1;records[40]=255;records[41]=0;
 state[key('root')]=root();state[key('token')]=id;state[reverse('lof:')]=hex(domain);state[reverse('uri:')]=hex(domain);
 state[key('records')]=hex(records);state[key('addr:21337')]=hex(Buffer.from(decodeAccountID(owner)));
 state[key('text:description')]=hex('Original profile');state[key('text:custom.key')]=hex('custom value');
 const slot=sha(Buffer.concat([Buffer.from('txi:'),Buffer.from(key('root'),'hex'),Buffer.from([0])]));
 state[slot]=key('text:custom.key')+hex('custom.key');
 state[sha(Buffer.concat([Buffer.from('primary_of:'),Buffer.from(decodeAccountID(owner))]))]=key('root');
 tokens[id]={LedgerEntryType:'URIToken',Issuer:TESTNET.treasury,Owner:owner,URI:hex(uri),Flags:1,index:id};
 return {state,tokens,domains:Object.create(null),recovery:Object.create(null)};
}
function stateNode(k,value,kind='ModifiedNode',namespace) {return {[kind]:{LedgerEntryType:'HookState',LedgerIndex:stateIndex(k,namespace),[kind==='CreatedNode'?'NewFields':'FinalFields']:{HookStateKey:k,HookStateData:value}}};}
function tokenNode(fields,kind='ModifiedNode') {return {[kind]:{LedgerEntryType:'URIToken',LedgerIndex:id,[kind==='CreatedNode'?'NewFields':'FinalFields']:fields}};}
function receipt(index=101, nodes=[], tx={}, result='tesSUCCESS') {return {validated:true,hash:sha('tx:'+index+JSON.stringify(tx)+JSON.stringify(nodes)),ledgerIndex:index,ledgerHash:hash(index),tx:{TransactionType:'Invoke',Account:owner,Destination:TESTNET.treasury,NetworkID:21338,...tx},meta:{TransactionIndex:0,TransactionResult:result,AffectedNodes:nodes}};}
function ledger(index=101,receipts=[]) {return {checkpoint:{ledgerIndex:index,ledgerHash:hash(index)},parentHash:hash(index-1),receipts};}
function source(snapshot=seed()) {let current=100;return {connect:async()=>{},disconnect:async()=>{},latest:async()=>({ledgerIndex:current,ledgerHash:hash(current)}),snapshot:async()=>structuredClone(snapshot),ledger:async i=>ledger(i),setHead:i=>current=i};}
module.exports={owner,recipient,domain,id,root,key,hex,hash,sha,seed,reverse,stateIndex,stateNode,tokenNode,receipt,ledger,source,config:TESTNET};
