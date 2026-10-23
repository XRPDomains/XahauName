# XNIP-0001: Canonical names and token identity

- Status: Draft
- Version: 0.1.0
- Created: 2026-10-23
- Category: Identity
- Depends on: XNIP-0000

## Requirements

A canonical name MUST be lowercase ASCII `<label>.<tld>`. Label length is1..57 with alphanumeric endpoints and internal alphanumeric/hyphen characters. TLD length is2..8 alphanumeric characters. Subdomains and Unicode normalization are unsupported. Friendly input MAY remove whitespace/add a default TLD before protocol validation, but a resolver MUST NOT reinterpret an explicit unsupported multilabel name.

Token identity MUST use the canonical forward mapping written by the hook. A minted token's ID derives from issuer and exact immutable URI, not the domain alone. URIBase changes MUST NOT reinterpret existing IDs. A verified owner reader MUST validate mapping, recognized issuer, native owner and root consistency at one validated ledger. A metadata response or a token from another issuer MUST NOT establish identity.

## Lifecycle and errors

Mint/offer is pending until recipient claim. A reader MUST distinguish available, reserved/pending and owned states. Transfer through native buy resets all records and previous primary; Remit bypass is rejected. Burn removes mappings and records. No expiry/renewal is implied.

Absent identity returns null. Malformed/contradictory mappings fail closed; raw root presence alone is not native-owner proof. The installed chain MUST reject a burn whose sender is not the native token Owner, including issuer-originated burns. Treasury upgrade/reset powers remain. The retained native burnable flag supports strong transfer validation, and an upgrade that removes the burn restriction could restore issuer burning; this convention does not promise immutable control.

## Compatibility and tests

Legacy bare-domain URIs remain readable through recognized issuer and canonical maps; clients MUST NOT silently rewrite token URI. Model lifecycle probes and live purchase/claim/transfer/burn tests provide positive evidence. Tests include invalid labels, third-party tokens, conflicting owners and record cleanup. Format details are in [SPEC](../SPEC.md).

## Implementation assurance caveat

The required transfer/burn cleanup is observed in successful live paths. Native token changes and weak domain finalization are not proven atomic under injected weak state failures. The current implementation needs the reconciliation/fault-injection gate in [F-01](../review/FINDINGS.md) before a production conformance claim.
