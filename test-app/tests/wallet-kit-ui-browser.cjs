// Real Kit UI, public-account readonly balance; no wallet approval or ledger writes.
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.APP_TEST_URL??'http://127.0.0.1:5173/');
  await page.evaluate(async()=>{
   const host=document.createElement('div');host.id='kit-ui-fixture';host.className='wallet-control';host.style.cssText='width:500px;padding:16px';document.body.prepend(host);
   window.__kitFixture=await(await import('/tests/wallet-balance-fixture.ts')).mountReadOnlyBalance(host);
  });
  const balance=page.locator('#kit-ui-fixture .xwk-button-balance');
  await balance.waitFor({state:'visible'});
  const previous=await balance.innerText();assert.match(previous,/XAH/);
  assert.notEqual(previous,`(${await balance.getAttribute('title')})`,'Button should compact the full public-account balance');
  await page.evaluate(()=>{window.__kitRefresh=window.__kitFixture.refreshWithDelay(1500);});
  await page.waitForTimeout(100);
  assert.equal(await balance.innerText(),previous,'Keep known balance during refresh');
  assert.equal(await page.locator('#kit-ui-fixture .xwk-skeleton-button-balance').count(),0);
  await page.evaluate(()=>window.__kitRefresh);
  await page.locator('#kit-ui-fixture').evaluate(node=>node.style.width='180px');
  await page.waitForFunction(()=>document.querySelector('#kit-ui-fixture [data-xwk-wallet-button]')?.hasAttribute('data-xwk-hide-balance'));
  assert.equal(await balance.isVisible(),false);
  await page.locator('#kit-ui-fixture [data-xwk-wallet-button]').click();
  const panel=page.locator('.xwk-account-panel');await panel.waitFor({state:'visible'});
  assert.match(await panel.locator('.xwk-pill-balance').innerText(),/XAH/);
  assert.equal(await page.locator('#kit-ui-fixture .xwk-button-network').count(),0);
  assert.deepEqual(errors,[]);
  await page.evaluate(()=>window.__kitFixture.dispose());
  console.log(JSON.stringify({result:'PASS',checks:['Compact button balance','Known balance stays visible during refresh','Narrow button hides balance','Account panel keeps balance','No button network badge'],submittedTransactions:0}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
