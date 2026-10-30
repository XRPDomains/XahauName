import {createRecentNames,defaultNameFilters,nameLengthRange,isNewName,selectOwnedNames,type NameFilters} from './names-collection';
import {connectedWalletView,parseRoute,routeHash,profileSections,type AppRoute,type ProfileSection} from './navigation';
import {nameCopy} from './ui-text';
import {appMarkup} from './app-markup';
import {ActivityHistory} from './activity';
import {createWalletKit} from '@xrpl-wallet-kit/client';
import {XahauNameClient, createWalletKitRpcTransport, util, explainError as explainSdkError, normalizeDomainInput, type PortfolioSnapshot, type ProfileTextKey, type FullProfile, type RegistrationStatus, type TxResult} from '@xahauname/sdk';
import {evaluateProfileEdit} from './profile-editor';
import {resolveTransferRecipient,createTransferRecipientPreview,type TransferRecipient} from './transfer-recipient';
import {assertNetwork,createWalletSigner,MAX_FEE} from './wallet-signer';
import './styles.css';
import {XAMAN_CLIENT_ID,DEPLOYMENT,CHAIN} from './config';
import {NETWORKS,PROFILE_FIELDS,networkName,encodeAddress,decodeAddress} from './records';
import {fetchMetadata,metadataURL,mediaURL} from './metadata';
import {purchaseThenClaim} from './purchase';
import {applyRegistrationPrimary,type PrimaryOutcome} from './registration-primary';
import {connectThenPurchase} from './purchase-connection';
import {checkoutFromLedger,checkoutActions,isUnstartedPurchase,isConfirmedFailure,definitiveWalletDecline,createPurchaseJournal,type CheckoutState,type PurchaseHint} from './registration-progress';
import {registrationProgress,registrationSuccess} from './registration-view';
import {celebrateRegistration,clearCelebration} from './celebration';
import {domainCards,incomingDomainCards,addressRows,profileFieldForms,escapeHTML as esc} from './views';
import {createBalanceResolver} from './wallet-balance';
import {createIdentityResolver} from './wallet-identity';
import {enhanceDomainInputs,enhanceRegistrationInput} from './domain-input';
import {renderArtwork} from './artwork';
import {createNotifications,type NotificationTone,type NotificationAction} from './notifications';

