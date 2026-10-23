import test from 'node:test';import assert from 'node:assert/strict';
import {decodeAccountID} from 'xahau';
import {encodeAddress,decodeAddress,canonicalAddressBytes} from '../../sdk/src/addresses';
import {COIN_TYPES,LEGACY_COIN_TYPES} from '../../sdk/src/constants';
import {ENS_GLOBAL_TEXT_KEYS,GLOBAL_PROFILE_FIELDS,getDomainDisplayName} from '../../sdk/src/text-records';
import {PROFILE_TEXT_KEYS,profilePatchFields,coinBytes} from '../../sdk/src/protocol';
import {ResolverModule} from '../../sdk/src/resolver';
import {NETWORKS} from '../src/records';
const address='rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn',h='A'.repeat(64);
for(const [coin,text,hex] of [
 [0,'1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa','76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac'],
 [0,'3Ai1JZ8pdJb2ksieUV8FsxSNVJCpoPi8W6','a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1887'],
 [0,'BC1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KV8F3T4','0014751e76e8199196d454941c45d1b3a323f1433bd6'],
 [60,'0x314159265dD8dbb310642f98f50C066173C1259b','314159265dd8dbb310642f98f50c066173c1259b'],
 [144,address,'004b4e9c06f24296074f7bc48f92a97916c6dc5ea9'],
 [144,'X7qvLs7gSnNoKvZzNWUT2e8st17QPY64PPe7zriLNuJszeg','05444b4e9c06f24296074f7bc48f92a97916c6dc5ea9000000000000000000']
] as const)test('ENSIP-9 official binary vector '+text,()=>{const bytes=encodeAddress(coin,text);assert.equal(bytes.toString('hex'),hex);const decoded=decodeAddress(coin,bytes);assert.equal(decoded.format,'address');assert.deepEqual(encodeAddress(coin,decoded.value),bytes);});
test('Ethereum mixed-case invalid checksum is rejected',()=>assert.throws(()=>encodeAddress(60,'0x314159265dD8dbb310642f98f50C066173C1259c')));
test('SLIP44 Xahau is 21337, no alias of XRP or historical wrong assignments',()=>{assert.equal(COIN_TYPES.XAH,21337);assert.equal(COIN_TYPES.XRP,144);assert.equal(COIN_TYPES.SOL,501);assert.equal(LEGACY_COIN_TYPES.XAH_LOCAL,535);assert(NETWORKS.some(n=>n.coin===21337));assert.throws(()=>encodeAddress(535,address));assert.throws(()=>encodeAddress(345,address));assert.equal(decodeAddress(535,Buffer.from(decodeAccountID(address))).format,'hex');});
test('Xahau binary convention is explicit Ripple encoding, with old AccountID reads preserved',()=>{const old=Buffer.from(decodeAccountID(address)),canonical=encodeAddress(21337,address);assert.equal(canonical.length,21);assert.equal(decodeAddress(21337,old).value,address);assert.equal(decodeAddress(144,old).value,address);assert.deepEqual(canonicalAddressBytes(144,old),encodeAddress(144,address));assert.equal(old.length,20);});
test('invalid Ripple binary prefixes and unrelated chain addresses fail closed',()=>{assert.equal(decodeAddress(144,Buffer.alloc(21,1)).format,'hex');assert.throws(()=>encodeAddress(144,'1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'));});
test('all ten ENSIP-5 Global Keys are consumer presets, not a remapped v1 batch',()=>{assert.deepEqual(ENS_GLOBAL_TEXT_KEYS,['avatar','description','display','email','keywords','mail','notice','location','phone','url']);assert.deepEqual(GLOBAL_PROFILE_FIELDS.map(f=>f.key),ENS_GLOBAL_TEXT_KEYS);assert.deepEqual(PROFILE_TEXT_KEYS,ENS_GLOBAL_TEXT_KEYS);assert.equal(PROFILE_TEXT_KEYS.length,10);assert.equal(profilePatchFields({phone:'+84901234567'}).profile[0],2);});
test('display only changes casing of the canonical domain; it cannot replace identity',()=>{assert.equal(getDomainDisplayName('alice.xah',{display:'Alice.xah'}),'Alice.xah');assert.equal(getDomainDisplayName('alice.xah',{display:'Bob'}),'alice.xah');});
function setup(){let data:Buffer|null=null;const calls:any[]=[];const ctx:any={treasury:address,signerAddress:()=>address,ledgerHash:async()=>h,readState:async()=>data,submit:async(tx:any)=>{calls.push(tx);return{};}};const r=new ResolverModule(ctx);r.getOwner=async(_domain,opts)=>{assert.equal(opts?.ledgerHash,h);assert.equal(opts?.verifyOwner,true);return address;};return{r,calls,setData:(value:Buffer|null)=>data=value};}
test('ENS-like addr/text empty returns coexist with original null getters',async()=>{const{r}=setup();assert.equal(await r.getAddr('alice.xah',144),null);assert.equal((await r.addr('alice.xah',144)).length,0);assert.equal(await r.getText('alice.xah','mail'),null);assert.equal(await r.text('alice.xah','mail'),'');});
test('receiving resolver reads the requested record without falling back to owner or XRP',async()=>{const{r,setData}=setup();assert.equal(await r.resolveAddress('alice.xah'),null);setData(encodeAddress(21337,address));assert.equal(await r.resolveAddress('alice.xah'),address);setData(Buffer.alloc(60));await assert.rejects(r.resolveAddress('alice.xah'),/invalid codec/);});
test('setAddress produces one canonical native-v2 write',async()=>{const{r,calls}=setup();await r.setAddress({label:'alice',tld:'xah',coinType:21337,address});assert.equal(calls.length,1);const params=calls[0].HookParameters.map((x:any)=>x.HookParameter);const byName=Object.fromEntries(params.map((x:any)=>[Buffer.from(x.HookParameterName,'hex').toString(),Buffer.from(x.HookParameterValue,'hex')]));assert.equal(byName.addr.toString(),encodeAddress(21337,address).toString('hex').toUpperCase());});
test('owner lock is disabled by SDK policy before any signature',async()=>{const{r,calls}=setup();await assert.rejects(r.lock({label:'alice',tld:'xah'}),e=>(e as any).code==='UNSUPPORTED_OPERATION');assert.equal(calls.length,0);});
test('deployed uint16 coin index limit remains explicit; no fake ENSIP-11 support',()=>{assert.throws(()=>coinBytes(0x80000001));});

test('receiving resolver refuses inconsistent native ownership',async()=>{const{r,setData}=setup();setData(encodeAddress(21337,address));r.getOwner=async()=>{throw new Error('Root and token owner differ');};await assert.rejects(r.resolveAddress('alice.xah'),/owner differ/);});
