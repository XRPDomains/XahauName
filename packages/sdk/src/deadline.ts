import {XahauNameError} from './errors';

export function positiveMilliseconds(value:number,name:string):number {
    if(!Number.isSafeInteger(value)||value<1||value>2147483647)
        throw new XahauNameError('Invalid '+name,'INVALID_ARGUMENT');
    return value;
}

/** Bound the caller's wait, without cancelling a transport shared by other readers. */
export function beforeDeadline<T>(read:()=>Promise<T>,deadline:number,signal?:AbortSignal,details?:unknown):Promise<T> {
    const error=(aborted=false)=>new XahauNameError(aborted?'Read aborted':'Read deadline exceeded',aborted?'ABORTED':'TIMEOUT',details);
    if(signal?.aborted)return Promise.reject(error(true));
    const remaining=deadline-Date.now();
    if(remaining<=0)return Promise.reject(error());
    return new Promise<T>((resolve,reject)=>{
        let settled=false;
        const finish=(callback:()=>void)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);callback();};
        const abort=()=>finish(()=>reject(error(true)));
        const timer=setTimeout(()=>finish(()=>reject(error())),Math.min(remaining,2147483647));
        signal?.addEventListener('abort',abort,{once:true});
        if(signal?.aborted){abort();return;}
        Promise.resolve().then(()=>{if(signal?.aborted)throw error(true);return read();}).then(value=>finish(()=>resolve(value)),cause=>finish(()=>reject(cause)));
    });
}

export function waitDelay(ms:number,signal?:AbortSignal):Promise<void> {
    if(signal?.aborted)return Promise.reject(new XahauNameError('Read aborted','ABORTED'));
    return new Promise((resolve,reject)=>{
        const done=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve();};
        const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new XahauNameError('Read aborted','ABORTED'));};
        const timer=setTimeout(done,ms);signal?.addEventListener('abort',abort,{once:true});
        if(signal?.aborted)abort();
    });
}