function explainError(error:unknown){const info=explainSdkError(error);return{...info,title:nameCopy(info.title),message:nameCopy(info.message)};}

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
let writer: XahauNameClient | null = null, selected = '', profile: FullProfile | null = null, busy = false, checked: {name:string;status:RegistrationStatus;price:bigint;enabled:boolean}|null = null, epoch=0,currentAction='';
const touchedProfileFields=new Set<string>();
function showTransferRecipient(recipient:TransferRecipient){const result=el('transfer-recipient-result');result.replaceChildren();const label=document.createElement('strong'),address=document.createElement('code');label.textContent=recipient.domain?'Current owner of '+recipient.domain:'Recipient wallet';address.textContent=recipient.address;result.append(label,address);result.hidden=false;}
const recipientPreview=createTransferRecipientPreview(domain=>reader.read.getOwner({name:domain,bypassCache:true}),state=>{
 const result=el('transfer-recipient-result'),error=el('transfer-recipient-error'),input=el<HTMLInputElement>('transfer-recipient');
 result.classList.toggle('is-loading',state.status==='loading');result.hidden=state.status==='idle'||state.status==='error';error.hidden=state.status!=='error'||busy;
 input.setAttribute('aria-busy',String(state.status==='loading'));
 if(state.status==='loading')result.textContent='Checking recipient…';
 else if(state.status==='ready')showTransferRecipient(state.recipient);
 else if(state.status==='error'){result.replaceChildren();error.textContent=explainError(state.error).message;input.setAttribute('aria-invalid','true');}
 else result.replaceChildren();
 if(state.status!=='error')input.removeAttribute('aria-invalid');
});
function clearTransferRecipient(){recipientPreview.reset();el('transfer-submit').textContent='Create transfer offer';el('transfer-form').querySelectorAll<HTMLElement>(':scope > .field-error').forEach(error=>{error.hidden=true;error.textContent='';});}
document.querySelectorAll<HTMLAnchorElement>('.record-nav a').forEach(link=>{
 const section=Object.entries(profileSections).find(([,id])=>link.hash==='#'+id)?.[0] as ProfileSection;
 link.dataset.section=section;
 link.addEventListener('click',event=>{event.preventDefault();if(!selected||busy)return;const route:AppRoute={view:'profile-section',name:selected,section};writeRoute(route);scrollRoute(route);});
});
let ownedPortfolio:PortfolioSnapshot|null=null,portfolioRefreshPending=false;
const recentNames=(account:string)=>createRecentNames({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)},CHAIN.networkId+':'+DEPLOYMENT.treasury+':'+DEPLOYMENT.namespaceId+':'+account);
function requestPortfolioRefresh(){portfolioRefreshPending=true;if(busy||!writer||currentView!=='portfolio')return;portfolioRefreshPending=false;void run('Refresh names',refreshDomains);}
const activity=new ActivityHistory();
el('open-activity').onclick=()=>{const dialog=el<HTMLDialogElement>('activity-dialog');if(!dialog.open)dialog.showModal();};
el('close-activity').onclick=()=>el<HTMLDialogElement>('activity-dialog').close();
function log(label:string,result:string,hash?:string,details?:unknown) {activity.add({label,result,hash,details});el('activity-count').textContent=String(activity.size);el('activity-count').hidden=activity.size===0;el('activity-list').innerHTML=activity.recent().map(r=>`<article><div><strong>${esc(r.label)}</strong><span>${esc(r.result)}</span></div>${r.hash?`<a class="mono" href="${explorer(r.hash)}" target="_blank" rel="noreferrer">${esc(short(r.hash))} ↗</a>`:''}${r.details?`<details><summary>Technical details</summary><pre>${esc(JSON.stringify(r.details,(_k,v)=>typeof v==='bigint'?v.toString():v,2))}</pre></details>`:''}</article>`).join('');}
const kit = createWalletKit({network:CHAIN.walletKitId,wallets:XAMAN_CLIENT_ID?['gemwallet','xyra','xaman']:['gemwallet','xyra'],xamanClientId:XAMAN_CLIENT_ID,autoReconnect:true,storage:'localStorage',identity:{web3Name:true,fallbackToAddress:true},preflight:{maxFeeDrops:MAX_FEE},transactionConfirmation:{enabled:false},accountStatus:{enabled:false},metadata:{name:'XahauName',description:'Manage names on '+CHAIN.label,url:location.origin},connectButton:{target:'#connect-wallet',showBalance:true,identityResolver:createIdentityResolver(reader,address=>ownedPortfolio?.address===address?ownedPortfolio.primary??undefined:undefined),balanceResolver:createBalanceResolver(reader,ready)},xahau:{request:createWalletKitRpcTransport(reader.rawClient,ready,CHAIN.walletKitId)},ui:{mode:'light',toast:false}});
const notifications=createNotifications();
const purchaseJournal=createPurchaseJournal({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)},CHAIN.networkId+':'+DEPLOYMENT.treasury+':'+DEPLOYMENT.namespaceId);
let checkout:CheckoutState|null=null,activePurchase:PurchaseHint|null=null,currentInline=false;
let activeInboxClaim:string|null=null;
let completedRegistration:{name:string;claimHash:string;primary?:PrimaryOutcome}|null=null;
let registrationSetPrimary=false,activeRegistrationPrimary:{name:string;account:string}|null=null;
const hintFor=(name:string)=>activePurchase?.name===name?activePurchase:purchaseJournal.get(name);
function rememberPurchase(hint:PurchaseHint){try{purchaseJournal.save(hint);}catch(error){throw Object.assign(new Error((error as Error)?.message?.includes('previous purchases')?'Check previous purchase statuses before starting another.':'Allow browser storage to keep your purchase progress, then try again.'),{code:'INVALID_ARGUMENT',cause:error});}activePurchase=hint;}
function observePurchase(hint:PurchaseHint){activePurchase=hint;try{purchaseJournal.save(hint);}catch{log('Purchase tracking','Keep the transaction hash',hint.claimHash??hint.paymentHash);}}
function forgetPurchase(name:string){if(activePurchase?.name===name)activePurchase=null;try{purchaseJournal.clear(name);}catch{/* A future ledger refresh still verifies the remaining hint. */}}
function registrationSigning(){
 if(activeRegistrationPrimary){const c=writeClient();if(disposed||queuedRoute||c.signerAddress!==activeRegistrationPrimary.account||kit.manager.getAccount()?.address!==activeRegistrationPrimary.account)throw new Error('Primary update paused because the wallet or page changed.');assertNetwork(kit.manager,activeRegistrationPrimary.account);return;}
 if(activeInboxClaim){if(disposed||queuedRoute)throw new Error('Claim paused because the page changed. Check status before continuing.');const hint=hintFor(activeInboxClaim);if(hint)rememberPurchase({...hint,claimStarted:true});return;}
 if(!currentInline||!['Buy & claim name','Accept name','Continue registration'].includes(currentAction))return;
 if(disposed||queuedRoute||currentView!=='discover'||!checked||!checkout)throw new Error('Registration paused because the page changed. Check status before continuing.');
 const hint=hintFor(checked.name);if(!hint)throw new Error('Purchase tracking is missing. Check status before signing.');
 rememberPurchase({...hint,...(checkout.step===2?{claimStarted:true}:{paymentStarted:true})});
}
function registrationSubmitted(hash:string){
 if(activeRegistrationPrimary){log('Primary update submitted','submitted',hash);if(checkout?.step===3)setCheckout({...checkout,phase:'primary-confirming',message:'Name claimed. Confirming your primary update on the ledger…'});return;}
 if(!checked||!checkout||!/^[a-f0-9]{64}$/i.test(hash))return;const hint=hintFor(checked.name);if(!hint)return;
 const claim=checkout.step===2;observePurchase({...hint,...(claim?{claimHash:hash}:{paymentHash:hash})});
 checkout={...checkout,phase:claim?'claim-confirming':'payment-confirming',message:claim?'Confirming ownership on the ledger…':'Confirming your payment on the ledger…',...(claim?{claimHash:hash}:{paymentHash:hash})};renderRegistration();
}
function notice(message:string,tone:NotificationTone='success',action?:NotificationAction){if(currentInline){if(tone==='error'||tone==='warning'){el('discovery-error').textContent=message;el('discovery-error').hidden=false;}return;}notifications.show(message,tone,action);}
let actionDomain='';
let currentView="discover",lastRouteURL='',queuedRoute:AppRoute|null=null,profileRequest=0,disposed=false;
function writeRoute(route:AppRoute,mode:'push'|'replace'='push'){
 const url=new URL(location.href);url.hash=routeHash(route);url.searchParams.delete('domain');
 if(url.href!==location.href)history[mode==='push'?'pushState':'replaceState'](null,'',url);
 lastRouteURL=location.href;
}
function scrollRoute(route:AppRoute){
 document.querySelectorAll<HTMLAnchorElement>('.record-nav a').forEach(link=>{
  if(route.view!=='profile-section')return;
  link.href=routeHash({view:'profile-section',name:route.name,section:link.dataset.section as ProfileSection});
  if(link.dataset.section===(route.section??'addresses'))link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');
 });
 const id=route.view==='profile-section'?profileSections[route.section??'addresses']:route.view==='discover'&&route.section==='lookup'?'lookup-name':route.view==='portfolio'&&route.section==='claims'?'incoming-section':null;
 if(!id)return;const target=el(id);if(target instanceof HTMLDetailsElement)target.open=true;
 requestAnimationFrame(()=>{if(disposed||!target.isConnected||queuedRoute||routeHash(parseRoute(location.hash)??{view:'discover'})!==routeHash(route))return;target.scrollIntoView({block:'start'});if(route.view==='discover')target.focus({preventScroll:true});});
}
async function applyRoute(route:AppRoute){
 if(disposed)return;for(const id of ['activity-dialog','domain-action-dialog']){const dialog=el<HTMLDialogElement>(id);if(dialog.open)dialog.close();}
 if(busy){queuedRoute=route;if(currentAction==='Buy & claim name'&&kit.modal?.isOpen())kit.closeModal();return;}
 if(route.view==='profile-section'){
  if(currentView==='profile-section'&&selected===route.name&&profile){scrollRoute(route);return;}
  await run('Load profile',()=>loadProfile(route.name,'none',route.section));return;
 }
 view(route.view,true,true,'none');scrollRoute(route);
}
function followLocation(){if(lastRouteURL===location.href)return;lastRouteURL=location.href;const route=parseRoute(location.hash);if(!route){writeRoute({view:'discover'},'replace');void applyRoute({view:'discover'});return;}void applyRoute(route);}
window.addEventListener('popstate',followLocation);window.addEventListener('hashchange',followLocation);
function view(name:string,focus=true,refresh=true,historyMode:'push'|'replace'|'none'='push'){currentView=name;el('main-content').dataset.view=name;el('page-eyebrow').hidden=name==='discover';for(const v of ['portfolio','discover','profile-section'])el(v).hidden=v!==name;document.querySelectorAll<HTMLElement>('.nav').forEach(n=>{const active=n.dataset.view===(name==='profile-section'?'portfolio':name);n.classList.toggle('active',active);if(active)n.setAttribute('aria-current','page');else n.removeAttribute('aria-current');});el('page-eyebrow').textContent=name==='profile-section'?'NAME PROFILE':'NAME MANAGER';el('page-heading').textContent=name==='discover'?'Find a name':name==='profile-section'?selected:'My names';el('page-description').textContent=name==='discover'?'One name for your wallet, profile, and links.':name==='profile-section'?'Addresses, profile, and settings.':'Manage your on-chain identity.';el('find-domain').hidden=name!=='portfolio';el('close-profile').hidden=name!=='profile-section';const route:AppRoute=name==='profile-section'?{view:'profile-section',name:selected}:name==='portfolio'?{view:'portfolio'}:{view:'discover'};if(historyMode!=='none')writeRoute(route,historyMode);if(name==='profile-section')scrollRoute(route);if(focus)el('page-heading').focus({preventScroll:true});if(refresh&&name==='portfolio'&&writer)requestPortfolioRefresh();}
document.querySelectorAll<HTMLButtonElement>('button[data-view]').forEach(n=>n.addEventListener('click',()=>{const target=n.getAttribute('data-view')!;view(target);}));
function canonical(input:string){return normalizeDomainInput(input);}
el('search-name').addEventListener('input',()=>{checked=null;checkout=null;completedRegistration=null;registrationSetPrimary=false;el('search-result').replaceChildren();el('discovery-error').hidden=true;});
const registrationInput=enhanceRegistrationInput(el<HTMLInputElement>('search-name'));
enhanceDomainInputs([el<HTMLInputElement>('lookup-name'),el<HTMLFormElement>('register-form').querySelector<HTMLInputElement>('[name="domain"]')!]);
function writeClient(){if(!writer)throw new Error(`Connect a ${CHAIN.label} wallet to continue.`);assertNetwork(kit.manager,writer.signerAddress??undefined);return writer;}
function updateActions(){const primaryOption=el<HTMLInputElement>('registration-set-primary');if(primaryOption)primaryOption.disabled=busy;el('admin-panel').hidden=writer?.signerAddress!==DEPLOYMENT.treasury;const own=!!writer&&profile?.owner===writer.signerAddress;document.querySelectorAll<HTMLElement>('.owner-action').forEach(n=>n.hidden=!own);document.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{if(b.closest('#connect-wallet,.app-notifications')||b.id==='open-activity'||b.id==='close-activity')return;b.disabled=busy||(b.id==='refresh-domains'&&!writer);});el<HTMLInputElement>('search-name').readOnly=busy&&['Buy & claim name','Accept name','Continue registration'].includes(currentAction);updateProfileState();}
function progress(message:string){if(currentInline){if(checkout){checkout.message=message;renderRegistration();}return;}notifications.show(message,'waiting');}
async function run(label:string,fn:()=>Promise<unknown>,errorTarget?:HTMLElement,inline=false){
 if(busy)return;busy=true;currentAction=label;currentInline=inline;updateActions();el('notice').hidden=true;el('notice').setAttribute('aria-busy','true');if(inline){notifications.dismiss();el('discovery-error').hidden=true;el('discovery-status').textContent=label+'…';el('discovery-status').hidden=false;}else progress(label+'…');
 const dialog=el<HTMLDialogElement>('domain-action-dialog'),actionStatus=el('action-status');
 if(dialog.open)actionStatus.hidden=true;
 try{const r:any=await fn();if(r?.txHash)log(label,r.engineResult,r.txHash,r.hookExecutions??r.rawMeta);if(!inline)notice(r?.message??label+' completed.',r?.warning?'warning':'success');return r;}
 catch(e:any){const info=explainError(e);log(label,info.title,info.txHash,{...info,technicalMessage:e.message,hookExecutions:e.details?.hookExecutions});if(errorTarget){errorTarget.textContent=info.message;errorTarget.hidden=false;}if(inline){if(!errorTarget){el('discovery-error').textContent=info.message;el('discovery-error').hidden=false;}}else notice(info.message,info.stage==='confirmation'?'warning':'error',info.stage==='connection'?{label:'Retry connection',run:()=>reconnectButton.click()}:undefined);if(dialog.open&&!errorTarget){actionStatus.hidden=false;actionStatus.textContent=info.message;actionStatus.className='error';}}
 finally{busy=false;currentAction='';currentInline=false;notifications.clearWaiting();el('discovery-status').hidden=true;if(kit.manager.getAccount()&&reader.isConnected())void kit.refreshBalance();el('notice').removeAttribute('aria-busy');updateActions();if(inline){renderRegistration();if(completedRegistration&&['Buy & claim name','Accept name','Continue registration'].includes(label))el('registration-success-title')?.focus();}if(queuedRoute){const next=queuedRoute;queuedRoute=null;queueMicrotask(()=>void applyRoute(next));}else if(portfolioRefreshPending&&writer&&currentView==='portfolio')queueMicrotask(requestPortfolioRefresh);}
}
function form(id:string,fn:(data:FormData)=>Promise<unknown>,validate?:()=>boolean,inline=false){const f=el<HTMLFormElement>(id);const error=document.createElement('p');error.className='field-error';error.hidden=true;error.setAttribute('role','alert');const actions=f.querySelector('.transfer-actions');if(actions)actions.before(error);else f.append(error);f.addEventListener('submit',e=>{e.preventDefault();error.hidden=true;if(validate&&!validate())return;const submitter=(e as SubmitEvent).submitter as HTMLButtonElement|null;void run(submitter?.textContent??f.querySelector<HTMLButtonElement>('button[type=submit],button:not([type])')?.textContent??'Save',()=>fn(new FormData(f)),error,inline);});}
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
 const signer=createWalletSigner(kit.manager,{request:async request=>{await ready();return reader.rawClient.request(request);}},hash=>{log('Submitted — awaiting confirmation','submitted',hash);if(activeInboxClaim&&!activeRegistrationPrimary){const hint=hintFor(activeInboxClaim);if(hint)observePurchase({...hint,claimStarted:true,claimHash:hash});}if(currentInline&&['Buy & claim name','Accept name','Continue registration'].includes(currentAction))registrationSubmitted(hash);else progress('Confirming transaction…');},result=>{kit.manager.addTransaction({hash:result.txHash,status:result.engineResult==='tesSUCCESS'?'confirmed':'failed',result,confirmedAt:Date.now()});},registrationSigning);
 reader.setSigner(signer);writer=reader;
 const destination=connectedWalletView(currentView,!!(checked||checkout||completedRegistration||el<HTMLInputElement>('search-name').value.trim()));
 if(destination!==currentView)view(destination,false,false);
 if(currentView==='portfolio'){portfolioRefreshPending=false;await refreshDomains();}void kit.refreshBalance();if(selected&&currentView==='profile-section'){const route=parseRoute(location.hash);await loadProfile(selected,'none',route?.view==='profile-section'&&route.name===selected?route.section:undefined);}if(currentView==='discover')renderRegistration();
}
let walletSyncTimer:ReturnType<typeof setTimeout>|undefined;
function syncWallet(){if(walletSyncTimer!==undefined)return;const attempt=()=>{walletSyncTimer=undefined;if(!kit.manager.getAccount())return;if(busy){walletSyncTimer=setTimeout(attempt,200);return;}void run('Connect wallet',connectWriter,undefined,currentView==='discover');};attempt();}
kit.manager.on('connected',syncWallet);
kit.manager.on('accountChanged',syncWallet);
kit.manager.on('disconnected',()=>{if(walletSyncTimer!==undefined){clearTimeout(walletSyncTimer);walletSyncTimer=undefined;}el('incoming-section').hidden=true;el('incoming-list').replaceChildren();el('incoming-error').hidden=true;epoch++;incomingController?.abort();writer=null;ownedPortfolio=null;el('names-toolbar').hidden=true;reader.setSigner(null);el('domain-count').textContent='—';el('wallet-caption').textContent='Connect your wallet to view your names.';el('domain-list').innerHTML='<div class="empty"><h3>Wallet disconnected.</h3><p>Reconnect to manage your names.</p></div>';if(currentView==='portfolio')view('discover',false);updateActions();});
kit.manager.on('networkChanged',()=>{try{assertNetwork(kit.manager);}catch(e:any){el('incoming-section').hidden=true;el('incoming-list').replaceChildren();writer=null;ownedPortfolio=null;el('names-toolbar').hidden=true;reader.setSigner(null);epoch++;incomingController?.abort();notice(e.message,'error');updateActions();}});
kit.manager.on('error',({error}:any)=>{const info=explainError(error);if(info.stage==='connection'){connectionUnavailable();return;}notice(info.message,'error');});
kit.manager.on('disconnected',()=>renderRegistration());
kit.manager.on('networkChanged',()=>renderRegistration());
let portfolioRequest=0,incomingController:AbortController|undefined;
async function refreshDomains(){
 if(!writer){kit.openModal();return;}await ready();const c=writeClient(),account=c.signerAddress!,generation=epoch,request=++portfolioRequest;incomingController?.abort();
 const portfolio=await c.getPortfolio(account,{bypassCache:true});if(generation!==epoch||request!==portfolioRequest)return;
 const previous=ownedPortfolio?.address===account?new Set(ownedPortfolio.domains.map(record=>record.domain)):null;if(previous)for(const record of portfolio.domains)if(!previous.has(record.domain))recentNames(account).mark(record.domain);
 ownedPortfolio=portfolio;const names=portfolio.domains.map(record=>record.domain),opts={ledgerHash:portfolio.ledgerHash,bypassCache:true};
 el('domain-count').textContent=String(names.length);el('wallet-caption').textContent=short(account)+(portfolio.primary?' · '+portfolio.primary:'');renderOwnedCollection(true);
 el('incoming-error').hidden=true;
 const current=()=>generation===epoch&&request===portfolioRequest;
 const controller=new AbortController();incomingController=controller;
 void (async()=>{try{const incoming=await c.listIncomingDomains(account,{...opts,signal:controller.signal});if(!current())return;el('incoming-error').hidden=true;const offers=incoming.offers;el('incoming-section').hidden=!offers.length;el('incoming-count').textContent=String(offers.length);el('incoming-list').innerHTML=incomingDomainCards(offers,new Set(offers.filter(offer=>{const hint=hintFor(offer.domain);return hint?.claimStarted||hint?.claimHash;}).map(offer=>offer.domain)));const route=parseRoute(location.hash);if(route?.view==='portfolio'&&route.section==='claims'){if(offers.length)scrollRoute(route);else{el('incoming-error').textContent='No claim offers found for this wallet. Switch to the recipient wallet or refresh.';el('incoming-error').hidden=false;}}let cursor=0;const enrich=async()=>{while(cursor<offers.length){const offer=offers[cursor++];if(!current())return;const target=Array.from(el('incoming-list').querySelectorAll<HTMLElement>('[data-art-domain]')).find(n=>n.dataset.artDomain===offer.domain);if(target)await hydrateArtwork(offer.domain,target,opts,offer.uri);}};void Promise.allSettled([enrich(),enrich(),enrich()]);}catch(error){if(!current())return;el('incoming-error').hidden=false;el('incoming-error').className='incoming-note hint';el('incoming-error').textContent='Incoming offers could not be refreshed. Use Refresh to try again.';log('Incoming offers','Refresh pending',undefined,{technicalMessage:String((error as Error)?.message??error)});}})();
 void (async()=>{let cursor=0;
  const enrich=async()=>{while(cursor<portfolio.domains.length){const record=portfolio.domains[cursor++];if(!current())return;const target=Array.from(el('domain-list').querySelectorAll<HTMLElement>('[data-art-domain]')).find(n=>n.dataset.artDomain===record.domain);if(target)await hydrateArtwork(record.domain,target,opts,record.uri);}};await Promise.allSettled([enrich(),enrich(),enrich()]);})().catch(()=>{});
}

