#include "common.h"

int64_t do_set_pricing(const uint8_t*m,int ml,const uint8_t*sender){if(!is_owner_of_hook(sender))rollback(SBUF("owner only"),RC_NOT_ADMIN);uint8_t key[32],p[PRICING_LEN];p[0]=PRICING_VERSION;if(otxn_param(p+1,80,(uint32_t)"prices",6)!=80)rollback(SBUF("prices length"),RC_BAD_ADMIN_ARG);make_pricing_key(key);if(state_set(p,PRICING_LEN,key,32)!=PRICING_LEN)rollback(SBUF("pricing w"),RC_STATE_ERR);accept(SBUF("pricing set"),RC_OK);}

int64_t do_tld(int enable, const uint8_t *memo, int ml, const uint8_t *sender20)
{
    if (!is_owner_of_hook(sender20))
        rollback(SBUF("not admin"), RC_NOT_ADMIN);
    uint8_t tld[16];
    int tlen = parse_lower_field(memo, ml, "tld", 3, tld, 16);
    if (tlen <= 0) rollback(SBUF("no tld"), RC_BAD_ADMIN_ARG);
    int rc = validate_tld_format(tld, tlen);
    if (rc != 0) rollback(SBUF("bad tld"), rc);

    uint8_t key[32]; make_tld_key(key, tld, tlen);
    uint8_t val[1] = { enable ? (uint8_t)0x01 : (uint8_t)0x00 };
    if (state_set(val, 1, key, 32) != 1)
        rollback(SBUF("tld w"), RC_STATE_ERR);
    accept(SBUF("tld updated"), RC_OK);
    return RC_OK;
}

int64_t do_pause(int pause_flag, const uint8_t *sender20)
{
    if (!is_owner_of_hook(sender20))
        rollback(SBUF("not admin"), RC_NOT_ADMIN);
    uint8_t key[32]; make_paused_key(key);
    if (pause_flag) {
        uint8_t one[1] = { 0x01 };
        if (state_set(one, 1, key, 32) != 1)
            rollback(SBUF("pause w"), RC_STATE_ERR);
    } else {
        uint8_t zero[1] = { 0 };
        int64_t cleared = state_set(zero, 0, key, 32);
        if (cleared < 0 && cleared != DOESNT_EXIST)
            rollback(SBUF("pause clear w"), RC_STATE_ERR);
    }
    accept(SBUF("pause toggled"), RC_OK);
    return RC_OK;
}
#pragma clang attribute pop

__attribute__((flatten)) int64_t hook(uint32_t ctx){_g(1,1);uint8_t sender[20];int operation=entry_operation(ctx,sender);const uint8_t*m=0;int ml=0;switch(operation){case 16:return do_set_uri_base(sender);case 10:return do_set_pricing(m,ml,sender);case 11:return do_tld(1,m,ml,sender);case 12:return do_tld(0,m,ml,sender);case 13:return do_pause(1,sender);case 14:return do_pause(0,sender);default:accept(SBUF("next"),0);}}
