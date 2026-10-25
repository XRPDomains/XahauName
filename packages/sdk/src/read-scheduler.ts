/** One client-wide limit, including reads started by independent public calls. */
export class ReadScheduler {
    private active=0;
    private queue:Array<()=>void>=[];
    constructor(private limit:number) {
        if(!Number.isSafeInteger(limit)||limit<1||limit>32)throw new Error('readConcurrency must be an integer 1..32');
    }
    run<T>(read:()=>Promise<T>):Promise<T> {
        return new Promise((resolve,reject)=>{
            const start=()=>{
                this.active++;
                Promise.resolve().then(read).then(resolve,reject).finally(()=>{
                    this.active--;this.queue.shift()?.();
                });
            };
            if(this.active<this.limit)start();
            else if(this.queue.length<1024)this.queue.push(start);
            else reject(Object.assign(new Error('Too many queued ledger reads; reduce concurrent requests'),{code:'RPC_LIMIT'}));
        });
    }
}
