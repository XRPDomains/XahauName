import type {Plugin,ResolvedConfig} from 'vite';
import {createDocsFiles,docsContentDirectory,docsReferenceFiles,type DocsOptions} from './site';

export function docsPlugin():Plugin{
 let options:DocsOptions={},cache:Map<string,string>|undefined;
 const files=()=>cache??=createDocsFiles(options);
 return{
  name:'xahauname-static-docs',
  configResolved(config:ResolvedConfig){options={network:config.env.VITE_NETWORK??'testnet',wss:config.env.VITE_WSS||undefined,deployment:config.env.VITE_DEPLOYMENT_JSON?JSON.parse(config.env.VITE_DEPLOYMENT_JSON):undefined};},
  configureServer(server){
   server.watcher.add([docsContentDirectory,...docsReferenceFiles]);
   const normalize=(path:string)=>path.replace(/\\/g,'/');
   const references=new Set(docsReferenceFiles.map(normalize));
   server.watcher.on('all',(_event,path)=>{if(normalize(path).startsWith(normalize(docsContentDirectory))||references.has(normalize(path))||normalize(path).includes('/docs/assets/')){cache=undefined;server.ws.send({type:'full-reload',path:'*'});}});
   server.middlewares.use((req,res,next)=>{
    const pathname=(req.url??'').split('?')[0];
    if(pathname==='/docs'){res.writeHead(302,{Location:'/docs/'});res.end();return;}
    if(!pathname.startsWith('/docs/'))return next();
    let key=pathname.slice('/docs/'.length);if(!key||key.endsWith('/'))key+='index.html';
    const content=files().get(key);if(content===undefined){res.statusCode=404;res.end('Documentation page not found');return;}
    const type=key.endsWith('.css')?'text/css':/\.m?js$/.test(key)?'text/javascript':key.endsWith('.json')?'application/json':'text/html';
    res.setHeader('Content-Type',type+'; charset=utf-8');res.setHeader('Cache-Control','no-cache');res.end(content);
   });
  },
  generateBundle(){for(const [path,source]of createDocsFiles(options))this.emitFile({type:'asset',fileName:'docs/'+path,source});},
 };
}
