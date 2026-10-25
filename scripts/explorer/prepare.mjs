import {prepareToolchain,upstream} from './toolchain.mjs';
await prepareToolchain();
console.log(JSON.stringify({result:'ABI_TOOLCHAIN_READY',...upstream}));
