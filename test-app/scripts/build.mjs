// Cross-platform production build, without depending on npm shell wrappers.
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('..',import.meta.url));
const check=spawnSync(process.execPath,[require.resolve('typescript/bin/tsc'),'--noEmit'],{cwd:root,stdio:'inherit'});
if(check.status!==0)process.exit(check.status??1);
await build({root,configFile:fileURLToPath(new URL('../vite.config.ts',import.meta.url))});
