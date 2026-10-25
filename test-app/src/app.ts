import {appMarkup} from './app-markup';
import {ActivityHistory} from './activity';
import {createWalletKit} from '@xrpl-wallet-kit/client';
import {XahauNameClient, createWalletKitRpcTransport, util, explainError, normalizeDomainInput, diffProfile, type ProfileTextKey, type FullProfile, type RegistrationStatus, type TxResult} from '@xahauname/sdk';
import {assertNetwork,createWalletSigner,MAX_FEE} from './wallet-signer';
import './styles.css';
import {XAMAN_CLIENT_ID,DEPLOYMENT,CHAIN} from './config';
import {NETWORKS,PROFILE_FIELDS,networkName,encodeAddress,decodeAddress} from './records';
import {fetchMetadata,metadataURL,mediaURL} from './metadata';
import {purchaseThenClaim} from './purchase';
import {domainCards,incomingDomainCards,addressRows,profileFieldForms,escapeHTML as esc} from './views';
import {createBalanceResolver} from './wallet-balance';
import {enhanceDomainInputs} from './domain-input';
import {renderArtwork} from './artwork';
import {createNotifications,type NotificationTone,type NotificationAction} from './notifications';

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const short = (s: string) => s.length > 22 ? s.slice(0,10)+'…'+s.slice(-8) : s;
const amount = (drops: bigint|string) => {const n=BigInt(drops),fraction=(n%1000000n).toString().padStart(6,'0').replace(/0+$/,'');return `${n/1000000n}${fraction?'.'+fraction:''} XAH`;};
const explorer = (hash: string) => `${CHAIN.explorer}${encodeURIComponent(hash)}`;
el('app').innerHTML=appMarkup();

