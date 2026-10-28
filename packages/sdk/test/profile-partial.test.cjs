const test=require('node:test'),assert=require('node:assert/strict');
const {ResolverModule,PROFILE_TEXT_KEYS,diffProfile,validateProfileValue,util}=require('../dist');
const hash='AB'.repeat(32),address='rw5W1Ljeg7T4JionCu2hKzWeUus7XQ9qs';
function setup(){
 const sent=[],reads=[],current={display:'Legacy display',email:'old@example.com','custom.note':'keep'};
 const r=new ResolverModule({treasury:address,signerAddress:()=>address,ledgerHash:async()=>hash,
  readState:async(key,opts)=>{assert.equal(opts.ledgerHash,hash);reads.push(key);const name=Object.keys(current).find(k=>util.textKey('alice','xah',k)===key);return name?Buffer.from(current[name]):null;},
  submit:async(tx)=>{sent.push(tx);return {txHash:'CD'.repeat(32),engineResult:'tesSUCCESS'};}});
 return{r,sent,reads,current};
}
function fields(tx){return Object.fromEntries(tx.HookParameters.map(x=>[Buffer.from(x.HookParameter.HookParameterName,'hex').toString(),Buffer.from(x.HookParameter.HookParameterValue,'hex')]));}
test('partial profile saves use one Invoke and read/write only supplied fields',async()=>{
 const {r,sent,reads,current}=setup();
 await r.setProfile({label:'alice',tld:'xah',set:{description:'Bio'}});
 await r.setProfile({label:'alice',tld:'xah',set:{phone:'+84901234567'}});
 assert.equal(sent.length,2);assert.deepEqual([...fields(sent[0]).profile],[2,0,2,0,0]);assert.equal(fields(sent[0]).p1.toString(),'Bio');
 assert.deepEqual([...fields(sent[1]).profile],[2,1,0,0,0]);assert.equal(fields(sent[1]).p8.toString(),'+84901234567');
 assert.deepEqual(reads,[util.textKey('alice','xah','description'),util.textKey('alice','xah','phone')]);assert.equal(current.display,'Legacy display');assert.equal(current['custom.note'],'keep');
});
test('full optional form diffs omit empty fields and permit an explicit single-field clear',async()=>{
 const {r,sent,current}=setup();
 const values=Object.fromEntries(PROFILE_TEXT_KEYS.map(k=>[k,current[k]??'']));values.description='Bio';values.email='  ';
 const patch=diffProfile(current,values);assert.deepEqual(patch,{set:{description:'Bio'},clear:['email']});
 await r.setProfile({label:'alice',tld:'xah',...patch});assert.equal(sent.length,1);
 const p=fields(sent[0]);assert.deepEqual([...p.profile],[2,0,2,0,8]);assert.deepEqual(Object.keys(p).filter(k=>/^p\d/.test(k)),['p1']);
 assert.deepEqual(diffProfile({},Object.fromEntries(PROFILE_TEXT_KEYS.map(k=>[k,'  ']))),{set:{},clear:[]});
});
test('display accepts free text within the shared byte limit and submits without a full profile',async()=>{
 const {r,sent}=setup();const name='Nguyễn Alice';
 validateProfileValue('alice.xah','display',name);
 await r.setProfile({label:'alice',tld:'xah',set:{display:name}});
 assert.equal(sent.length,1);assert.equal(fields(sent[0]).p2.toString(),name);
 assert.throws(()=>validateProfileValue('alice.xah','display','é'.repeat(65)),e=>e.code==='INVALID_ARGUMENT'&&e.details.field==='display');
});