function displayAddr(ct:number,b:Buffer){return decodeAddress(ct,b).value;}
async function loadProfile(name:string,historyMode:'push'|'none'='push',section?:ProfileSection){
 const request=++profileRequest,generation=epoch;await ready();const snapshot=await reader.read.getProfile({name}),p=snapshot?.profile??null;if(generation!==epoch||request!==profileRequest||queuedRoute)return;selected=name;profile=p;
 if(!p){el('profile-section').hidden=true;throw new Error('This name has not been claimed yet. Use “Check availability” to inspect its pending status or offer.');}
 view('profile-section',false,false,historyMode);if(section&&historyMode==='push')writeRoute({view:'profile-section',name,section});el('profile-name').textContent=name;el('identity-name').textContent=name;el('domain-monogram').textContent=name[0];el('identity-status').textContent=p.owner===writer?.signerAddress?'Your name':'Public profile';el('profile-owner').textContent=short(p.owner);el('profile-owner').title=p.owner;el('profile-owner-full').textContent=p.owner;el('copy-owner').textContent='Copy';el('profile-primary').textContent=p.primary?'Primary':'Not set';el('profile-lock').textContent=p.locked?'Legacy locked profile':'Editable';
 const {tokenId,uri,transferOffer,ledgerHash}=snapshot!;el('profile-token').textContent=tokenId;el('transfer-claim').hidden=!(writer&&transferOffer?.destination===writer.signerAddress&&transferOffer?.amountDrops==='0'&&p.owner!==writer.signerAddress);
 el('profile-uri').textContent=uri;void hydrateArtwork(name,el('profile-art'),{ledgerHash,bypassCache:true,profileAvatar:p.texts.avatar??null},uri);el('primary-button').textContent=p.primary?'Unset primary':'Set primary';
 renderRecords(p);updateActions();scrollRoute({view:'profile-section',name,...(section?{section}:{})});
}
async function mutate(label:string,fn:(c:XahauNameClient)=>Promise<TxResult>){return run(label,async()=>{const c=writeClient(),r=await fn(c);log(label,r.engineResult,r.txHash,r.hookExecutions);if(label==='Accept transferred name')recentNames(c.signerAddress!).mark(selected);await refreshConfirmed(selected||undefined);if(['Update primary name','Reset profile','Accept transferred name'].includes(label))void kit.refreshIdentity()?.catch(()=>{});return{message:label+' confirmed.'};});}
async function refreshConfirmed(name?:string){
 try{if(name&&currentView!=='portfolio'){const route=parseRoute(location.hash);await loadProfile(name,'none',route?.view==='profile-section'&&route.name===name?route.section:undefined);}else if(currentView==='portfolio')await refreshDomains();return true;}
 catch(error){log('Refresh view','Pending',undefined,{message:'The transaction is confirmed; the view could not be refreshed.',technicalMessage:String((error as Error)?.message??error)});return false;}
}
async function checkName(name:string,feedback=false){
 await ready();let quote=await reader.read.getQuote({name,bypassCache:true});try{if(registrationInput.name()!==name)return;}catch{return;}
 let hint=hintFor(name);
 if(quote.status.stage==='available'&&isUnstartedPurchase(hint)){forgetPurchase(name);hint=null;}
 // Only a validated failed receipt releases an uncertain submitted attempt.
 const uncertainHash=quote.status.stage==='available'?hint?.paymentHash:quote.status.stage==='awaitingClaim'?hint?.claimHash:undefined;
 if(uncertainHash)try{const receipt=await reader.waitForTransaction(uncertainHash,{timeoutMs:2000});if(receipt.validated===true&&receipt.meta.TransactionResult==='tesSUCCESS')quote=await reader.read.getQuote({name,bypassCache:true});if(isConfirmedFailure(receipt)){
  if(quote.status.stage==='available'){forgetPurchase(name);hint=null;}
  else if(hint){hint={...hint,claimHash:undefined,claimStarted:false};observePurchase(hint);}
 }}catch{/* Keep the attempt blocked while its result remains unknown. */}
 try{if(registrationInput.name()!==name)return;}catch{return;}
 checked={name,status:quote.status,price:quote.priceDrops,enabled:quote.tldEnabled};checkout=checkoutFromLedger(quote.status,hint);if(feedback&&checkout)checkout.message='Status checked. '+checkout.message;
 if(quote.status.stage==='claimed'&&hint)forgetPurchase(name);
 renderRegistration();
}