const reader = new XahauNameClient({...DEPLOYMENT,cacheTtlMs:0,connectionTimeoutMs:6000,connectionAttempts:2});
let readerConnection: Promise<void> | undefined;
const reconnectButton = document.createElement('button');
reconnectButton.type = 'button';reconnectButton.className = 'subtle';reconnectButton.textContent = 'Reconnect';reconnectButton.hidden = true;
el('connection-status').after(reconnectButton);
function connectionUnavailable(){el('connection-status').textContent=`${CHAIN.label} · Disconnected`;reconnectButton.hidden=false;}
reader.rawClient.on('disconnected',connectionUnavailable);
let writer: XahauNameClient | null = null, selected = '', profile: FullProfile | null = null, busy = false, checked: {name:string;status:RegistrationStatus;price:bigint}|null = null, epoch=0,currentAction='';
const activity=new ActivityHistory();
function log(label:string,result:string,hash?:string,details?:unknown) {activity.add({label,result,hash,details});el('activity-count').textContent=String(activity.size);el('activity-list').innerHTML=activity.recent().map(r=>`<article><div><strong>${esc(r.label)}</strong><span>${esc(r.result)}</span></div>${r.hash?`<a class="mono" href="${explorer(r.hash)}" target="_blank" rel="noreferrer">${esc(short(r.hash))} ↗</a>`:''}${r.details?`<details><summary>Hook executions / result</summary><pre>${esc(JSON.stringify(r.details,(_k,v)=>typeof v==='bigint'?v.toString():v,2))}</pre></details>`:''}</article>`).join('');}
const kit = createWalletKit({network:CHAIN.walletKitId,wallets:XAMAN_CLIENT_ID?['gemwallet','xyra','xaman']:['gemwallet','xyra'],xamanClientId:XAMAN_CLIENT_ID,autoReconnect:true,storage:'localStorage',preflight:{maxFeeDrops:MAX_FEE},transactionConfirmation:{enabled:false},accountStatus:{enabled:false},metadata:{name:'XahauName',description:'Manage domains on '+CHAIN.label,url:location.origin},connectButton:{target:'#connect-wallet',showBalance:true,balanceResolver:createBalanceResolver(reader,ready)},xahau:{request:createWalletKitRpcTransport(reader.rawClient,ready,CHAIN.walletKitId)},ui:{mode:'light',toast:false}});
const notifications=createNotifications();
function notice(message:string,tone:NotificationTone='success',action?:NotificationAction){notifications.show(message,tone,action);}
let actionDomain='';
let currentView="portfolio";
function view(name:string,focus=true){currentView=name;for(const v of ['portfolio','discover','profile-section'])el(v).hidden=v!==name;document.querySelectorAll<HTMLElement>('.nav').forEach(n=>{const active=n.dataset.view===(name==='profile-section'?'portfolio':name);n.classList.toggle('active',active);if(active)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});el('page-eyebrow').textContent=name==='profile-section'?'DOMAIN PROFILE':'DOMAIN MANAGER';el('page-heading').textContent=name==='discover'?'Find a domain':name==='profile-section'?selected:'My domains';el('page-description').textContent=name==='discover'?'Find a name. Make it yours.':name==='profile-section'?'Addresses, profile, and settings.':'Manage your on-chain identity.';el('find-domain').hidden=name!=='portfolio';el('close-profile').hidden=name!=='profile-section';if(focus)el('page-heading').focus({preventScroll:true});}
document.querySelectorAll('[data-view]').forEach(n=>n.addEventListener('click',()=>{const target=n.getAttribute('data-view')!;view(target);if(target==='portfolio'&&writer)void run('Refresh domains',refreshDomains);}));
function canonical(input:string){return normalizeDomainInput(input);}
el('search-name').addEventListener('input',()=>{checked=null;el('search-result').replaceChildren();});
enhanceDomainInputs([el<HTMLInputElement>('search-name'),el<HTMLInputElement>('lookup-name'),el<HTMLFormElement>('register-form').querySelector<HTMLInputElement>('[name="domain"]')!]);
function writeClient(){if(!writer)throw new Error(`Connect a ${CHAIN.label} wallet to continue.`);assertNetwork(kit.manager,writer.signerAddress??undefined);return writer;}
function updateActions(){el('admin-panel').hidden=writer?.signerAddress!==DEPLOYMENT.treasury;const own=!!writer&&profile?.owner===writer.signerAddress;document.querySelectorAll<HTMLElement>('.owner-action').forEach(n=>n.hidden=!own);document.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{if(b.closest('#connect-wallet,.app-notifications'))return;b.disabled=busy||(b.id==='refresh-domains'&&!writer);});updateProfileState();}
function progress(message:string){notifications.show(message,'waiting');}
async function run(label:string,fn:()=>Promise<unknown>,errorTarget?:HTMLElement){
 if(busy)return;busy=true;currentAction=label;updateActions();el('notice').hidden=true;el('notice').setAttribute('aria-busy','true');progress(label+'…');
 const dialog=el<HTMLDialogElement>('domain-action-dialog'),actionStatus=el('action-status');
 if(dialog.open)actionStatus.hidden=true;
 try{const r:any=await fn();if(r?.txHash)log(label,r.engineResult,r.txHash,r.hookExecutions??r.rawMeta);notice(r?.message??label+' completed.',r?.warning?'warning':'success');return r;}
 catch(e:any){const info=explainError(e);if(currentAction==='Buy & claim domain'&&info.txHash){el('buy-name')?.remove();checked=null;el<HTMLFormElement>('receipt-form').querySelector<HTMLInputElement>('[name=hash]')!.value=info.txHash;}log(label,info.title,info.txHash,{...info,technicalMessage:e.message,hookExecutions:e.details?.hookExecutions});if(errorTarget){errorTarget.textContent=info.message;errorTarget.hidden=false;}notice(info.message,info.stage==='confirmation'?'warning':'error',info.stage==='connection'?{label:'Retry connection',run:()=>reconnectButton.click()}:undefined);if(dialog.open&&!errorTarget){actionStatus.hidden=false;actionStatus.textContent=info.message;actionStatus.className='error';}}
 finally{busy=false;currentAction='';notifications.clearWaiting();if(kit.manager.getAccount()&&reader.isConnected())void kit.refreshBalance();el('notice').removeAttribute('aria-busy');updateActions();}
}
function form(id:string,fn:(data:FormData)=>Promise<unknown>){const f=el<HTMLFormElement>(id);const error=document.createElement('p');error.className='field-error';error.hidden=true;error.setAttribute('role','alert');f.append(error);f.addEventListener('submit',e=>{e.preventDefault();error.hidden=true;const submitter=(e as SubmitEvent).submitter as HTMLButtonElement|null;void run(submitter?.textContent??f.querySelector<HTMLButtonElement>('button[type=submit],button:not([type])')?.textContent??'Save',()=>fn(new FormData(f)),error);});}
async function ready(){
 if(readerConnection)return readerConnection;
 if(reader.isConnected())return;
 reconnectButton.disabled=true;el('connection-status').textContent=`Connecting to ${CHAIN.label}…`;
 readerConnection=reader.connect().then(()=>{el('connection-status').textContent=`${CHAIN.label} · Network ${CHAIN.networkId}`;reconnectButton.hidden=true;},error=>{connectionUnavailable();throw error;});
 try{await readerConnection;}finally{readerConnection=undefined;reconnectButton.disabled=false;}
}
reconnectButton.onclick=()=>void run('Reconnect to ledger',async()=>{await ready();if(kit.manager.getAccount()&&!writer)await connectWriter();});
async function connectWriter(){
 const generation=++epoch;await ready();if(generation!==epoch)return;
 const signer=createWalletSigner(kit.manager,{request:async request=>{await ready();return reader.rawClient.request(request);}},hash=>{log('Submitted — awaiting confirmation','submitted',hash);progress('Confirming transaction…');if(currentAction==='Buy & claim domain'){el('buy-name')?.remove();checked=null;}},result=>{kit.manager.addTransaction({hash:result.txHash,status:result.engineResult==='tesSUCCESS'?'confirmed':'failed',result,confirmedAt:Date.now()});});
 reader.setSigner(signer);writer=reader;
 if(currentView==='portfolio')await refreshDomains();void kit.refreshBalance();if(selected&&currentView==='profile-section')await loadProfile(selected);
}
let walletSyncTimer:ReturnType<typeof setTimeout>|undefined;
function syncWallet(){if(walletSyncTimer!==undefined)return;const attempt=()=>{walletSyncTimer=undefined;if(!kit.manager.getAccount())return;if(busy){walletSyncTimer=setTimeout(attempt,200);return;}void run('Connect wallet',connectWriter);};attempt();}
kit.manager.on('connected',syncWallet);
kit.manager.on('accountChanged',syncWallet);
kit.manager.on('disconnected',()=>{if(walletSyncTimer!==undefined){clearTimeout(walletSyncTimer);walletSyncTimer=undefined;}el('incoming-section').hidden=true;el('incoming-list').replaceChildren();el('incoming-error').hidden=true;epoch++;incomingController?.abort();writer=null;reader.setSigner(null);el('domain-count').textContent='—';el('wallet-caption').textContent='Connect your wallet to view your domains.';el('domain-list').innerHTML='<div class="empty"><h3>Wallet disconnected.</h3><p>Reconnect to manage your domains.</p></div>';updateActions();});
kit.manager.on('networkChanged',()=>{try{assertNetwork(kit.manager);}catch(e:any){el('incoming-section').hidden=true;el('incoming-list').replaceChildren();writer=null;reader.setSigner(null);epoch++;incomingController?.abort();notice(e.message,'error');updateActions();}});
kit.manager.on('error',({error}:any)=>{const info=explainError(error);if(info.stage==='connection'){connectionUnavailable();return;}notice(info.message,'error');});
let portfolioRequest=0,incomingController:AbortController|undefined;
async function refreshDomains(){
 if(!writer){kit.openModal();return;}await ready();const c=writeClient(),account=c.signerAddress!,generation=epoch,request=++portfolioRequest;incomingController?.abort();
 const portfolio=await c.getPortfolio(account,{bypassCache:true});if(generation!==epoch||request!==portfolioRequest)return;
 const names=portfolio.domains.map(record=>record.domain),opts={ledgerHash:portfolio.ledgerHash,bypassCache:true};
 el('domain-count').textContent=String(names.length);el('wallet-caption').textContent=short(account)+(portfolio.primary?' · '+portfolio.primary:'');renderDomainCards(names,portfolio.primary);
 el('incoming-error').hidden=true;
 const current=()=>generation===epoch&&request===portfolioRequest;
 const controller=new AbortController();incomingController=controller;
 void (async()=>{try{const incoming=await c.listIncomingDomains(account,{...opts,signal:controller.signal});if(!current())return;el('incoming-error').hidden=true;const offers=incoming.offers;el('incoming-section').hidden=!offers.length;el('incoming-count').textContent=String(offers.length);el('incoming-list').innerHTML=incomingDomainCards(offers);let cursor=0;const enrich=async()=>{while(cursor<offers.length){const offer=offers[cursor++];if(!current())return;const target=Array.from(el('incoming-list').querySelectorAll<HTMLElement>('[data-art-domain]')).find(n=>n.dataset.artDomain===offer.domain);if(target)await hydrateArtwork(offer.domain,target,opts,offer.uri);}};void Promise.allSettled([enrich(),enrich(),enrich()]);}catch(error){if(!current())return;el('incoming-error').hidden=false;el('incoming-error').className='incoming-note hint';el('incoming-error').textContent='Incoming offers could not be refreshed. Use Refresh to try again.';log('Incoming offers','Refresh pending',undefined,{technicalMessage:String((error as Error)?.message??error)});}})();
 void (async()=>{let cursor=0;
  const enrich=async()=>{while(cursor<portfolio.domains.length){const record=portfolio.domains[cursor++];if(!current())return;const target=Array.from(el('domain-list').querySelectorAll<HTMLElement>('[data-art-domain]')).find(n=>n.dataset.artDomain===record.domain);if(target)await hydrateArtwork(record.domain,target,opts,record.uri);}};await Promise.allSettled([enrich(),enrich(),enrich()]);})().catch(()=>{});
}

