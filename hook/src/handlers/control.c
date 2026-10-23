#include "common.h"

static int primary_keys_equal(const uint8_t *a, const uint8_t *b)
{
    const xn_word *x = (const xn_word *)a, *y = (const xn_word *)b;
    return !((x[0].value ^ y[0].value) | (x[1].value ^ y[1].value) |
             (x[2].value ^ y[2].value) | (x[3].value ^ y[3].value) |
             (x[4].value ^ y[4].value) | (x[5].value ^ y[5].value) |
             (x[6].value ^ y[6].value) | (x[7].value ^ y[7].value));
}

int64_t do_set_primary(const uint8_t *memo, int ml, const uint8_t *sender20)
{
    uint8_t label[64], tld[16];
    int llen = parse_lower_field(memo, ml, "label", 5, label, 64);
    int tlen = parse_lower_field(memo, ml, "tld",   3, tld,   16);
    if (llen <= 0 || tlen <= 0) rollback(SBUF("bad memo"), RC_BAD_MEMO);
    int flag = parse_bool_field(memo, ml, "flag", 4);
    if (flag < 0) rollback(SBUF("bad flag"), RC_BAD_MEMO);

    uint8_t root_key[32], root_val[ROOT_LEN];
    require_owner(label, llen, tld, tlen, sender20, root_key, root_val);

    uint8_t po_key[32]; make_primary_of_key(po_key, sender20);
    uint8_t zero[1] = { 0 };

    if (flag) {
        uint8_t prev[32];
        if (state(prev, 32, po_key, 32) == 32) {
            int same = primary_keys_equal(prev, root_key);
            if (!same) {
                uint8_t prev_root[ROOT_LEN];
                if (state(prev_root, ROOT_LEN, prev, 32) == ROOT_LEN) {
                    prev_root[ROOT_OFF_FLAGS] &= (uint8_t)~ROOT_FLAG_PRIMARY;
                    if (state_set(prev_root, ROOT_LEN, prev, 32) != ROOT_LEN)
                        rollback(SBUF("prev w"), RC_STATE_ERR);
                }
            }
        }
        root_val[ROOT_OFF_FLAGS] |= ROOT_FLAG_PRIMARY;
        if (state_set(root_val, ROOT_LEN, root_key, 32) != ROOT_LEN)
            rollback(SBUF("root w"), RC_STATE_ERR);
        if (state_set(root_key, 32, po_key, 32) != 32)
            rollback(SBUF("po w"), RC_STATE_ERR);
    } else {
        root_val[ROOT_OFF_FLAGS] &= (uint8_t)~(ROOT_FLAG_PRIMARY|ROOT_FLAG_LOCKED);
        if (state_set(root_val, ROOT_LEN, root_key, 32) != ROOT_LEN)
            rollback(SBUF("root w"), RC_STATE_ERR);
        uint8_t prev[32];
        if (state(prev, 32, po_key, 32) == 32) {
            int same = primary_keys_equal(prev, root_key);
            if (same && state_set(zero, 0, po_key, 32) < 0)
                rollback(SBUF("po del"), RC_STATE_ERR);
        }
    }
    accept(SBUF("primary"), RC_OK);
    return RC_OK;
}

int64_t do_reset(const uint8_t *memo, int ml, const uint8_t *sender20)
{
    uint8_t label[64], tld[16];
    int llen = parse_lower_field(memo, ml, "label", 5, label, 64);
    int tlen = parse_lower_field(memo, ml, "tld",   3, tld,   16);
    if (llen <= 0 || tlen <= 0) rollback(SBUF("bad memo"), RC_BAD_MEMO);

    uint8_t root_key[32];
    if (!make_root_key(root_key, label, llen, tld, tlen))
        rollback(SBUF("key err"), RC_STATE_ERR);
    uint8_t root_val[ROOT_LEN];
    if (state(root_val, ROOT_LEN, root_key, 32) != ROOT_LEN)
        rollback(SBUF("not reg"), RC_DOMAIN_NOT_REG);

    int is_owner = 1;
    for (int i = 0; GUARD(21), i < 20; i++)
        if (root_val[ROOT_OFF_OWNER + i] != sender20[i]) { is_owner = 0; break; }
    int is_admin_now = has_role((uint8_t *)"admin", 5, sender20);
    if (!is_owner && !is_admin_now)
        rollback(SBUF("not authorized"), RC_NOT_ADMIN);

    uint8_t owner20[20];
    for (int i = 0; GUARD(21), i < 20; i++) owner20[i] = root_val[ROOT_OFF_OWNER + i];

    uint8_t po_key[32]; make_primary_of_key(po_key, owner20);
    uint8_t prev[32]; uint8_t zero[1] = { 0 };
    if (state(prev, 32, po_key, 32) == 32) {
        int same = 1;
        for (int i = 0; GUARD(33), i < 32; i++)
            if (prev[i] != root_key[i]) { same = 0; break; }
        if (same && state_set(zero, 0, po_key, 32) < 0) rollback(SBUF("primary clear"), RC_STATE_ERR);
    }
    root_val[ROOT_OFF_FLAGS] &= (uint8_t)~(ROOT_FLAG_PRIMARY|ROOT_FLAG_LOCKED);
    if (state_set(root_val, ROOT_LEN, root_key, 32) != ROOT_LEN) rollback(SBUF("root w"), RC_STATE_ERR);

    uint8_t idx[RECIDX_LEN];
    if (load_records_index(idx, label, llen, tld, tlen)) {
        if (!clear_indexed_records(idx, label, llen, tld, tlen, root_key))
            rollback(SBUF("records clear"), RC_STATE_ERR);
        
        uint8_t rk[32];
        if (!make_records_key(rk, label, llen, tld, tlen) || state_set(zero, 0, rk, 32) < 0) rollback(SBUF("index clear"), RC_STATE_ERR);
    }
    accept(SBUF("reset"), RC_OK);
    return RC_OK;
}
#pragma clang attribute pop

__attribute__((flatten)) int64_t hook(uint32_t ctx){_g(1,1);int64_t tt=otxn_type();if(tt!=ttPAYMENT&&tt!=ttINVOKE)accept(SBUF("ignored"),0);if(ctx!=0)accept(SBUF("weak ignored"),0);uint8_t marker[1];if(otxn_param(marker,1,(uint32_t)"xn_v",4)!=1||marker[0]!=2)accept(SBUF("not v2"),0);uint8_t sender[20];if(otxn_field(sender,20,sfAccount)!=20)rollback(SBUF("sender"),RC_BAD_MEMO);uint8_t op[1];if(otxn_param(op,1,(uint32_t)"op",2)!=1||(op[0]>16||op[0]==15||op[0]==8))rollback(SBUF("unknown op"),RC_UNKNOWN_OP);int operation=op[0];const uint8_t*m=0;int ml=0;if(operation==3)return do_set_primary(m,ml,sender);if(operation==9)return do_reset(m,ml,sender);accept(SBUF("next"),0);}