function renderRegistration(){
 const form=el<HTMLFormElement>('search-form'),intro=el('search-heading').closest<HTMLElement>('.form-intro')!;
 form.hidden=!!completedRegistration;intro.hidden=!!completedRegistration;
 if(completedRegistration){
  const{name,claimHash}=completedRegistration;
  el('search-result').innerHTML=registrationSuccess(name,claimHash,explorer,busy,completedRegistration.primary);
  el('buy-another-name').onclick=()=>{if(!busy)resetDiscovery();};
  el('open-name').onclick=()=>void run('Load profile',async()=>{await loadProfile(name);if(currentView==='profile-section'&&selected===name)resetDiscovery(false);},undefined,true);
  return;
 }
 if(!checked)return;const{name,status,price,enabled}=checked,account=writer?.signerAddress??undefined;
 const hint=hintFor(name),actions=checkoutActions(status,checkout,hint,account,enabled),canBuy=actions.buy,canClaim=actions.claim,canContinue=actions.continue;
 const needWallet=!writer&&(status.stage==='awaitingClaim'||status.stage==='pending');
 const labels={available:enabled?'Available':'Registration disabled',pending:'Creating your name',awaitingClaim:'Ready to accept',claimed:account===status.owner?'Your name is ready':'Already owned',refundPending:'Refund needs checking',recoveryRequired:'Recovery required'};
 let primary=needWallet?'<button id="registration-connect" class="primary">Connect wallet</button>':canBuy?'<button id="buy-name" class="primary">Buy name</button>':canClaim?'<button id="claim-name" class="primary">Accept name</button>':canContinue?'<button id="continue-name" class="primary">Continue registration</button>':status.stage==='awaitingClaim'?'<button id="claim-in-my-names" class="primary">Open My names</button>':status.stage==='claimed'?'<button id="open-name" class="primary">Manage name</button>':'';
 if(busy)primary='';
 el('search-result').innerHTML=`<div class="registration-summary"><div><strong>${esc(name)}</strong><span class="availability-label" data-stage="${status.stage}">${labels[status.stage]}</span></div>${status.stage==='available'&&!hint?`<b>${esc(amount(price))}</b>`:''}</div>${checkout?registrationProgress(checkout,explorer,hint?.setPrimary===true):canBuy?`<p class="registration-consent">${registrationSetPrimary?3:2} wallet approvals · Network fees apply</p>`:''}${status.recipient&&status.recipient!==account&&status.stage!=='claimed'?`<p class="registration-recipient">Recipient: <span class="mono">${esc(short(status.recipient))}</span>${writer?' · Switch to this wallet to accept.':''}</p>`:''}${canBuy&&!busy?`<label class="registration-primary-option"><input id="registration-set-primary" type="checkbox" ${registrationSetPrimary?'checked':''}><span><strong>Set as my primary name</strong><small>Requires one extra approval after claiming.</small></span></label>`:''}<div class="registration-actions"><button id="refresh-name" class="subtle" ${busy?'disabled':''}>${hint||checkout?'Check status':'Refresh'}</button>${primary}</div>`;
 el('registration-connect')?.addEventListener('click',()=>{if(kit.manager.getAccount())void run('Connect wallet',connectWriter,undefined,true);else kit.openModal();});
 el('registration-set-primary')?.addEventListener('change',event=>{registrationSetPrimary=(event.target as HTMLInputElement).checked;const consent=el('search-result').querySelector('.registration-consent');if(consent)consent.textContent=(registrationSetPrimary?'3':'2')+' wallet approvals · Network fees apply';});
 el('buy-name')?.addEventListener('click',()=>void startPurchase(name));
 el('claim-name')?.addEventListener('click',()=>void run('Accept name',()=>continueCheckedName(name,false),undefined,true));
 el('continue-name')?.addEventListener('click',()=>void run('Continue registration',()=>continueCheckedName(name,true),undefined,true));
 el('open-name')?.addEventListener('click',()=>void run('Load profile',()=>loadProfile(name),undefined,true));
 el('refresh-name')?.addEventListener('click',()=>void run('Check registration status',()=>checkName(name,true),undefined,true));
 el('claim-in-my-names')?.addEventListener('click',()=>{const route:AppRoute={view:'portfolio',section:'claims'};writeRoute(route);void applyRoute(route);});
}
function resetDiscovery(focus=true){
 completedRegistration=null;checked=null;checkout=null;registrationSetPrimary=false;clearCelebration();
 el<HTMLFormElement>('search-form').reset();registrationInput.reset();el('search-result').replaceChildren();
 el('search-form').querySelectorAll<HTMLElement>('.field-error').forEach(error=>{error.hidden=true;error.textContent='';});
 el('discovery-error').hidden=true;el('discovery-error').textContent='';el('discovery-status').hidden=true;
 try{const url=new URL(location.href);if(url.searchParams.has('domain')){url.searchParams.delete('domain');history.replaceState(null,'',url);}}catch{/* URL cleanup must not change a confirmed transaction outcome. */}
 renderRegistration();if(focus)el('search-name').focus();
}
function setCheckout(next:CheckoutState){checkout=next;el('discovery-status').hidden=true;renderRegistration();}
function ensureRegistrationWallet(c:XahauNameClient,account:string){if(disposed||queuedRoute||currentView!=='discover')throw new Error('Return to Find a name and check status to continue.');if(writer!==c||writer.signerAddress!==account||kit.manager.getAccount()?.address!==account)throw new Error('Wallet changed. Reconnect the recipient wallet to continue.');assertNetwork(kit.manager,account);}
function registrationFailed(error:unknown,name:string){
 const info=explainError(error),hint=hintFor(name);
 if(info.txHash&&/^[a-f0-9]{64}$/i.test(info.txHash)&&hint){observePurchase({...hint,...(checkout?.step===2?{claimHash:info.txHash}:{paymentHash:info.txHash})});}
 const declined=definitiveWalletDecline(error);
 if(declined&&hint?.claimStarted&&!hint.claimHash&&!info.txHash)observePurchase({...hint,claimStarted:false});
 const current=hintFor(name),uncertain=!!(current?.claimHash||current?.claimStarted||(!current?.paid&&current));
 if(checkout)setCheckout({...checkout,phase:info.recovery==='operator'?'attention':uncertain?'uncertain':checkout.step===2?'claim-ready':'attention',message:info.stage==='refund'?'Refund tracking needs checking. Do not send another payment.':info.recovery==='operator'?info.message:uncertain?'Confirmation is unknown. Check status before signing again.':checkout.step===2&&declined?'Your name is ready. Accept it now or later from My names.':info.message,...(current?{paymentHash:current.paymentHash,claimHash:current.claimHash}:{})});
 log('Registration',info.title,info.txHash,{...info,technicalMessage:String((error as Error)?.message??error)});
}
async function finishRegistrationPrimary(name:string,account:string){
 const requested=hintFor(name)?.setPrimary===true&&hintFor(name)?.account===account;
 if(!requested)return 'skipped' as const;
 if(checked?.name===name)checked.status={...checked.status,stage:'claimed',owner:account};
 activeRegistrationPrimary={name,account};
 if(currentView==='discover'&&checked?.name===name)setCheckout({...checkout!,phase:'primary-approval',completed:3,step:3,message:'Name claimed. Approve one more transaction to set it as your primary name.'});
 else progress('Name claimed. Approve the primary update in your wallet.');
 try{
  const c=writeClient(),outcome=await applyRegistrationPrimary(c,name,account,true,()=>{if(disposed||queuedRoute||writer!==c||c.signerAddress!==account||kit.manager.getAccount()?.address!==account)throw new Error('Primary update paused because the wallet or page changed.');assertNetwork(kit.manager,account);});
  if(outcome.result){log('Set primary name',outcome.result.engineResult,outcome.result.txHash,outcome.result.hookExecutions);void kit.refreshIdentity()?.catch(()=>{});}
  if(outcome.error){const info=explainError(outcome.error);log('Set primary name',info.title,info.txHash,{...info,technicalMessage:String(outcome.error)});}
  return outcome.outcome;
 }catch(error){log('Set primary name','Not updated',undefined,{technicalMessage:String(error)});return 'not-set' as const;}
 finally{activeRegistrationPrimary=null;}
}
async function finishRegistration(name:string,result:TxResult,account:string){
 log('Name accepted',result.engineResult,result.txHash,result.hookExecutions);recentNames(account).mark(name);
 const primary=await finishRegistrationPrimary(name,account);forgetPurchase(name);resetDiscovery(false);completedRegistration={name,claimHash:result.txHash,primary};renderRegistration();
 if(currentView==='discover')celebrateRegistration(result.txHash,el('search-result'));
 if(writer?.signerAddress===account&&kit.manager.getAccount()?.address===account)try{await refreshDomains();}catch(error){log('Refresh names','Refresh pending',undefined,{technicalMessage:String(error)});}
}
async function startPurchase(name:string){
 await run('Buy & claim name',async()=>{
  const origin=location.href,price=checked?.price,setPrimary=registrationSetPrimary;
  await connectThenPurchase({
   isCurrent:()=>!disposed&&!queuedRoute&&currentView==='discover'&&location.href===origin&&checked?.name===name&&checked.price===price,
   hasAccount:()=>!!kit.manager.getAccount(),
   connect:async()=>{if(!kit.modal)throw new Error('Wallet connection is unavailable.');el('discovery-status').textContent='Connect your wallet to continue…';await kit.modal.openAndWait();},
   bind:async()=>{if(!writer||writer.signerAddress!==kit.manager.getAccount()?.address){await connectWriter();if(walletSyncTimer!==undefined){clearTimeout(walletSyncTimer);walletSyncTimer=undefined;}}},
   buy:()=>buyCheckedName(name,setPrimary),
  });
 },undefined,true);
}
async function buyCheckedName(name:string,setPrimary=false){
 const c=writeClient(),account=c.signerAddress!;if(checked?.name!==name||!checkoutActions(checked.status,checkout,hintFor(name),account,checked.enabled).buy)throw new Error('Check the previous purchase status before paying again.');
 const quote=await reader.read.getQuote({name,bypassCache:true});ensureRegistrationWallet(c,account);
 if(quote.status.stage!=='available'||!quote.tldEnabled||quote.priceDrops!==checked?.price){checked={name,status:quote.status,price:quote.priceDrops,enabled:quote.tldEnabled};checkout=checkoutFromLedger(quote.status,hintFor(name));renderRegistration();el('discovery-error').textContent='Availability or price changed. Review the updated result before continuing.';el('discovery-error').hidden=false;return;}
 rememberPurchase({name,account,paid:false,paymentStarted:false,setPrimary});
 setCheckout({phase:'payment-approval',completed:0,step:0,message:'Approve the payment in your wallet.'});
 try{
  const result=await purchaseThenClaim(c.registrar,{...util.splitDomain(name),expectedPriceDrops:quote.priceDrops},{
   purchased:r=>{observePurchase({...hintFor(name)!,paid:true,paymentHash:r.txHash});if(checked?.name===name)checked.status={...checked.status,stage:'pending',recipient:account};log('Payment confirmed',r.engineResult,r.txHash,r.hookExecutions);setCheckout({phase:'minting',completed:1,step:1,message:'Payment confirmed. Creating your name and claim offer…',paymentHash:r.txHash});},
   claiming:()=>{ensureRegistrationWallet(c,account);rememberPurchase({...hintFor(name)!,claimStarted:false});if(checked?.name===name)checked.status={...checked.status,stage:'awaitingClaim',recipient:account};setCheckout({...checkout!,phase:'claim-approval',completed:2,step:2,message:'Approve the offer to receive your name.'});},
  });
  if(result.pendingClaim){registrationFailed(result.error,name);return;}
  await finishRegistration(name,result.claim,account);
 }catch(error){const info=explainError(error),hint=hintFor(name);if(!info.txHash&&(isUnstartedPurchase(hint)||(!hint?.paid&&!hint?.paymentHash&&definitiveWalletDecline(error)))){forgetPurchase(name);checkout=null;if(info.code==='PRICE_CHANGED')try{await checkName(name);}catch{/* Keep the original price error if refreshing is unavailable. */}throw error;}registrationFailed(error,name);}
}
async function continueCheckedName(name:string,waitForOffer:boolean){
 const c=writeClient(),account=c.signerAddress!;try{
  const status=await c.read.getDomain({name,bypassCache:true});ensureRegistrationWallet(c,account);
  if(status.recipient!==account||!['pending','awaitingClaim'].includes(status.stage))throw new Error('Refresh name status and connect the designated recipient wallet.');
  const hint=hintFor(name);if(hint?.claimHash||hint?.claimStarted)throw new Error('Check the previous claim transaction before signing again.');
  if(hint&&hint.account!==account)throw new Error('Connect the original recipient wallet.');
  if(!hint)rememberPurchase({name,account,paid:true});
  if(waitForOffer){setCheckout({...checkout!,phase:'minting',completed:1,step:1,message:'Waiting for your claim offer…'});await c.registrar.waitForOffer(name);}
  ensureRegistrationWallet(c,account);rememberPurchase({...hintFor(name)!,claimStarted:false});if(checked?.name===name)checked.status={...checked.status,stage:'awaitingClaim',recipient:account};setCheckout({...checkout!,phase:'claim-approval',completed:2,step:2,message:'Approve the offer to receive your name.'});
  await finishRegistration(name,await c.registrar.claim(name),account);
 }catch(error){registrationFailed(error,name);}
}