function displayAddr(ct:number,b:Buffer){return decodeAddress(ct,b).value;}
async function loadProfile(name:string){
 const generation=epoch;await ready();const snapshot=await reader.read.getProfile({name}),p=snapshot?.profile??null;if(generation!==epoch)return;selected=name;profile=p;
 if(!p){el('profile-section').hidden=true;throw new Error('This domain has not been claimed yet. Use “Check availability” to inspect its pending status or offer.');}
 view('profile-section',false);el('profile-name').textContent=name;el('identity-name').textContent=name;el('domain-monogram').textContent=name[0];el('identity-status').textContent=p.owner===writer?.signerAddress?'Your domain':'Public profile';el('profile-owner').textContent=short(p.owner);el('profile-owner').title=p.owner;el('profile-owner-full').textContent=p.owner;el('copy-owner').textContent='Copy';el('profile-primary').textContent=p.primary?'Primary':'Not set';el('profile-lock').textContent=p.locked?'Legacy locked profile':'Editable';
 const {tokenId,uri,transferOffer,ledgerHash}=snapshot!;el('profile-token').textContent=tokenId;el('transfer-claim').hidden=!(writer&&transferOffer?.destination===writer.signerAddress&&transferOffer?.amountDrops==='0'&&p.owner!==writer.signerAddress);
 el('profile-uri').textContent=uri;void hydrateArtwork(name,el('profile-art'),{ledgerHash,bypassCache:true,profileAvatar:p.texts.avatar??null},uri);el('primary-button').textContent=p.primary?'Unset primary':'Set primary';
 renderRecords(p);updateActions();
}
async function mutate(label:string,fn:(c:XahauNameClient)=>Promise<TxResult>){return run(label,async()=>{const c=writeClient(),r=await fn(c);log(label,r.engineResult,r.txHash,r.hookExecutions);await refreshConfirmed(selected||undefined);return{message:label+' confirmed.'};});}
async function refreshConfirmed(name?:string){
 try{if(name&&currentView!=='portfolio')await loadProfile(name);else if(currentView==='portfolio')await refreshDomains();return true;}
 catch(error){log('Refresh view','Pending',undefined,{message:'The transaction is confirmed; the view could not be refreshed.',technicalMessage:String((error as Error)?.message??error)});return false;}
}
async function checkName(name:string){
 await ready();checked=null;const quote=await reader.read.getQuote({name,bypassCache:true});if(!quote.tldEnabled)throw new Error('This TLD is not enabled. Try .xah or .xahau.');
 const status=quote.status,price=quote.priceDrops;try{if(canonical(el<HTMLInputElement>('search-name').value)!==name)return;}catch{return;}checked={name,status,price};
 const labels={available:'Available',pending:'Creating token',awaitingClaim:'Ready to claim',claimed:'Already owned',refundPending:'Refund pending',recoveryRequired:'Recovery required'};
 el('search-result').innerHTML=`<div class="name-result"><div><strong>${esc(name)}</strong><span>${labels[status.stage]}</span></div><b>${status.stage==='available'?esc(amount(price)):''}</b></div>${status.stage==='available'?'<p class="hint">Purchase, then claim · 2 approvals plus fees.</p><button id="buy-name" class="primary">Buy & claim domain</button>':status.stage==='awaitingClaim'?`<p>Recipient: <span class="mono">${esc(status.recipient)}</span></p><button id="claim-name" class="primary">Claim domain</button>`:status.stage==='claimed'?'<button id="open-name" class="subtle">View profile ↗</button>':'<p class="hint">Do not send another payment. Refresh the status to check progress.</p>'}<button id="refresh-name" class="subtle">↻ Refresh status</button>`;
 el('buy-name')?.addEventListener('click',()=>void run('Buy & claim domain',async()=>{
  const c=writeClient(),account=c.signerAddress;const result=await purchaseThenClaim(c.registrar,util.splitDomain(name),{purchased:r=>{log('Purchase confirmed',r.engineResult,r.txHash,r.hookExecutions);progress('Purchase confirmed. Waiting for the mint and sell offer…');},claiming:()=>{if(writer!==c||writer.signerAddress!==account)throw new Error('Wallet changed. Reconnect the recipient wallet to claim.');progress('Approve the claim request in your wallet…');}});
  if(result.pendingClaim){const info=explainError(result.error);log('Claim pending',info.title,result.purchase.txHash,{...info,technicalMessage:String((result.error as Error)?.message??result.error)});return{message:'Purchase confirmed. '+(info.code==='REGISTRATION_FAILED'?info.message:'Claim is not completed yet. Refresh status to continue claiming; do not buy again.'),warning:true};}
  log('Domain claimed',result.claim.engineResult,result.claim.txHash,result.claim.hookExecutions);const refreshed=await refreshConfirmed(name);return{message:refreshed?'Your domain is now in your wallet.':'Domain claimed. Refresh the profile to load its latest data.'};
 }));
 el('claim-name')?.addEventListener('click',()=>void run('Claim domain',async()=>{const r=await writeClient().registrar.claim(name);log('Claim domain',r.engineResult,r.txHash,r.hookExecutions);await refreshConfirmed(name);}));el('open-name')?.addEventListener('click',()=>void run('Load profile',()=>loadProfile(name)));el('refresh-name')?.addEventListener('click',()=>void run('Check availability',()=>checkName(name)));
}

