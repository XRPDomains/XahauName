const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), {spawnSync} = require('node:child_process');
const source = path.resolve(__dirname, '../version-packages.mjs');
function fixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xahauname-workspaces-'));
    const put = (name, value) => {const p = path.join(dir, name); fs.mkdirSync(path.dirname(p), {recursive: true}); fs.writeFileSync(p, JSON.stringify(value, null, 2) + '\n');};
    put('package.json', {name: 'fixture-root', private: true, version: '0.3.0', workspaces: ['packages/*', 'test-app']});
    put('packages/sdk/package.json', {name: '@fixture/sdk', version: '0.3.0'});
    put('packages/indexer/package.json', {name: '@fixture/indexer', version: '0.3.0', peerDependencies: {'@fixture/sdk': '^0.3.0'}, devDependencies: {'@fixture/sdk': '0.3.0'}});
    put('test-app/package.json', {name: 'fixture-app', private: true, version: '0.3.0', dependencies: {'@fixture/sdk': '0.3.0'}});
    fs.mkdirSync(path.join(dir, 'scripts')); fs.copyFileSync(source, path.join(dir, 'scripts/version-packages.mjs'));
    const run = version => spawnSync(process.execPath, [path.join(dir, 'scripts/version-packages.mjs'), version], {cwd: dir, encoding: 'utf8', env: {...process.env, npm_execpath: process.env.npm_execpath}});
    const read = name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    const close = () => {const full = path.resolve(dir); if (path.dirname(full) !== path.resolve(os.tmpdir()) || !path.basename(full).startsWith('xahauname-workspaces-')) throw new Error('Unsafe fixture cleanup'); fs.rmSync(full, {recursive: true, force: true});};
    return {dir, run, read, close};
}
test('version preparation synchronizes packages, app, peer ranges and root lock without Git', () => {
    const f = fixture(); try {
        const r = f.run('0.3.1'); assert.equal(r.status, 0, r.stderr);
        for (const name of ['package.json', 'packages/sdk/package.json', 'packages/indexer/package.json', 'test-app/package.json']) assert.equal(f.read(name).version, '0.3.1');
        assert.equal(f.read('packages/indexer/package.json').peerDependencies['@fixture/sdk'], '^0.3.1');
        assert.equal(f.read('test-app/package.json').dependencies['@fixture/sdk'], '0.3.1');
        assert.equal(f.read('package-lock.json').packages['packages/sdk'].version, '0.3.1');
        assert.equal(fs.existsSync(path.join(f.dir, '.git')), false);
    } finally {f.close();}
});
test('invalid version rejects before mutating manifests', () => {
    const f = fixture(); try {const r = f.run('latest'); assert.notEqual(r.status, 0); assert.equal(f.read('package.json').version, '0.3.0'); assert.equal(fs.existsSync(path.join(f.dir, 'package-lock.json')), false);} finally {f.close();}
});
test('lock update failure restores every manifest and the previous lock', () => {
    const f = fixture(); try {
        fs.writeFileSync(path.join(f.dir, 'package-lock.json'), 'previous-lock');
        const fail = path.join(f.dir, 'fail.cjs'); fs.writeFileSync(fail, 'process.exit(1);');
        const r = spawnSync(process.execPath, [path.join(f.dir, 'scripts/version-packages.mjs'), '0.3.1'], {cwd: f.dir, encoding: 'utf8', env: {...process.env, npm_execpath: fail}});
        assert.notEqual(r.status, 0); assert.equal(f.read('package.json').version, '0.3.0');
        assert.equal(f.read('packages/indexer/package.json').peerDependencies['@fixture/sdk'], '^0.3.0');
        assert.equal(fs.readFileSync(path.join(f.dir, 'package-lock.json'), 'utf8'), 'previous-lock');
    } finally {f.close();}
});
