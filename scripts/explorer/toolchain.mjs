import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const upstream={repository:'https://github.com/XRPLWin/xahau-hooks-abi-skill',commit:'9e0eed4830535ed6b288820fb6aa116e0fd9844e'};
export const toolchain=path.join(root,'hook/build/current/explorer-toolchain',upstream.commit);
const files=['LICENSE','SKILL.md','reference/format.md','reference/reader.md','reference/patterns.md','reference/publishing.md',
 'scripts/check.mjs','scripts/validate.mjs','scripts/lib/io.js','scripts/lib/manifest.js','scripts/lib/parser.js','scripts/lib/xfl.js','scripts/package.json','scripts/package-lock.json'];
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
/** Official Node installations put npm beside node on Windows, under ../lib on Unix. */
export function resolveNpmCli({execPath=process.execPath,npmExecPath=process.env.npm_execpath}={}){
 const nodeDir=path.dirname(execPath);
 const candidates=[npmExecPath,path.join(nodeDir,'node_modules/npm/bin/npm-cli.js'),path.resolve(nodeDir,'../lib/node_modules/npm/bin/npm-cli.js')];
 const cli=candidates.find(candidate=>candidate&&fs.existsSync(candidate));
 if(!cli)throw new Error('npm CLI not found. Run npm run explorer:prepare or set npm_execpath to npm-cli.js.');
 return cli;
}
export function verifyToolchain(){
 const receiptFile=path.join(toolchain,'source.json');
 if(!fs.existsSync(receiptFile))throw new Error('Run node scripts/explorer/prepare.mjs first');
 const receipt=JSON.parse(fs.readFileSync(receiptFile));
 if(receipt.commit!==upstream.commit)throw new Error('Unexpected ABI toolchain revision');
 for(const file of files)if(!receipt.files[file]||sha(fs.readFileSync(path.join(toolchain,file)))!==receipt.files[file])throw new Error('ABI toolchain integrity mismatch: '+file);
 if(!fs.existsSync(path.join(toolchain,'scripts/node_modules/xahau-address-codec')))throw new Error('ABI toolchain dependencies missing; run prepare.mjs');
 return toolchain;
}
export async function prepareToolchain(){
 try{return verifyToolchain();}catch{/* Re-fetch only the explicitly pinned source files. */}
 fs.mkdirSync(toolchain,{recursive:true});const checksums={};
 await Promise.all(files.map(async file=>{
  const response=await fetch(`https://raw.githubusercontent.com/XRPLWin/xahau-hooks-abi-skill/${upstream.commit}/${file}`,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('Unable to fetch ABI tool '+file+': '+response.status);
  const data=Buffer.from(await response.arrayBuffer()),target=path.join(toolchain,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);checksums[file]=sha(data);
 }));
 const npmCli=resolveNpmCli();
 const result=spawnSync(process.execPath,[npmCli,'ci','--ignore-scripts','--no-audit','--no-fund','--workspaces=false','--prefix',path.join(toolchain,'scripts')],{cwd:toolchain,stdio:'inherit'});
 if(result.error||result.status!==0)throw new Error('ABI toolchain dependency installation failed');
 fs.writeFileSync(path.join(toolchain,'source.json'),JSON.stringify({...upstream,files:checksums},null,2)+'\n');return verifyToolchain();
}
