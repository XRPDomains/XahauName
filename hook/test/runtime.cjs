const fs = require('node:fs');
const crypto = require('node:crypto');
const moduleBytes = fs.readFileSync(`${__dirname}/probe.wasm`);
const moduleObject = new WebAssembly.Module(moduleBytes);
function setup(options = {}) {
  let instance, offset = 131072, reserved = false;
  const guards = new Map(), calls = [], values = options.values || new Map(), slots = new Map();
  const codec=require(require('node:path').resolve(__dirname,'../../../../sdk/node_modules/xahau-binary-codec'));
  const address=require(require('node:path').resolve(__dirname,'../../../../sdk/node_modules/xahau-address-codec'));
  const account=address.encodeAccountID(Buffer.alloc(20,0x11));
  const emitted=options.emitted || [];
  const bytes = () => new Uint8Array(instance.exports.memory.buffer);
  const keyOf = (p, n) => Buffer.from(bytes().slice(p, p + n)).toString('hex');
  const env = {
    _g(id, max) { const n = (guards.get(id) || 0) + 1; guards.set(id,n); if (options.enforceGuards && n > max) throw { kind: 'guard', id, count: n, max }; return 1; },
    util_sha512h(out,len,input,n) { calls.push({ api: 'hash', outputLength: len }); if (len < 32) return -4n; bytes().set(crypto.createHash('sha512').update(bytes().slice(input,input+n)).digest().subarray(0,32),out); return 32n; },
    state(out,len,key,n) { calls.push({api:'state',keyLength:n}); const value=values.get(keyOf(key,n)); if(!value)return -5n; bytes().set(value.subarray(0,len),out); return BigInt(value.length); },
    state_set(input,len,key,n) { calls.push({api:'state_set',keyLength:n,length:len}); if(options.failStateWrite || options.failWritePredicate?.(len,keyOf(key,n)))return -3n; if(len)values.set(keyOf(key,n),Buffer.from(bytes().slice(input,input+len))); else values.delete(keyOf(key,n)); return BigInt(len); },
    hook_account(out,len) { bytes().fill(0x11,out,out+Math.min(len,20)); return 20n; },
    otxn_field(out,len,field) { const value=options.fields?.get(field); if(!value)return -5n; bytes().set(value.subarray(0,len),out); return BigInt(value.length); },
    rollback(p,n,code) { throw {kind:'rollback',code:Number(code),text:Buffer.from(bytes().slice(p,p+n)).toString().replace(/\0+$/,'')}; },
    accept(p,n,code) { throw {kind:'accept',code:Number(code),text:Buffer.from(bytes().slice(p,p+n)).toString().replace(/\0+$/,'')}; },
    memset(p,v,n) { bytes().fill(v,p,p+n); return p; },
    memcpy(out,input,len) { bytes().copyWithin(out,input,input+len); return out; },
    otxn_param(out,len,p,n){const name=Buffer.from(bytes().slice(p,p+n)).toString(),v=options.params?.get(name);if(v===undefined)return -5n;const b=Buffer.from(v);if(b.length>len)return -4n;bytes().set(b,out);return BigInt(b.length);},
    hook_again(){calls.push({api:'hook_again'});return options.againFailure?-9n:1n;},
    slot_set(p,n,s){
      if(n!==34)return -7n;
      const id=Buffer.from(bytes().slice(p+2,p+n)).toString('hex'),name=values.get(Buffer.concat([Buffer.from('lof:'),Buffer.from(id,'hex').subarray(0,28)]).toString('hex'));
      let native=options.nativeOwner;
      if(native===undefined&&name){const key=crypto.createHash('sha512').update(name).update(':root').digest().subarray(0,32).toString('hex');native=values.get(key)?.subarray(0,20);}
      if(!native)return -5n;
      slots.set(s,new Map([[524290,Buffer.from(native)]]));return BigInt(s);
    },
    otxn_type() { return BigInt(options.txType || 0); },
    ledger_seq(){return 1000n;}, ledger_last_time(){return 123456789n;},
    otxn_id(out,len,flags){const v=options.txid||Buffer.alloc(32,0xaa);bytes().set(v,out);return 32n;},
    etxn_reserve(n){if(reserved||options.failReserve)return -8n;reserved=true;return BigInt(n);},
    etxn_details(out,len){if(options.failDetails)return -3n;const b=Buffer.from(codec.encode({EmitDetails:{EmitGeneration:1,EmitBurden:'0000000000000001',EmitParentTxnID:'AA'.repeat(32),EmitNonce:'BB'.repeat(32),EmitHookHash:'CC'.repeat(32),EmitCallback:account}}),'hex');if(len<b.length)return -4n;bytes().set(b,out);return BigInt(b.length);},
    etxn_fee_base(p,n){if(options.failFee)return -3n;codec.decode(Buffer.from(bytes().slice(p,p+n)).toString('hex'));return 12n;},
    emit(out,len,p,n){if(options.failEmit)return -3n;const blob=Buffer.from(bytes().slice(p,p+n)),json=codec.decode(blob.toString('hex'));if(codec.encode(json).toLowerCase()!==blob.toString('hex'))throw Error('noncanonical emitted blob');const hash=crypto.createHash('sha512').update(Buffer.from('54584e00','hex')).update(blob).digest().subarray(0,32);bytes().set(hash,out);emitted.push({blob:blob.toString('hex'),json,hash});return 32n;},
    otxn_slot(s){slots.set(s||1,options.fields||new Map());return BigInt(s||1);},
    meta_slot(s){if(options.noMeta)return -9n;slots.set(s||10,new Map([[1048579,Buffer.from([options.result||0])]]));return BigInt(s||10);},
    slot_subfield(parent,field,s){const v=slots.get(parent)?.get(field);if(v===undefined)return -5n;slots.set(s||12,v);return BigInt(s||12);},
    slot_type(s,flags){return slots.has(s)?1n:-5n;},
    slot(out,len,s){const v=slots.get(s);if(!Buffer.isBuffer(v))return -5n;if(len<v.length)return -4n;bytes().set(v,out);return BigInt(v.length);},
    sto_subarray(p,n,index){try{const b=Buffer.from(bytes().slice(p,p+n)),start=b[0]===0xf9?1:0;let off=start;for(let i=0;off<b.length&&b[off]!==0xf1;i++){const f=field(b,off);if(i===index)return (BigInt(off)<<32n)|BigInt(f.end-off);off=f.end;}return -5n;}catch{return -3n;}},
    sto_subfield(p,n,id){try{const b=Buffer.from(bytes().slice(p,p+n));for(let off=0;off<b.length&&b[off]!==0xe1;){const f=field(b,off);if(f.id===id)return (BigInt(f.payload)<<32n)|BigInt(f.length);off=f.end;}return -5n;}catch{return -3n;}},
  };
  function field(b,start){let p=start,h=b[p++],type=h>>4,num=h&15;if(!type)type=b[p++];if(!num)num=b[p++];let payload=p,length;
    if(type===14){let q=p;while(q<b.length&&b[q]!==0xe1)q=field(b,q).end;if(b[q]!==0xe1)throw Error('bad memo object');length=q-p;return {id:(type<<16)+num,payload,length,end:q+1};}
    if(type===7||type===8){let v=b[p++];if(v<=192)length=v;else if(v<=240)length=193+(v-193)*256+b[p++];else throw Error('unsupported VL');payload=p;}
    else throw Error('unsupported field');if(payload+length>b.length)throw Error('bad field length');return{id:(type<<16)+num,payload,length,end:payload+length};}
  instance = new WebAssembly.Instance(moduleObject,{env});
  instance.exports.memory.grow(8);
  const put = value => { const b = typeof value === 'string' ? Buffer.from(value) : Buffer.from(value); const p=offset; offset+=b.length+16; bytes().set(b,p); return [p,b.length]; };
  const invoke = (name,...args) => { try {
    instance.exports.reset_execution_result?.();
    if(instance.exports.prepare_memo_fields && /^(parse_(str|lower|uint|hex|bool)|do_(set|clear|buy|register|reset|tld))/.test(name)) instance.exports.prepare_memo_fields(args[name==='do_tld'?1:0],args[name==='do_tld'?2:1]);
    const value=instance.exports[name](...args);
    const final=instance.exports.finish_execution_result?instance.exports.finish_execution_result(BigInt(value??0)):value;
    return {return:typeof value==='number'?Number(final):final};
  } catch(e) { if(e.kind)return e; throw e; } };
  return {e:instance.exports,put,invoke,bytes,calls,values,emitted};
}

module.exports={setup};
