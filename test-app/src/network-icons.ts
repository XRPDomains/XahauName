const icons:Record<number,string>={
 0:new URL('./icons/btc.svg',import.meta.url).href,
 60:new URL('./icons/eth.svg',import.meta.url).href,
 501:new URL('./icons/sol.svg',import.meta.url).href,
 195:new URL('./icons/trx.svg',import.meta.url).href,
 144:new URL('./icons/xrp.svg',import.meta.url).href,
};
export function networkIcon(coin:number){if(coin===21337)return '<svg viewBox="0 0 32 32" aria-hidden="true"><text x="16" y="20" text-anchor="middle" fill="currentColor" font-size="10" font-weight="700">XAH</text></svg>';const icon=icons[coin];return icon?`<img src="${icon}" width="24" height="24" alt="">`:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m10 3-4 18M18 3l-4 18M3 9h18M2 15h18"/></svg>';}
