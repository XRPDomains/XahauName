#include "common.h"

int64_t do_mint_shared(const uint8_t *label, int llen,
                       const uint8_t *tld,   int tlen,
                       const uint8_t *destination20,
                       uint64_t amount_drops,
                       uint32_t payment_flags)
{
    reject_custom_uri();
    
    uint8_t pk[32]; make_paused_key(pk);
    uint8_t pf[1];
    if (state(pf, 1, pk, 32) == 1 && pf[0] == 0x01)
        rollback(SBUF("paused"), RC_PAUSED);

    int rc = validate_name(label, llen, tld, tlen);
    if (rc != 0) rollback(SBUF("name invalid"), rc);

    uint8_t root_key[32];
    if (!make_root_key(root_key, label, llen, tld, tlen))
        rollback(SBUF("key err"), RC_STATE_ERR);
    uint8_t probe[ROOT_LEN];
    uint8_t recovery[32]; recovery_key(recovery,root_key);
    if(state(probe,ROOT_LEN,recovery,32)!=DOESNT_EXIST)rollback(SBUF("domain needs reconciliation"),RC_STATE_ERR);
    if (state(probe, ROOT_LEN, root_key, 32) == ROOT_LEN)
        rollback(SBUF("already reg"), RC_ALREADY_REG);

    uint8_t token_key[32], existing_id[32];
    if(!make_token_key(token_key,label,llen,tld,tlen)) rollback(SBUF("token key"),RC_STATE_ERR);
    int mapped=state(existing_id,32,token_key,32);
    if(mapped==32) {
        if(pending_exists(existing_id)) rollback(SBUF("already pending"),RC_ALREADY_PENDING);
        rollback(SBUF("domain reserved"),RC_ALREADY_REG);
    }
    if(mapped!=DOESNT_EXIST) rollback(SBUF("token map read"),RC_STATE_ERR);
    uint8_t name[70],uri[TOKEN_URI_MAX],base_key[32];
    int name_len=build_uri(name,70,label,llen,tld,tlen);
    if(name_len<1||!make_uri_base_key(base_key)) rollback(SBUF("uri err"),RC_STATE_ERR);
    int base_len=state(uri,URI_BASE_MAX,base_key,32);
    if(base_len<10||base_len>URI_BASE_MAX) rollback(SBUF("uri base not set"),RC_URI_BASE_NOT_SET);
    XN_COPY(uri+base_len,name,name_len);
    int uri_len=base_len+name_len;

    uint8_t issuer[20]; hook_account(issuer, 20);
    uint8_t utid[URITOKENID_LEN];
    if (!compute_uritoken_id(utid, issuer, uri, uri_len))
        rollback(SBUF("utid err"), RC_STATE_ERR);

    if (pending_exists(utid))
        rollback(SBUF("already pending"), RC_ALREADY_PENDING);

    uint8_t label_key[32];
    if(!make_label_of_key(label_key,utid)||state_set(name,name_len,label_key,32)!=name_len ||
       state_set(utid,32,token_key,32)!=32) rollback(SBUF("identity map w"),RC_STATE_ERR);
    
    int ec = emit_correlated(ttURITOKEN_MINT,uri,uri_len,utid,0,0,"mnt");
    if (ec != RC_OK) rollback(SBUF("emit fail"), RC_EMIT_FAIL);

    if (!write_pending(utid, destination20, amount_drops, 0))
        rollback(SBUF("pending w"), RC_STATE_ERR);

    accept(SBUF("minting"), RC_OK);
    return RC_OK;
}
#pragma clang attribute pop
__attribute__((flatten)) int64_t cbak(uint32_t reason)
{
    _g(2, 1);
    if (reason > 1) accept(SBUF("unknown reason"), RC_CBAK_UNKNOWN);
    int64_t tx = otxn_slot(1);
    uint8_t type[2], account[20], issuer[20], id[32], uri[TOKEN_URI_MAX+1];
    if (tx < 0 || tx_slot_field(tx, sfTransactionType, type, 2) != 2 ||
        tx_slot_field(tx, sfAccount, account, 20) != 20 || hook_account(issuer, 20) != 20 ||
        !bytes_equal(account, issuer, 20))
        accept(SBUF("unknown callback"), RC_CBAK_UNKNOWN);
    int tt = ((int)type[0] << 8) | type[1], uri_len = 0;
    const char *tag;
    if (tt == ttURITOKEN_MINT) {
        int vl = tx_slot_field(tx, sfURI, uri, sizeof(uri));
        
        if (vl < 2 || uri[0] < 1 || uri[0] > TOKEN_URI_MAX || vl != uri[0] + 1)
            accept(SBUF("bad callback uri"), RC_CBAK_UNKNOWN);
        uri_len = uri[0];
        if (!compute_uritoken_id(id, issuer, uri + 1, uri_len))
            accept(SBUF("bad callback id"), RC_CBAK_UNKNOWN);
        tag = "mnt";
    } else if (tt == ttURITOKEN_CREATE_SELL_OFFER) {
        if (tx_slot_field(tx, sfURITokenID, id, 32) != 32)
            accept(SBUF("no callback id"), RC_CBAK_UNKNOWN);
        tag = "ofr";
    } else if (tt == ttPAYMENT) {
        if (tx_slot_field(tx, sfInvoiceID, id, 32) != 32)
            accept(SBUF("untracked payment"), RC_OK);
        tag = "rfd";
    } else accept(SBUF("untracked callback"), RC_OK);

    uint8_t key[32], expected[32], actual[32], pending[PENDING_LEN];
    async_key(key, tag, id);
    if (state(expected, 32, key, 32) != 32 || otxn_id(actual, 32, 0) != 32 ||
        !bytes_equal(expected, actual, 32))
        accept(SBUF("uncorrelated callback"), RC_CBAK_UNKNOWN);
    make_pending_key(key, id);
    if (state(pending, PENDING_LEN, key, 32) != PENDING_LEN)
        accept(SBUF("already settled"), RC_OK);
    int success = reason == 1 ? 0 : execution_success();
    if (success < 0) accept(SBUF("outcome unavailable"), RC_CBAK_UNKNOWN);
    if (tt == ttPAYMENT) {
        if (!success) accept(SBUF("refund requires recovery"), RC_EMIT_FAIL);
        if (!clear_pending(id) || !erase_async("mnt", id) || !erase_async("ofr", id) ||
            !erase_async("rfd", id)) rollback(SBUF("refund settle w"), RC_STATE_ERR);

        if(!(pending[28]&0x80)) {
            uint8_t name[70],tk[32],mapped[32],zero[1]={0};
            make_label_of_key(key,id); int n=state(name,70,key,32),dot=-1;
            if(n<1||n>70) rollback(SBUF("refund identity"),RC_STATE_ERR);
            for(int i=n-1;GUARD(70),i>=0;i--) if(name[i]=='.'){dot=i;break;}
            if(n<1||n>70||dot<1||dot>=n-1||!make_token_key(tk,name,dot,name+dot+1,n-dot-1)||
               state(mapped,32,tk,32)!=32||!id_equal(mapped,id)) rollback(SBUF("refund identity"),RC_STATE_ERR);
            if(state_set(zero,0,tk,32)<0||state_set(zero,0,key,32)<0) rollback(SBUF("refund map w"),RC_STATE_ERR);
        }
        accept(SBUF("refunded"), RC_OK);
    }
    async_key(key, "rfd", id);
    int rfd = state(actual, 32, key, 32);
    if (rfd == 32) accept(SBUF("refund pending"), RC_OK);
    if (rfd != DOESNT_EXIST) rollback(SBUF("refund read"), RC_STATE_ERR);
    if (!success) {
        uint64_t amount = 0;
#pragma clang loop unroll(full)
        for (int i = 0; i < 8; i++) amount = (amount << 8) | pending[20 + i];
        if (amount == 0) accept(SBUF("zero refund requires recovery"), RC_EMIT_FAIL);
        if (emit_correlated(ttPAYMENT, 0, 0, id, pending, amount, "rfd") != RC_OK)
            rollback(SBUF("refund emit failed"), RC_EMIT_FAIL);
        accept(SBUF("refund queued"), RC_OK);
    }
    if (tt == ttURITOKEN_MINT) {
        async_key(key, "ofr", id);
        int already = state(actual, 32, key, 32);
        if (already == 32) accept(SBUF("offer already queued"), RC_OK);
        if (already != DOESNT_EXIST) rollback(SBUF("offer read"), RC_STATE_ERR);
        
        make_pending_key(key,id); pending[28]|=0x80;
        if(state_set(pending,PENDING_LEN,key,32)!=PENDING_LEN) rollback(SBUF("mint flag w"),RC_STATE_ERR);
        if (emit_correlated(ttURITOKEN_CREATE_SELL_OFFER, 0, 0, id, pending, 0, "ofr") != RC_OK)
            rollback(SBUF("offer emit failed"), RC_EMIT_FAIL);
        accept(SBUF("offer queued"), RC_OK);
    }
    accept(SBUF("awaiting claim"), RC_OK);
}

