import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {resolveNpmCli} from './toolchain.mjs';

test('ABI preparation finds npm in Windows and Linux Node layouts and honors npm_execpath',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'xahauname-npm-layout-'));
 const write=file=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'');return file;};
 try{
  const windows=path.join(root,'windows/node.exe');
  const windowsNpm=write(path.join(root,'windows/node_modules/npm/bin/npm-cli.js'));
  assert.equal(resolveNpmCli({execPath:windows,npmExecPath:null}),windowsNpm);
  const linux=path.join(root,'linux/bin/node');
  const linuxNpm=write(path.join(root,'linux/lib/node_modules/npm/bin/npm-cli.js'));
  assert.equal(resolveNpmCli({execPath:linux,npmExecPath:null}),linuxNpm);
  const explicit=write(path.join(root,'custom/npm-cli.js'));
  assert.equal(resolveNpmCli({execPath:linux,npmExecPath:explicit}),explicit);
  assert.throws(()=>resolveNpmCli({execPath:path.join(root,'missing/node'),npmExecPath:null}),/npm CLI not found/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
