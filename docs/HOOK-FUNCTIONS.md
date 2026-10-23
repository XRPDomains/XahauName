# Hook function reference

Canonical source: [common helpers](../hook/src/common.h), [handler order](../hook/config/handlers.json). Wire/state semantics are in [SPEC](SPEC.md). Only hook and issuance cbak are runtime entry points; helpers inline into each production module. An unused compatibility helper does not imply a supported operation.

## Entry points and business operations

| Handler | Functions / responsibility |
| --- | --- |
| issuance | hook parses Payment and price/recipient; do_mint_shared reserves identity and emits mint; cbak correlates mint/offer/refund outcomes |
| set-address | hook dispatches set/clear; do_address validates coin/hex, updates bounded index and checked state |
| authorization | hook verifies root owner and native token owner for mutations; a later rollback undoes earlier address changes |
| set-text | hook routes ordinary key/value; do_set_text maintains standard/custom descriptors and key-name slots |
| clear-text | do_clear_text deletes value, descriptor and custom-name slot atomically |
| control | do_set_primary preserves replacement/unset invariants; do_reset clears full profile while keeping ownership |
| admin | do_set_pricing validates ten uint64 prices; do_tld writes explicit enable/tombstone; do_pause toggles issuance; do_set_uri_base validates base |
| claim | hook handles native URITokenBuy; trigger_uritoken_buy finalizes initial claim or resets old records/primary for transfer; reject_domain_remit rejects bypass |
| burn | trigger_uritoken_burn removes root, records, maps, pending/correlation where applicable |
| profile | do_set_profile validates version/masks/values/capacity and atomically updates ten Global Keys or legacy-v1 fields |

## Shared helper groups

- Key builders: make_root_key, make_token_key, make_addr_key, make_text_key, make_records_key, text_slot_key, make_primary_of_key and reverse/pending keys. They hash exact canonical bytes or construct documented fixed prefixes.
- Input validation: validate_name, parse_lower_field, parse_uint_field_strict, parse_bool_field, parse_hex20_field and bounded hex decoders read native HookParameters. Legacy function names do not imply JSON memo transport.
- Authorization: require_owner checks root owner; authorize_owner additionally verifies native token owner. is_owner_of_hook is treasury administration. Legacy role-key helpers have no dispatched grant functionality.
- Index mutation: load_records_index/save_records_index, recidx_add/remove variants and custom-name slots enforce capacity and enumerable cleanup. Failed reads/writes must abort.
- Identity and cleanup: compute_uritoken_id, finalize_claim, clear_indexed_records and key equality helpers preserve full-ID mapping/native-owner invariants.
- Async emission: emit_stage serializes one canonical native transaction, reserves emission, attaches details/fee and emits; emit_correlated persists the stage hash. async_key/erase_async and pending helpers support correlation/idempotency. execution_success reads metadata outcome; callback reason alone is not engine result.
- URI policy: do_set_uri_base, reject_custom_uri and build_uri ensure owner-configured base plus canonical name. compute_uritoken_id hashes exact bytes.

## Buffer and result contracts

| Helper family | Inputs and result |
| --- | --- |
| make_*_key | Caller-owned 32-byte output and explicit component lengths; hashed builders return 1/0. Fixed-prefix builders use the documented truncated ID slices. |
| build_uri | Canonical label/TLD into a bounded name buffer; returns byte length or 0. URIBase concatenation happens in do_mint_shared. |
| compute_uritoken_id | Output32, issuer20, exact URI and length; returns 1/0. Never uses a pointer-sized SBUF length. |
| validate_label / validate_tld_format / validate_name | Return RC_OK or a specific rejection code; full validation also checks reserved labels and enabled TLD. |
| parse_str_field / parse_lower_field | Native named parameter into caller buffer; missing returns 0, read/buffer errors return negative; lower helper folds ASCII uppercase. |
| parse_uint_field_strict | Exactly four big-endian bytes; missing -1, malformed -2, otherwise uint32 value carried in int64. |
| parse_bool_field | Exactly one byte 0/1; missing or malformed returns -1. |
| parse_hex20_field / parse_hex_var_field | Bounded ASCII hexadecimal; recipient20 or variable decoded bytes; missing/error must be handled by caller. |
| read_payment_amount_drops | Native encoded Amount to uint64 drops, with explicit validity output; issuance separately rejects PartialPayment. |
| require_owner / authorize_owner | Fill root key/value and enforce sender authority; violations rollback rather than returning an authorized fallback. Native token check is an additional invariant. |
| load_records_index / save_records_index | Read/create the bounded index / checked persistence. Callers validate counts and must reject failed writes. |
| recidx_add_* | Distinguish added, existing and exhausted index; custom slots preserve full text state key and key name. Deletion also clears associated slot state. |
| clear_indexed_records | Bounded address/text/slot sweep; returns 1/0. Caller must rollback on failure. |
| write_pending / pending_exists / clear_pending | Explicit token-correlated settlement state. Clearing pending alone is not successful ownership settlement. |
| execution_success | 1 for tesSUCCESS, 0 for known failure, negative when outcome cannot be established from slots. |
| emit_stage / emit_correlated | RC_OK=0 or RC_EMIT_FAIL=60; never queue dependent mint and offer in parallel. Correlated emission also requires a successful stage-hash write. |
| finalize_claim | Promotes a valid pending claim only after successful native buy; returns 1/0, with caller rollback required on failure. |

All parameter pointers refer to WASM memory. Every variable-length component carries an explicit byte count. State writes use exact key/value lengths; reserved padding is initialized. Internal C helper calls are not external protocol commands.

## Complete shared symbol index

This list includes compatibility helpers compiled only when reachable. Definitions, return conventions and buffer bounds remain next to their implementation; changes to a shared header require rebuilding every handler.

- `str_has_whitespace`
- `str_eq_lit`
- `hex_nibble`
- `make_root_key`
- `enc_decimal`
- `make_addr_key`
- `make_text_key`
- `make_text_key_lit`
- `make_records_key`
- `make_label_of_key`
- `make_role_key`
- `make_tld_key`
- `make_pricing_key`
- `make_paused_key`
- `make_primary_of_key`
- `make_uri_key`
- `make_pending_key`
- `is_owner_of_hook`
- `make_uri_base_key`
- `make_token_key`
- `id_equal`
- `valid_uri_base`
- `do_set_uri_base`
- `reject_custom_uri`
- `compute_uritoken_id`
- `build_uri`
- `is_allowed_label_char`
- `is_reserved_label`
- `validate_label`
- `validate_tld_format`
- `tld_in_list`
- `validate_name`
- `parse_str_field`
- `parse_lower_field`
- `parse_bool_field`
- `parse_hex20_field`
- `parse_hex_var_field`
- `parse_uint_field_strict`
- `has_role`
- `read_payment_amount_drops`
- `payment_is_partial`
- `load_records_index`
- `save_records_index`
- `text_slot_key`
- `equal_key32`
- `recidx_add_custom`
- `clear_indexed_records`
- `recidx_add_coin`
- `recidx_remove_coin`
- `recidx_add_text_std`
- `recidx_remove_text_all`
- `write_pending`
- `pending_exists`
- `clear_pending`
- `async_key`
- `bytes_equal`
- `emit_stage`
- `emit_correlated`
- `emit_uritoken_mint_and_offer`
- `emit_refund`
- `tx_slot_field`
- `execution_success`
- `erase_async`
- `finalize_claim`
- `equal_key20`
- `require_owner`
- `authorize_owner`
