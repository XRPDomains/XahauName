#include "common.h"
#pragma clang attribute pop
__attribute__((flatten)) int64_t hook(uint32_t ctx){
    _g(1,1);
    int tt=otxn_type();
    if((tt!=ttPAYMENT&&tt!=ttINVOKE)||ctx!=0)accept(SBUF("ignored"),0);
    uint8_t marker[1],op[1],sender[20],label[64],tld[16],root[32],value[ROOT_LEN];
    if(otxn_param(marker,1,(uint32_t)"xn_v",4)!=1||marker[0]!=2)accept(SBUF("not v2"),0);
    if(otxn_param(op,1,(uint32_t)"op",2)!=1)rollback(SBUF("missing op"),RC_BAD_MEMO);
    if(!((op[0]>=3&&op[0]<=7)||op[0]==9))accept(SBUF("next"),0);
    if(otxn_field(sender,20,sfAccount)!=20)rollback(SBUF("sender"),RC_BAD_MEMO);
    if(op[0]==9&&is_owner_of_hook(sender))accept(SBUF("admin reset"),0);
    int llen=parse_lower_field(0,0,"label",5,label,64),tlen=parse_lower_field(0,0,"tld",3,tld,16);
    if(llen<=0||tlen<=0)rollback(SBUF("domain required"),RC_BAD_MEMO);
    uint8_t identity_key[32],identity[32];
    if(!make_token_key(identity_key,label,llen,tld,tlen))rollback(SBUF("identity key"),RC_STATE_ERR);
    int mapped=state(identity,32,identity_key,32);
    if(mapped==DOESNT_EXIST){
        uint8_t uri[70],issuer[20];int n=build_uri(uri,70,label,llen,tld,tlen);
        if(n<1||hook_account(issuer,20)!=20||!compute_uritoken_id(identity,issuer,uri,n)||
           state_set(identity,32,identity_key,32)!=32)rollback(SBUF("legacy identity"),RC_STATE_ERR);
    }else if(mapped!=32)rollback(SBUF("identity state"),RC_STATE_ERR);
    authorize_owner(label,llen,tld,tlen,sender,root,value);
    accept(SBUF("authorized"),0);
}