function renderDomainCards(names:string[],primary:string|null){
 el('domain-list').innerHTML=names.length?domainCards(names,primary):'<div class="empty"><span class="empty-mark">.xah</span><h3>Find your first name.</h3><p>This wallet does not own any claimed domains yet.</p><button class="subtle" id="empty-search">Find a domain ↗</button></div>';
 el('empty-search')?.addEventListener('click',()=>view('discover'));
}
el('incoming-list').addEventListener('click',e=>{const button=(e.target as Element).closest<HTMLElement>('[data-claim-domain]');if(!button)return;const name=button.dataset.claimDomain!;void run('Claim domain',async()=>{const r=await writeClient().registrar.claimIncoming(name);log('Claim domain',r.engineResult,r.txHash,r.hookExecutions);await refreshConfirmed(name);return{message:name+' is now in your wallet.'};});});
el('domain-list').addEventListener('click',e=>{const button=(e.target as Element).closest<HTMLElement>('button');if(!button)return;if(button.dataset.transfer)openDomainAction('transfer',button.dataset.transfer);else if(button.dataset.burn)openDomainAction('burn',button.dataset.burn);else if(button.dataset.domain)void run('Load profile',()=>loadProfile(button.dataset.domain!));});
function openDomainAction(action:'transfer'|'burn',domain:string){if(busy)return;actionDomain=domain;el('action-title').textContent=action==='transfer'?'Transfer domain':'Burn domain';el('action-domain').textContent=domain;el('action-status').hidden=true;el<HTMLFormElement>('transfer-form').reset();el<HTMLFormElement>('burn-form').reset();el('transfer-form').hidden=action!=='transfer';el('burn-form').hidden=action!=='burn';el<HTMLFormElement>('burn-form').querySelector<HTMLInputElement>('[name="confirmation"]')!.placeholder=domain;el<HTMLDialogElement>('domain-action-dialog').showModal();}
el('close-action').onclick=()=>el<HTMLDialogElement>('domain-action-dialog').close();
el('copy-owner').onclick=async()=>{if(!profile)return;try{await navigator.clipboard.writeText(profile.owner);el('copy-owner').textContent='Copied';}catch{el('copy-owner').textContent='Copy';notice('Copy the owner address from On-chain details.','warning');}};
const artworkBases=new Map<string,Promise<string|null>>();
async function hydrateArtwork(name:string,target:HTMLElement,opts:any={},knownURI?:string|null){
 return renderArtwork(target,name,async()=>{
  const uri=knownURI??await reader.registrar.getTokenURI(name,opts);
  let base=opts.legacyBase;
  if(uri===name&&base===undefined){const key=String(opts.ledgerHash);if(!artworkBases.has(key)){if(artworkBases.size>=20)artworkBases.delete(artworkBases.keys().next().value!);const request=reader.registrar.getURIBase(opts);artworkBases.set(key,request);void request.catch(()=>artworkBases.delete(key));}base=await artworkBases.get(key);}
  const metadata=uri?await fetchMetadata(metadataURL(uri,name,base)??''):null;
  if(metadata?.image)return{image:metadata.image,caption:'Token artwork'};
  const avatar=mediaURL(opts.profileAvatar);return avatar?{image:avatar,caption:'Profile avatar'}:null;
 },target.id==='profile-art'?el('metadata-caption'):undefined);
}
function addressEditor(coin:number){const data=profile?.addrs[coin],decoded=data?decodeAddress(coin,data):null,known=NETWORKS.some(n=>n.coin===coin);el<HTMLSelectElement>('address-network').value=known?String(coin):'custom';el<HTMLFormElement>('addr-form').querySelector<HTMLInputElement>('[name="coin"]')!.value=String(coin);el<HTMLInputElement>('address-raw').checked=decoded?.format==='hex'||!known;updateAddressNetwork();el<HTMLFormElement>('addr-form').querySelector<HTMLInputElement>('[name="address"]')!.value=decoded?.value??'';el('addr-form').scrollIntoView({behavior:'smooth',block:'center'});}
function updateAddressNetwork(){const select=el<HTMLSelectElement>('address-network'),custom=select.value==='custom',raw=el<HTMLInputElement>('address-raw');el('custom-coin-label').hidden=!custom;if(custom)raw.checked=true;const input=el<HTMLFormElement>('addr-form').querySelector<HTMLInputElement>('[name="address"]')!;input.placeholder=raw.checked?'Hex bytes (without 0x)':NETWORKS.find(n=>String(n.coin)===select.value)?.placeholder??'Wallet address';}
el('address-network').addEventListener('change',()=>{el<HTMLInputElement>('address-raw').checked=false;el<HTMLFormElement>('addr-form').querySelector<HTMLInputElement>('[name="address"]')!.value='';updateAddressNetwork();});el('address-raw').addEventListener('change',updateAddressNetwork);
function renderRecords(p:FullProfile){
 el('address-list').innerHTML=addressRows(p.addrs);el('profile-fields').innerHTML=profileFieldForms(p.texts,p.owner===writer?.signerAddress&&!p.locked);
 const standards=new Set<string>(PROFILE_FIELDS.map(f=>f.key));el('text-list').innerHTML=Object.entries(p.texts).filter(([key])=>!standards.has(key)).map(([key,value])=>`<div class="record"><div><span>${esc(key)}</span><p>${esc(value)}</p></div><button class="subtle owner-action" data-clear-text="${esc(key)}">Remove</button></div>`).join('')||'<p class="placeholder">No custom text records yet.</p>';
 if(!p.textKeysComplete)el('text-list').insertAdjacentHTML('beforeend',`<p class="hint">Some legacy keys have no stored name. Save the original key again to add its name.</p><pre>${esc(JSON.stringify(p.unnamedTexts,null,2))}</pre>`);
 el('address-list').querySelectorAll<HTMLButtonElement>('[data-edit-addr]').forEach(b=>b.onclick=()=>addressEditor(Number(b.dataset.editAddr)));
 el('address-list').querySelectorAll<HTMLButtonElement>('[data-clear-addr]').forEach(b=>b.onclick=()=>void mutate('Remove address',c=>c.resolver.clearAddr({...util.splitDomain(selected),coinType:Number(b.dataset.clearAddr)})));
 el('text-list').querySelectorAll<HTMLButtonElement>('[data-clear-text]').forEach(b=>b.onclick=()=>void mutate('Remove text record',c=>c.resolver.clearText({...util.splitDomain(selected),key:b.dataset.clearText!})));
 el('profile-fields').querySelectorAll<HTMLElement>('[data-profile-key]').forEach(field=>{field.querySelector<HTMLButtonElement>('[data-clear-field]')!.onclick=()=>{field.querySelector<HTMLInputElement|HTMLTextAreaElement>('input,textarea')!.value='';updateProfileState();};});
 updateProfileState();
}

