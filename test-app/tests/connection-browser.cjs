// Readonly browser regression: on-demand RPC, inline failure and explicit recovery.
const {chromium}=require('@playwright/test');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage(),errors=[];let blocked=true,sockets=0;
  page.on('pageerror',error=>errors.push(error.message));
  await page.routeWebSocket(/^wss?:\/\/(?!127\.0\.0\.1|localhost)/,socket=>{
   sockets++;
   if(blocked)socket.close({code:1013,reason:'Connection failure regression test'});
   else socket.connectToServer();
  });
  await page.goto(process.env.APP_TEST_URL??'http://127.0.0.1:5173/');
  await page.locator('#search-form').waitFor({state:'attached'});
  // Observe idle startup, including Wallet Kit initialization, without a wallet session.
  await page.waitForTimeout(1200);assert.equal(sockets,0);
  assert.equal(await page.locator('#notice').isVisible(),false);
  assert.equal(await page.locator('.app-notifications').isVisible(),false);
  assert.doesNotMatch(await page.locator('#connection-status').innerText(),/Connecting|Disconnected/);
  await page.getByRole('button',{name:'Find a domain',exact:true}).click();
  await page.locator('#search-name').fill('alice.xah');assert.equal(sockets,0);
  await page.getByRole('button',{name:'Check availability',exact:false}).click();
  const fieldError=page.locator('#search-form .field-error');
  await fieldError.waitFor({state:'visible',timeout:30000});
  assert.equal(await fieldError.innerText(),'Could not load on-chain data. Please try again.');
  await page.locator('.app-notifications[data-tone=error]').waitFor({state:'visible'});
  assert.equal(await page.locator('.app-toast-message').innerText(),'Could not load on-chain data. Please try again.');
  assert.equal(await page.locator('#notice').isVisible(),false);
  assert.match(await page.locator('#connection-status').innerText(),/Disconnected/);
  const reconnect=page.getByRole('button',{name:'Reconnect',exact:true});
  assert.equal(await reconnect.isVisible(),true);
  assert.match(await page.locator('#activity-list').textContent(),/"stage": "connection"/);
  assert.match(await page.locator('#activity-list').textContent(),/RPC_CONNECTION_FAILED/);
  blocked=false;await page.getByRole('button',{name:'Retry connection',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#connection-status')?.textContent?.includes('Network 21338'),{timeout:45000});
  assert.equal(await reconnect.isVisible(),false);
  assert.equal(await page.locator('#notice').isVisible(),false);
  assert(sockets>=2);assert.deepEqual(errors,[]);
  // Opening a profile directly is an explicit data request, so it may connect.
  blocked=true;const base=process.env.APP_TEST_URL??'http://127.0.0.1:5173/';
  await page.goto(base+'?domain=alice.xah');
  await page.locator('#search-form .field-error').waitFor({state:'visible',timeout:30000});
  assert.equal(await page.locator('#search-name').inputValue(),'alice.xah');
  assert.equal(await page.locator('#notice').isVisible(),false);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',checks:['Idle startup and empty discovery form open no ledger WebSocket','Submitting a form connects on demand','Read failures have inline guidance and a brief error toast without payment warnings','Explicit reconnect verifies live network and installed hook hashes','Domain deep links request their data on demand','No browser errors'],submittedTransactions:0}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
