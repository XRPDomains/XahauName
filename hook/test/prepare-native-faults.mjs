// Test-only copies: production sources/artifacts are never overwritten.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(process.env.XAHAUNAME_STANDALONE!=='1')throw Error('Explicit standalone authorization required');
const refundCleanup=process.argv.includes('--refund-cleanup');
if(process.argv.slice(2).some(arg=>arg!=='--refund-cleanup'))throw Error('Unknown fault preparation option');
const root=path.join(repo,'hook/build/current',refundCleanup?'native-refund-cleanup-fault':'native-fault-artifacts');
if(fs.existsSync(root))throw Error('Existing fault artifacts: preserve evidence before rebuilding');
const source=fs.readFileSync(path.join(repo,'hook/src/common.h'),'utf8');
const anchor='#pragma clang attribute push (__attribute__((always_inline)), apply_to=function)';
if(source.split(anchor).length!==2)throw Error('Unexpected common header');
const instrumented=refundCleanup?source:source.replace(anchor,anchor+`
// TEST ONLY: request a real native state_set parameter error at a selected boundary.
// The normal handler then follows its existing error/rollback branch.
static uint32_t xn_test_writes;
static int64_t xn_test_state_set(uint32_t p,uint32_t n,uint32_t k,uint32_t kn) {
    uint8_t at[1];
    if(otxn_param(at,1,(uint32_t)"fi",2)==1 && ++xn_test_writes==at[0])
        return state_set(p,n,k,0);
    return state_set(p,n,k,kn);
}
#define state_set(p,n,k,kn) xn_test_state_set(p,n,k,kn)
`);
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
const run=(exe,args)=>{const r=spawnSync(exe,args,{cwd:repo,encoding:'utf8',maxBuffer:16*1024*1024});if(r.error)throw r.error;return r;};
const wsl=p=>'/mnt/'+p[0].toLowerCase()+'/'+p.slice(3).replaceAll('\\','/');
const results=[];
for(const part of (refundCleanup?['issuance']:['claim','burn'])){
 const out=path.join(root,part),src=path.join(out,'src');fs.mkdirSync(src,{recursive:true});
 fs.writeFileSync(path.join(src,'common.h'),instrumented);
 let handler=fs.readFileSync(path.join(repo,'hook/src/handlers',part+'.c'),'utf8');
 if(refundCleanup){
  const boundary='if (!clear_pending(id) ||';
  if(handler.split(boundary).length!==2)throw Error('Unexpected refund cleanup boundary');
  handler=handler.replace(boundary,'if (state_set(key,0,key,0)<0 || !clear_pending(id) ||');
 }
 fs.writeFileSync(path.join(src,'xahau-name-hook.c'),handler);
 const compiled=run('docker',['run','--rm','--network','none','--mount',`type=bind,source=${src},target=/src,readonly`,'--mount',`type=bind,source=${out},target=/out`,'--mount',`type=bind,source=${path.join(repo,'hook/toolchain/compile-hook.mjs')},target=/opt/toolchain/compile-hook.mjs,readonly`,'xahauname-hook-toolchain:cli-3.0.0']);
 fs.writeFileSync(path.join(out,'compiler.log'),compiled.stdout+compiled.stderr);if(compiled.status!==0)throw Error(part+' fault artifact compilation failed');
 const checker=process.env.GUARD_CHECKER??path.join(os.tmpdir(),'xahauname-hooks-toolchain/guard/guard_checker');
 const file=path.join(out,'xahau-name-hook.cleaned.wasm');
 const checked=process.platform==='win32'?run('wsl',['-d','Ubuntu','--',wsl(checker),wsl(file)]):run(checker,[file]);
 fs.writeFileSync(path.join(out,'guard-check.log'),checked.stdout+checked.stderr);
 if(checked.status!==0||!checked.stdout.includes('Hook validation successful!'))throw Error(part+' fault artifact guard check failed');
 const code=fs.readFileSync(file);const proof={part,testOnly:true,faultMode:refundCleanup?'before refund cleanup':'selected write ordinal',bytes:code.length,sha256:digest(code),productionCommonSha256:digest(source),productionHandlerSha256:digest(fs.readFileSync(path.join(repo,'hook/src/handlers',part+'.c'))),guardPassed:true};
 fs.writeFileSync(path.join(out,'proof.json'),JSON.stringify(proof,null,2)+'\n');results.push(proof);console.log(JSON.stringify(proof));
}
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(results,null,2)+'\n');
