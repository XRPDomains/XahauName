# XahauName protocol specification

Version 0.3.0. Native wire marker 2. Target: Xahau testnet, NetworkID 21338. Integers are unsigned big-endian unless stated otherwise. Amounts use drops (1 XAH = 1,000,000 drops).

## 1. Identity and authority

Canonical names are `<label>.<tld>`. Labels contain 1..57 lowercase ASCII letters, digits or internal hyphens, with alphanumeric endpoints. TLDs contain 2..8 lowercase ASCII letters or digits. Subdomains, Unicode normalization, expiry, renewal and leasing are outside this version. Friendly SDK/UI input may remove whitespace and add `.xah`; hook inputs are lowercased before validation. Reserved labels are xahau, treasury, admin, root and www. Default TLDs are xah/xahau unless explicitly disabled.

The hook account is the treasury and URIToken issuer. Its owner controls upgrades, administrative registration/reset, pricing, TLDs, issuance pause and URIBase. Delegated roles and owner profile locking are unsupported. The legacy lock bit has no effect. Issuer-burn authority remains because tokens use `tfBurnable=1`.

Domain authorization checks both root owner and native URIToken owner. Metadata, arbitrary texts and third-party tokens cannot establish ownership. All ten handlers share one namespace. Strong execution can reject the originating transaction and roll back its provisional hook writes. Weak executions run after native application and cannot undo that native transaction; see the failure boundary below.

## 2. Chain and transport

Canonical order is `hook/config/handlers.json`: issuance, set-address, authorization, set-text, clear-text, control, admin, claim, burn, profile. Separate handlers satisfy the native size, instruction and 32-block budgets. Helpers inline within each artifact because the pinned cleaner removes internal functions.

Requests use native HookParameters. JSON hex wraps parameter names and values; values described below are decoded bytes. Include `xn_v=02`, `op=<one byte>`. Issuance uses Payment to treasury; ordinary changes use Invoke to treasury. Bare payments pass through. Validated purchase success means mint queued, not recipient ownership.

| Opcode | Operation | Parameters beyond marker/op | Authority |
| --- | --- | --- | --- |
| 0 | noop | none | any |
| 1 | register | label, tld, optional recipient | treasury |
| 2 | buy | label, tld, optional recipient | any; sufficient native payment |
| 3 | setPrimary | label, tld, flag00/01 | owner |
| 4 | setAddr | label, tld, coinType4, addr ASCII hex | owner |
| 5 | clearAddr | label, tld, coinType | owner |
| 6 | setText | label, tld, key/value OR profile batch | owner |
| 7 | clearText | label, tld, key | owner |
| 8 | reserved | owner lock retired; rejects4 | none |
| 9 | reset | label, tld | owner or treasury |
| 10 | setPricing | prices80 | treasury |
| 11/12 | addTld/removeTld | tld | treasury |
| 13/14 | pause/unpause | none | treasury |
| 15 | reserved | unsupported | none |
| 16 | setURIBase | uri_base | treasury |

Recipient is40 ASCII hex characters for AccountID20. CoinType is transported as uint32 but limited to0..65535 by the current index. Addresses decode to1..128 bytes. Text keys normalize to lowercase, with1..40 ASCII letters, digits, dot, underscore or hyphen. Values contain 1..128 bytes. The hook enforces bounds and authorization; typed SDK helpers add UTF-8/field semantics.

Partial Payments and issued currencies are rejected for issuance. Overpayment is currently accepted and retained on a successful purchase; there is no automatic change refund. The SDK submits the current quoted amount exactly. Ten uint64 prices cover lengths 1..9 and 10+. Missing pricing rejects purchase. Disabled built-in TLDs have explicit tombstones. Pause affects issuance. Current testnet prices are in the deployment guide.

## 3. Mint, callback and claim

