import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDocsFiles} from '../docs/site';
import pages from '../../docs/site/pages.json';

const files=createDocsFiles();
test('Docs are prerendered HTML with a local-only search index and no wallet bundle',()=>{
 assert.equal([...files.keys()].filter(path=>path.endsWith('.html')).length,pages.length+1);
 const home=files.get('index.html')!;
 assert(home.includes('<article><h1'));assert(home.includes('live on-chain'));
 assert(!home.includes('/src/'));assert(!home.includes('app.ts'));assert(!home.includes('@xrpl-wallet-kit'));
 const index=JSON.parse(files.get('search-index.json')!);
 assert.equal(index.length,pages.length);assert(index.some((page:any)=>page.text.includes('getOwner')));
 const deployment=files.get('deployment/index.html')!;
 assert(deployment.includes('21338'));assert(deployment.includes('rw5W1Ljeg7T4JionCu2hKzWeUus7XQ9qs'));
 assert(!deployment.includes('{{deployment}}'));assert(!deployment.includes('{{hooks}}'));
});
test('all local pages, assets and heading links work below a hosting subdirectory',()=>{
 const base='https://example.com/xahauname/docs/';
 for(const[path,html]of files){
  if(!path.endsWith('.html'))continue;
  for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g)){
   const reference=match[1];if(/^https?:/.test(reference))continue;
   const target=new URL(reference,base+path);
   if(target.pathname==='/xahauname/')continue; // app link
   assert(target.pathname.startsWith('/xahauname/docs/'),`${path}: ${reference} escapes Docs`);
   let key=target.pathname.slice('/xahauname/docs/'.length);if(!key||key.endsWith('/'))key+='index.html';
   assert(files.has(key),`${path}: missing ${key}`);
   if(target.hash)assert(files.get(key)!.includes(`id="${target.hash.slice(1)}"`),`${path}: missing heading ${reference}`);
  }
 }
});
test('Docs keep on-chain authority separate from media, admin trust and indexed data',()=>{
 const model=files.get('on-chain/index.html')!;
 for(const claim of ['The ledger is the source of truth','treasury','HTTPS','IPFS','Weak execution','upgrade'])assert(model.includes(claim));
 const standards=files.get('standards/index.html')!;assert(standards.includes('Draft status'));assert(standards.includes('15 text slots'));
});
test('explicit mainnet Docs require and render a separate deployment',()=>{
 assert.throws(()=>createDocsFiles({network:'mainnet'}),/explicit deployment/);
 const manifest={treasury:'rExampleMainnet',namespaceId:'AB'.repeat(32),expectedNetworkId:21337,hookHashes:{profile:'CD'.repeat(32)}};
 const mainnet=createDocsFiles({network:'mainnet',deployment:manifest,wss:'wss://mainnet.example'}).get('deployment/index.html')!;
 assert(mainnet.includes('Mainnet'));assert(mainnet.includes('rExampleMainnet'));assert(mainnet.includes('wss://mainnet.example'));
 assert(!mainnet.includes('rw5W1Ljeg7T4JionCu2hKzWeUus7XQ9qs'));
 assert.throws(()=>createDocsFiles({network:'mainnet',deployment:{...manifest,expectedNetworkId:21338}}),/network mismatch/);
});
test('deployment text cannot inject markup and code examples stay escaped',()=>{
 const html=createDocsFiles({wss:'wss://example.com/<img src=x onerror=alert(1)>'}).get('deployment/index.html')!;
 assert(!html.includes('<img src=x'));assert(html.includes('&lt;img'));
 assert(files.get('write/index.html')!.includes('copy-code'));
 const client=files.get('assets/docs.js')!;assert(!client.includes('innerHTML'));assert(!client.includes('WebSocket'));
});
test('static packaging hook emits every Docs file without an application build',async()=>{
 const{docsPlugin}=await import('../docs/plugin');const plugin=docsPlugin(),emitted:any[]=[];
 const generate=plugin.generateBundle as Function;
 generate.call({emitFile:(asset:unknown)=>emitted.push(asset)});
 assert.equal(emitted.length,files.size);assert(emitted.every(asset=>asset.type==='asset'&&asset.fileName.startsWith('docs/')));
 assert(emitted.some(asset=>asset.fileName==='docs/read/index.html'));
 const app=readFileSync(new URL('../src/app-markup.ts',import.meta.url),'utf8');assert(app.includes('href="./docs/"'));
});

test('SPEC, raw operation tables and result types come from canonical source files',()=>{
 const spec=readFileSync(new URL('../../docs/SPEC.md',import.meta.url),'utf8');
 const protocol=files.get('protocol/index.html')!,raw=files.get('hook/index.html')!,types=files.get('functions/index.html')!;
 assert(protocol.includes('Version 0.3.0'));assert(protocol.includes('Domain authorization checks both root owner and native URIToken owner'));
 assert(protocol.includes('/blob/main/docs/SPEC.md'));assert(!protocol.includes('/site/../'));
 assert(protocol.includes('https://github.com/XRPDomains/XahauName/blob/main/docs/review/'));
 assert(spec.includes('## 9. Return codes'));assert(raw.includes('id="operation-table"'));assert(raw.includes('reconcile'));
 assert(raw.includes('make_root_key'));assert(raw.includes('mintedAt'));assert(types.includes('interface TxResult'));
 assert(types.includes('interface ProfileSnapshot'));assert(types.includes('Promise&lt;TxResult | null&gt;'));
 for(const html of[protocol,raw,types])assert(!/\{\{(?:operations|sdk_types|state_table|hook_functions)\}\}/.test(html));
 assert(raw.includes('../examples/verify-domain.mjs'));assert(files.has('examples/verify-domain.mjs'));
 const reader=files.get('examples/verify-domain.mjs')!;assert(!/^import .*from ['"]@xahauname\/sdk/m.test(reader));assert(!reader.includes('signAndSubmit('));
});