function nameFilters():NameFilters{
 return{query:el<HTMLInputElement>('names-query').value,...nameLengthRange(el<HTMLSelectElement>('names-length').value),characters:el<HTMLSelectElement>('names-characters').value,sort:el<HTMLSelectElement>('names-sort').value};
}
function renderOwnedCollection(rebuild=false){
 if(!ownedPortfolio||ownedPortfolio.address!==writer?.signerAddress)return;
 const filters=nameFilters(),recent=recentNames(ownedPortfolio.address).read(),records=selectOwnedNames(ownedPortfolio.domains,ownedPortfolio.primary,filters,recent);
 el('names-toolbar').hidden=false;el('names-filter-count').textContent=records.length+' of '+ownedPortfolio.domains.length;el('names-filter-count').hidden=records.length===ownedPortfolio.domains.length;
 if(rebuild)renderDomainCards(ownedPortfolio.domains.map(record=>record.domain),ownedPortfolio.primary,new Set(ownedPortfolio.domains.filter(record=>isNewName(record,recent)).map(record=>record.domain)));
 const list=el('domain-list'),visible=new Set(records.map(record=>record.domain));list.querySelector('.names-no-results')?.remove();
 const rows=new Map(Array.from(list.querySelectorAll<HTMLElement>('.owned-domain')).map(row=>[row.querySelector<HTMLElement>('[data-domain]')!.dataset.domain!,row]));
 for(const[name,row]of rows)row.hidden=!visible.has(name);
 for(const record of records){const row=rows.get(record.domain);if(row)list.append(row);}
 if(!records.length&&ownedPortfolio.domains.length)list.insertAdjacentHTML('beforeend','<div class="names-no-results"><h3>No matching names</h3><p>Try another keyword or clear your filters.</p></div>');
}
for(const id of ['names-query'])el(id).addEventListener('input',()=>renderOwnedCollection());
for(const id of ['names-length','names-characters','names-sort'])el(id).addEventListener('change',()=>renderOwnedCollection());
el('names-clear-filters').onclick=()=>{el<HTMLInputElement>('names-query').value='';el<HTMLSelectElement>('names-length').value='all';el<HTMLSelectElement>('names-characters').value=defaultNameFilters.characters;el<HTMLSelectElement>('names-sort').value=defaultNameFilters.sort;renderOwnedCollection();};
function renderDomainCards(names:string[],primary:string|null,newNames:ReadonlySet<string>=new Set()){
 el('domain-list').innerHTML=names.length?domainCards(names,primary,newNames):'<div class="empty"><span class="empty-mark">.xah</span><h3>Find your first name.</h3><p>This wallet does not own any claimed names yet.</p><button class="subtle" id="empty-search">Find a name ↗</button></div>';
 el('empty-search')?.addEventListener('click',()=>view('discover'));
}
el('incoming-list').addEventListener('click',e=>{const button=(e.target as Element).closest<HTMLElement>('[data-claim-domain]');if(!button)return;const name=button.dataset.claimDomain!;void run('Claim name',async()=>{const c=writeClient(),account=c.signerAddress!;activeInboxClaim=name;try{
 const r=await c.registrar.claimIncoming(name);const primary=await finishRegistrationPrimary(name,account);forgetPurchase(name);recentNames(account).mark(name);
 if(checked?.name===name){resetDiscovery(false);completedRegistration={name,claimHash:r.txHash,primary};renderRegistration();}
 log('Claim name',r.engineResult,r.txHash,r.hookExecutions);await refreshConfirmed(name);return{message:name+' is now in your wallet.'};
 }catch(error){const hint=hintFor(name),info=explainError(error);if(hint){if(info.txHash)observePurchase({...hint,claimStarted:true,claimHash:info.txHash});else if(definitiveWalletDecline(error)&&!hint.claimHash)observePurchase({...hint,claimStarted:false});}throw error;}finally{activeInboxClaim=null;}});});
