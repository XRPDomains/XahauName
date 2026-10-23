#include "common.h"

int64_t do_set_text(const uint8_t *memo, int ml, const uint8_t *sender20)
{
    uint8_t label[64], tld[16], tkey[40], tval[128];
    int llen = parse_lower_field(memo, ml, "label", 5, label, 64);
    int tlen = parse_lower_field(memo, ml, "tld",   3, tld,   16);
    int klen = parse_lower_field(memo, ml, "key",   3, tkey,  40);
    int vlen = parse_str_field  (memo, ml, "value", 5, tval,  128);
    if (llen <= 0 || tlen <= 0 || klen <= 0 || vlen <= 0)
        rollback(SBUF("bad memo"), RC_BAD_MEMO);

    for (int i = 0; GUARD(42), i < klen; i++) {
        uint8_t c = tkey[i];
        int ok = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
              || c == '.' || c == '_' || c == '-';
        if (!ok) rollback(SBUF("bad text key"), RC_BAD_MEMO);
    }

    uint8_t root_key[32], root_val[ROOT_LEN];
    require_owner(label, llen, tld, tlen, sender20, root_key, root_val);

    uint8_t key[32];
    if (!make_text_key(key, label, llen, tld, tlen, tkey, klen))
        rollback(SBUF("key err"), RC_STATE_ERR);

    uint8_t idx[RECIDX_LEN];
    load_records_index(idx, label, llen, tld, tlen);
    int rc_add = recidx_add_text_std(idx, (const char *)tkey, klen);
    if (rc_add == 0) rc_add = recidx_add_custom(idx, root_key, key, tkey, klen);
    if (rc_add == 0) rollback(SBUF("text index full"), RC_INDEX_FULL);
    if (rc_add == 1 && !save_records_index(idx, label, llen, tld, tlen))
        rollback(SBUF("idx w"), RC_STATE_ERR);
    if (state_set(tval, vlen, key, 32) != vlen)
        rollback(SBUF("text w"), RC_STATE_ERR);

    accept(SBUF("text set"), RC_OK);
    return RC_OK;
}
#pragma clang attribute pop

__attribute__((flatten)) int64_t hook(uint32_t ctx){_g(1,1);int64_t tt=otxn_type();if(tt!=ttPAYMENT&&tt!=ttINVOKE)accept(SBUF("ignored"),0);if(ctx!=0)accept(SBUF("weak ignored"),0);uint8_t marker[1];if(otxn_param(marker,1,(uint32_t)"xn_v",4)!=1||marker[0]!=2)accept(SBUF("not v2"),0);uint8_t sender[20];if(otxn_field(sender,20,sfAccount)!=20)rollback(SBUF("sender"),RC_BAD_MEMO);uint8_t op[1];if(otxn_param(op,1,(uint32_t)"op",2)!=1||(op[0]>17||op[0]==15||op[0]==8))rollback(SBUF("unknown op"),RC_UNKNOWN_OP);int operation=op[0];const uint8_t*m=0;int ml=0;if(operation!=6)accept(SBUF("next"),0);uint8_t hdr[5];int hl=otxn_param(hdr,5,(uint32_t)"profile",7);if(hl!=DOESNT_EXIST)accept(SBUF("next"),0);return do_set_text(m,ml,sender);}
