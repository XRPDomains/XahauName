/* SPDX-License-Identifier: MIT
 * Shared native-v2 state, serialization and authorization helpers.
 */
#include "hookapi.h"

extern int64_t accept(uint32_t, uint32_t, int64_t) __attribute__((noreturn));
extern int64_t rollback(uint32_t, uint32_t, int64_t) __attribute__((noreturn));

#pragma clang attribute push (__attribute__((always_inline)), apply_to=function)

typedef struct __attribute__((packed, may_alias)) {uint32_t value;} xn_word;

#define XN_COPY(dst,src,len) do { int xn_n=(len),xn_k=0; \
 for(;_g(0xB0000000U+__LINE__,37),xn_k+4<=xn_n;xn_k+=4) \
 ((xn_word*)((dst)+xn_k))->value=((const xn_word*)((src)+xn_k))->value; \
 if(xn_k<xn_n)(dst)[xn_k]=(src)[xn_k]; \
 if(xn_k+1<xn_n)(dst)[xn_k+1]=(src)[xn_k+1]; \
 if(xn_k+2<xn_n)(dst)[xn_k+2]=(src)[xn_k+2]; }while(0)

#ifndef ttPAYMENT
#define ttPAYMENT                 0
#endif
#ifndef ttINVOKE
#define ttINVOKE                 99
#endif

#ifndef ttURITOKEN_MINT
#define ttURITOKEN_MINT          45
#endif
#ifndef ttURITOKEN_BURN
#define ttURITOKEN_BURN          46
#endif
#ifndef ttURITOKEN_BUY
#define ttURITOKEN_BUY           47
#endif
#ifndef ttURITOKEN_CREATE_SELL_OFFER
#define ttURITOKEN_CREATE_SELL_OFFER  48
#endif
#ifndef ttURITOKEN_CANCEL_SELL_OFFER
#define ttURITOKEN_CANCEL_SELL_OFFER  49
#endif

#define tfPartialPayment       0x00020000

#define NAMESPACE_SEED  "XAHAU_NAME_V1"
#define MEMO_TYPE_STR   "xahau_name:op:v1"
#define MEMO_TYPE_LEN   16

#define ROOT_OFF_OWNER      0
#define ROOT_OFF_FLAGS     20
#define ROOT_OFF_MINT_TS   21
#define ROOT_LEN           32
#define ROOT_FLAG_PRIMARY  0x01
#define ROOT_FLAG_LOCKED   0x02

#define RECIDX_OFF_VER        0
#define RECIDX_OFF_ADDR_CNT   1   
#define RECIDX_OFF_TEXT_CNT   3   
#define RECIDX_OFF_ADDR_LIST  4   
#define RECIDX_OFF_TEXT_LIST  34  
#define RECIDX_LEN            124
#define RECIDX_VERSION        1
#define RECIDX_MAX_ADDR       15
#define RECIDX_MAX_TEXT       15

#define PENDING_OFF_DEST       0   
#define PENDING_OFF_AMOUNT    20   
#define PENDING_OFF_FLAGS     28   
#define PENDING_LEN           32

#define PRICING_LEN       81
#define PRICING_VERSION    1

#define URITOKEN_PREFIX_HI  0x00
#define URITOKEN_PREFIX_LO  0x55
#define URITOKENID_LEN      32

#define RC_OK                 0
#define RC_WRONG_TX_TYPE      1
#define RC_NO_MEMO            2
#define RC_BAD_MEMO           3
#define RC_UNKNOWN_OP         4
#define RC_LABEL_INVALID     10
#define RC_DOMAIN_NOT_REG    11
#define RC_NOT_OWNER         12
#define RC_FROZEN            13
#define RC_STATE_ERR         20
#define RC_ALREADY_REG       31
#define RC_TLD_DISABLED      33
#define RC_HAS_WHITESPACE    34
#define RC_TLD_INVALID       36
#define RC_NOT_ADMIN         40
#define RC_BAD_ADMIN_ARG     41
#define RC_UNDERPAYMENT      50
#define RC_PRICING_NOT_SET   51
#define RC_PAUSED            52
#define RC_IOU_REJECTED      53
#define RC_PARTIAL_PAYMENT   54
#define RC_ALREADY_PENDING   55
#define RC_PRICE_OVERFLOW    57
#define RC_PRICE_WRONG_COUNT 58
#define RC_HEX_MALFORMED     59
#define RC_EMIT_FAIL         60
#define RC_CBAK_UNKNOWN      61
#define RC_INDEX_FULL        62

#define SWEEP_TEXT_KEYS_COUNT   18
static const char * const SWEEP_TEXT_KEYS[SWEEP_TEXT_KEYS_COUNT] = {
    "avatar", "description", "url", "email", "notice", "keywords", "com.twitter", "com.github", "com.discord", "com.reddit", "com.linkedin", "org.telegram", "name", "location", "contenthash", "display", "mail", "phone"
};
static const uint8_t SWEEP_TEXT_KEY_LENS[SWEEP_TEXT_KEYS_COUNT] = {
    6, 11, 3, 5, 6, 8, 11, 10, 11, 10, 12, 12, 4, 8, 11, 7, 4, 5
};

int str_has_whitespace(const uint8_t *s, int n)
{
    for (int i = 0; GUARD(130), i < n; i++) {
        uint8_t c = s[i];
        if (c == 0x20 || c == 0x09 || c == 0x0A || c == 0x0D) return 1;
    }
    return 0;
}