el('domain-list').addEventListener('click',e=>{const button=(e.target as Element).closest<HTMLElement>('button');if(!button)return;if(button.dataset.transfer)openDomainAction('transfer',button.dataset.transfer);else if(button.dataset.burn)openDomainAction('burn',button.dataset.burn);else if(button.dataset.domain)void run('Load profile',()=>loadProfile(button.dataset.domain!));});
function openDomainAction(action:'transfer'|'burn',domain:string){if(busy)return;actionDomain=domain;clearTransferRecipient();el('action-title').textContent=action==='transfer'?'Transfer name':'Burn name';el('action-domain').textContent=domain;el('action-status').hidden=true;el<HTMLFormElement>('transfer-form').reset();el<HTMLFormElement>('burn-form').reset();el('transfer-form').hidden=action!=='transfer';el('burn-form').hidden=action!=='burn';el<HTMLFormElement>('burn-form').querySelector<HTMLInputElement>('[name="confirmation"]')!.placeholder=domain;el<HTMLDialogElement>('domain-action-dialog').showModal();}
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
 touchedProfileFields.clear();el('address-list').innerHTML=addressRows(p.addrs);el('profile-fields').innerHTML=profileFieldForms(p.texts,p.owner===writer?.signerAddress&&!p.locked,selected);
 const standards=new Set<string>(PROFILE_FIELDS.map(f=>f.key));el('text-list').innerHTML=Object.entries(p.texts).filter(([key])=>!standards.has(key)).map(([key,value])=>`<div class="record"><div><span>${esc(key)}</span><p>${esc(value)}</p></div><button class="subtle owner-action" data-clear-text="${esc(key)}">Remove</button></div>`).join('')||'<p class="placeholder">No custom text records yet.</p>';
 if(!p.textKeysComplete)el('text-list').insertAdjacentHTML('beforeend',`<p class="hint">Some legacy keys have no stored name. Save the original key again to add its name.</p><pre>${esc(JSON.stringify(p.unnamedTexts,null,2))}</pre>`);
 el('address-list').querySelectorAll<HTMLButtonElement>('[data-edit-addr]').forEach(b=>b.onclick=()=>addressEditor(Number(b.dataset.editAddr)));
 el('address-list').querySelectorAll<HTMLButtonElement>('[data-clear-addr]').forEach(b=>b.onclick=()=>void mutate('Remove address',c=>c.resolver.clearAddr({...util.splitDomain(selected),coinType:Number(b.dataset.clearAddr)})));
 el('text-list').querySelectorAll<HTMLButtonElement>('[data-clear-text]').forEach(b=>b.onclick=()=>void mutate('Remove text record',c=>c.resolver.clearText({...util.splitDomain(selected),key:b.dataset.clearText!})));
 el('profile-fields').querySelectorAll<HTMLElement>('[data-profile-key]').forEach(field=>{field.querySelector<HTMLButtonElement>('[data-clear-field]')!.onclick=()=>{field.querySelector<HTMLInputElement|HTMLTextAreaElement>('input,textarea')!.value='';updateProfileState();validateProfileForm();};});
 updateProfileState();
}

