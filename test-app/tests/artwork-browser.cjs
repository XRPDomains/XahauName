// Browser DOM/image behavior with controlled metadata and image responses. No ledger writes.
const {chromium}=require('@playwright/test'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();let metadataRequests=0,releaseImage;
  const imageGate=new Promise(resolve=>releaseImage=resolve);
  await page.route('https://artwork.example/**',async route=>{
   const url=route.request().url();
   if(url.endsWith('/metadata')){metadataRequests++;await route.fulfill({json:{image:'https://artwork.example/image.svg'}});}
   else if(url.endsWith('/broken.svg'))await route.abort();
   else{await imageGate;await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#0078ae"/></svg>'});}
  });
  await page.goto(process.env.APP_TEST_URL??'http://127.0.0.1:5173/');
  await page.evaluate(async()=>{
   const {domainCards}=await import('/src/views.ts'),{renderArtwork}=await import('/src/artwork.ts'),{fetchMetadata}=await import('/src/metadata.ts');
   const host=document.createElement('section');host.id='artwork-fixture';host.innerHTML=domainCards(['one.xah','two.xah'],null)+'<div class="domain-art art-loading" data-art-domain="profile.xah"><img hidden><span>p</span></div>';document.body.prepend(host);
   window.__renderArtwork=renderArtwork;
   window.__resolveArtwork=()=>fetchMetadata('https://artwork.example/metadata');
   window.__artworkDone=Promise.all([...host.querySelectorAll('[data-art-domain]')].map(target=>renderArtwork(target,target.dataset.artDomain,window.__resolveArtwork)));
  });
  await page.waitForFunction(()=>[...document.querySelectorAll('#artwork-fixture img')].every(img=>img.getAttribute('src')));
  assert.equal(metadataRequests,1);
  assert.equal(await page.locator('#artwork-fixture .art-loading').count(),3);
  assert(await page.locator('#artwork-fixture [data-art-domain]>span').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).visibility==='hidden')));
  releaseImage();await page.evaluate(()=>window.__artworkDone);
  assert.equal(await page.locator('#artwork-fixture .has-artwork').count(),3);
  assert(await page.locator('#artwork-fixture img').evaluateAll(nodes=>nodes.every(img=>!img.hidden&&img.naturalWidth>0&&getComputedStyle(img).opacity==='1')));
  await page.evaluate(async()=>{const target=document.querySelector('#artwork-fixture [data-art-domain]');await window.__renderArtwork(target,'one.xah',window.__resolveArtwork);});
  assert.equal(metadataRequests,1);assert.equal(await page.locator('#artwork-fixture .has-artwork').count(),3);
  await page.evaluate(async()=>{const target=document.querySelector('#artwork-fixture [data-art-domain]');await window.__renderArtwork(target,'missing.xah',async()=>null);});
  const first=page.locator('#artwork-fixture [data-art-domain]').first();assert.equal(await first.locator('img').isVisible(),false);assert.equal(await first.locator('span').evaluate(node=>getComputedStyle(node).visibility),'visible');
  await page.evaluate(async()=>{const target=document.querySelector('#artwork-fixture [data-art-domain]');await window.__renderArtwork(target,'broken.xah',async()=>({image:'https://artwork.example/broken.svg'}));});
  assert.equal(await first.locator('img').isVisible(),false);assert.equal(await first.locator('span').evaluate(node=>getComputedStyle(node).visibility),'visible');
  await page.evaluate(async()=>{
   const target=document.querySelector('#artwork-fixture [data-art-domain]');let release;
   const old=window.__renderArtwork(target,'old.xah',()=>new Promise(resolve=>release=resolve));
   await window.__renderArtwork(target,'new.xah',async()=>({image:'https://artwork.example/image.svg'}));release(null);await old;
  });
  assert.equal(await first.getAttribute('data-art-domain'),'new.xah');assert.match(await first.getAttribute('class'),/has-artwork/);
  console.log(JSON.stringify({result:'PASS',checks:['List and profile request images eagerly before monogram fallback','One metadata HTTP fetch shared across cards/profile and refresh','Image failure and absent metadata expose fallback','Stale results cannot replace current artwork'],ledgerRequests:0,submittedTransactions:0}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
