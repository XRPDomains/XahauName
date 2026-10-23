#include "common.h"

static int64_t reject_domain_remit(void){
    uint8_t ids[1026],key[32],name[70];
    int n=otxn_field(ids,sizeof(ids),sfURITokenIDs);
    if(n==DOESNT_EXIST)accept(SBUF("ignored"),0);
    if(n<1)rollback(SBUF("invalid token vector"),RC_BAD_MEMO);
    int off=0;
    if(n%32){
        int declared=ids[0];off=1;
        if(ids[0]>=193&&ids[0]<=240){declared=193+(ids[0]-193)*256+ids[1];off=2;}
        if(ids[0]>240||declared!=n-off)rollback(SBUF("invalid token vector"),RC_BAD_MEMO);
    }
    int size=n-off;
    if(size<32||size>1024||size%32)rollback(SBUF("invalid token vector"),RC_BAD_MEMO);
    for(int i=0;GUARD(33),i<32;i++){
        if(i*32>=size)break;
        make_label_of_key(key,ids+off+i*32);
        int len=state(name,70,key,32);
        if(len>0)rollback(SBUF("use URITokenBuy"),65);
        if(len!=DOESNT_EXIST)rollback(SBUF("token identity read"),RC_STATE_ERR);
    }
    accept(SBUF("unrelated remit"),0);
}
int64_t trigger_uritoken_buy(void)
{
    
    uint8_t utid[URITOKENID_LEN];
    if (otxn_field(utid, URITOKENID_LEN, sfURITokenID) != URITOKENID_LEN)
        accept(SBUF("no utid"), RC_OK);

    uint8_t new_owner[20];
    if (otxn_field(new_owner, 20, sfAccount) != 20)
        rollback(SBUF("no buyer"), RC_STATE_ERR);

    if (execution_success() != 1)
        accept(SBUF("buy not applied"), RC_OK);

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

    uint8_t root_key[32];
    if (!make_root_key(root_key, label, llen, tld, tlen))
        accept(SBUF("key err"), RC_OK);
    uint8_t tk[32],bound_id[32];
    if(!make_token_key(tk,label,llen,tld,tlen)) rollback(SBUF("token key"),RC_STATE_ERR);
    int bound=state(bound_id,32,tk,32);
    if(bound==32&&!id_equal(bound_id,utid)) rollback(SBUF("token map mismatch"),RC_STATE_ERR);
    if(bound==DOESNT_EXIST) { if(state_set(utid,32,tk,32)!=32) rollback(SBUF("token map w"),RC_STATE_ERR); }
    else if(bound!=32) rollback(SBUF("token map read"),RC_STATE_ERR);
    uint8_t root_val[ROOT_LEN];
    if (state(root_val, ROOT_LEN, root_key, 32) != ROOT_LEN) {
        if (!pending_exists(utid)) accept(SBUF("no root"), RC_OK);
        if (!finalize_claim(utid, new_owner))
            rollback(SBUF("claim not finalized"), RC_STATE_ERR);
        accept(SBUF("claimed"), RC_OK);
    }

    int same_owner = 1;
#pragma clang loop unroll(full)
    for (int k = 0; k < 20; k++) if (root_val[ROOT_OFF_OWNER+k] != new_owner[k]) same_owner = 0;
    if (same_owner) accept(SBUF("transferred"), RC_OK);
    uint8_t idx[RECIDX_LEN];
    if (load_records_index(idx, label, llen, tld, tlen)) {
        if (!clear_indexed_records(idx, label, llen, tld, tlen, root_key)) rollback(SBUF("records clear"), RC_STATE_ERR);
        uint8_t rk[32], empty[1] = {0};
        if (!make_records_key(rk, label, llen, tld, tlen) || state_set(empty, 0, rk, 32) < 0)
            rollback(SBUF("index clear"), RC_STATE_ERR);
    }
    
    uint8_t old_po[32];
    if (!make_primary_of_key(old_po, root_val + ROOT_OFF_OWNER))
        rollback(SBUF("primary key"), RC_STATE_ERR);
    uint8_t prev[32]; uint8_t zero[1] = { 0 };
    if (state(prev, 32, old_po, 32) == 32) {
        int same = 1;
        for (int i = 0; GUARD(33), i < 32; i++)
            if (prev[i] != root_key[i]) { same = 0; break; }
        if (same && state_set(zero, 0, old_po, 32) < 0)
            rollback(SBUF("primary clear"), RC_STATE_ERR);
    }

    for (int i = 0; GUARD(21), i < 20; i++)
        root_val[ROOT_OFF_OWNER + i] = new_owner[i];
    root_val[ROOT_OFF_FLAGS] = 0; 
    
    if (state_set(root_val, ROOT_LEN, root_key, 32) != ROOT_LEN)
        rollback(SBUF("root w"), RC_STATE_ERR);

    accept(SBUF("transferred"), RC_OK);
    return RC_OK;
}
#pragma clang attribute pop

__attribute__((flatten)) int64_t hook(uint32_t ctx){_g(1,1);int64_t tt=otxn_type();if(tt==95)return reject_domain_remit();if(tt!=ttURITOKEN_BUY)accept(SBUF("ignored"),0);if(ctx==0){if(hook_again()!=1)rollback(SBUF("again failed"),RC_STATE_ERR);accept(SBUF("await result"),0);}if(execution_success()!=1)accept(SBUF("not successful"),0);return trigger_uritoken_buy();}
