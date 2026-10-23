import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),base=path.join(root,'hook/build/current');
for(const name of ['prepare','lifecycle','profile-batch','policy','validation']){
 const r=spawnSync(process.execPath,[path.join(root,'hook/test/'+name+'.cjs')],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});fs.writeFileSync(path.join(base,name+'-test.log'),r.stdout+r.stderr);
 if(r.status!==0){console.error(r.stdout+r.stderr);process.exit(r.status??1);}
}
const parts=JSON.parse(fs.readFileSync(path.join(root,'hook/config/handlers.json'))),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const artifacts=parts.map(name=>({name,sha256:sha(fs.readFileSync(path.join(base,name,'xahau-name-hook.cleaned.wasm')))}));
const results=['test-results.json','profile-batch/probes.json','policy-results.json','validation-results.json'].map(file=>{const rows=JSON.parse(fs.readFileSync(path.join(base,file)));if(!rows.every(r=>r.pass))throw new Error('Failed probe');return{file,passed:rows.length};});
fs.writeFileSync(path.join(base,'verification.json'),JSON.stringify({artifacts,results},null,2)+'\n');console.log(JSON.stringify({result:'PASS',results}));
