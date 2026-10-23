#include "common.h"

static int64_t do_set_profile(const uint8_t *sender, const uint8_t *header, int hlen)
{
    if(hlen!=5||(header[0]!=1&&header[0]!=2))rollback(SBUF("profile invalid"),RC_BAD_MEMO);
    uint32_t sets=((uint32_t)header[1]<<8)|header[2];
    uint32_t clears=((uint32_t)header[3]<<8)|header[4];
    if(!(sets|clears)||((sets|clears)&~1023U)||(sets&clears))rollback(SBUF("profile invalid"),RC_BAD_MEMO);
    uint8_t data[10][128], lengths[10], junk[128];
    if(otxn_param(junk,128,(uint32_t)"key",3)!=DOESNT_EXIST||
       otxn_param(junk,128,(uint32_t)"value",5)!=DOESNT_EXIST)
        rollback(SBUF("profile invalid"),RC_BAD_MEMO);
    for(int i=0;GUARD(11),i<10;i++) {
        uint8_t pname[2]={'p',(uint8_t)('0'+i)};
        int n=otxn_param(data[i],128,pname,2);
        if(sets&(1U<<i)) {
            if(n<1||n>128)rollback(SBUF("profile invalid"),RC_BAD_MEMO);
            lengths[i]=n;
        } else if(n!=DOESNT_EXIST)rollback(SBUF("profile invalid"),RC_BAD_MEMO);
    }
    uint8_t label[64],tld[16],root[32],rootval[ROOT_LEN],idx[RECIDX_LEN];
    int llen=parse_lower_field(0,0,"label",5,label,64);
    int tlen=parse_lower_field(0,0,"tld",3,tld,16);
    if(llen<1||llen>57||tlen<2||tlen>8)rollback(SBUF("profile invalid"),RC_BAD_MEMO);
    require_owner(label,llen,tld,tlen,sender,root,rootval);
    load_records_index(idx,label,llen,tld,tlen);
    int cnt=idx[3];
    if(cnt>15||idx[1]!=0||idx[2]>15)rollback(SBUF("profile state"),RC_STATE_ERR);
    static const uint16_t bit_for_tag[18]={4,2,8,16,0,0,64,128,512,0,0,256,1,32,0,0,0,0};
    static const uint8_t tag_for_bit[10]={12,1,0,2,3,13,6,7,11,8};
    static const uint16_t global_bit_for_tag[18]={1,2,512,8,64,16,0,0,0,0,0,0,0,128,0,4,32,256};
    static const uint8_t global_tag_for_bit[10]={0,1,15,3,5,16,4,13,17,2};
    uint32_t present=0,seen_tags=0,seen_slots=0;int kept=0;
    for(int i=0;GUARD(16),i<cnt;i++) {
        int off=34+i*6,tag=idx[off];uint32_t bit=0;
        if(tag==255) {
            int slot=idx[off+1];
            if(slot>=15||(seen_slots&(1U<<slot)))rollback(SBUF("profile state"),RC_STATE_ERR);
            seen_slots|=1U<<slot;
        } else {
            if(tag>=SWEEP_TEXT_KEYS_COUNT||(seen_tags&(1U<<tag))||idx[off+1]!=SWEEP_TEXT_KEY_LENS[tag])
                rollback(SBUF("profile state"),RC_STATE_ERR);
            seen_tags|=1U<<tag;bit=header[0]==1?bit_for_tag[tag]:global_bit_for_tag[tag];present|=bit;
        }
        if(bit&clears)continue;
#pragma clang loop unroll(full)
        for(int k=0;k<6;k++)idx[34+kept*6+k]=idx[off+k];
        kept++;
    }
    int changed=kept!=cnt;
    for(int i=0;GUARD(11),i<10;i++) {
        uint32_t bit=1U<<i;
        if(!(sets&bit)||(present&bit))continue;
        if(kept>=15)rollback(SBUF("profile index full"),RC_INDEX_FULL);
        int tag=(header[0]==1?tag_for_bit[i]:global_tag_for_bit[i]),n=SWEEP_TEXT_KEY_LENS[tag],off=34+kept*6;
        idx[off]=tag;idx[off+1]=n;
#pragma clang loop unroll(full)
        for(int k=0;k<4;k++)idx[off+2+k]=k<n?(uint8_t)SWEEP_TEXT_KEYS[tag][k]:0;
        kept++;changed=1;
    }
    idx[3]=kept;
    
    if(changed&&!save_records_index(idx,label,llen,tld,tlen))rollback(SBUF("profile state"),RC_STATE_ERR);
    
    uint8_t pre[84],key[32],zero[1]={0};
    XN_COPY(pre,label,llen);
    pre[llen]='.';
    XN_COPY(pre+llen+1,tld,tlen);
    int prefix=llen+1+tlen;
    pre[prefix++]=':';pre[prefix++]='t';pre[prefix++]='e';
    pre[prefix++]='x';pre[prefix++]='t';pre[prefix++]=':';
    
    for(int i=0;GUARD(11),i<10;i++) {
        uint32_t bit=1U<<i;
        if(!((sets|clears)&bit))continue;
        int tag=(header[0]==1?tag_for_bit[i]:global_tag_for_bit[i]),n=SWEEP_TEXT_KEY_LENS[tag];
#pragma clang loop unroll(full)
        for(int k=0;k<12;k++)if(k<n)pre[prefix+k]=(uint8_t)SWEEP_TEXT_KEYS[tag][k];
        if(util_sha512h(key,32,pre,prefix+n)!=32)rollback(SBUF("profile state"),RC_STATE_ERR);
        if(sets&bit) {
            if(state_set(data[i],lengths[i],key,32)!=lengths[i])rollback(SBUF("profile state"),RC_STATE_ERR);
        } else {
            int read=state(junk,128,key,32);
            if(read!=DOESNT_EXIST&&(read<0||state_set(zero,0,key,32)<0))rollback(SBUF("profile state"),RC_STATE_ERR);
        }
    }
    accept(SBUF("profile set"),RC_OK);
}
#pragma clang attribute pop

__attribute__((flatten)) int64_t hook(uint32_t ctx){_g(1,1);int64_t tt=otxn_type();if(tt!=ttPAYMENT&&tt!=ttINVOKE)accept(SBUF("ignored"),0);if(ctx!=0)accept(SBUF("weak ignored"),0);uint8_t marker[1];if(otxn_param(marker,1,(uint32_t)"xn_v",4)!=1||marker[0]!=2)accept(SBUF("not v2"),0);uint8_t sender[20];if(otxn_field(sender,20,sfAccount)!=20)rollback(SBUF("sender"),RC_BAD_MEMO);uint8_t op[1];if(otxn_param(op,1,(uint32_t)"op",2)!=1||(op[0]>16||op[0]==15||op[0]==8))rollback(SBUF("unknown op"),RC_UNKNOWN_OP);int operation=op[0];const uint8_t*m=0;int ml=0;if(operation!=6)accept(SBUF("next"),0);uint8_t hdr[5];int hl=otxn_param(hdr,5,(uint32_t)"profile",7);if(hl==DOESNT_EXIST)accept(SBUF("next"),0);return do_set_profile(sender,hdr,hl);}
