import {diffProfile,validateProfileValue,type ProfileTextKey} from '@xahauname/sdk';

/** Validate only changed nonblank fields; untouched/absent records remain outside the patch. */
export function evaluateProfileEdit(domain:string,current:Record<string,string>,values:Partial<Record<ProfileTextKey,string>>) {
    const patch=diffProfile(current,values),errors:Partial<Record<ProfileTextKey,string>>={};
    for(const [key,value]of Object.entries(patch.set)){
        try{validateProfileValue(domain,key,value);}
        catch(error){errors[key as ProfileTextKey]=error instanceof Error?error.message:'Check this field';}
    }
    return{patch,errors};
}
