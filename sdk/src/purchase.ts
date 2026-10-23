type Registrar<P,C>={buy(args:{label:string;tld:string}):Promise<P>;waitForOffer(domain:string,options:{timeoutMs:number;pollIntervalMs:number}):Promise<unknown>;claim(domain:string):Promise<C>};
/** Pay exactly once. A failed/declined claim never triggers another payment. */
export async function purchaseThenClaim<P,C>(registrar:Registrar<P,C>,args:{label:string;tld:string},hooks:{purchased:(tx:P)=>void;claiming:()=>void}){
    const purchase=await registrar.buy(args);
    try{hooks.purchased(purchase);await registrar.waitForOffer(`${args.label}.${args.tld}`,{timeoutMs:90000,pollIntervalMs:1500});hooks.claiming();const claim=await registrar.claim(`${args.label}.${args.tld}`);return{purchase,claim,pendingClaim:false as const};}
    catch(error){return{purchase,pendingClaim:true as const,error};}
}
