const search=document.getElementById('docs-search'),results=document.getElementById('search-results');
const root=new URL(document.body.dataset.docsRoot,location.href);
let indexPromise,revision=0;
async function searchDocs(){
 const query=search.value.trim().toLowerCase(),request=++revision;
 results.replaceChildren();results.hidden=!query;search.setAttribute('aria-expanded',String(!!query));
 if(!query)return;
 try{
  indexPromise??=fetch(new URL('search-index.json',root)).then(response=>{if(!response.ok)throw new Error('Search unavailable');return response.json();}).catch(error=>{indexPromise=undefined;throw error;});
  const pages=await indexPromise;if(request!==revision)return;
  const words=query.split(/\s+/),matches=pages.filter(page=>words.every(word=>(page.title+' '+page.text).toLowerCase().includes(word))).sort((a,b)=>Number(b.title.toLowerCase().includes(query))-Number(a.title.toLowerCase().includes(query))).slice(0,8);
  if(!matches.length){results.textContent='No matching pages. Try a function name or topic.';return;}
  for(const page of matches){const link=document.createElement('a'),title=document.createElement('strong'),excerpt=document.createElement('span');link.href=new URL(page.href,root).href;title.textContent=page.title;const position=page.text.toLowerCase().indexOf(words[0]),start=Math.max(0,position-35);excerpt.textContent=(start?'…':'')+page.text.slice(start,start+145)+'…';link.append(title,excerpt);results.append(link);}
 }catch{if(request===revision)results.textContent='Search is unavailable. Browse the sidebar to continue.';}
}
search.addEventListener('input',searchDocs);
search.addEventListener('focus',()=>{if(search.value)void searchDocs();});
search.addEventListener('keydown',event=>{if(event.key==='Escape'){revision++;results.hidden=true;search.setAttribute('aria-expanded','false');}if(event.key==='ArrowDown'){event.preventDefault();results.querySelector('a')?.focus();}});
document.addEventListener('click',event=>{if(!event.target.closest('.docs-search')){revision++;results.hidden=true;search.setAttribute('aria-expanded','false');}});
document.querySelector('.docs-search').addEventListener('focusout',event=>{if(!event.relatedTarget?.closest('.docs-search')){revision++;results.hidden=true;search.setAttribute('aria-expanded','false');}});
document.getElementById('docs-menu').addEventListener('click',event=>{const open=document.body.classList.toggle('menu-open');event.currentTarget.setAttribute('aria-expanded',String(open));});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('menu-open')){document.body.classList.remove('menu-open');document.getElementById('docs-menu').setAttribute('aria-expanded','false');document.getElementById('docs-menu').focus();}});
for(const button of document.querySelectorAll('.copy-code'))button.addEventListener('click',async()=>{
 const code=button.closest('.code-example').querySelector('code');
 try{await navigator.clipboard.writeText(code.textContent);button.textContent='Copied';}
 catch{button.textContent='Select code';const selection=window.getSelection(),range=document.createRange();range.selectNodeContents(code);selection.removeAllRanges();selection.addRange(range);}
 setTimeout(()=>{button.textContent='Copy';},1800);
});
