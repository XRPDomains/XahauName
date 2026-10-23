import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skipped = new Set(['.git', 'node_modules', 'build', 'dist', 'release', 'coverage', 'playwright-report', 'test-results']);
const problems = [];
const textExtensions = new Set(['.md', '.ts', '.js', '.cjs', '.mjs', '.c', '.h', '.json', '.yml', '.yaml', '.sh', '.ps1', '.html', '.css']);
let checked = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (skipped.has(entry.name) || (entry.name.startsWith('.env') && entry.name !== '.env.example')) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(file); continue; }
    if (!textExtensions.has(path.extname(file)) && entry.name !== '.env.example') continue;
    const relative = path.relative(root, file).replaceAll('\\', '/');
    const text = fs.readFileSync(file, 'utf8');
    checked++;
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      // Report locations only; never print possible signing material.
      if (/\bs(?:Ed[1-9A-HJ-NP-Za-km-z]{28}|[1-9A-HJ-NP-Za-km-z]{28})\b/.test(lines[i]) || /-----BEGIN (?:EC |RSA )?PRIVATE KEY-----/.test(lines[i])) {
        problems.push(`${relative}:${i + 1}: possible private signing material`);
      }
    }
    if (path.extname(file) === '.md') {
      for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
        const target = match[1].replace(/^<|>$/g, '').split('#')[0];
        if (!target || /^[a-z]+:/i.test(target) || target.startsWith('/')) continue;
        if (!fs.existsSync(path.resolve(path.dirname(file), decodeURIComponent(target)))) {
          problems.push(`${relative}: missing local link ${target}`);
        }
      }
    }
  }
}
walk(root);
const tracked = execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
for (const name of tracked) {
  if (!fs.existsSync(path.join(root, name))) continue; // Intentional removals may not be staged yet.
  if (/(^|\/)(build|dist|release)\//.test(name) || /(^|\/)\.env(?!\.example$)/.test(name)) {
    problems.push(`${name}: generated/private file remains tracked`);
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Repository checks PASS: ${checked} text files, local links and signing-material scan.`);
}
