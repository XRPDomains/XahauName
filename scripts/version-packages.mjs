import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2];
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(version ?? ''))
    throw new Error('Usage: npm run release:version -- 0.3.1 (or a prerelease version)');
if (!process.env.npm_execpath) throw new Error('Run through npm run release:version');
const rootFile = path.join(root, 'package.json'), manifest = JSON.parse(fs.readFileSync(rootFile, 'utf8'));
const dirs = fs.readdirSync(path.join(root, 'packages'), {withFileTypes: true})
    .filter(e => e.isDirectory() && fs.existsSync(path.join(root, 'packages', e.name, 'package.json')))
    .map(e => `packages/${e.name}`);
const files = [rootFile, ...dirs.map(d => path.join(root, d, 'package.json')), path.join(root, 'test-app/package.json')];
const packages = files.map(file => ({file, json: JSON.parse(fs.readFileSync(file, 'utf8'))}));
const publicNames = new Set(packages.filter(p => !p.json.private).map(p => p.json.name));
const backup = new Map(files.map(file => [file, fs.readFileSync(file)]));
const lock = path.join(root, 'package-lock.json');
if (fs.existsSync(lock)) backup.set(lock, fs.readFileSync(lock));
try {
    for (const {file, json} of packages) {
        json.version = version;
        for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'])
            for (const name of Object.keys(json[section] ?? {})) if (publicNames.has(name)) json[section][name] = section === 'peerDependencies' ? '^' + version : version;
        fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
    }
    const result = spawnSync(process.execPath, [process.env.npm_execpath, 'install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], {cwd: root, stdio: 'inherit'});
    if (result.error || result.status !== 0) throw result.error ?? new Error('Could not update workspace lock');
} catch (error) {for (const [file, bytes] of backup) fs.writeFileSync(file, bytes); throw error;}
console.log(`Workspace versions synchronized: ${manifest.version} -> ${version}. No Git commit, tag or npm publication was created.`);
