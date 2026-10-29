import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {relative,resolve} from 'node:path';
import {Marked,Renderer} from 'marked';
import ts from 'typescript';
import pages from '../../docs/site/pages.json';

const repository='https://github.com/XRPDomains/XahauName';
const contentRoot=new URL('../../docs/site/',import.meta.url);
const repoRoot=fileURLToPath(new URL('../../',import.meta.url));
const readerSource=new URL('../../docs/examples/verify-domain.mjs',import.meta.url);
export interface DocsOptions {network?:string;wss?:string;deployment?:{treasury:string;namespaceId:string;expectedNetworkId?:number;hookHashes:Record<string,string>}}
export const escapeHTML=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const slug=(text:string)=>text.toLowerCase().replace(/<[^>]+>/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

function sourceTable(file:string,heading:string){
 const source=readFileSync(new URL(file,contentRoot),'utf8').replace(/\r\n/g,'\n'),start=source.indexOf('## '+heading+'\n');
 if(start<0)throw new Error('Missing reference section: '+heading);
 const end=source.indexOf('\n## ',start+4),section=source.slice(start,end<0?undefined:end),table=section.match(/^\|[^\n]*(?:\n\|[^\n]*)+/m)?.[0];
 if(!table)throw new Error('Missing reference table: '+heading);return table;
}
function sdkTypes(){
 const file=resolve(repoRoot,'packages/sdk/src/types.ts'),source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 const names=['ReadOptions','OwnedDomainSummary','RootRecord','FullProfile','ProfileSnapshot','RegistrationStage','RegistrationStatus','DomainQuote','HookExecutionResult','TxResult','SignAndSubmitResult','RefundStatus'];
 const declarations=new Map(source.statements.filter(statement=>ts.isInterfaceDeclaration(statement)||ts.isTypeAliasDeclaration(statement)).map(statement=>[statement.name.text,statement.getText(source)]));
 return names.map(name=>{const declaration=declarations.get(name);if(!declaration)throw new Error('Missing SDK type: '+name);return '```ts\n'+declaration+'\n```';}).join('\n\n');
}

function deploymentMarkdown(options:DocsOptions){
 const network=options.network??'testnet';
 if(!['testnet','mainnet'].includes(network))throw new Error('Unknown Docs network');
 if(network==='mainnet'&&!options.deployment)throw new Error('Mainnet Docs require an explicit deployment');
 const manifest=JSON.parse(readFileSync(new URL('../../deployments/testnet.json',import.meta.url),'utf8'));
 const deployment=options.deployment??{treasury:manifest.treasury,namespaceId:manifest.namespace,expectedNetworkId:manifest.networkID,hookHashes:Object.fromEntries(manifest.handlers.map((handler:{name:string;hash:string})=>[handler.name,handler.hash]))};
 if(deployment.expectedNetworkId!==undefined&&deployment.expectedNetworkId!==(network==='testnet'?21338:21337))throw new Error('Docs deployment network mismatch');
 // Public config is rendered as text, never as executable markup or Markdown syntax.
 const cell=(value:string)=>escapeHTML(value).replace(/\|/g,'&#124;').replace(/`/g,'&#96;').replace(/[\r\n]/g,' ');
 const explorer=`https://${network==='testnet'?'testnet.':''}xahauwin.com/account/${encodeURIComponent(deployment.treasury)}`;
 return {network,
  deployment:`| Setting | Value |\n| --- | --- |\n| Network | Xahau ${network==='testnet'?'Testnet':'Mainnet'} |\n| NetworkID | ${network==='testnet'?21338:21337} |\n| RPC | ${cell(options.wss??(network==='testnet'?'wss://xahau-test.net':'wss://xahau.network'))} |\n| Treasury | ${cell(deployment.treasury)} |\n| Namespace | ${cell(deployment.namespaceId)} |\n\n[View hook account](${explorer})`,
  hooks:`| Handler | Configured hash |\n| --- | --- |\n${Object.entries(deployment.hookHashes).map(([name,hash])=>`| ${cell(name)} | ${cell(hash)} |`).join('\n')}`};
}

/** Generate plain HTML and small static assets. No wallet, RPC or browser Markdown renderer. */
export function createDocsFiles(options:DocsOptions={}):Map<string,string>{
 const config=deploymentMarkdown(options),files=new Map<string,string>(),search:Array<{title:string;href:string;text:string}>=[];
 const assets=new URL('./assets/',import.meta.url);
 files.set('assets/docs.css',readFileSync(new URL('docs.css',assets),'utf8'));
 files.set('assets/docs.js',readFileSync(new URL('docs.js',assets),'utf8'));
 files.set('examples/verify-domain.mjs',readFileSync(readerSource,'utf8'));
 const references={
  '{{operations}}':sourceTable('../SPEC.md','2. Chain and transport'),
  '{{state_table}}':sourceTable('../SPEC.md','5. State'),
  '{{hook_functions}}':sourceTable('../HOOK-FUNCTIONS.md','Entry points and business operations'),
  '{{sdk_types}}':sdkTypes(),
 };
 for(const [index,page]of pages.entries()){
  const sourceURL=new URL(page.file,contentRoot);
  let markdown=readFileSync(sourceURL,'utf8').replace('{{deployment}}',config.deployment).replace('{{hooks}}',config.hooks);
  for(const [token,content]of Object.entries(references))markdown=markdown.replace(token,content);
  const headings:Array<{id:string;text:string}>=[],used=new Map<string,number>();
  const render=(prefix:string)=>{
   headings.length=0;used.clear();
   const renderer=new Renderer();
   renderer.heading=function({depth,tokens}){const text=this.parser.parseInline(tokens),base=slug(text),number=used.get(base)??0;used.set(base,number+1);const id=base+(number?'-'+number:'');if(depth===2)headings.push({id,text:text.replace(/<[^>]+>/g,'')});return `<h${depth} id="${id}">${text}</h${depth}>\n`;};
   renderer.html=({text})=>escapeHTML(text);
   renderer.link=function({href,tokens,title}){
    let target=href;
    if(!/^https?:\/\//i.test(href)&&!href.startsWith('#')){
     if(/^[a-z][a-z0-9+.-]*:/i.test(href))return this.parser.parseInline(tokens);
     const destination=new URL(href,sourceURL),fragment=destination.hash;destination.hash='';
     const local=pages.find(candidate=>new URL(candidate.file,contentRoot).href===destination.href);
     if(local)target=prefix+local.slug+'/'+fragment;
     else if(destination.href===readerSource.href)target=prefix+'examples/verify-domain.mjs';
     else{
      const path=relative(repoRoot,fileURLToPath(destination)).replace(/\\/g,'/');
      if(path.startsWith('../'))return this.parser.parseInline(tokens);
      target=repository+'/blob/main/'+path.split('/').map(encodeURIComponent).join('/')+fragment;
     }
    }
    return `<a href="${escapeHTML(target)}"${title?` title="${escapeHTML(title)}"`:''}${/^https?:/i.test(target)?' target="_blank" rel="noopener noreferrer"':''}>${this.parser.parseInline(tokens)}</a>`;
   };
   renderer.code=({text,lang})=>`<div class="code-example"><div class="code-tools"><span>${escapeHTML(lang??'code')}</span><button type="button" class="copy-code" aria-label="Copy code example">Copy</button></div><pre tabindex="0"><code>${escapeHTML(text)}</code></pre></div>`;
   const body=new Marked({renderer,gfm:true}).parse(markdown,{async:false}).replace(/<table>/g,'<div class="table-scroll" role="region" aria-label="Reference table" tabindex="0"><table>').replace(/<\/table>/g,'</table></div>');
   const groupNames=[...new Set(pages.map(item=>item.group))];
   const nav=groupNames.map(group=>`<div class="sidebar-group"><p>${group}</p>${pages.filter(item=>item.group===group).map(item=>`<a href="${prefix}${item.slug}/"${item.slug===page.slug?' aria-current="page"':''}>${item.title}</a>`).join('')}</div>`).join('');
   const toc=headings.map(heading=>`<a href="#${heading.id}">${escapeHTML(heading.text)}</a>`).join('');
   const previous=pages[index-1],next=pages[index+1];
   const sourcePath=relative(repoRoot,fileURLToPath(sourceURL)).replace(/\\/g,'/');
   return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escapeHTML(page.summary)}"><meta name="theme-color" content="#f3f6fa"><title>${escapeHTML(page.title)} · XahauName Docs</title><link rel="icon" href="https://xrpdomains.xyz/logo/logo.png"><link rel="stylesheet" href="${prefix}assets/docs.css"><script type="module" src="${prefix}assets/docs.js"></script></head><body data-docs-root="${prefix}"><a class="skip-link" href="#content">Skip to content</a><header class="docs-header"><a class="docs-brand" href="${prefix}"><img src="https://xrpdomains.xyz/logo/logo.png" width="28" height="28" alt=""><strong>XahauName</strong><span>Docs</span></a><span class="network-label">${config.network==='testnet'?'Testnet':'Mainnet'}</span><div class="docs-search"><label class="sr-only" for="docs-search">Search documentation</label><input id="docs-search" type="search" placeholder="Search docs…" autocomplete="off" aria-controls="search-results" aria-expanded="false"><div id="search-results" hidden role="region" aria-label="Search results" aria-live="polite"></div></div><nav class="header-links" aria-label="Project"><a href="${prefix}../">Open app ↗</a><a href="${repository}" target="_blank" rel="noopener noreferrer">GitHub ↗</a></nav><button id="docs-menu" type="button" aria-controls="docs-sidebar" aria-expanded="false">Menu</button></header><div class="docs-layout"><aside id="docs-sidebar" class="docs-sidebar"><nav aria-label="Documentation">${nav}</nav></aside><main id="content" tabindex="-1"><p class="page-category">${page.group}</p><details class="mobile-toc"><summary>On this page</summary><nav aria-label="Page sections">${toc}</nav></details><article>${body}</article><nav class="page-navigation" aria-label="Previous and next page">${previous?`<a href="${prefix}${previous.slug}/"><small>Previous</small>${previous.title}</a>`:'<span></span>'}${next?`<a href="${prefix}${next.slug}/"><small>Next</small>${next.title}</a>`:'<span></span>'}</nav><footer class="docs-footer"><a href="${repository}/blob/main/${sourcePath}" target="_blank" rel="noopener noreferrer">View Markdown source ↗</a><span>XahauName · Developer documentation</span></footer></main><aside class="docs-toc"><p>On this page</p><nav aria-label="On this page">${toc}</nav></aside></div></body></html>`;
  };
  files.set(page.slug+'/index.html',render('../'));
  if(index===0)files.set('index.html',render('./'));
  search.push({title:page.title,href:page.slug+'/',text:markdown.replace(/```[\s\S]*?```/g,block=>block.replace(/```[^\n]*\n|```/g,'')).replace(/[#*`|]/g,'').replace(/\s+/g,' ').trim()});
 }
 files.set('search-index.json',JSON.stringify(search));
 return files;
}

export const docsContentDirectory=fileURLToPath(contentRoot);
export const docsReferenceFiles=['../../docs/SPEC.md','../../docs/HOOK-FUNCTIONS.md','../../packages/sdk/src/types.ts','../../docs/examples/verify-domain.mjs'].map(path=>fileURLToPath(new URL(path,import.meta.url)));
