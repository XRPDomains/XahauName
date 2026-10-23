// Readonly live profile measurements. No wallet session, signing or ledger writes.
const {chromium}=require('@playwright/test'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage(),errors=[],frames=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('websocket',socket=>{
   if(!socket.url().startsWith('wss:'))return;
   socket.on('framesent',frame=>{try{const q=JSON.parse(String(frame.payload));delete q.id;frames.push(q);}catch{}});
  });
  await page.goto(process.env.APP_TEST_URL??'http://127.0.0.1:5173/');
  const results=[],domain=process.env.PROFILE_TEST_DOMAIN??'sdklive13386530.xah';
  for(const phase of ['initial connection','existing connection']){
   await page.getByRole('button',{name:'Find a domain',exact:true}).click();
   await page.locator('#lookup-name').fill(domain);frames.length=0;
   const start=Date.now();await page.getByRole('button',{name:'View profile',exact:true}).click();
   await page.locator('#profile-section').waitFor({state:'visible',timeout:45000});
   const data=frames.filter(q=>q.command==='ledger_entry'||q.command==='ledger');
   const duplicateDataRpc=data.length-new Set(data.map(q=>JSON.stringify(q))).size;
   assert.equal(duplicateDataRpc,0,'Profile must not issue duplicate ledger-data reads');
   assert.equal(await page.locator('#identity-name').innerText(),domain);
   results.push({phase,ms:Date.now()-start,totalRpc:frames.length,profileDataRpc:data.length,duplicateDataRpc});
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',domain,measurements:results,submittedTransactions:0},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
