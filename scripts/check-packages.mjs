import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const manifest = read(path.join(root, 'package.json'));
const directories = fs.readdirSync(path.join(root, 'packages'), {withFileTypes: true})
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(root, 'packages', entry.name, 'package.json')))
    .map(entry => `packages/${entry.name}`);
const packages = directories.map(directory => ({directory, ...read(path.join(root, directory, 'package.json'))}));
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this check with npm run release:check');
function npm(args, capture = false) {
    const result = spawnSync(process.execPath, [npmCli, ...args], {cwd: root, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', maxBuffer: 8 * 1024 * 1024});
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`npm ${args.join(' ')} failed\n${capture ? result.stderr : ''}`);
    return result.stdout;
}
if (!manifest.private || !manifest.workspaces?.includes('packages/*')) throw new Error('Root must be private with packages/* workspaces');
const names = new Map(packages.map(p => [p.name, p]));
if (names.size !== packages.length) throw new Error('Duplicate package names');
const ordered = [], visited = new Set(), visiting = new Set();
function visit(p) {
    if (visited.has(p.name)) return;
    if (visiting.has(p.name)) throw new Error('Circular package build dependency: ' + p.name);
    visiting.add(p.name);
    for (const name of Object.keys({...p.dependencies, ...p.devDependencies, ...p.peerDependencies})) if (names.has(name)) visit(names.get(name));
    visiting.delete(p.name); visited.add(p.name); ordered.push(p);
}
packages.forEach(visit);
for (const p of ordered) {
    if (p.private) continue;
    if (p.version !== manifest.version) throw new Error(`${p.name}: release version differs from root`);
    if (p.repository?.directory !== p.directory || p.publishConfig?.access !== 'public' || p.publishConfig?.registry !== 'https://registry.npmjs.org/')
        throw new Error(`${p.name}: invalid public npm metadata`);
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
        for (const [name, range] of Object.entries(p[section] ?? {})) {
            if (/^(?:file:|link:|workspace:)/.test(String(range))) throw new Error(`${p.name}: local-only dependency ${name}`);
            if (names.has(name) && range !== manifest.version && range !== '^' + manifest.version)
                throw new Error(`${p.name}: internal dependency ${name} is not synchronized`);
        }
    }
    npm(['run', 'build', '--workspace', p.name]);
    if (process.argv.includes('--build-only')) continue;
    const packed = JSON.parse(npm(['pack', '--workspace', p.name, '--dry-run', '--ignore-scripts', '--json'], true))[0];
    const files = new Set(packed.files.map(f => f.path));
    const required = new Set(['README.md', 'LICENSE', p.main, p.module, p.types,
        ...Object.values(p.exports ?? {}).flatMap(e => typeof e === 'string' ? [e] : Object.values(e))].filter(Boolean).map(f => f.replace(/^\.\//, '')));
    for (const file of required) if (!files.has(file)) throw new Error(`${p.name}: package entry missing ${file}`);
    for (const file of files) if (/(^|\/)(?:node_modules|test|tests|build|data|release|coverage)\//.test(file) || /(^|\/)\.env(?:\.|$)/.test(file) || /\.(?:sqlite(?:-wal|-shm)?|seed|secret|pem|key|log)$/.test(file))
        throw new Error(`${p.name}: private/generated test file included: ${file}`);
    console.log(JSON.stringify({package: p.name, version: p.version, files: files.size, bytes: packed.size, result: 'PACK_CHECK_PASS'}));
}
