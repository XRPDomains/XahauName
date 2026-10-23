#include "common.h"
#pragma clang attribute pop
__attribute__((flatten)) int64_t hook(uint32_t ctx){
 _g(1,1);
 if(otxn_type()==ttINVOKE)accept(SBUF("next"),0);
 // Issuer-originated burn executes strongly, before native token deletion.
 // Weak owner-burn notifications only clean up after confirmed deletion.
 if(otxn_type()==ttURITOKEN_BURN&&ctx==0){
  uint8_t id[32],keylet[34]={0,85},owner[20],sender[20];
  if(otxn_field(id,32,sfURITokenID)!=32||otxn_field(sender,20,sfAccount)!=20)
   rollback(SBUF("burn fields missing"),RC_BAD_MEMO);
  COPY_TX_FIXED(keylet+2,id,32);
  if(slot_set(keylet,34,20)!=20||tx_slot_field(20,sfOwner,owner,20)!=20)
   rollback(SBUF("native owner unavailable"),RC_STATE_ERR);
  if(!bytes_equal(sender,owner,20))rollback(SBUF("only token owner may burn"),RC_NOT_OWNER);
 }
 return lifecycle_dispatch(ctx);
}