static int hex_nibble(uint8_t c)
{
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

int make_root_key(uint8_t *out32,
                  const uint8_t *label, int llen,
                  const uint8_t *tld,   int tlen)
{
    uint8_t buf[128];
    int i = 0;
    if (llen + 1 + tlen + 5 > (int)sizeof(buf)) return 0;
    XN_COPY(buf+i,label,llen);i+=llen;
    buf[i++] = '.';
    XN_COPY(buf+i,tld,tlen);i+=tlen;
    buf[i++] = ':'; buf[i++] = 'r'; buf[i++] = 'o'; buf[i++] = 'o'; buf[i++] = 't';
    return util_sha512h(out32, 32, buf, i) == 32 ? 1 : 0;
}

static int enc_decimal(uint8_t *out, uint32_t v)
{
    uint8_t tmp[10];
    int n = 0;
    if (v == 0) { out[0] = '0'; return 1; }
    while (GUARD(11), v > 0 && n < 10) { tmp[n++] = '0' + (v % 10); v /= 10; }
    for (int i = 0; GUARD(11), i < n; i++) out[i] = tmp[n - 1 - i];
    return n;
}

int make_addr_key(uint8_t *out32,
                  const uint8_t *label, int llen,
                  const uint8_t *tld,   int tlen,
                  uint32_t coin_type)
{
    uint8_t buf[128];
    int i = 0;
    if (llen + 1 + tlen + 6 + 10 > (int)sizeof(buf)) return 0;
    XN_COPY(buf+i,label,llen);i+=llen;
    buf[i++] = '.';
    XN_COPY(buf+i,tld,tlen);i+=tlen;
    buf[i++] = ':'; buf[i++] = 'a'; buf[i++] = 'd'; buf[i++] = 'd'; buf[i++] = 'r'; buf[i++] = ':';
    i += enc_decimal(buf + i, coin_type);
    return util_sha512h(out32, 32, buf, i) == 32 ? 1 : 0;
}

int make_text_key(uint8_t *out32,
                  const uint8_t *label, int llen,
                  const uint8_t *tld,   int tlen,
                  const uint8_t *tkey,  int klen)
{
    uint8_t buf[128];
    int i = 0;
    if (llen + 1 + tlen + 6 + klen > (int)sizeof(buf)) return 0;
    XN_COPY(buf+i,label,llen);i+=llen;
    buf[i++] = '.';
    XN_COPY(buf+i,tld,tlen);i+=tlen;
    buf[i++] = ':'; buf[i++] = 't'; buf[i++] = 'e'; buf[i++] = 'x'; buf[i++] = 't'; buf[i++] = ':';
    XN_COPY(buf+i,tkey,klen);i+=klen;
    return util_sha512h(out32, 32, buf, i) == 32 ? 1 : 0;
}

int make_text_key_lit(uint8_t *out32,
                      const uint8_t *label, int llen,
                      const uint8_t *tld,   int tlen,
                      const char *tkey, int klen)
{
    uint8_t buf[128];
    int i = 0;
    if (llen + 1 + tlen + 6 + klen > (int)sizeof(buf)) return 0;
    XN_COPY(buf+i,label,llen);i+=llen;
    buf[i++] = '.';
    XN_COPY(buf+i,tld,tlen);i+=tlen;
    buf[i++] = ':'; buf[i++] = 't'; buf[i++] = 'e'; buf[i++] = 'x'; buf[i++] = 't'; buf[i++] = ':';
    for (int k = 0; GUARD(42), k < klen; k++) buf[i++] = (uint8_t)tkey[k];
    return util_sha512h(out32, 32, buf, i) == 32 ? 1 : 0;
}

int make_records_key(uint8_t *out32,
                     const uint8_t *label, int llen,
                     const uint8_t *tld,   int tlen)
{
    uint8_t buf[96];
    int i = 0;
    XN_COPY(buf+i,label,llen);i+=llen;
    buf[i++] = '.';
    XN_COPY(buf+i,tld,tlen);i+=tlen;
    buf[i++] = ':'; buf[i++] = 'r'; buf[i++] = 'e'; buf[i++] = 'c';
    buf[i++] = 'o'; buf[i++] = 'r'; buf[i++] = 'd'; buf[i++] = 's';
    return util_sha512h(out32, 32, buf, i) == 32 ? 1 : 0;
}

int make_label_of_key(uint8_t *out32, const uint8_t *uritokenid_32)
{
    out32[0] = 'l'; out32[1] = 'o'; out32[2] = 'f'; out32[3] = ':';
#pragma clang loop unroll(full)
    for (int k = 0; k < 28; k++) out32[4 + k] = uritokenid_32[k];
    return 1;
}

int make_tld_key(uint8_t *out32, const uint8_t *tld, int tlen)
{
    uint8_t buf[16];
    int i = 0;
    const char *pfx = "_tld:";
    for (int k = 0; GUARD(6), k < 5; k++) buf[i++] = (uint8_t)pfx[k];
    XN_COPY(buf+i,tld,tlen);i+=tlen;
    return util_sha512h(out32, 32, buf, i) == 32 ? 1 : 0;
}

int make_pricing_key(uint8_t *out32)
{
    const char *s = "_pricing_v1";
    return util_sha512h(out32, 32, (uint8_t *)s, 11) == 32 ? 1 : 0;
}

int make_paused_key(uint8_t *out32)
{
    const char *s = "_paused";
    return util_sha512h(out32, 32, (uint8_t *)s, 7) == 32 ? 1 : 0;
}

int make_primary_of_key(uint8_t *out32, const uint8_t *addr20)
{
    uint8_t buf[32];
    const char *pfx = "primary_of:";
    int i = 0;
    for (int k = 0; GUARD(12), k < 11; k++) buf[i++] = (uint8_t)pfx[k];
    for (int k = 0; GUARD(21), k < 20; k++) buf[i++] = addr20[k];
    return util_sha512h(out32, 32, buf, i) == 32 ? 1 : 0;
}

int make_uri_key(uint8_t *out32, const uint8_t *uritokenid_32)
{
    out32[0] = 'u'; out32[1] = 'r'; out32[2] = 'i'; out32[3] = ':';
    for (int k = 0; GUARD(28), k < 28; k++) out32[4 + k] = uritokenid_32[k];
    return 1;
}

int make_pending_key(uint8_t *out32, const uint8_t *uritokenid_32)
{
    out32[0] = 'p'; out32[1] = 'e'; out32[2] = 'n'; out32[3] = 'd';
    out32[4] = 'i'; out32[5] = 'n'; out32[6] = 'g'; out32[7] = ':';
#pragma clang loop unroll(full)
    for (int k = 0; k < 24; k++) out32[8 + k] = uritokenid_32[k];
    return 1;
}

int is_owner_of_hook(const uint8_t *sender20);

#define URI_BASE_MAX 120
#define TOKEN_URI_MAX 186 
#define RC_URI_BASE_NOT_SET 63
#define RC_CUSTOM_URI_FORBIDDEN 64
static int make_uri_base_key(uint8_t *out) {
    return util_sha512h(out, 32, (uint32_t)"_uri_base_v1", 12) == 32;
}
static int make_token_key(uint8_t *out, const uint8_t *label, int llen, const uint8_t *tld, int tlen) {
    uint8_t pre[96]; int p = 0;
    XN_COPY(pre+p,label,llen); p += llen; pre[p++] = '.';
    XN_COPY(pre+p,tld,tlen); p += tlen;
    pre[p++]=':'; pre[p++]='t'; pre[p++]='o'; pre[p++]='k'; pre[p++]='e'; pre[p++]='n';
    return util_sha512h(out,32,pre,p) == 32;
}
static int id_equal(const uint8_t *a, const uint8_t *b) {
    int same=1;
#pragma clang loop unroll(full)
    for(int i=0;i<32;i++) if(a[i]!=b[i]) same=0;
    return same;
}
static int valid_uri_base(const uint8_t *s,int n) {
    if(n<10||n>URI_BASE_MAX||s[n-1]!='/') return 0;
    const char *scheme="https://";
#pragma clang loop unroll(full)
    for(int i=0;i<8;i++) if(s[i]!=(uint8_t)scheme[i]) return 0;
    int slash=0;
    for(int i=8;GUARD(URI_BASE_MAX),i<n;i++) {
        uint8_t c=s[i];
        if(c=='/') { if(i==8||s[i-1]=='/') return 0; slash=1; continue; }
        int hostchar=(c>='a'&&c<='z')||(c>='0'&&c<='9')||c=='-'||c=='.';
        int pathchar=hostchar||(c>='A'&&c<='Z')||c=='_';
        if((!slash&&!hostchar)||(slash&&!pathchar)||(c=='.'&&s[i-1]=='.')) return 0;
    }
    return slash;
}
static int64_t do_set_uri_base(const uint8_t *sender) {
    if(!is_owner_of_hook(sender)) rollback(SBUF("owner only"),RC_NOT_ADMIN);
    if(otxn_type()!=ttINVOKE) rollback(SBUF("invoke required"),RC_WRONG_TX_TYPE);
    uint8_t base[URI_BASE_MAX],key[32];
    int n=otxn_param(base,URI_BASE_MAX,(uint32_t)"uri_base",8);
    if(!valid_uri_base(base,n)) rollback(SBUF("bad uri base"),RC_BAD_ADMIN_ARG);
    if(!make_uri_base_key(key)||state_set(base,n,key,32)!=n) rollback(SBUF("uri base w"),RC_STATE_ERR);
    accept(SBUF("uri base set"),RC_OK);
}
static void reject_custom_uri(void) {
    uint8_t probe[1];
    if(otxn_param(probe,1,(uint32_t)"uri",3)!=DOESNT_EXIST ||
       otxn_param(probe,1,(uint32_t)"URI",3)!=DOESNT_EXIST ||
       otxn_param(probe,1,(uint32_t)"customURI",9)!=DOESNT_EXIST ||
       otxn_param(probe,1,(uint32_t)"URIBase",7)!=DOESNT_EXIST ||
       otxn_param(probe,1,(uint32_t)"uriBase",7)!=DOESNT_EXIST)
        rollback(SBUF("custom uri forbidden"),RC_CUSTOM_URI_FORBIDDEN);
}

int compute_uritoken_id(uint8_t *out32,
                        const uint8_t *issuer_20,
                        const uint8_t *uri,
                        int uri_len)
{
    uint8_t buf[256];
    int i = 0;
    if (uri_len < 1 || uri_len > TOKEN_URI_MAX || 2 + 20 + uri_len > (int)sizeof(buf)) return 0;
    buf[i++] = URITOKEN_PREFIX_HI;
    buf[i++] = URITOKEN_PREFIX_LO;
    
    for (int k = 0; GUARD(42), k < 20; k++) buf[i++] = issuer_20[k];
    int k=0;
    for(;GUARD(47),k+4<=uri_len;k+=4) ((xn_word*)(buf+i+k))->value=((const xn_word*)(uri+k))->value;
    if(k<uri_len)buf[i+k]=uri[k];
    if(k+1<uri_len)buf[i+k+1]=uri[k+1];
    if(k+2<uri_len)buf[i+k+2]=uri[k+2];
    i+=uri_len;
    return util_sha512h(out32, 32, buf, i) == 32 ? 1 : 0;
}

int build_uri(uint8_t *out, int cap,
              const uint8_t *label, int llen,
              const uint8_t *tld,   int tlen)
{
    if (llen + 1 + tlen > cap) return 0;
    int i = 0;
    XN_COPY(out+i,label,llen);i+=llen;
    out[i++] = '.';
    XN_COPY(out+i,tld,tlen);i+=tlen;
    return i;
}

int is_allowed_label_char(uint8_t c)
{
    if (c >= 'a' && c <= 'z') return 1;
    if (c >= '0' && c <= '9') return 1;
    if (c == '-') return 1;
    /* Canonical names use the same ASCII subset as SDK domainFields. */
    return 0;
}

int is_reserved_label(const uint8_t *s, int n)
{
    const char *bad[] = { "xahau", "treasury", "admin", "root", "www" };
    const int bl[]    = {   5,       8,          5,       4,      3  };
    for (int r = 0; GUARD(6), r < 5; r++) {
        if (n != bl[r]) continue;
        int eq = 1;
        for (int i = 0; GUARD(9), i < n; i++)
            if (s[i] != (uint8_t)bad[r][i]) { eq = 0; break; }
        if (eq) return 1;
    }
    return 0;
}

int validate_label(const uint8_t *label, int llen)
{
    if (llen < 1 || llen > 57) return RC_LABEL_INVALID;
    if (str_has_whitespace(label, llen)) return RC_HAS_WHITESPACE;
    if (label[0] == '-' || label[llen - 1] == '-') return RC_LABEL_INVALID;
    for (int i = 0; GUARD(58), i < llen; i++) {
        uint8_t c = label[i];
        if (c >= 'A' && c <= 'Z') return RC_LABEL_INVALID;
        if (c == '.') return RC_LABEL_INVALID;
        if (!is_allowed_label_char(c)) return RC_LABEL_INVALID;
    }
    if (is_reserved_label(label, llen)) return RC_LABEL_INVALID;
    return 0;
}

int validate_tld_format(const uint8_t *tld, int tlen)
{
    if (tlen < 2 || tlen > 8) return RC_TLD_INVALID;
    if (str_has_whitespace(tld, tlen)) return RC_HAS_WHITESPACE;
    for (int i = 0; GUARD(9), i < tlen; i++) {
        uint8_t c = tld[i];
        if (!((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')))
            return RC_TLD_INVALID;
    }
    return 0;
}

int tld_in_list(const uint8_t *tld, int tlen)
{
    uint8_t key[32];
    if (!make_tld_key(key, tld, tlen)) return 0;
    uint8_t flag[1];
    int rl = state(flag, 1, key, 32);
    if (rl == 1) {
        if (flag[0] == 0x01) return 1;  
        return 0;                        
    }
    
    if (tlen == 3 && tld[0]=='x' && tld[1]=='a' && tld[2]=='h') return 1;
    if (tlen == 5 && tld[0]=='x' && tld[1]=='a' && tld[2]=='h'
        && tld[3]=='a' && tld[4]=='u') return 1;
    return 0;
}

int validate_name(const uint8_t *label, int llen,
                  const uint8_t *tld,   int tlen)
{
    int rc = validate_label(label, llen);
    if (rc != 0) return rc;
    rc = validate_tld_format(tld, tlen);
    if (rc != 0) return rc;
    if (!tld_in_list(tld, tlen)) return RC_TLD_DISABLED;
    return 0;
}

int parse_str_field(const uint8_t *memo,int ml,const char *name,int nl,uint8_t*out,int cap){int n=otxn_param(out,cap,name,nl);return n==DOESNT_EXIST?0:n<0?-1:n;}

int parse_lower_field(const uint8_t *memo, int ml,
                      const char *field_name, int fname_len,
                      uint8_t *out, int cap)
{
    int n = parse_str_field(memo, ml, field_name, fname_len, out, cap);
    if (n <= 0) return n;
    for (int i = 0; GUARD(130), i < n; i++)
        if (out[i] >= 'A' && out[i] <= 'Z') out[i] += 32;
    return n;
}

int parse_bool_field(const uint8_t *memo,int ml,const char *name,int nl){
    uint8_t value[1];int n=otxn_param(value,1,name,nl);
    if(n!=1||value[0]>1)return -1;return value[0];
}

int parse_hex20_field(const uint8_t *memo, int ml,
                      const char *field_name, int fname_len,
                      uint8_t *out20)
{
    uint8_t hex[48];
    int hl = parse_str_field(memo, ml, field_name, fname_len, hex, 48);
    if (hl == 0) return 0;
    if (hl != 40) return -1;
    for (int i = 0; GUARD(21), i < 20; i++) {
        int hi = hex_nibble(hex[i * 2]);
        int lo = hex_nibble(hex[i * 2 + 1]);
        if (hi < 0 || lo < 0) return -1;
        out20[i] = (hi << 4) | lo;
    }
    return 1;
}

int64_t parse_uint_field_strict(const uint8_t *memo,int ml,const char *name,int nl){uint8_t value[4];int n=otxn_param(value,4,name,nl);if(n==DOESNT_EXIST)return -1;if(n!=4)return -2;return ((uint32_t)value[0]<<24)|((uint32_t)value[1]<<16)|((uint32_t)value[2]<<8)|value[3];}

int is_owner_of_hook(const uint8_t *addr20)
{
    uint8_t ha[20];
    hook_account(ha, 20);
    for (int i = 0; GUARD(21), i < 20; i++)
        if (ha[i] != addr20[i]) return 0;
    return 1;
}

uint64_t read_payment_amount_drops(int *valid)
{
    uint8_t amount[48];
    int al = otxn_field(amount, 48, sfAmount);
    *valid = 0;
    if (al != 8) return 0;              
    if (amount[0] & 0x80) return 0;     
    *valid = 1;
    uint64_t v = ((uint64_t)(amount[0] & 0x3F) << 56)
               | ((uint64_t)amount[1] << 48)
               | ((uint64_t)amount[2] << 40)
               | ((uint64_t)amount[3] << 32)
               | ((uint64_t)amount[4] << 24)
               | ((uint64_t)amount[5] << 16)
               | ((uint64_t)amount[6] <<  8)
               |  (uint64_t)amount[7];
    return v;
}

int load_records_index(uint8_t *idx_out,
                       const uint8_t *label, int llen,
                       const uint8_t *tld,   int tlen)
{
    uint8_t key[32];
    if (!make_records_key(key, label, llen, tld, tlen)) rollback(SBUF("index key"), RC_STATE_ERR);
    int rl = state(idx_out, RECIDX_LEN, key, 32);
    if (rl == RECIDX_LEN && idx_out[RECIDX_OFF_VER] == RECIDX_VERSION) return 1;
    if (rl != -5) rollback(SBUF("index read"), RC_STATE_ERR);
    
    for (int i = 0; GUARD(RECIDX_LEN + 1), i < RECIDX_LEN; i++) idx_out[i] = 0;
    idx_out[RECIDX_OFF_VER] = RECIDX_VERSION;
    return 0;
}

int save_records_index(const uint8_t *idx,
                       const uint8_t *label, int llen,
                       const uint8_t *tld,   int tlen)
{
    uint8_t key[32];
    if (!make_records_key(key, label, llen, tld, tlen)) return 0;
    int wl = state_set(idx, RECIDX_LEN, key, 32);
    return wl == RECIDX_LEN ? 1 : 0;
}

static int text_slot_key(uint8_t *out, const uint8_t *root, int slot_id)
{
    if (slot_id < 0 || slot_id >= RECIDX_MAX_TEXT) return 0;
    uint8_t pre[37] = {'t','x','i',':'};
#pragma clang loop unroll(full)
    for (int k = 0; k < 32; k++) pre[4+k] = root[k];
    pre[36] = (uint8_t)slot_id;
    return util_sha512h(out, 32, pre, 37) == 32;
}
static int equal_key32(const uint8_t *a, const uint8_t *b)
{
    int equal = 1;
#pragma clang loop unroll(full)
    for (int k = 0; k < 32; k++) if (a[k] != b[k]) equal = 0;
    return equal;
}
static int recidx_add_custom(uint8_t *idx, const uint8_t *root, const uint8_t *text_key,
                             const uint8_t *name, int klen)
{
    int cnt = idx[RECIDX_OFF_TEXT_CNT];
    if (cnt > RECIDX_MAX_TEXT) rollback(SBUF("index corrupt"), RC_STATE_ERR);
    uint32_t used = 0;
    uint8_t skey[32], stored[72];
    if (klen < 1 || klen > 40) rollback(SBUF("text key len"), RC_STATE_ERR);
    for (int i = 0; GUARD(RECIDX_MAX_TEXT), i < cnt; i++) {
        int off = RECIDX_OFF_TEXT_LIST + i*6;
        if (idx[off] != 255) {
            if (idx[off] >= SWEEP_TEXT_KEYS_COUNT) rollback(SBUF("index corrupt"), RC_STATE_ERR);
            continue;
        }
        int slot_id = idx[off+1];
        if (slot_id >= RECIDX_MAX_TEXT || (used & (1U << slot_id))) rollback(SBUF("index corrupt"), RC_STATE_ERR);
        used |= 1U << slot_id;
        if (!text_slot_key(skey, root, slot_id)) rollback(SBUF("text index key"), RC_STATE_ERR);
        int slen = state(stored, 72, skey, 32);
        if (slen < 32 || slen > 72) rollback(SBUF("text index read"), RC_STATE_ERR);
        if (equal_key32(stored, text_key)) {
            XN_COPY(stored + 32, name, klen);
            if (state_set(stored, 32 + klen, skey, 32) != 32 + klen)
                rollback(SBUF("text index write"), RC_STATE_ERR);
            return -1;
        }
    }
    if (cnt == RECIDX_MAX_TEXT) return 0;
    int free_slot = -1;
    for (int i = 0; GUARD(RECIDX_MAX_TEXT), i < RECIDX_MAX_TEXT; i++)
        if (!(used & (1U << i))) { free_slot = i; break; }
    XN_COPY(stored, text_key, 32);
    XN_COPY(stored + 32, name, klen);
    if (!text_slot_key(skey, root, free_slot) || state_set(stored, 32 + klen, skey, 32) != 32 + klen)
        rollback(SBUF("text index write"), RC_STATE_ERR);
    int off = RECIDX_OFF_TEXT_LIST + cnt*6;
    idx[off] = 255; idx[off+1] = (uint8_t)free_slot;
    idx[off+2] = idx[off+3] = idx[off+4] = idx[off+5] = 0;
    idx[RECIDX_OFF_TEXT_CNT] = (uint8_t)(cnt+1);
    return 1;
}

static int clear_indexed_records(const uint8_t *idx,
                                 const uint8_t *label, int llen,
                                 const uint8_t *tld, int tlen, const uint8_t *root_key, int resume)
{
    int acnt = ((int)idx[RECIDX_OFF_ADDR_CNT] << 8) | idx[RECIDX_OFF_ADDR_CNT + 1];
    int tcnt = idx[RECIDX_OFF_TEXT_CNT];
    if (acnt > RECIDX_MAX_ADDR || tcnt > RECIDX_MAX_TEXT ||
        llen < 1 || llen > 63 || tlen < 1 || tlen > 15)
        return 0;

    uint8_t preimage[128], key[32], zero[1] = { 0 };
    int p = 0;
    for (int k = 0; GUARD(64), k < llen; k++) preimage[p++] = label[k];
    preimage[p++] = '.';
    for (int k = 0; GUARD(16), k < tlen; k++) preimage[p++] = tld[k];
    preimage[p++] = ':';
    int suffix = p + 5;

    preimage[p] = 'a'; preimage[p + 1] = 'd'; preimage[p + 2] = 'd';
    preimage[p + 3] = 'r'; preimage[p + 4] = ':';
    for (int i = 0; GUARD(RECIDX_MAX_ADDR), i < acnt; i++) {
        int off = RECIDX_OFF_ADDR_LIST + i * 2;
        uint32_t ct = ((uint32_t)idx[off] << 8) | idx[off + 1];

        static const uint32_t scale[5] = {10000, 1000, 100, 10, 1};
        int digits = 1 + (ct >= 10) + (ct >= 100) + (ct >= 1000) + (ct >= 10000);
        uint32_t scaled = ct * scale[digits - 1];
        preimage[suffix] = '0' + scaled / 10000;
        preimage[suffix + 1] = '0' + (scaled / 1000) % 10;
        preimage[suffix + 2] = '0' + (scaled / 100) % 10;
        preimage[suffix + 3] = '0' + (scaled / 10) % 10;
        preimage[suffix + 4] = '0' + scaled % 10;
        int n = suffix + digits;
        if (util_sha512h(key, 32, preimage, n) != 32) return 0;
        if (state_set(zero, 0, key, 32) < 0) return 0;
    }

    preimage[p] = 't'; preimage[p + 1] = 'e'; preimage[p + 2] = 'x';
    preimage[p + 3] = 't'; preimage[p + 4] = ':';
    for (int i = 0; GUARD(RECIDX_MAX_TEXT), i < tcnt; i++) {
        int off = RECIDX_OFF_TEXT_LIST + i * 6;
        if (idx[off] == 255) {
            uint8_t skey[32], stored[72];
            if (!text_slot_key(skey, root_key, idx[off+1])) return 0;
            int slen = state(stored, 72, skey, 32);
            // A previous weak execution can have deleted this slot after its
            // value was deleted. Only a validated recovery journal allows this.
            if (resume && slen == DOESNT_EXIST) continue;
            if (slen < 32 || slen > 72 || state_set(zero, 0, stored, 32) < 0 ||
                state_set(zero, 0, skey, 32) < 0) return 0;
            continue;
        }
        int si = idx[off];
        if (si >= SWEEP_TEXT_KEYS_COUNT) return 0;
        int klen = SWEEP_TEXT_KEY_LENS[si];
        const char *name = SWEEP_TEXT_KEYS[si];

#pragma clang loop unroll(full)
        for (int k = 0; k < 12; k++)
            if (k < klen) preimage[suffix + k] = (uint8_t)name[k];
        if (util_sha512h(key, 32, preimage, suffix + klen) != 32) return 0;
        if (state_set(zero, 0, key, 32) < 0) return 0;
    }
    return 1;
}

int recidx_add_coin(uint8_t *idx, uint16_t coin_type)
{
    int cnt = ((int)idx[RECIDX_OFF_ADDR_CNT] << 8) | idx[RECIDX_OFF_ADDR_CNT + 1];
    if(cnt>RECIDX_MAX_ADDR)rollback(SBUF("index corrupt"),RC_STATE_ERR);
    
    for (int i = 0; GUARD(15), i < cnt; i++) {
        int off = RECIDX_OFF_ADDR_LIST + i * 2;
        uint16_t ct = ((uint16_t)idx[off] << 8) | idx[off + 1];
        if (ct == coin_type) return -1;
    }
    if (cnt >= RECIDX_MAX_ADDR) return 0;
    int off = RECIDX_OFF_ADDR_LIST + cnt * 2;
    idx[off]     = (uint8_t)((coin_type >> 8) & 0xFF);
    idx[off + 1] = (uint8_t)( coin_type       & 0xFF);
    cnt++;
    idx[RECIDX_OFF_ADDR_CNT]     = (uint8_t)((cnt >> 8) & 0xFF);
    idx[RECIDX_OFF_ADDR_CNT + 1] = (uint8_t)( cnt       & 0xFF);
    return 1;
}

int recidx_remove_coin(uint8_t *idx, uint16_t coin_type)
{
    int cnt = ((int)idx[RECIDX_OFF_ADDR_CNT] << 8) | idx[RECIDX_OFF_ADDR_CNT + 1];
    if(cnt>RECIDX_MAX_ADDR)rollback(SBUF("index corrupt"),RC_STATE_ERR);
    for (int i = 0; GUARD(15), i < cnt; i++) {
        int off = RECIDX_OFF_ADDR_LIST + i * 2;
        uint16_t ct = ((uint16_t)idx[off] << 8) | idx[off + 1];
        if (ct == coin_type) {
            
            for (int j = i; GUARD(15), j < cnt - 1; j++) {
                int o1 = RECIDX_OFF_ADDR_LIST + j * 2;
                int o2 = o1 + 2;
                idx[o1]     = idx[o2];
                idx[o1 + 1] = idx[o2 + 1];
            }
            cnt--;
            idx[RECIDX_OFF_ADDR_CNT]     = (uint8_t)((cnt >> 8) & 0xFF);
            idx[RECIDX_OFF_ADDR_CNT + 1] = (uint8_t)( cnt       & 0xFF);
            return 1;
        }
    }
    return 0;
}

static const uint32_t text_key_words[18][3]={
{0x74617661U,0x00007261U,0x00000000U},
{0x63736564U,0x74706972U,0x006e6f69U},
{0x006c7275U,0x00000000U,0x00000000U},
{0x69616d65U,0x0000006cU,0x00000000U},
{0x69746f6eU,0x00006563U,0x00000000U},
{0x7779656bU,0x7364726fU,0x00000000U},
{0x2e6d6f63U,0x74697774U,0x00726574U},
{0x2e6d6f63U,0x68746967U,0x00006275U},
{0x2e6d6f63U,0x63736964U,0x0064726fU},
{0x2e6d6f63U,0x64646572U,0x00007469U},
{0x2e6d6f63U,0x6b6e696cU,0x6e696465U},
{0x2e67726fU,0x656c6574U,0x6d617267U},
{0x656d616eU,0x00000000U,0x00000000U},
{0x61636f6cU,0x6e6f6974U,0x00000000U},
{0x746e6f63U,0x68746e65U,0x00687361U},
{0x70736964U,0x0079616cU,0x00000000U},
{0x6c69616dU,0x00000000U,0x00000000U},
{0x6e6f6870U,0x00000065U,0x00000000U}
};

int recidx_add_text_std(uint8_t *idx, const char *key_name, int klen)
{
    int cnt = idx[RECIDX_OFF_TEXT_CNT];
    if(cnt>RECIDX_MAX_TEXT)rollback(SBUF("index corrupt"),RC_STATE_ERR);
    
    if(klen>12)return 0;
    uint8_t padded[12]={0};
    XN_COPY(padded,(const uint8_t*)key_name,klen);
    const xn_word *w=(const xn_word*)padded;
    int idx_in_sweep = -1;
    for (int i = 0; GUARD(SWEEP_TEXT_KEYS_COUNT + 1), i < SWEEP_TEXT_KEYS_COUNT; i++) {
        if (SWEEP_TEXT_KEY_LENS[i] != klen) continue;
        if(!((w[0].value^text_key_words[i][0])|(w[1].value^text_key_words[i][1])|
             (w[2].value^text_key_words[i][2]))){idx_in_sweep=i;break;}
    }
    if (idx_in_sweep < 0) return 0; 
    
    for (int i = 0; GUARD(15), i < cnt; i++) {
        int off = RECIDX_OFF_TEXT_LIST + i * 6;
        if (idx[off] == (uint8_t)idx_in_sweep) return -1;
    }
    if (cnt >= RECIDX_MAX_TEXT) return 0;
    int off = RECIDX_OFF_TEXT_LIST + cnt * 6;
    idx[off] = (uint8_t)idx_in_sweep;
    idx[off + 1] = (uint8_t)klen;
    for (int k = 0; GUARD(5), k < 4; k++)
        idx[off + 2 + k] = (k < klen) ? (uint8_t)key_name[k] : 0;
    cnt++;
    idx[RECIDX_OFF_TEXT_CNT] = (uint8_t)cnt;
    return 1;
}

int recidx_remove_text_all(uint8_t *idx, const uint8_t *root, const uint8_t *text_key,
                           const uint8_t *name, int klen)
{
    int cnt = idx[RECIDX_OFF_TEXT_CNT];
    if (cnt > RECIDX_MAX_TEXT) rollback(SBUF("index corrupt"), RC_STATE_ERR);
    uint8_t skey[32], stored[72], zero[1] = {0};
    for (int i = 0; GUARD(RECIDX_MAX_TEXT), i < cnt; i++) {
        int off = RECIDX_OFF_TEXT_LIST+i*6, custom = idx[off] == 255, same = 1;
        if (custom) {
            if (!text_slot_key(skey, root, idx[off+1])) rollback(SBUF("text index key"), RC_STATE_ERR);
            int slen = state(stored, 72, skey, 32);
            if (slen < 32 || slen > 72) rollback(SBUF("text index read"), RC_STATE_ERR);
            same = equal_key32(stored, text_key);
        } else {
            int si = idx[off];
            if (si >= SWEEP_TEXT_KEYS_COUNT) rollback(SBUF("index corrupt"), RC_STATE_ERR);
            if (SWEEP_TEXT_KEY_LENS[si] != klen) continue;
#pragma clang loop unroll(full)
            for (int k = 0; k < 12; k++)
                if (k < klen && (uint8_t)SWEEP_TEXT_KEYS[si][k] != name[k]) same = 0;
        }
        if (!same) continue;
        if (custom && state_set(zero, 0, skey, 32) < 0) rollback(SBUF("text index clear"), RC_STATE_ERR);
        int last = RECIDX_OFF_TEXT_LIST+(cnt-1)*6;
#pragma clang loop unroll(full)
        for (int k = 0; k < 6; k++) { idx[off+k] = idx[last+k]; idx[last+k] = 0; }
        idx[RECIDX_OFF_TEXT_CNT] = (uint8_t)(cnt-1);
        return 1;
    }
    return 0;
}

int write_pending(const uint8_t *uritokenid_32,
                  const uint8_t *dest20,
                  uint64_t amount,
                  uint32_t flags)
{
    uint8_t key[32]; make_pending_key(key, uritokenid_32);
    uint8_t val[PENDING_LEN];
    for (int i = 0; GUARD(21), i < 20; i++) val[i] = dest20[i];
    for (int i = 0; GUARD(9), i < 8; i++)
        val[PENDING_OFF_AMOUNT + i] = (uint8_t)((amount >> (8 * (7 - i))) & 0xFF);
    for (int i = 0; GUARD(5), i < 4; i++)
        val[PENDING_OFF_FLAGS + i] = (uint8_t)((flags >> (8 * (3 - i))) & 0xFF);
    return state_set(val, PENDING_LEN, key, 32) == PENDING_LEN ? 1 : 0;
}

int pending_exists(const uint8_t *uritokenid_32)
{
    uint8_t key[32]; make_pending_key(key, uritokenid_32);
    uint8_t val[PENDING_LEN];
    return state(val, PENDING_LEN, key, 32) == PENDING_LEN ? 1 : 0;
}

int clear_pending(const uint8_t *uritokenid_32)
{
    uint8_t key[32]; make_pending_key(key, uritokenid_32);
    uint8_t zero[1] = { 0 };
    return state_set(zero, 0, key, 32) >= 0;
}

static void async_key(uint8_t *out, const char *tag, const uint8_t *id)
{
    out[0] = tag[0]; out[1] = tag[1]; out[2] = tag[2]; out[3] = ':';
#pragma clang loop unroll(full)
    for (int i = 0; i < 28; i++) out[4 + i] = id[i];
}

static int bytes_equal(const uint8_t *a, const uint8_t *b, int len)
{
    for (int i = 0; GUARD(64), i < len; i++) if (a[i] != b[i]) return 0;
    return 1;
}

#define COPY_TX_FIXED(dst, src, count) do { \
    _Pragma("clang loop unroll(disable)") \
    for (int ck = 0; GUARD(count), ck < (count); ck++) (dst)[ck] = (src)[ck]; \
} while (0)

static int emit_stage(int kind, const uint8_t *uri, int uri_len,
                      const uint8_t *id, const uint8_t *destination,
                      uint64_t drops, uint8_t *hash)
{
    if (uri_len < 0 || uri_len > TOKEN_URI_MAX || drops > 0x3FFFFFFFFFFFFFFFULL) return RC_EMIT_FAIL;
    uint8_t tx[512], account[20];
    if (hook_account(account, 20) != 20 || etxn_reserve(1) != 1) return RC_EMIT_FAIL;
    int64_t seq = ledger_seq();
    if (seq < 0 || seq > 0xFFFFFFFAULL) return RC_EMIT_FAIL;
    int p = 0;
    tx[p++] = 0x12; tx[p++] = 0; tx[p++] = (uint8_t)kind;
    tx[p++] = 0x22; tx[p++] = 0; tx[p++] = 0; tx[p++] = 0;
    // Burnable keeps the issuer strong for Remit/Buy validation; burn.c
    // denies issuer-originated burn unless it is also the native Owner.
    tx[p++] = kind == ttURITOKEN_MINT ? 1 : 0;
    tx[p++] = 0x24; tx[p++] = 0; tx[p++] = 0; tx[p++] = 0; tx[p++] = 0;
    tx[p++] = 0x20; tx[p++] = 26;
    uint32_t fls = (uint32_t)seq + 1, lls = (uint32_t)seq + 5;
#pragma clang loop unroll(full)
    for (int i = 0; i < 4; i++) tx[p++] = fls >> (24 - 8 * i);
    tx[p++] = 0x20; tx[p++] = 27;
#pragma clang loop unroll(full)
    for (int i = 0; i < 4; i++) tx[p++] = lls >> (24 - 8 * i);
    if (kind != ttURITOKEN_MINT && id) {
        tx[p++] = 0x50; tx[p++] = kind == ttPAYMENT ? 17 : 36;
        COPY_TX_FIXED(tx + p, id, 32); p += 32;
    }
    if (kind != ttURITOKEN_MINT) {
        tx[p++] = 0x61;
        uint64_t amount = 0x4000000000000000ULL | drops;
#pragma clang loop unroll(full)
        for (int i = 0; i < 8; i++) tx[p++] = amount >> (56 - 8 * i);
    }
    tx[p++] = 0x68;
    int fee_off = p;
#pragma clang loop unroll(full)
    for (int i = 0; i < 8; i++) tx[p++] = i == 0 ? 0x40 : 0;
    tx[p++] = 0x73; tx[p++] = 33;
#pragma clang loop unroll(full)
    for (int i = 0; i < 33; i++) ((volatile uint8_t *)tx)[p++] = 0;
    if (kind == ttURITOKEN_MINT) {
        if (uri_len < 1) return RC_EMIT_FAIL;
        tx[p++] = 0x75; tx[p++] = uri_len;
        for (int i = 0; GUARD(TOKEN_URI_MAX), i < uri_len; i++) tx[p++] = uri[i];
    }
    tx[p++] = 0x81; tx[p++] = 20;
    COPY_TX_FIXED(tx + p, account, 20); p += 20;
    if (kind != ttURITOKEN_MINT) {
        tx[p++] = 0x83; tx[p++] = 20;
        COPY_TX_FIXED(tx + p, destination, 20); p += 20;
    }
    int64_t dl = etxn_details(tx + p, sizeof(tx) - p);
    if (dl <= 0 || dl > (int)sizeof(tx) - p) return RC_EMIT_FAIL;
    p += dl;
    int64_t fee = etxn_fee_base(tx, p);
    if (fee < 0 || (uint64_t)fee > 0x3FFFFFFFFFFFFFFFULL) return RC_EMIT_FAIL;
    uint64_t encoded_fee = 0x4000000000000000ULL | (uint64_t)fee;
#pragma clang loop unroll(full)
    for (int i = 0; i < 8; i++) tx[fee_off + i] = encoded_fee >> (56 - 8 * i);
    return emit(hash, 32, tx, p) == 32 ? RC_OK : RC_EMIT_FAIL;
}

static int emit_correlated(int kind, const uint8_t *uri, int uri_len,
                           const uint8_t *id, const uint8_t *dest, uint64_t drops,
                           const char *tag)
{
    uint8_t hash[32], key[32];
    if (emit_stage(kind, uri, uri_len, id, dest, drops, hash) != RC_OK) return RC_EMIT_FAIL;
    async_key(key, tag, id);
    return state_set(hash, 32, key, 32) == 32 ? RC_OK : RC_EMIT_FAIL;
}

static int tx_slot_field(int tx, uint32_t field, uint8_t *out, int cap)
{
    int64_t s = slot_subfield(tx, field, 12);
    if (s < 0 || slot_type(s, 0) < 0) return -1;
    return slot(out, cap, s);
}

static int execution_success(void)
{
    int64_t m = meta_slot(10);
    if (m < 0) return -1;
    int64_t s = slot_subfield(m, sfTransactionResult, 11);
    uint8_t result[1];
    if (s < 0 || slot(result, 1, s) != 1) return -1;
    return result[0] == 0;
}

static int erase_async(const char *tag, const uint8_t *id)
{
    uint8_t key[32], zero[1] = {0};
    async_key(key, tag, id);
    return state_set(zero, 0, key, 32) >= 0;
}

#define RECOVERY_COPY(dst,src,count) do { \
    _Pragma("clang loop unroll(full)") \
    for(int ri=0;ri<(count);ri++)(dst)[ri]=(src)[ri]; \
} while(0)
// A durable journal makes weak-phase writes resumable, including partial writes.
// v1 | hadRoot | full token ID | original root | name length | canonical name.
static void recovery_key(uint8_t *out, const uint8_t *root) {
    out[0]='r'; out[1]='c'; out[2]='v'; out[3]=':';
    RECOVERY_COPY(out+4,root,28);
}
static int recovery_name_equal(const uint8_t *a,const uint8_t *b,int n) {
    for(int i=0;GUARD(67),i<n;i++)if(a[i]!=b[i])return 0;
    return 1;
}

static int lifecycle_update(const uint8_t *id, const uint8_t *owner, int repair) {
    uint8_t name[66], label[64], tld[16], lk[32], rk[32], tk[32], jk[32];
    int n, dot=-1;
    if (repair) {
        int ll=otxn_param(label,64,(uint32_t)"label",5);
        int tl=otxn_param(tld,16,(uint32_t)"tld",3);
        if(ll<1||ll>57||tl<2||tl>8)
            rollback(SBUF("invalid recovery name"),RC_BAD_MEMO);
        XN_COPY(name,label,ll); name[ll]='.'; XN_COPY(name+ll+1,tld,tl); n=ll+1+tl; dot=ll;
    } else {
        make_label_of_key(lk,id); n=state(name,sizeof(name),lk,32);
        if(n==DOESNT_EXIST)return 0;
        if(n<3||n>66)rollback(SBUF("identity read"),RC_STATE_ERR);
        for(int i=0;GUARD(67),i<n;i++)if(name[i]=='.')dot=i;
        if(dot<1||dot>=n-1)rollback(SBUF("identity format"),RC_STATE_ERR);
    }
    make_root_key(rk,name,dot,name+dot+1,n-dot-1);
    make_token_key(tk,name,dot,name+dot+1,n-dot-1); recovery_key(jk,rk);
    uint8_t journal[133], root[32]={0}, bound[32], pending[32], hash[32], zero[1]={0};
    int jl=state(journal,sizeof(journal),jk,32), resume=jl!=DOESNT_EXIST;
    int rl=state(root,32,rk,32), bl=state(bound,32,tk,32), had_root=rl==32;
    if(rl!=32&&rl!=DOESNT_EXIST)rollback(SBUF("root read"),RC_STATE_ERR);
    if(resume) {
        if(jl!=67+n||journal[0]!=1||journal[1]>1||!id_equal(journal+2,id)||journal[66]!=n||!recovery_name_equal(journal+67,name,n))
            rollback(SBUF("recovery journal read"),RC_STATE_ERR);
        had_root=journal[1]; RECOVERY_COPY(root,journal+34,32);
        if(bl!=DOESNT_EXIST&&(bl!=32||!id_equal(bound,id)))rollback(SBUF("recovery identity changed"),RC_STATE_ERR);
    } else {
        if(repair&&!owner&&bl==DOESNT_EXIST&&rl==DOESNT_EXIST) {
            // An absent root/map alone does not prove cleanup completed.
            uint8_t k[32], probe[1];
            make_records_key(k,name,dot,name+dot+1,n-dot-1);
            if(state(probe,1,k,32)!=DOESNT_EXIST)rollback(SBUF("orphan records require recovery"),RC_STATE_ERR);
            make_label_of_key(k,id); if(state(probe,1,k,32)!=DOESNT_EXIST)rollback(SBUF("orphan identity"),RC_STATE_ERR);
            make_uri_key(k,id); if(state(probe,1,k,32)!=DOESNT_EXIST)rollback(SBUF("orphan identity"),RC_STATE_ERR);
            make_pending_key(k,id); if(state(probe,1,k,32)!=DOESNT_EXIST)rollback(SBUF("registration not settled"),RC_ALREADY_PENDING);
            async_key(k,"mnt",id); if(state(probe,1,k,32)!=DOESNT_EXIST)rollback(SBUF("registration not settled"),RC_ALREADY_PENDING);
            async_key(k,"ofr",id); if(state(probe,1,k,32)!=DOESNT_EXIST)rollback(SBUF("registration not settled"),RC_ALREADY_PENDING);
            async_key(k,"rfd",id); if(state(probe,1,k,32)!=DOESNT_EXIST)rollback(SBUF("registration not settled"),RC_ALREADY_PENDING);
            return 0;
        }
        if(bl==DOESNT_EXIST&&had_root) {
            // Only the original bare-name URI can supply a legacy forward map.
            uint8_t preimage[88],account[20],expected[32]; preimage[0]=0; preimage[1]=85;
            if(hook_account(account,20)!=20)rollback(SBUF("issuer read"),RC_STATE_ERR);
            RECOVERY_COPY(preimage+2,account,20); XN_COPY(preimage+22,name,n);
            if(util_sha512h(expected,32,preimage,22+n)!=32||!id_equal(expected,id))rollback(SBUF("legacy token mismatch"),RC_STATE_ERR);
        } else if(bl!=32||!id_equal(bound,id))rollback(SBUF("token map mismatch"),RC_STATE_ERR);
        make_label_of_key(lk,id);
        int len=state(journal,sizeof(journal),lk,32);
        if(len!=n||!recovery_name_equal(journal,name,n))rollback(SBUF("reverse mismatch"),RC_STATE_ERR);
    }
    uint8_t pk[32]; make_pending_key(pk,id); int pl=state(pending,32,pk,32);
    if(pl!=32&&pl!=DOESNT_EXIST)rollback(SBUF("pending read"),RC_STATE_ERR);
    async_key(lk,"rfd",id);
    if(state(hash,32,lk,32)!=DOESNT_EXIST)rollback(SBUF("refund requires recovery"),RC_ALREADY_PENDING);
    if(!owner&&pl!=DOESNT_EXIST&&(!resume||had_root))rollback(SBUF("registration not settled"),RC_ALREADY_PENDING);
    if(owner&&!resume) {
        if(had_root&&pl!=DOESNT_EXIST)rollback(SBUF("pending conflicts with root"),RC_STATE_ERR);
        if(!had_root) {
            async_key(lk,"ofr",id);
            // In recovery, ownership may have moved again since the failed buy.
            // Custody must have left the issuer; the caller cannot select Owner.
            if(is_owner_of_hook(owner)||pl!=32||(!repair&&!bytes_equal(owner,pending,20))||state(hash,32,lk,32)!=32)
                rollback(SBUF("claim not finalized"),RC_STATE_ERR);
        } else if(bytes_equal(root,owner,20)) return 2;
    }
    uint8_t idx[RECIDX_LEN]; int indexed=load_records_index(idx,name,dot,name+dot+1,n-dot-1);
    if(!resume&&indexed) {
        if(idx[RECIDX_OFF_TEXT_CNT]>15||(((int)idx[1]<<8)|idx[2])>15)rollback(SBUF("index corrupt"),RC_STATE_ERR);
        uint8_t pre[37],slotkey[32],stored[72]; pre[0]='t';pre[1]='x';pre[2]='i';pre[3]=':';
        RECOVERY_COPY(pre+4,rk,32);
        for(int i=0;GUARD(16),i<idx[RECIDX_OFF_TEXT_CNT];i++) {
            int off=34+i*6;
            if(idx[off]!=255){if(idx[off]>=SWEEP_TEXT_KEYS_COUNT)rollback(SBUF("index corrupt"),RC_STATE_ERR);continue;}
            pre[36]=idx[off+1];
            if(pre[36]>=15||util_sha512h(slotkey,32,pre,37)!=32)rollback(SBUF("custom slot key"),RC_STATE_ERR);
            int size=state(stored,72,slotkey,32);
            if(size<32||size>72)rollback(SBUF("custom slot missing"),RC_STATE_ERR);
        }
    }
    if(!resume) {
        journal[0]=1; journal[1]=had_root; RECOVERY_COPY(journal+2,id,32);
        RECOVERY_COPY(journal+34,root,32); journal[66]=n; XN_COPY(journal+67,name,n);
        if(state_set(journal,67+n,jk,32)!=67+n)rollback(SBUF("recovery journal write"),RC_STATE_ERR);
    }
    if(had_root) {
        uint8_t po[32], prev[32]; make_primary_of_key(po,root);
        int len=state(prev,32,po,32);
        if(len!=DOESNT_EXIST&&len!=32)rollback(SBUF("primary read"),RC_STATE_ERR);
        if(len==32&&id_equal(prev,rk)&&state_set(zero,0,po,32)<0)rollback(SBUF("primary clear"),RC_STATE_ERR);
    }
    if(indexed) {
        if(!clear_indexed_records(idx,name,dot,name+dot+1,n-dot-1,rk,resume))rollback(SBUF("records clear"),RC_STATE_ERR);
        uint8_t ik[32]; make_records_key(ik,name,dot,name+dot+1,n-dot-1);
        if(state_set(zero,0,ik,32)<0)rollback(SBUF("index clear"),RC_STATE_ERR);
    }
    make_label_of_key(lk,id);
    if(!had_root&&(!clear_pending(id)||!erase_async("mnt",id)||!erase_async("ofr",id)))rollback(SBUF("pending clear"),RC_STATE_ERR);
    if(owner) {
        RECOVERY_COPY(root,owner,20); root[20]=0;
        if(!had_root) {
            int64_t now=ledger_last_time(); if(now<0)rollback(SBUF("ledger time"),RC_STATE_ERR);
#pragma clang loop unroll(full)
            for(int i=0;i<8;i++)root[21+i]=(uint64_t)now>>(56-i*8);
            root[29]=root[30]=root[31]=0;
        }
        if(state_set(root,32,rk,32)!=32||state_set(id,32,tk,32)!=32||state_set(name,n,lk,32)!=n)
            rollback(SBUF("identity write"),RC_STATE_ERR);
        make_uri_key(lk,id);
        if(state_set(name,n,lk,32)!=n)rollback(SBUF("reverse write"),RC_STATE_ERR);
    } else {
        if(state_set(zero,0,rk,32)<0||state_set(zero,0,lk,32)<0)rollback(SBUF("root clear"),RC_STATE_ERR);
        make_uri_key(lk,id);
        if(state_set(zero,0,lk,32)<0||state_set(zero,0,tk,32)<0)rollback(SBUF("identity clear"),RC_STATE_ERR);
    }
    // Last write: until this succeeds, all readers must quarantine the domain.
    if(state_set(zero,0,jk,32)<0)rollback(SBUF("recovery journal clear"),RC_STATE_ERR);
    return owner?(had_root?2:1):3;
}

static int equal_key20(const uint8_t *a,const uint8_t *b){
    const xn_word *x=(const xn_word*)a,*y=(const xn_word*)b;
    return !((x[0].value^y[0].value)|(x[1].value^y[1].value)|
             (x[2].value^y[2].value)|(x[3].value^y[3].value)|(x[4].value^y[4].value));
}
int require_owner(const uint8_t *label, int llen,
                           const uint8_t *tld,   int tlen,
                           const uint8_t *sender20,
                           uint8_t *root_key_out,
                           uint8_t *root_val_out)
{
    if (!make_root_key(root_key_out, label, llen, tld, tlen))
        rollback(SBUF("key err"), RC_STATE_ERR);
    if (state(root_val_out, ROOT_LEN, root_key_out, 32) != ROOT_LEN)
        rollback(SBUF("not reg"), RC_DOMAIN_NOT_REG);
    if(!equal_key20(root_val_out+ROOT_OFF_OWNER,sender20))
        rollback(SBUF("not owner"),RC_NOT_OWNER);

    return 0;
}

int authorize_owner(const uint8_t *label, int llen,
                           const uint8_t *tld,   int tlen,
                           const uint8_t *sender20,
                           uint8_t *root_key_out,
                           uint8_t *root_val_out)
{
    if (!make_root_key(root_key_out, label, llen, tld, tlen))
        rollback(SBUF("key err"), RC_STATE_ERR);
    if (state(root_val_out, ROOT_LEN, root_key_out, 32) != ROOT_LEN)
        rollback(SBUF("not reg"), RC_DOMAIN_NOT_REG);
    if(!equal_key20(root_val_out+ROOT_OFF_OWNER,sender20))
        rollback(SBUF("not owner"),RC_NOT_OWNER);

    uint8_t token_key[32], token_id[32], native_owner[20], keylet[34]={0,85};
    recovery_key(token_key,root_key_out);
    if(state(token_id,32,token_key,32)!=DOESNT_EXIST)rollback(SBUF("domain needs reconciliation"),RC_STATE_ERR);
    if(!make_token_key(token_key,label,llen,tld,tlen)||state(token_id,32,token_key,32)!=32)
        rollback(SBUF("token identity missing"),RC_STATE_ERR);
#pragma clang loop unroll(full)
    for(int i=0;i<32;i++)keylet[i+2]=token_id[i];
    if(slot_set(keylet,34,20)!=20||slot_subfield(20,sfOwner,21)!=21||slot(native_owner,20,21)!=20)
        rollback(SBUF("native owner unavailable"),RC_STATE_ERR);
    if(!equal_key20(native_owner,sender20))rollback(SBUF("native owner mismatch"),RC_NOT_OWNER);
    return 0;
}

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
static int64_t lifecycle_dispatch(uint32_t ctx){
    int64_t tt=otxn_type();
    uint8_t id[32], owner[20]; int repair=0, live=1;
    if(tt==95)return reject_domain_remit();
    if(tt==ttINVOKE&&ctx==0){
        uint8_t v[1],op[1],keylet[34]={0,85},issuer[20],account[20];
        if(otxn_param(v,1,(uint32_t)"xn_v",4)!=1||v[0]!=2||otxn_param(op,1,(uint32_t)"op",2)!=1||op[0]!=17)accept(SBUF("next"),0);
        if(otxn_param(id,32,(uint32_t)"token",5)!=32)rollback(SBUF("recovery token"),RC_BAD_MEMO);
        COPY_TX_FIXED(keylet+2,id,32);
        int64_t slot=slot_set(keylet,34,20);
        if(slot==DOESNT_EXIST)live=0;
        else {
            if(slot!=20||tx_slot_field(20,sfOwner,owner,20)!=20||tx_slot_field(20,sfIssuer,issuer,20)!=20||hook_account(account,20)!=20)
                rollback(SBUF("native token read"),RC_STATE_ERR);
            if(!bytes_equal(account,issuer,20))rollback(SBUF("native issuer mismatch"),RC_STATE_ERR);
        }
        repair=1;
    }else {
        if(tt!=ttURITOKEN_BUY&&tt!=ttURITOKEN_BURN)accept(SBUF("ignored"),0);
        if(ctx==0){if(hook_again()!=1)rollback(SBUF("again failed"),RC_STATE_ERR);accept(SBUF("await result"),0);}
        if(execution_success()!=1)accept(SBUF("not successful"),0);
        if(otxn_field(id,32,sfURITokenID)!=32)accept(SBUF("no utid"),0);
        if(tt==ttURITOKEN_BUY){if(otxn_field(owner,20,sfAccount)!=20)rollback(SBUF("no buyer"),RC_STATE_ERR);}else live=0;
    }
    int result=lifecycle_update(id,live?owner:0,repair);
    if(repair)accept(SBUF("reconciled"),0);
    if(result==3)accept(SBUF("burned"),0);
    if(result==2)accept(SBUF("transferred"),0);
    if(result==1)accept(SBUF("claimed"),0);
    accept(SBUF("not ours"),0);
    return 0;
}

// Shared entry policy for record, profile, control and admin handlers.
static int entry_operation(uint32_t ctx,uint8_t *sender) {
    int64_t tt=otxn_type();if(tt!=ttPAYMENT&&tt!=ttINVOKE)accept(SBUF("ignored"),0);if(ctx!=0)accept(SBUF("weak ignored"),0);uint8_t marker[1];if(otxn_param(marker,1,(uint32_t)"xn_v",4)!=1||marker[0]!=2)accept(SBUF("not v2"),0);if(otxn_field(sender,20,sfAccount)!=20)rollback(SBUF("sender"),RC_BAD_MEMO);uint8_t op[1];if(otxn_param(op,1,(uint32_t)"op",2)!=1||(op[0]>17||op[0]==15||op[0]==8))rollback(SBUF("unknown op"),RC_UNKNOWN_OP);return op[0];
}
