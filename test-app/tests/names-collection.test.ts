import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecentNames,defaultNameFilters,isNewName,nameLengthRange,selectOwnedNames} from '../src/names-collection';
import {domainCards} from '../src/views';
const now=Date.UTC(2026,9,28),mintedAt=(days:number)=>Math.floor((now-days*86400000)/1000)-946684800;
const records=[['old.xah',30],['new.xah',1],['123.xah',2],['abc1.xah',3],['a-b.xah',4]].map(([domain,days])=>({domain:String(domain),mintedAt:mintedAt(Number(days)),tokenId:'AB'.repeat(32),uri:'https://example.com/'+domain,primary:false}));
test('compact length choices count label characters and >10 excludes exactly ten',()=>{
 for(let i=1;i<=10;i++)assert.deepEqual(nameLengthRange(String(i)),{minLength:i,maxLength:i});
 assert.deepEqual(nameLengthRange('all'),{minLength:1,maxLength:57});assert.deepEqual(nameLengthRange('gt10'),{minLength:11,maxLength:57});
 const names=[10,11,57].map(length=>({...records[0],domain:'a'.repeat(length)+'.xah'}));
 assert.deepEqual(selectOwnedNames(names,null,{...defaultNameFilters,...nameLengthRange('gt10')}).map(r=>r.domain.length-4),[11,57]);
});
test('primary stays first and other names sort by newest without changing the SDK array',()=>{
 const sorted=selectOwnedNames(records,'old.xah',defaultNameFilters);assert.deepEqual(sorted.map(r=>r.domain),['old.xah','new.xah','123.xah','abc1.xah','a-b.xah']);assert.equal(records[0].domain,'old.xah');
 assert.equal(selectOwnedNames(records,'123.xah',{...defaultNameFilters,sort:'longest'})[0].domain,'123.xah');
});
test('keyword, label length and character filters compose locally',()=>{
 const select=(patch:Partial<typeof defaultNameFilters>)=>selectOwnedNames(records,null,{...defaultNameFilters,...patch}).map(r=>r.domain);
 assert.deepEqual(select({query:' NEW '}),['new.xah']);assert.deepEqual(select({minLength:4,maxLength:4}),['abc1.xah']);
 assert.deepEqual(select({characters:'numbers'}),['123.xah']);assert.deepEqual(select({characters:'mixed'}),['abc1.xah']);assert.deepEqual(select({characters:'hyphenated'}),['a-b.xah']);assert.deepEqual(select({query:'😀'}),[]);
 assert.deepEqual(select({minLength:9,maxLength:2}),[]);
});
test('New uses recent registration or verified local acquisition, with bounded wallet-scoped hints',()=>{
 const values=new Map<string,string>(),storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}},a=createRecentNames(storage,'wallet-a'),b=createRecentNames(storage,'wallet-b');
 assert(!isNewName(records[0],{},now));assert(isNewName(records[1],{},now));a.mark('old.xah',now);assert(isNewName(records[0],a.read(now),now));assert.deepEqual(b.read(now),{});
 assert.equal(selectOwnedNames(records,null,defaultNameFilters,a.read(now))[0].domain,'old.xah');assert.deepEqual(a.read(now+8*86400000),{});
 const html=domainCards(['old.xah'],'old.xah',new Set(['old.xah']));assert(html.includes('Primary'));assert(html.includes('new-tag'));assert(!domainCards(['old.xah'],null).includes('new-tag'));
});
