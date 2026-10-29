import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import {docsPlugin} from './docs/plugin';
const proxy={'/__metadata/api/nftdomains/metadata/':{target:'https://xrpdomains.xyz',changeOrigin:true,rewrite:(p:string)=>p.replace(/^\/__metadata/,'')}};
const sdkSource=fileURLToPath(new URL('../packages/sdk/src',import.meta.url));
export default defineConfig({base:'./',plugins:[docsPlugin(),{name:'watch-local-sdk',configureServer(server){server.watcher.add(sdkSource);}}],resolve:{alias:{'@xahauname/sdk':fileURLToPath(new URL('../packages/sdk/src/index.ts',import.meta.url))}},server:{port:5173,strictPort:true,proxy,fs:{allow:[fileURLToPath(new URL('..',import.meta.url))]}},preview:{proxy},build:{target:'es2022'}});
