import fs from 'node:fs';
import path from 'node:path';
import { compile, VERSIONS } from 'hooks-compiler';

const name = 'xahau-name-hook';
const headers = '/opt/toolchain/node_modules/@xahau/hooks-cli/dist/npm/src/init/c/contracts/include';
fs.mkdirSync('/out', { recursive: true });
try {
  const files = Object.fromEntries(fs.readdirSync(headers)
    .filter(file => file.endsWith('.h'))
    .map(file => [file, fs.readFileSync(path.join(headers, file), 'utf8')]));
  for (const file of fs.readdirSync('/src')) {
    if(file.endsWith('.h') || file === `${name}.c`) files[file] = fs.readFileSync(path.join('/src',file),'utf8');
  }
  const result = await compile({ files, entry: `${name}.c`, opt: '-O2' });
  const { wasm, ...metadata } = result;
  if (!WebAssembly.validate(wasm)) throw new Error('Cleaned WASM failed native validation');
  const log = result.logs.join('\n') + '\n';
  fs.writeFileSync(`/out/${name}.build.log`, log);
  process.stdout.write(log);
  if (wasm.length >= 65536) throw new Error(`Hook size ${wasm.length} must be below 65536 bytes`);
  fs.writeFileSync(`/out/${name}.cleaned.wasm`, wasm);
  fs.writeFileSync(`/out/${name}.cleaned.wasm.hex`, Buffer.from(wasm).toString('hex').toUpperCase() + '\n');
  fs.writeFileSync(`/out/${name}.build.json`, JSON.stringify({ ...metadata, versions: VERSIONS, helperInlining: true, nativeWasmValidated: true, guardChecked: false }, null, 2) + '\n');
  console.log('Compilation and cleaning complete. Guard validation is required before deployment.');
} catch (error) {
  const message = error instanceof Error ? error.stack : String(error);
  fs.writeFileSync(`/out/${name}.build.log`, message + '\n');
  console.error(message);
  process.exitCode = 1;
}
