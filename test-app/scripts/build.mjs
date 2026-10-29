// Cross-platform production build, without depending on npm shell wrappers.
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import {parseArgs} from 'node:util';
const {values:{base}}=parseArgs({options:{base:{type:'string',default:'./'}}});
if(base!=='./'&&!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base))throw new Error('Use a hosting base such as /xahauname/');
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('..',import.meta.url));
const check=spawnSync(process.execPath,[require.resolve('typescript/bin/tsc'),'--noEmit'],{cwd:root,stdio:'inherit'});
if(check.status!==0)process.exit(check.status??1);
await build({root,base,configFile:fileURLToPath(new URL('../vite.config.ts',import.meta.url))});
