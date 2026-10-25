import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const schema=JSON.parse(fs.readFileSync(path.join(root,'protocol/schema.json'),'utf8'));
const layout=JSON.parse(fs.readFileSync(path.join(root,'protocol/state-layouts.json'),'utf8'));
const {standardTextKeys:keys,legacyProfileKeys:legacy,profileKeys:global}=schema;
if(schema.version!==2||keys.length!==18||legacy.length!==10||global.length!==10||new Set(keys).size!==18||keys.some(k=>!/^[a-z0-9._-]{1,12}$/.test(k))||[...legacy,...global].some(k=>!keys.includes(k)))throw new Error('Invalid frozen protocol schema');
const changes=[];
function output(file,next){const target=path.join(root,file),old=fs.existsSync(target)?fs.readFileSync(target,'utf8').replaceAll('\r\n','\n'):'';if(old===next)return;if(process.argv.includes('--write'))fs.writeFileSync(target,next);else changes.push(file);}
const exports={OPERATIONS:schema.operations,STANDARD_TEXT_KEYS:keys,LEGACY_PROFILE_TEXT_KEYS:legacy,PROFILE_TEXT_KEYS:global};
output('packages/sdk/src/protocol.generated.ts','// Generated from protocol/schema.json. Run node scripts/sync-protocol.mjs --write.\n'+Object.entries(exports).map(([name,value])=>'export const '+name+' = '+JSON.stringify(value)+' as const;').join('\n')+'\n');
output('packages/sdk/src/state-layouts.generated.ts','// Generated from protocol/state-layouts.json. Run node scripts/sync-protocol.mjs --write.\nexport const STATE_LAYOUTS = '+JSON.stringify(layout,null,2)+' as const;\n');
const transform=(file,fn)=>output(file,fn(fs.readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n')));
transform('hook/src/common.h',source=>{
 const namespaceSeed=source.match(/^#define\s+NAMESPACE_SEED\s+"([^"]+)"/m)?.[1];
 if(namespaceSeed!==layout.namespaceSeed)throw new Error('C/state namespace seed mismatch');
 // Verify deployed C layout constants without rewriting C or changing artifact hashes.
 const constants={ROOT_OFF_OWNER:layout.root.owner,ROOT_OFF_FLAGS:layout.root.flags,ROOT_OFF_MINT_TS:layout.root.mintedAt,ROOT_LEN:layout.root.length,
  ROOT_FLAG_PRIMARY:layout.root.primaryFlag,ROOT_FLAG_LOCKED:layout.root.legacyLockedFlag,PENDING_OFF_DEST:layout.pending.destination,PENDING_OFF_AMOUNT:layout.pending.amountDrops,PENDING_OFF_FLAGS:layout.pending.flags,PENDING_LEN:layout.pending.length,
  PRICING_LEN:layout.pricing.length,PRICING_VERSION:layout.pricing.version,RECIDX_LEN:layout.records.length,RECIDX_VERSION:layout.records.version,RECIDX_OFF_ADDR_CNT:layout.records.addressCount,RECIDX_OFF_TEXT_CNT:layout.records.textCount,RECIDX_OFF_ADDR_LIST:layout.records.addresses,RECIDX_OFF_TEXT_LIST:layout.records.texts,RECIDX_MAX_ADDR:layout.records.maxAddresses,RECIDX_MAX_TEXT:layout.records.maxTexts};
 for(const [name,value]of Object.entries(constants)){const match=source.match(new RegExp('^#define\\s+'+name+'\\s+(0x[0-9A-Fa-f]+|[0-9]+)\\b','m'));if(!match||Number(match[1])!==value)throw new Error('C/state schema mismatch: '+name);}
 const strings='static const char * const SWEEP_TEXT_KEYS[SWEEP_TEXT_KEYS_COUNT] = {\n    '+keys.map(JSON.stringify).join(', ')+'\n};';
 const lengths='static const uint8_t SWEEP_TEXT_KEY_LENS[SWEEP_TEXT_KEYS_COUNT] = {\n    '+keys.map(k=>k.length).join(', ')+'\n};';
 const words='static const uint32_t text_key_words[18][3]={\n'+keys.map(k=>{const b=Buffer.alloc(12);b.write(k);return '{'+[0,4,8].map(i=>'0x'+b.readUInt32LE(i).toString(16).padStart(8,'0')+'U').join(',')+'}';}).join(',\n')+'\n};';
 return source.replace(/static const char \* const SWEEP_TEXT_KEYS\[SWEEP_TEXT_KEYS_COUNT\] = \{[\s\S]*?\n\};/,strings).replace(/static const uint8_t SWEEP_TEXT_KEY_LENS\[SWEEP_TEXT_KEYS_COUNT\] = \{[\s\S]*?\n\};/,lengths).replace(/static const uint32_t text_key_words\[18\]\[3\]=\{[\s\S]*?\n\};/,words);
});
transform('hook/src/handlers/profile.c',source=>{
 for(const [prefix,profile]of [['',legacy],['global_',global]]){
  const bits=keys.map(k=>profile.includes(k)?1<<profile.indexOf(k):0),tags=profile.map(k=>keys.indexOf(k));
  for(const [name,type,count,values]of [[prefix+'bit_for_tag','uint16_t',18,bits],[prefix+'tag_for_bit','uint8_t',10,tags]]){
   const re=new RegExp('static const '+type+' '+name+'\\['+count+'\\]=\\{[^}]+\\};');
   if(!re.test(source))throw new Error('Missing C schema table '+name);
   source=source.replace(re,'static const '+type+' '+name+'['+count+']={'+values.join(',')+'};');
  }
 }
 return source;
});
if(changes.length)throw new Error('Protocol outputs differ: '+changes.join(', '));
console.log('Protocol schema outputs match (wire key and bitmap order preserved).');