The treasury sets HTTPS URIBase (up to120 ASCII bytes), trailing slash, without credentials, port, query or fragment. Current policy: `https://xrpdomains.xyz/api/nftdomains/metadata/`. The hook appends canonical domain. Buyers cannot pass arbitrary URI. Maximum token URI is186 bytes. A base change affects future mints only.

TokenID = SHA512Half(`0x0055 || issuerAccountID20 || exactURIBytes`). The forward domain-to-token mapping is stored explicitly; do not recompute old IDs using the latest URIBase. Legacy bare-domain URIs remain readable. Native URI is immutable; an HTTPS response is not.

Issuance reserves identity, writes reverse-name and pending data and emits one URITokenMint. Its successful callback emits a restricted zero-price URITokenCreateSellOffer. Dependent stages are sequential. Root ownership finalizes only when the recipient signs URITokenBuy. A UI may request the claim signature immediately when the offer validates, or allow later Claim.

Callbacks correlate emitted transaction ID with a stored stage hash. Callback reason is not an engine result: transaction/metadata slots provide outcome. Missing outcome stays unresolved. Repeated/unknown callbacks cannot promote ownership. Failed mint/offer queues a correlated refund; pending is cleared after confirmed refund success. A minted token remains reserved if settlement needs recovery. Failed refunds and zero-value administrative issuance failures need operator recovery; this release has no general recovery command.

Only issuance may emit Payment0, Mint45 and CreateSellOffer48. Other handlers cannot emit. HookCanEmit uses active-low bits except SetHook22, which is active-high and disabled here. Deployment validates effective installed overrides, not just definitions.

## 4. Transfer, burn and reset

Transfer uses a recipient-restricted zero-price offer and URITokenBuy. Records stay with the sender until claim. Claim clears all indexed addresses, standard/custom texts, custom-key name slots, website content and old primary before setting the new owner. Native Remit of recognized domain tokens rejects 65 to prevent bypass. Paid marketplace settlement APIs are outside this release.

Burn removes root, identity/reverse mappings and records. Reset clears records/primary but retains ownership. The bounded index includes custom keys. Strong record updates roll back on failed writes. Claim/transfer/burn finalization runs weakly: a failed weak hook can leave native token state applied while domain finalization fails. Do not treat its rollback as native-transaction reversal. The SDK must reject inconsistent identity and report recoveryRequired; a complete repair flow and ledger fault-injection tests are still required before production. Clearing an older domain cannot remove a newer primary selection.

## 5. State

H(s) is SHA512Half of exact bytes without a terminator. Keys are namespace-scoped.

| Key | Value |
| --- | --- |
| H(domain + :root) |32 bytes: owner 20, flags 1, mintedAt uint64 at 21, padding |
| H(domain + :token) | tokenID32 |
| H(domain + :addr: + decimal coinType) | binary address1..128 |
| H(domain + :text: + textKey) | text bytes1..128 |
| H(domain + :records) |124-byte index |
| H(primary_of: + AccountID20) | root key32 |
| uri: + tokenID[0:28] | canonical domain bytes |
| lof: + tokenID[0:28] | canonical domain |
| pending: + tokenID[0:24] |32 bytes: recipient 20, payment 8, stage flags 1, padding |
| stage + colon + tokenID[0:28] | emitted transaction hash32; mnt/ofr/rfd |
| H(_pricing_v1) |01 + ten uint64 prices =81 bytes |
| H(_paused) | one-byte flag |
| H(_tld: + tld) | enabled/disabled marker |
| H(_uri_base_v1) | ASCII URIBase |

Index version 1: byte 0 version; bytes1..2 address count; byte 3 text count; bytes4..33 fifteen uint16 coin IDs; bytes34..123 fifteen six-byte text descriptors. Standard descriptors have stable tags and key length/prefix. Custom tag 255 references a named slot containing full text state key32 and original key bytes. Earlier unnamed slots remain deletable but cannot always be named by readers; SDK textKeysComplete reports this.

