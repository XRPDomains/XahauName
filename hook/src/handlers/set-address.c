#include "common.h"

static int64_t do_address(int operation,const uint8_t *sender)
{
    uint8_t label[64],tld[16],root[32],value[ROOT_LEN],key[32],idx[RECIDX_LEN],addr[128];
    int llen=parse_lower_field(0,0,"label",5,label,64),tlen=parse_lower_field(0,0,"tld",3,tld,16);
    int64_t coin=parse_uint_field_strict(0,0,"coinType",8);
    if(llen<=0||tlen<=0||coin<0||coin>65535)rollback(SBUF("bad address fields"),RC_BAD_MEMO);
    int length=0;
    if(operation==4){
        uint8_t hex[256];int n=otxn_param(hex,256,(uint32_t)"addr",4);
        if(n<2||(n&1))rollback(SBUF("bad addr"),RC_BAD_MEMO);
        length=n/2;
        /* 256 hex characters contain at most 128 bytes, plus the loop exit. */
        for(int i=0;GUARD(129),i<length;i++){
            int hi=hex_nibble(hex[2*i]),lo=hex_nibble(hex[2*i+1]);
            if(hi<0||lo<0)rollback(SBUF("bad addr"),RC_BAD_MEMO);
            addr[i]=(hi<<4)|lo;
        }
    }
    require_owner(label,llen,tld,tlen,sender,root,value);
    if(!make_addr_key(key,label,llen,tld,tlen,(uint32_t)coin))rollback(SBUF("address key"),RC_STATE_ERR);
    load_records_index(idx,label,llen,tld,tlen);
    int changed=operation==4?recidx_add_coin(idx,(uint16_t)coin):recidx_remove_coin(idx,(uint16_t)coin);
    if(operation==4&&changed==0)rollback(SBUF("index full"),RC_INDEX_FULL);
    if(changed==1&&!save_records_index(idx,label,llen,tld,tlen))rollback(SBUF("index write"),RC_STATE_ERR);
    int written=state_set(addr,length,key,32);
    if(written<0||(operation==4&&written!=length))rollback(SBUF("address write"),RC_STATE_ERR);
    if(operation==4)accept(SBUF("addr set"),0);
    accept(SBUF("addr cleared"),0);
}
#pragma clang attribute pop

__attribute__((flatten)) int64_t hook(uint32_t ctx){_g(1,1);int64_t tt=otxn_type();if(tt!=ttPAYMENT&&tt!=ttINVOKE)accept(SBUF("ignored"),0);if(ctx!=0)accept(SBUF("weak ignored"),0);uint8_t marker[1];if(otxn_param(marker,1,(uint32_t)"xn_v",4)!=1||marker[0]!=2)accept(SBUF("not v2"),0);uint8_t sender[20];if(otxn_field(sender,20,sfAccount)!=20)rollback(SBUF("sender"),RC_BAD_MEMO);uint8_t op[1];if(otxn_param(op,1,(uint32_t)"op",2)!=1||(op[0]>16||op[0]==15||op[0]==8))rollback(SBUF("unknown op"),RC_UNKNOWN_OP);int operation=op[0];const uint8_t*m=0;int ml=0;if(operation==4||operation==5)return do_address(operation,sender);accept(SBUF("next"),0);}