function profilePatch(){const values:Partial<Record<ProfileTextKey,string>>={};el('profile-fields').querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea').forEach(input=>{values[input.name as ProfileTextKey]=input.value;});return diffProfile(profile?.texts??{},values);}
function updateProfileState(){if(!el('save-profile'))return;const patch=profilePatch(),count=Object.keys(patch.set).length+patch.clear.length,editable=!!writer&&profile?.owner===writer.signerAddress&&!profile.locked;const supported=!!DEPLOYMENT.hookHashes?.profile;el<HTMLButtonElement>('save-profile').disabled=busy||!editable||!count||!supported;el<HTMLButtonElement>('discard-profile').disabled=busy||!editable||!count;el('profile-status').textContent=!supported?'Update unavailable':profile?.locked?'Profile locked':count?`${count} unsaved ${count===1?'change':'changes'}`:'No changes';el('profile-fields').querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea').forEach(input=>input.readOnly=busy||!editable);el('profile-fields').querySelectorAll<HTMLButtonElement>('[data-clear-field]').forEach(button=>button.disabled=busy||!editable);}
el('profile-form').addEventListener('input',updateProfileState);
el('discard-profile').onclick=()=>{el<HTMLFormElement>('profile-form').reset();updateProfileState();};
form('profile-form',async()=>{const patch=profilePatch();if(!Object.keys(patch.set).length&&!patch.clear.length)return{message:'No profile changes to save.'};const c=writeClient(),name=selected,r=await c.resolver.setProfile({...util.splitDomain(name),...patch});if(!r)return{message:'These profile changes are already saved on the ledger.'};log('Save profile',r.engineResult,r.txHash,r.hookExecutions);await refreshConfirmed(name);return{message:'Profile saved with one transaction.'};});

form('search-form',data=>checkName(canonical(String(el<HTMLInputElement>('search-name').value))));form('lookup-form',data=>loadProfile(canonical(el<HTMLInputElement>('lookup-name').value)));
form('addr-form',async data=>{const network=String(data.get('network')),ct=network==='custom'?Number(data.get('coin')):Number(network),value=String(data.get('address')).trim();let bytes:Buffer;
 if(data.get('raw')){if(!/^(?:[a-fA-F0-9]{2}){1,128}$/.test(value))throw new Error('Invalid hex: use 1–128 bytes.');bytes=Buffer.from(value,'hex');}else bytes=encodeAddress(ct,value);
 const r=await writeClient().resolver.setAddr({...util.splitDomain(selected),coinType:ct,addr:bytes});log('Save '+networkName(ct)+' address',r.engineResult,r.txHash,r.hookExecutions);await refreshConfirmed(selected);
});
form('text-form',async data=>{const r=await writeClient().resolver.setText({...util.splitDomain(selected),key:String(data.get('key')),value:String(data.get('value'))});log('Save text record',r.engineResult,r.txHash,r.hookExecutions);await refreshConfirmed(selected);});
el('transfer-claim').onclick=()=>void mutate('Accept transferred domain',c=>c.registrar.acceptTransfer(selected));
el('primary-button').onclick=()=>void mutate('Update primary name',c=>c.resolver.setPrimary({...util.splitDomain(selected),flag:!profile?.primary}));el('refresh-domains').onclick=()=>void run('Load domains',refreshDomains);el('close-profile').onclick=()=>{selected='';profile=null;view('portfolio');};
el('reset-profile').onclick=()=>{if(confirm('Remove all addresses, text records, and primary settings for '+selected+'?'))void mutate('Reset profile',c=>c.resolver.reset(util.splitDomain(selected)));};
form('transfer-form',async data=>{const r=await writeClient().registrar.createTransferOffer(actionDomain,String(data.get('recipient')).trim());log('Transfer offer',r.engineResult,r.txHash,r.meta);el<HTMLDialogElement>('domain-action-dialog').close();return{message:'Transfer offer created. The recipient can claim it from Ready to claim in My domains.'};});
el('cancel-transfer').onclick=()=>void run('Cancel transfer offer',async()=>{const r=await writeClient().registrar.cancelTransferOffer(actionDomain);log('Cancel transfer',r.engineResult,r.txHash,r.meta);el<HTMLDialogElement>('domain-action-dialog').close();return{message:'Transfer offer cancelled.'};});
form('burn-form',async data=>{const domain=actionDomain;if(String(data.get('confirmation'))!==domain)throw new Error('The confirmation name does not match.');const r=await writeClient().registrar.burn(domain);log('Burn domain',r.engineResult,r.txHash,r.hookExecutions);el<HTMLDialogElement>('domain-action-dialog').close();if(selected===domain){profile=null;selected='';view('portfolio');}await refreshConfirmed();return{message:domain+' was burned and its domain records were removed.'};});
form('register-form',async data=>{const name=canonical(String(data.get('domain'))),r=await writeClient().registrar.register({...util.splitDomain(name),recipient:String(data.get('recipient')).trim()});log('Treasury register',r.engineResult,r.txHash,r.hookExecutions);view('discover');el<HTMLInputElement>('search-name').value=name;await checkName(name);});
form('uribase-form',async data=>{const r=await writeClient().registrar.setURIBase(String(data.get('base')).trim());log('Update URI base',r.engineResult,r.txHash,r.hookExecutions);});
form('receipt-form',async data=>{await ready();const hash=String(data.get('hash')),r=await reader.waitForTransaction(hash,{timeoutMs:10000});log('Check transaction',r.meta.TransactionResult,hash,r.meta.HookExecutions);if(r.meta.TransactionResult!=='tesSUCCESS')throw new Error(r.meta.TransactionResult);});
view('portfolio',false);
const initialDomain=new URLSearchParams(location.search).get('domain');
if(initialDomain){view('discover',false);el<HTMLInputElement>('search-name').value=initialDomain;el<HTMLFormElement>('search-form').requestSubmit();}
const heartbeatTimer=setInterval(()=>{if(reader.isConnected())void reader.rawClient.request({command:'ping'}).catch(()=>{});},15000);

const balanceTimer=setInterval(()=>{if(kit.manager.getAccount()&&reader.isConnected()&&!document.hidden&&!busy)void kit.refreshBalance();},30000);
if(import.meta.hot)import.meta.hot.dispose(()=>{epoch++;incomingController?.abort();clearInterval(heartbeatTimer);clearInterval(balanceTimer);if(walletSyncTimer!==undefined)clearTimeout(walletSyncTimer);void reader.disconnect().catch(()=>{});});
