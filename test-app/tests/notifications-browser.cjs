const captureScreenshot=require('./capture-screenshot.cjs');
const {chromium}=require('@playwright/test'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});await page.clock.install();
  await page.goto(process.env.APP_TEST_URL??'http://127.0.0.1:5173/');await page.locator('#portfolio').waitFor({state:'visible'});
  assert.equal(await page.locator('.app-notifications').isVisible(),false);
  await page.evaluate(async()=>{window.__toastFixture=(await import('/tests/notifications-fixture.ts')).mountNotificationFixture();window.__toastFixture.app.show('Waiting for wallet approval…','waiting');});
  const app=page.locator('.app-notifications[data-tone]');
  assert.equal(await page.locator('.xwk-toast-root').count(),0,'Kit transaction toasts must be disabled');
  for(const width of [1440,375,320]){
   await page.setViewportSize({width,height:900});const a=await app.boundingBox();assert(a);assert(a.y>450,'App toast should use bottom-right');assert(a.x>=0&&a.x+a.width<=width);
   await captureScreenshot(page,{path:'../hook/build/current/browser/toasts-'+width+'.png',fullPage:true});
  }
  assert.equal(await app.locator('[role=status]').count(),1);assert.equal(await app.locator('.app-toast-spinner').count(),1);
  const colors=[];
  for(const tone of ['waiting','warning','error','success']){
   await page.evaluate(tone=>window.__toastFixture.app.show('Notification '+tone,tone),tone);
   await page.clock.fastForward(400);
   colors.push(await app.locator('.app-toast').evaluate(n=>getComputedStyle(n).borderLeftColor));
   assert.equal(await app.locator('[role=alert]').count(),tone==='error'?1:0);
  }
  assert.equal(new Set(colors).size,4);
  await page.evaluate(()=>window.__toastFixture.app.clearWaiting());assert.equal(await app.isVisible(),true,'Finishing an action must retain its success toast');
  await page.clock.fastForward(5001);await page.clock.fastForward(200);assert.equal(await app.isVisible(),false);
  await page.evaluate(()=>window.__toastFixture.app.show('Check the transaction before retrying.','warning'));
  await page.clock.fastForward(10000);assert.equal(await app.isVisible(),true);
  await app.getByRole('button',{name:'Dismiss notification'}).click();assert.match(await app.getAttribute('class'),/is-leaving/);await page.clock.fastForward(200);assert.equal(await app.isVisible(),false);
  await page.evaluate(()=>{document.querySelector('#domain-action-dialog').showModal();window.__toastFixture.app.show('Please check the recipient.','error');});
  assert.equal(await app.evaluate(n=>n.parentElement.id),'domain-action-dialog');assert.equal(await app.isVisible(),true);
  await app.getByRole('button',{name:'Dismiss notification'}).click();await page.evaluate(()=>document.querySelector('#domain-action-dialog').close());
  await page.waitForFunction(()=>document.querySelector('.app-notifications[data-tone]')?.parentElement===document.body);
  await page.setViewportSize({width:320,height:320});
  await page.evaluate(()=>window.__toastFixture.app.show('The transaction status is unknown. Reconnect and check the transaction hash before trying again. Do not send another purchase payment. Full details remain available in Activity.','warning'));
  await page.clock.fastForward(400);const smallApp=await app.boundingBox();assert(smallApp.y>=0&&smallApp.y+smallApp.height<=320);
  assert(await app.locator('.app-toast-content').evaluate(node=>node.scrollHeight>node.clientHeight&&node.tabIndex===0),'Long notices remain fully readable with keyboard-accessible scrolling');
  await page.evaluate(()=>{window.__toastFixture.app.show('Old phase','waiting');window.__toastFixture.app.show('Latest phase','success');window.__toastFixture.app.clearWaiting();});
  await page.clock.fastForward(400);assert.equal(await app.locator('.app-toast-message').innerText(),'Latest phase');assert.equal(await app.getAttribute('data-tone'),'success');
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.__toastFixture.app.dismiss());assert.equal(await app.isVisible(),false);
  await page.evaluate(()=>window.__toastFixture.dispose());
  console.log(JSON.stringify({result:'PASS',checks:['Single bottom-right app toast at 320–1440px; Kit toasts disabled','Four distinct tones and accessible roles','Success fades out; warnings persist; rapid phase changes keep the latest status','Modal toast stays visible and returns to page on close'],submittedTransactions:0}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
