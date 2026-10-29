/** An explicit Buy click may connect, then buy once. Cancellation never leaves a deferred payment. */
export async function connectThenPurchase(options:{
 isCurrent:()=>boolean;hasAccount:()=>boolean;connect:()=>Promise<void>;bind:()=>Promise<void>;buy:()=>Promise<void>;
}){
 const check=()=>{if(!options.isCurrent())throw new Error('Purchase cancelled because the page changed. Review the name before continuing.');};
 check();if(!options.hasAccount())await options.connect();check();await options.bind();check();await options.buy();
}