__attribute__((flatten)) int64_t hook(uint32_t ctx){_g(1,1);int64_t tt=otxn_type();if(tt!=ttPAYMENT)accept(SBUF("ignored"),0);if(ctx!=0)accept(SBUF("weak ignored"),0);uint8_t marker[1];if(otxn_param(marker,1,(uint32_t)"xn_v",4)!=1||marker[0]!=2)accept(SBUF("not v2"),0);uint8_t sender[20];if(otxn_field(sender,20,sfAccount)!=20)rollback(SBUF("sender"),RC_BAD_MEMO);uint8_t op[1];if(otxn_param(op,1,(uint32_t)"op",2)!=1||(op[0]>17||op[0]==15||op[0]==8))rollback(SBUF("unknown op"),RC_UNKNOWN_OP);int operation=op[0];const uint8_t*m=0;int ml=0;if(operation!=1&&operation!=2)accept(SBUF("next"),0);if(operation==1&&!is_owner_of_hook(sender))rollback(SBUF("owner only"),RC_NOT_ADMIN);int valid=0;uint64_t drops=read_payment_amount_drops(&valid);if(!valid)rollback(SBUF("native only"),RC_IOU_REJECTED);uint8_t f[4];int fl=otxn_field(f,4,sfFlags);uint32_t flags=fl==4?((uint32_t)f[0]<<24)|((uint32_t)f[1]<<16)|((uint32_t)f[2]<<8)|f[3]:0;if(flags&tfPartialPayment)rollback(SBUF("partial payment"),RC_PARTIAL_PAYMENT);uint8_t label[64],tld[16],destination[20];int llen=parse_lower_field(m,ml,"label",5,label,64),tlen=parse_lower_field(m,ml,"tld",3,tld,16);if(llen<=0||tlen<=0)rollback(SBUF("bad memo"),RC_BAD_MEMO);if(operation==2){uint8_t pk[32],pval[PRICING_LEN];make_pricing_key(pk);if(state(pval,PRICING_LEN,pk,32)!=PRICING_LEN||pval[0]!=PRICING_VERSION)rollback(SBUF("pricing not set"),RC_PRICING_NOT_SET);int tier=llen<10?llen:10;uint64_t required=0;
#pragma clang loop unroll(full)
for(int i=0;i<8;i++)required=(required<<8)|pval[1+(tier-1)*8+i];if(drops<required)rollback(SBUF("underpayment"),RC_UNDERPAYMENT);}int hr=parse_hex20_field(m,ml,"recipient",9,destination);if(hr<0)rollback(SBUF("bad recipient"),RC_BAD_MEMO);if(hr==0){
#pragma clang loop unroll(full)
for(int i=0;i<20;i++)destination[i]=sender[i];}return do_mint_shared(label,llen,tld,tlen,destination,drops,flags);}
