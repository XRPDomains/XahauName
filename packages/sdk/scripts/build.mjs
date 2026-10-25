import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url),root=join(dirname(fileURLToPath(import.meta.url)),'..');
function compile(args=[]){const result=spawnSync(process.execPath,[require.resolve('typescript/bin/tsc'),'-p',join(root,'tsconfig.json'),...args],{stdio:'inherit'});if(result.status!==0)process.exit(result.status??1);}
compile();
// Actual ESM modules allow consumers to eliminate unused exports instead of wrapping all CJS.
const esm=join(root,'dist/esm');
compile(['--module','ES2022','--outDir',esm,'--declaration','false','--declarationMap','false']);
for(const file of readdirSync(esm))if(file.endsWith('.js')){
    const target=join(esm,file),source=readFileSync(target,'utf8');
    writeFileSync(target,source.replace(/(\bfrom\s+|\bimport\s*)["'](\.\.?\/[^"']+)["']/g,(_match,prefix,specifier)=>prefix+JSON.stringify(specifier.endsWith('.js')?specifier:specifier+'.js')));
}
writeFileSync(join(esm,'package.json'),'{"type":"module"}\n');
writeFileSync(join(root,'dist/index.mjs'),"export * from './esm/index.js';\n");
