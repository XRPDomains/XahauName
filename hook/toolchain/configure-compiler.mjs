import fs from 'node:fs';
import crypto from 'node:crypto';

// hook-cleaner retains only hook/cbak. Inline helpers before it removes them.
// Restrict this workaround to the exact hooks-compiler@0.2.0 implementation.
const target = '/opt/toolchain/node_modules/hooks-compiler/dist/core.js';
const original = fs.readFileSync(target, 'utf8');
const expected = '0b8f60ea09ad3bd54d22b2fe40efb8bfb0ce506537232827e5145b0d037bc87b';
if (crypto.createHash('sha256').update(original).digest('hex') !== expected) {
  throw new Error('Compiler implementation changed; review the inlining workaround');
}
const needle = '        m.optimize();';
if (original.split(needle).length !== 2) throw new Error('Optimizer patch location changed');
const replacement = `        binaryen.setAlwaysInlineMaxSize(1000000);
        binaryen.setOneCallerInlineMaxSize(1000000);
        binaryen.setAllowInliningFunctionsWithLoops(true);
        m.optimize();
        m.runPasses(["inlining-optimizing", "remove-unused-module-elements"]);
        if (!m.validate()) throw new Error("Invalid module after helper inlining");`;
fs.writeFileSync(target, original.replace(needle, replacement));
console.log('Configured explicit helper inlining before hook-cleaner');
