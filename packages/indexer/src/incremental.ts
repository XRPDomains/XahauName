import {util} from '@xahauname/sdk';
import type {Change, Materialized} from './types';

/** A ledger-sized overlay. The committed projection is untouched until storage commits. */
export function overlayState(base:Materialized):Materialized {
    const table=(source:Record<string,any>)=>{
        const writes=new Map<string,any>(),removed=new Set<string>();
        return new Proxy(Object.create(null),{
            get:(_target,key)=>typeof key==='string'?(removed.has(key)?undefined:writes.has(key)?writes.get(key):source[key]):undefined,
            set:(_target,key,value)=>{writes.set(String(key),value);removed.delete(String(key));return true;},
            deleteProperty:(_target,key)=>{writes.delete(String(key));removed.add(String(key));return true;},
            ownKeys:()=>[...new Set([...Object.keys(source),...writes.keys()])].filter(key=>!removed.has(key)),
            getOwnPropertyDescriptor:(_target,key)=>typeof key==='string'&&!removed.has(key)&&(writes.has(key)||Object.hasOwn(source,key))?{enumerable:true,configurable:true}:undefined,
        });
    };
    return {state:table(base.state),tokens:table(base.tokens),domains:table(base.domains),recovery:table(base.recovery)};
}

/** Reverse dependencies include absent keys so adding a new record is observed too. */
export class DomainDependencies {
    private byKey=new Map<string,string|Set<string>>();
    private byName=new Map<string,string[]>();
    constructor(state:Materialized) {for(const name of Object.keys(state.domains))this.update(name,state);}
    affected(changes:Change[]):Set<string> {
        const out=new Set<string>();
        for(const change of changes){const names=this.byKey.get(change.table+':'+change.key);if(typeof names==='string')out.add(names);else for(const name of names??[])out.add(name);}
        return out;
    }
    update(name:string,state:Materialized) {
        for(const key of this.byName.get(name)??[]){const names=this.byKey.get(key);if(typeof names==='string'){if(names===name)this.byKey.delete(key);}else if(names){names.delete(name);if(!names.size)this.byKey.delete(key);else if(names.size===1)this.byKey.set(key,names.values().next().value!);}}
        const profile=state.domains[name];
        if(!profile){this.byName.delete(name);return;}
        const {label,tld}=util.splitDomain(name);
        const stateKeys=[util.rootKey(label,tld),util.tokenKey(label,tld),util.recordsKey(label,tld),util.recoveryKey(label,tld),
            ...Array.from({length:15},(_,slot)=>util.textSlotKey(label,tld,slot)).filter(key=>state.state[key]!==undefined),
            ...Object.keys(profile?.addrs??{}).map(coin=>util.addrKey(label,tld,Number(coin))),
            ...Object.keys(profile?.texts??{}).map(key=>util.textKey(label,tld,key)),...Object.keys(profile?.unnamedTexts??{})];
        if(profile?.owner)stateKeys.push(util.primaryOfKey(profile.owner));
        const id=profile?.tokenId??state.state[util.tokenKey(label,tld)];
        if(id)stateKeys.push(util.uriKey(id),util.labelOfKey(id),util.pendingKey(id),...(['mnt','ofr','rfd'] as const).map(tag=>util.asyncKey(tag,id)));
        const keys=stateKeys.map(key=>'state:'+key);
        if(id)keys.push('tokens:'+id);
        keys.push('recovery:'+name);
        this.byName.set(name,keys);
        for(const key of keys){const names=this.byKey.get(key);if(names===undefined)this.byKey.set(key,name);else if(typeof names==='string'){if(names!==name)this.byKey.set(key,new Set([names,name]));}else names.add(name);}
    }
}

export class DomainCollections {
    private owners=new Map<string,Set<string>>();
    private offers=new Map<string,Set<string>>();
    private recovering=new Set<string>();
    private previous=new Map<string,{owner?:string;destination?:string}>();
    constructor(state:Materialized){for(const [name,profile]of Object.entries(state.domains))this.update(name,profile);}
    private member(map:Map<string,Set<string>>,key:string|undefined,name:string,add:boolean){
        if(!key)return;let set=map.get(key);
        if(add){if(!set)map.set(key,set=new Set());set.add(name);}
        else if(set){set.delete(name);if(!set.size)map.delete(key);}
    }
    update(name:string,profile:Materialized['domains'][string]|undefined){
        const old=this.previous.get(name);
        this.member(this.owners,old?.owner,name,false);this.member(this.offers,old?.destination,name,false);this.recovering.delete(name);
        const next={owner:profile?.status==='claimed'?profile.owner:undefined,destination:profile?.status!=='recoveryRequired'?profile?.offer?.destination:undefined};
        this.member(this.owners,next.owner,name,true);this.member(this.offers,next.destination,name,true);
        if(profile?.status==='recoveryRequired')this.recovering.add(name);
        if(profile)this.previous.set(name,next);else this.previous.delete(name);
    }
    owned(address:string){return [...this.owners.get(address)??[]].sort();}
    incoming(address:string){return [...this.offers.get(address)??[]].sort();}
    recovery(){return [...this.recovering].sort();}
}