Tags0..14 retain their original meanings. Tags15..17 add display/mail/phone. An older deployment with custom descriptors using these names needs explicit migration before upgrade; the deployment preflight refuses such collisions. None existed for this testnet upgrade.

Reverse/pending keys truncate token IDs to fit32-byte state keys. Canonical full-ID mappings plus native issuer/owner checks are required. This release retains these legacy auxiliary layouts; it has not established a separate collision proof for every such key. Exact encodings are implemented by common.h and SDK utilities.

## 6. Atomic profile batch

Opcode 6 accepts `profile = version:uint8 || setMask:uint16 || clearMask:uint16`, a five-byte header. SDK emits version 2. Bits reference p0..p9 parameters. Clear bits have no value. Masks must be disjoint, nonempty and limited to ten bits. Extra p-values and mixed key/value mode reject. Unchanged SDK patches return null without signing.

Version 2 order: avatar, description, display, email, keywords, mail, notice, location, phone, url. Legacy version 1 order: name, description, avatar, url, email, location, com.twitter, com.github, org.telegram, com.discord. Both count toward the same fifteen-text limit. One Invoke and one signature apply all changes; invalid input, exhausted capacity or failed writes roll back everything.

## 7. Resolution and interoperability

[XNIP standards](standards/README.md) define application-facing names, texts/content, addresses, primary and avatars. These are bounded adaptations of ENS concepts, not ENS contracts/ABI implementations. High-bit ENSIP-11 EVM coin IDs, arbitrary-chain reverse registrations, Unicode names, wildcards and DNS delegation are unsupported.

getPrimaryName returns an owned configured candidate. getVerifiedPrimaryName additionally requires explicit XAH receiving record21337 to resolve to the requesting account at the same validated ledger. It never substitutes XRP (144) or the owner. Destination tags participate in comparison. Arbitrary text primary values have no authority.

The contenthash text key stores canonical ipfs://CID root URI. SDK optionally converts to/from the IPFS subset of ENSIP-7 binary bytes. No separate binary contenthash state exists. Typed SDK/UI validates rich formats; generic setText remains bounded raw storage.

## 8. Limits and migration

Per domain: fifteen addresses and fifteen total texts, with values at most 128 bytes. Profile Globals use ordinary slots. Storage uses treasury ledger reserves and a shared namespace. Object growth, pagination and indexer operations require capacity planning. listOwnedDomains follows native account objects and mappings; some legacy reverse lookups require namespace pagination. Million-domain storage/throughput has not been demonstrated.

No delegated roles, locks, renewal, subdomains, arbitrary-operation batch or public recovery service is promised. Upgrade authority and external metadata availability are separate trust considerations. Upgrades preserve namespace state and verify installed code before updating SDK configuration.

## 9. Return codes

| Codes | Meaning |
| --- | --- |
| 0 | accepted; inspect return string and stage |
| 1..4 | transaction/transport/argument/operation rejection |
| 10/11/12 | invalid name / missing domain / unauthorized owner |
| 20 | state/key/write failure |
| 31/33/36 | reserved domain / disabled TLD / invalid TLD |
| 40/41 | unauthorized admin / invalid admin argument |
| 50/51/52 | underpayment / missing pricing / paused issuance |
| 53/54/55 | nonnative amount / partial payment / already pending |
| 57..59 | amount overflow / price count / malformed hex |
| 60/61/62 | emission failure / unknown callback / records full |
| 63/64/65 | URIBase missing / custom buyer URI / unsupported Remit |

Code0 alone is insufficient evidence that the intended operation ran. SDK receipts require validated tesSUCCESS, treasury account, expected handler hash and operation return string. Unknown submission outcomes retain their hash and must be queried before retrying.

## Assurance status

[Open findings](review/FINDINGS.md) distinguish proven strong-operation rollback, modeled weak failure detection and still-required native ledger fault tests. Do not infer complete failure recovery from passing WASM probes.