function profileEdit(){const values:Partial<Record<ProfileTextKey,string>>={};el('profile-fields').querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea').forEach(input=>{values[input.name as ProfileTextKey]=input.value;});return evaluateProfileEdit(selected,profile?.texts??{},values);}
function profilePatch(){return profileEdit().patch;}
function validateProfileForm(focus=false){const{errors}=profileEdit();let first:HTMLInputElement|HTMLTextAreaElement|undefined;el('profile-fields').querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea').forEach(input=>{const message=errors[input.name as ProfileTextKey];if(focus&&message)touchedProfileFields.add(input.name);const show=!!message&&(focus||touchedProfileFields.has(input.name)),error=el('profile-error-'+input.name);error.textContent=show?message!:'';error.hidden=!show;if(show)input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid');if(message&&!first)first=input;});if(focus)first?.focus();return!first;}
function updateProfileState(){if(!el('save-profile'))return;const patch=profilePatch(),count=Object.keys(patch.set).length+patch.clear.length,editable=!!writer&&profile?.owner===writer.signerAddress&&!profile.locked;const supported=!!DEPLOYMENT.hookHashes?.profile;el<HTMLButtonElement>('save-profile').disabled=busy||!editable||!count||!supported;el<HTMLButtonElement>('discard-profile').disabled=busy||!editable||!count;el('profile-status').textContent=!supported?'Update unavailable':profile?.locked?'Profile locked':count?`${count} unsaved ${count===1?'change':'changes'}`:'No changes';el('profile-fields').querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea').forEach(input=>input.readOnly=busy||!editable);el('profile-fields').querySelectorAll<HTMLButtonElement>('[data-clear-field]').forEach(button=>button.disabled=busy||!editable);}
el('profile-form').addEventListener('input',()=>{updateProfileState();validateProfileForm();});
el('profile-fields').addEventListener('focusout',event=>{const input=event.target;if(input instanceof HTMLInputElement||input instanceof HTMLTextAreaElement){touchedProfileFields.add(input.name);validateProfileForm();}});
el('discard-profile').onclick=()=>{el<HTMLFormElement>('profile-form').reset();touchedProfileFields.clear();validateProfileForm();updateProfileState();};
form('profile-form',async()=>{const patch=profilePatch();if(!Object.keys(patch.set).length&&!patch.clear.length)return{message:'No profile changes to save.'};const c=writeClient(),name=selected,r=await c.resolver.setProfile({...util.splitDomain(name),...patch});if(!r)return{message:'These profile changes are already saved on the ledger.'};log('Save profile',r.engineResult,r.txHash,r.hookExecutions);await refreshConfirmed(name);return{message:'Profile changes saved with one transaction.'};},()=>validateProfileForm(true));

form('search-form',()=>checkName(registrationInput.name()),undefined,true);form('lookup-form',data=>loadProfile(canonical(el<HTMLInputElement>('lookup-name').value)));
form('addr-form',async data=>{const network=String(data.get('network')),ct=network==='custom'?Number(data.get('coin')):Number(network),value=String(data.get('address')).trim();let bytes:Buffer;
 if(data.get('raw')){if(!/^(?:[a-fA-F0-9]{2}){1,128}$/.test(value))throw new Error('Invalid hex: use 1–128 bytes.');bytes=Buffer.from(value,'hex');}else bytes=encodeAddress(ct,value);
 const r=await writeClient().resolver.setAddr({...util.splitDomain(selected),coinType:ct,addr:bytes});log('Save '+networkName(ct)+' address',r.engineResult,r.txHash,r.hookExecutions);await refreshConfirmed(selected);
});
form('text-form',async data=>{const r=await writeClient().resolver.setText({...util.splitDomain(selected),key:String(data.get('key')),value:String(data.get('value'))});log('Save text record',r.engineResult,r.txHash,r.hookExecutions);await refreshConfirmed(selected);});
el('transfer-claim').onclick=()=>void mutate('Accept transferred name',c=>c.registrar.acceptTransfer(selected));
el('primary-button').onclick=()=>void mutate('Update primary name',c=>c.resolver.setPrimary({...util.splitDomain(selected),flag:!profile?.primary}));el('refresh-domains').onclick=()=>void run('Load names',refreshDomains);el('close-profile').onclick=()=>{selected='';profile=null;view('portfolio');};
el('reset-profile').onclick=()=>{if(confirm('Remove all addresses, text records, and primary settings for '+selected+'?'))void mutate('Reset profile',c=>c.resolver.reset(util.splitDomain(selected)));};
el('transfer-recipient').addEventListener('input',clearTransferRecipient);
const autoResolveRecipient=()=>{if(el<HTMLDialogElement>('domain-action-dialog').open&&!el('transfer-form').hidden)void recipientPreview.resolve(el<HTMLInputElement>('transfer-recipient').value).catch(()=>{});};
el('transfer-recipient').addEventListener('change',autoResolveRecipient);
el('transfer-recipient').addEventListener('blur',autoResolveRecipient);
el('domain-action-dialog').addEventListener('close',clearTransferRecipient);
form('transfer-form',async data=>{
 const client=writeClient(),name=actionDomain,input=String(data.get('recipient')).trim();
 const preview=recipientPreview.state.status==='ready'?recipientPreview.state.recipient:null;
 const pending=preview?resolveTransferRecipient(input,domain=>reader.read.getOwner({name:domain,bypassCache:true})):recipientPreview.resolve(input),version=recipientPreview.version;
 const recipient=await pending;
 if(!recipient)throw new Error('Recipient changed. Review the recipient and try again.');
 if(recipientPreview.version!==version||!el<HTMLDialogElement>('domain-action-dialog').open||actionDomain!==name||el<HTMLInputElement>('transfer-recipient').value.trim()!==input||writeClient()!==client)throw new Error('Transfer details changed. Review the recipient and try again.');
 if(recipient.domain&&preview&&preview.address!==recipient.address){
  clearTransferRecipient();await recipientPreview.resolve(input);
  return{message:'The name owner changed. Review the updated recipient before confirming.',warning:true};
 }
 const r=await client.registrar.createTransferOffer(name,recipient.address);log('Transfer offer',r.engineResult,r.txHash,r.meta);el<HTMLDialogElement>('domain-action-dialog').close();return{message:'Transfer offer created. The recipient can claim it from Ready to claim in My names.'};
});
el('cancel-transfer').onclick=()=>void run('Cancel transfer offer',async()=>{const r=await writeClient().registrar.cancelTransferOffer(actionDomain);log('Cancel transfer',r.engineResult,r.txHash,r.meta);el<HTMLDialogElement>('domain-action-dialog').close();return{message:'Transfer offer cancelled.'};});
form('burn-form',async data=>{const domain=actionDomain;if(String(data.get('confirmation'))!==domain)throw new Error('The confirmation name does not match.');const r=await writeClient().registrar.burn(domain);log('Burn name',r.engineResult,r.txHash,r.hookExecutions);el<HTMLDialogElement>('domain-action-dialog').close();if(selected===domain){profile=null;selected='';view('portfolio');}await refreshConfirmed();void kit.refreshIdentity()?.catch(()=>{});return{message:domain+' was burned and its name records were removed.'};});
form('register-form',async data=>{const name=canonical(String(data.get('domain'))),r=await writeClient().registrar.register({...util.splitDomain(name),recipient:String(data.get('recipient')).trim()});log('Treasury register',r.engineResult,r.txHash,r.hookExecutions);view('discover');el<HTMLInputElement>('search-name').value=name;await checkName(name);});
form('uribase-form',async data=>{const r=await writeClient().registrar.setURIBase(String(data.get('base')).trim());log('Update URI base',r.engineResult,r.txHash,r.hookExecutions);});
form('receipt-form',async data=>{await ready();const hash=String(data.get('hash')),r=await reader.waitForTransaction(hash,{timeoutMs:10000});log('Check transaction',r.meta.TransactionResult,hash,r.meta.HookExecutions);if(r.meta.TransactionResult!=='tesSUCCESS')throw new Error(r.meta.TransactionResult);});
const initialRoute=parseRoute(location.hash),initialDomain=new URLSearchParams(location.search).get('domain');
view('discover',false,false,'none');
if(initialRoute&&(initialRoute.view!=='discover'||initialRoute.section==='lookup')){lastRouteURL=location.href;void applyRoute(initialRoute);}
else{
 writeRoute({view:'discover'},'replace');const candidate=initialDomain??purchaseJournal.latest()?.name;
 if(candidate)try{registrationInput.setDomain(candidate);el<HTMLFormElement>('search-form').requestSubmit();}catch(error){el('discovery-error').textContent=explainError(error).message;el('discovery-error').hidden=false;}
}
const heartbeatTimer=setInterval(()=>{if(reader.isConnected())void reader.rawClient.request({command:'ping'}).catch(()=>{});},15000);

const balanceTimer=setInterval(()=>{if(kit.manager.getAccount()&&reader.isConnected()&&!document.hidden&&!busy)void kit.refreshBalance();},30000);
if(import.meta.hot)import.meta.hot.dispose(()=>{disposed=true;window.removeEventListener('popstate',followLocation);window.removeEventListener('hashchange',followLocation);kit.closeModal();clearCelebration();epoch++;incomingController?.abort();clearInterval(heartbeatTimer);clearInterval(balanceTimer);if(walletSyncTimer!==undefined)clearTimeout(walletSyncTimer);void reader.disconnect().catch(()=>{});});
