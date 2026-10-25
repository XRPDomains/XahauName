export interface ActivityEntry {label:string;hash?:string;result:string;details?:unknown}
/** Session diagnostics have a fixed entry and serialized-byte budget. */
export class ActivityHistory {
    private entries:ActivityEntry[]=[];
    constructor(private limit=100,private maxBytes=128*1024) {
        if(!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(maxBytes)||maxBytes<256)throw new Error('Invalid activity limits');
    }
    add(entry:ActivityEntry) {
        if(entry.hash){const duplicate=this.entries.findIndex(old=>old.hash===entry.hash&&old.label===entry.label&&old.result===entry.result);if(duplicate>=0)this.entries.splice(duplicate,1);}
        let details:unknown;
        if(entry.details!==undefined){
            try {
                const json=JSON.stringify(entry.details,(_key,value)=>typeof value==='bigint'?String(value):value);
                details=json&&json.length<=8192?JSON.parse(json):{summary:'Details omitted. Check the transaction hash for the full receipt.'};
            } catch {details={summary:'Details unavailable. Check the transaction hash.'};}
        }
        this.entries.unshift({...entry,label:entry.label.slice(0,256),result:entry.result.slice(0,512),details});
        this.entries.length=Math.min(this.entries.length,this.limit);
        while(this.entries.length&&new TextEncoder().encode(JSON.stringify(this.entries)).byteLength>this.maxBytes)this.entries.pop();
    }
    get size(){return this.entries.length;}
    recent(limit=30):readonly ActivityEntry[]{return this.entries.slice(0,limit);}
}
