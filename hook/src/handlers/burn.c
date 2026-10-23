#include "common.h"

int64_t trigger_uritoken_burn(void)
{
    
    uint8_t utid[URITOKENID_LEN];
    if (otxn_field(utid, URITOKENID_LEN, sfURITokenID) != URITOKENID_LEN)
        accept(SBUF("no utid"), RC_OK);

    uint8_t lkey[32];
    if (!make_label_of_key(lkey, utid)) rollback(SBUF("label key"), RC_STATE_ERR);
    uint8_t ltbuf[70];
    int ltlen = state(ltbuf, 70, lkey, 32);
    if (ltlen <= 0) accept(SBUF("not ours"), RC_OK);

    int dot = -1;
    for (int i = ltlen - 1; GUARD(70), i >= 0; i--)
        if (ltbuf[i] == '.') { dot = i; break; }
    if (dot <= 0 || dot >= ltlen - 1)
        accept(SBUF("bad label_of"), RC_OK);
    const uint8_t *label = ltbuf;
    int llen = dot;
    const uint8_t *tld = ltbuf + dot + 1;
    int tlen = ltlen - dot - 1;

    uint8_t tk[32],bound_id[32];
    if(!make_token_key(tk,label,llen,tld,tlen)) rollback(SBUF("token key"),RC_STATE_ERR);
    int bound=state(bound_id,32,tk,32);
    if(bound==32) {
        if(!id_equal(bound_id,utid)||state_set(0,0,tk,32)<0) rollback(SBUF("token map clear"),RC_STATE_ERR);
    } else if(bound!=DOESNT_EXIST) rollback(SBUF("token map read"),RC_STATE_ERR);
    
    uint8_t root_key[32];
    if (!make_root_key(root_key, label, llen, tld, tlen))
        accept(SBUF("key err"), RC_OK);
    uint8_t root_val[ROOT_LEN]; uint8_t zero[1] = { 0 };
    if (state(root_val, ROOT_LEN, root_key, 32) == ROOT_LEN) {
        uint8_t po_key[32];
        if (!make_primary_of_key(po_key, root_val + ROOT_OFF_OWNER))
            rollback(SBUF("primary key"), RC_STATE_ERR);
        uint8_t prev[32];
        if (state(prev, 32, po_key, 32) == 32) {
            int same = 1;
            for (int i = 0; GUARD(33), i < 32; i++)
                if (prev[i] != root_key[i]) { same = 0; break; }
            if (same && state_set(zero, 0, po_key, 32) < 0)
                rollback(SBUF("primary clear"), RC_STATE_ERR);
        }
    }

    uint8_t idx[RECIDX_LEN];
    if (load_records_index(idx, label, llen, tld, tlen)) {
        if (!clear_indexed_records(idx, label, llen, tld, tlen, root_key))
            rollback(SBUF("records clear"), RC_STATE_ERR);
        uint8_t rk[32];
        if (!make_records_key(rk, label, llen, tld, tlen) ||
            state_set(zero, 0, rk, 32) < 0)
            rollback(SBUF("index clear"), RC_STATE_ERR);
    }

    if (state_set(zero, 0, root_key, 32) < 0)
        rollback(SBUF("root clear"), RC_STATE_ERR);
    uint8_t ukey[32];
    if (!make_uri_key(ukey, utid) || state_set(zero, 0, ukey, 32) < 0 ||
        state_set(zero, 0, lkey, 32) < 0)
        rollback(SBUF("reverse clear"), RC_STATE_ERR);

    accept(SBUF("burned"), RC_OK);
    return RC_OK;
}
#pragma clang attribute pop

__attribute__((flatten)) int64_t hook(uint32_t ctx){_g(1,1);int64_t tt=otxn_type();if(tt!=ttURITOKEN_BURN)accept(SBUF("ignored"),0);if(ctx==0){if(hook_again()!=1)rollback(SBUF("again failed"),RC_STATE_ERR);accept(SBUF("await result"),0);}if(execution_success()!=1)accept(SBUF("not successful"),0);return trigger_uritoken_burn();}
