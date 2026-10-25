import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {root,upstream,verifyToolchain} from './toolchain.mjs';
import {capture,deploymentConfig,validateSnapshot} from './snapshot.mjs';
import {generate,layout} from './projections.mjs';
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);if(i<0)return undefined;if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('Missing '+name);return args[i+1];};
const network=option('--network')??'testnet';if(!['testnet','mainnet'].includes(network))throw new Error('Use --network testnet or mainnet');
const tools=verifyToolchain(),{manifest,config}=deploymentConfig(network,option('--deployment'),option('--wss'));
const snapshotFile=option('--snapshot');
console.log(JSON.stringify({stage:snapshotFile?'load-snapshot':'read-only-snapshot',network}));
const snapshot=validateSnapshot(snapshotFile?JSON.parse(fs.readFileSync(snapshotFile)):await capture(network,manifest,config),network,config);
const out=path.resolve(option('--out')??path.join(root,'hook/build/current','explorer-'+network+'-'+snapshot.ledgerIndex));
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({result:'NOT_VERIFIED',network,ledgerIndex:snapshot.ledgerIndex,ledgerHash:snapshot.ledgerHash,published:false},null,2)+'\n');
fs.writeFileSync(path.join(out,'snapshot.json'),JSON.stringify(snapshot,null,2)+'\n');
console.log(JSON.stringify({stage:'snapshot-saved',ledgerIndex:snapshot.ledgerIndex,entries:snapshot.entries.length,snapshot:path.join(out,'snapshot.json')}));
const networkCatalog=path.join(root,'explorer',`catalog.${network}.json`);
const catalog=JSON.parse(fs.readFileSync(option('--catalog')??(fs.existsSync(networkCatalog)?networkCatalog:path.join(root,'explorer/catalog.json'))));
const generated=await generate(snapshot,catalog);
const {normalise,lint}=await import(pathToFileURL(path.join(tools,'scripts/lib/manifest.js')));
const {parser}=await import(pathToFileURL(path.join(tools,'scripts/lib/io.js')));
const decoder=parser(),manifests={},warnings=[];
for(const [name,projections]of Object.entries(generated.projections)){
 const operations=Object.entries(JSON.parse(fs.readFileSync(path.join(root,'protocol/schema.json'))).operations).filter(([op])=>!['lock'].includes(op)).map(([op,id])=>`${op}: ${id}`).join(', ');
 const readme=`# XahauName / ${name}\n\nPart of the ten-hook native name-service chain. See the repository protocol and SDK reference for transaction authority and recovery rules.\n\n## State ABI scope\n\nThis ABI is a snapshot-bound explorer description for **${network}**, validated ledger ${snapshot.ledgerIndex}, hash ${snapshot.ledgerHash}. It is not a universal resolver or ownership proof. Exact state-key selectors do not discover future domains, new keys or changed address/descriptor lengths. Regenerate and re-check before publishing an update.\n\nThe hook uses namespace seed ${layout.namespaceSeed}. ${projections.length} projections are assigned to this logical ABI owner; other chain members may write the same record kinds. Each kind is described in only one chain manifest to avoid duplicate tables.\n\nRoot mintedAt is an eight-byte BE integer in seconds since 2000-01-01, not the four-byte ABI Timestamp. Integer drops are UInt64 BE, not serialized NativeAmount. Addresses are explicitly raw bytes; use SDK coin codecs.\n\nThe raw key is always visible. Selector prefixes are truncated hashes/IDs, never labelled as full IDs. Synthetic fixtures are recorded separately and are not ledger entries.\n\n## Operations\n\nWire marker xn_v = 2. Operation IDs: ${operations}. Their routing, named HookParameters, types and units are documented in https://github.com/XRPDomains/XahauName/blob/main/docs/SPEC.md and https://github.com/XRPDomains/XahauName/blob/main/docs/API.md. See hook/src/handlers/${name}.c for this entry point and callback behavior.\n\nExplorer ABI tooling: ${upstream.repository}, pinned ${upstream.commit}.\n`;
 const raw={name:'XahauName / '+name,description:'Native domain service: '+name+' handler. Snapshot-bound HookState ABI.',readme,repo:'https://github.com/XRPDomains/XahauName',license:'MIT',publishers:[{name:'Redstone (XRPDomains)',type:'organization',url:'https://github.com/XRPDomains'}],namespaces:{[config.namespaceId]:layout.namespaceSeed},abi:{hookStates:projections}};
 const normalized=normalise(raw),check=lint(normalized.manifest.abi.hookStates);
 if(check.errors.length)throw new Error(name+': '+check.errors.join('; '));
 warnings.push(...check.warnings.map(w=>name+': '+w));
 manifests[name]=normalized.manifest;
}
if(warnings.length)throw new Error('Unresolved ABI warnings: '+warnings.join('; '));
const all=Object.entries(manifests).flatMap(([owner,m])=>m.abi.hookStates.map(projection=>({owner,projection})));
const used=new Set();
for(const entry of [...snapshot.entries.map(e=>({k:e.key,v:e.value})),...generated.extra]){
 const matches=all.filter(({projection})=>decoder.decodeHookState(entry.k,entry.v,projection));
 if(matches.length!==1)throw new Error(entry.k+' decoded '+matches.length+' times');
 used.add(matches[0]);
}
if(used.size!==all.length)throw new Error('Unexercised ABI projections');
const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
write('snapshot.json',snapshot);write('state.json',snapshot.entries.map(e=>({k:e.key,v:e.value})));
for(const [name,m]of Object.entries(manifests)){write(name+'.manifest.json',m);write(name+'.abi.json',m.abi.hookStates);}
const check={account:snapshot.treasury,network,ledger:snapshot.ledgerIndex,hooks:snapshot.hooks.map(h=>({...h,manifest:h.name+'.manifest.json'})),state:{[snapshot.namespace]:'state.json'},extra:{[snapshot.namespace]:generated.extra}};
write('check.json',check);
function run(script,params,file){const result=spawnSync(process.execPath,[path.join(tools,'scripts',script),...params],{cwd:out,encoding:'utf8',maxBuffer:16*1024*1024});fs.writeFileSync(path.join(out,file),(result.stdout??'')+(result.stderr??''));if(result.error||result.status!==0)throw new Error('Upstream '+script+' failed; inspect '+path.join(out,file));}
run('check.mjs',[path.join(out,'check.json'),'--samples','1'],'coverage.log');
for(const name of Object.keys(manifests))for(const type of ['abi','manifest'])run('validate.mjs',[path.join(out,name+'.'+type+'.json')],name+'.'+type+'.validate.log');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const report={result:'PASS',network,ledgerIndex:snapshot.ledgerIndex,ledgerHash:snapshot.ledgerHash,treasury:snapshot.treasury,namespace:snapshot.namespace,hookHashes:snapshot.hookHashes,liveEntries:snapshot.entries.length,syntheticEntries:generated.extra.length,projections:all.length,unmatched:0,ambiguous:0,untestedProjections:0,warnings,recordKinds:generated.counts,toolchain:upstream,stateSchemaSha256:sha('protocol/state-layouts.json'),protocolSchemaSha256:sha('protocol/schema.json'),scope:'Snapshot-bound exact-key selectors. Future states and changed variable-length records require regeneration.',published:false};
write('verification.json',report);
fs.copyFileSync(path.join(tools,'LICENSE'),path.join(out,'ABI-TOOL-LICENSE.txt'));
fs.writeFileSync(path.join(out,'PUBLISHING.md'),`# Explorer handoff\n\nNetwork: ${network}. Snapshot ledger: ${snapshot.ledgerIndex}. This bundle passed upstream check.mjs and validate.mjs, but describes this snapshot/catalog only.\n\nInspect verification.json and coverage.log. Confirm current installed HookHashes still match. Open ${network==='testnet'?'https://testnet.xahauwin.com':'https://xahauwin.com'}/account/${snapshot.treasury}#namespaces, select each hook tab and its edit pencil, and copy that hook's manifest fields and bare .abi.json array. Keep ABI ownership partitioned across the ten hooks. Sign in with your own Google/Xaman account and review before publishing. No explorer login or publication was performed by the generator.\n\nA new HookHash requires another checked manifest; namespaces and user state do not need a SetHook transaction for explorer metadata. Never claim coverage of future hashed keys.\n`);
console.log(JSON.stringify({...report,output:out}));
