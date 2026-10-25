#include "common.h"

int64_t do_clear_text(const uint8_t *memo, int ml, const uint8_t *sender20)
{
    uint8_t label[64], tld[16], tkey[40];
    int llen = parse_lower_field(memo, ml, "label", 5, label, 64);
    int tlen = parse_lower_field(memo, ml, "tld",   3, tld,   16);
    int klen = parse_lower_field(memo, ml, "key",   3, tkey,  40);
    if (llen <= 0 || tlen <= 0 || klen <= 0)
        rollback(SBUF("bad memo"), RC_BAD_MEMO);

    uint8_t root_key[32], root_val[ROOT_LEN];
    require_owner(label, llen, tld, tlen, sender20, root_key, root_val);

    uint8_t key[32];
    if (!make_text_key(key, label, llen, tld, tlen, tkey, klen)) rollback(SBUF("text key"), RC_STATE_ERR);
    uint8_t zero[1] = { 0 };
    if (state_set(zero, 0, key, 32) < 0) rollback(SBUF("text clear"), RC_STATE_ERR);

    uint8_t idx[RECIDX_LEN];
    if (load_records_index(idx, label, llen, tld, tlen)) {
        if (recidx_remove_text_all(idx, root_key, key, tkey, klen) &&
            !save_records_index(idx, label, llen, tld, tlen)) rollback(SBUF("idx w"), RC_STATE_ERR);
    }
    accept(SBUF("text cleared"), RC_OK);
    return RC_OK;
}
#pragma clang attribute pop

__attribute__((flatten)) int64_t hook(uint32_t ctx){_g(1,1);uint8_t sender[20];int operation=entry_operation(ctx,sender);const uint8_t*m=0;int ml=0;if(operation==7)return do_clear_text(m,ml,sender);accept(SBUF("next"),0);}
