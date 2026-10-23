type Artwork={image:string|null;caption?:string}|null;
const generations=new WeakMap<HTMLElement,number>();
const pendingLoads=new WeakMap<HTMLElement,()=>void>();
/** Image-first rendering; no hidden lazy-image deadlock or monogram flash. */
export async function renderArtwork(target:HTMLElement,name:string,resolve:()=>Promise<Artwork>,caption?:HTMLElement){
 pendingLoads.get(target)?.();
 const generation=(generations.get(target)??0)+1;generations.set(target,generation);
 const current=()=>generations.get(target)===generation&&target.isConnected;
 const img=target.querySelector<HTMLImageElement>('img')!;
 const keep=target.dataset.artDomain===name&&target.classList.contains('has-artwork');
 target.dataset.artDomain=name;target.classList.add('art-loading');
 if(!keep){target.classList.remove('has-artwork');img.hidden=true;img.removeAttribute('src');}
 const fallback=()=>{if(!current())return;target.classList.remove('art-loading','has-artwork');img.hidden=true;img.removeAttribute('src');if(caption)caption.textContent='Artwork unavailable';};
 try{
  const result=await resolve();if(!current())return;
  if(!result?.image){fallback();return;}
  const image=result.image;
  if(keep&&img.getAttribute('src')===result.image&&img.complete&&img.naturalWidth>0){target.classList.remove('art-loading');if(caption)caption.textContent=result.caption??'Artwork from token metadata';return;}
  await new Promise<void>((done)=>{
   const finish=()=>{clearTimeout(timer);if(pendingLoads.get(target)===finish){pendingLoads.delete(target);img.onload=null;img.onerror=null;}done();};
   const timer=setTimeout(()=>{fallback();finish();},8000);pendingLoads.set(target,finish);
   const success=()=>{if(current()){img.hidden=false;target.classList.add('has-artwork');target.classList.remove('art-loading');if(caption)caption.textContent=result.caption??'Artwork from token metadata';}finish();};
   const failure=()=>{fallback();finish();};img.onload=success;img.onerror=failure;
   // Hidden + loading="lazy" can defer a request indefinitely. Load the image
   // now; CSS masks it while pending, and only errors expose the monogram.
   img.loading='eager';img.decoding='async';img.alt='Artwork for '+name;img.hidden=false;img.src=image;
   if(img.complete){if(img.naturalWidth>0)success();else failure();}
  });
 }catch{fallback();}
}
