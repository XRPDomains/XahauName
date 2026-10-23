# SDK API reference

Version 0.3.0. Import from @xahauname/sdk. See [quickstart](../packages/sdk/README.md), [types](../packages/sdk/src/types.ts) and [protocol](SPEC.md). Arguments label/tld refer to canonical domain components. Amounts are bigint drops; binary values are Buffer.

## Client configuration

`resolveNetworkConfig({network: 'testnet' | 'mainnet', deployment?, wss?})` selects shared transport and deployment configuration. The reviewed testnet deployment is bundled; mainnet requires its own explicit manifest. `XAHAU_NETWORKS` also provides Wallet Kit IDs and explorer/faucet settings. See [network configuration](NETWORKS.md).

Optional `new IndexerReadClient({url, networkId, fetch?})` exposes `describe`, `listOwnedDomains`, `listIncomingOffers`, `getVerifiedPrimaryName`, `listRecovery` and cursor-paginated `events`. Responses contain `{status, data}`, retaining indexed ledger/hash, observed head, lag, last successful sync and last error. Network-mismatched responses are rejected. Read-model data is not current ledger proof and does not replace transaction preflight. See [indexer API](../packages/indexer/README.md).

new XahauNameClient(config) requires wss, treasury and exactly one namespaceId/namespaceSeed. wallet (xahau Wallet) and external signer (TxSigner) are mutually exclusive. TESTNET supplies verified public configuration, NetworkID 21338 and handler hashes. Optional cacheTtlMs, hardcodedTlds and maxFeeXAH control reads and signing. Local-wallet default fee ceiling is1 XAH; purchase price is separate.

connect() validates configured network and installed handler hashes. Concurrent calls share one connection attempt. Optional `connectionTimeoutMs` sets the WebSocket connection timeout (default 15000 ms). Connection failures use `RPC_CONNECTION_FAILED`; `explainError()` returns stage `connection` and recovery `reconnect` when no transaction hash is available. Reconnecting does not retry a transaction. disconnect() closes the connection. A TxSigner must return a validated transaction result with hash, engineResult and metadata. createWalletKitSigner implements this contract without depending on Kit internals.

ReadOptions supports ledgerHash, bypassCache, verifyOwner. Multi-read identity/profile routines pin a validated ledger. Do not mix snapshots from different ledgers when displaying identity. Public client.getOwner/describe (and the deprecated owner resolve alias) verify native ownership by default. Passing verifyOwner:false is an explicit unverified read. Low-level resolver.getOwner/describe retain their legacy state-only default; pass verifyOwner:true for identity use. Generic raw-state methods do not prove native ownership by themselves.

Concurrent identical object/state requests with an explicit ledger hash may share an in-flight RPC; results are cloned and the entry is discarded on completion. This also applies with `bypassCache:true`, since the pinned ledger is immutable. Unpinned reads, fees, queues and submissions are never coalesced this way. `waitForOffer()` and `waitForClaimed()` poll the validated head and rescan lifecycle state only when its hash changes; transient failed scans can retry without waiting for another ledger. Timeout/cancellation and fresh write checks still apply.

## Client reads

`client.setSigner(signer | null)` attaches or detaches a signing session on the existing connected client. It clears the state cache without opening or closing a WebSocket. Recreate the Wallet Kit signer on account/network changes; normal submission network and session checks still apply.

| Method | Result/meaning |
| --- | --- |
| getOwner(domain) | Canonical native-verified domain owner, or null |
| root(domain) | Root owner/primary/locked=false/mintedAt or null |
| describe(domain, options) | Profile including addrs, texts, unnamedTexts, textKeysComplete |
| getProfileSnapshot(domain, options) | Fresh native-verified profile, tokenId, URI, native-XAH transfer offer and ledgerHash; null without a root; rejects unfinalized lifecycle state |
| listOwnedDomains(address) | Native-owned domains with recognized issuer/mapping |
| getPortfolio(address, options) | One verified snapshot: domains with tokenId/URI/primary flag, owned primary candidate and ledgerHash |
| checkDomain(domain, options) | Same-ledger lifecycle status, priceDrops and tldEnabled; independent reads run concurrently |
| listIncomingDomains(address, options) | Registration/transfer offers from history and verified native state; optional AbortSignal stops obsolete scans |
| getPrimaryName(address) | Configured owned candidate or null |
| getVerifiedPrimaryName(address) | Candidate with explicit native receiving round-trip |
| primaryOf(address) | Raw primary root-state hash or null |
| isAvailable(domain) | Registration stage available |
| getAvatar(domain, options) | {uri,url,source} or null; optional fallbackToMetadata |
| getAccountBalance(address) | Validated total XAH balance |
| getLedgerHash() | Validated snapshot hash |
| getLedgerObject(index, options) | Raw ledger object or null |
| readState(hexKey, options) | Raw namespaced bytes or null |
| resolve(domain) | Deprecated owner alias; never receiving-address fallback |

MintedAt records the initial claim ledger timestamp in ledger epoch seconds, not Unix milliseconds; transfers preserve it. A legacy unnamed custom slot appears under unnamedTexts indexed by state key; textKeysComplete=false means its original key cannot be recovered from current state. New custom writes store names on-chain.

For a domain list, use `getPortfolio()` instead of separately enumerating ownership and primary. Its memoization lasts only for that immutable ledger snapshot; a new call starts fresh. Incoming-offer history is a separate request and need not block the owned list. Verified token URIs in the portfolio can feed SDK `metadataURL()` and `fetchMetadata()` without repeating domain-state reads for display artwork. Writes still perform their normal fresh checks.

For the profile screen, use `getProfileSnapshot()` instead of composing describe, token-ID, native-token, URI and avatar reads separately. It shares immutable reads across identity, lifecycle and record discovery, always verifies native ownership and bypasses the persistent state cache. `transferOffer` includes only a destination-restricted native-XAH offer; the recipient must still use normal fresh claim validation. Render `profile.texts.avatar` through `mediaURL()`, or use the verified `uri` with metadata helpers. Metadata fetching need not block profile rendering. Only legacy bare-domain URIs need an additional display-base lookup.

Incoming offer summaries also include a verified `uri` for display. `fetchMetadata()` shares concurrent requests and a bounded cache within each fetch transport, so a proxy can reuse metadata between cards and the profile without mixing responses from different transports. Successful results remain cached for five minutes; failed requests for five seconds. These display caches never authorize ownership or writes. The domain-manager UI prioritizes the metadata image, then an available profile avatar, then a monogram; monograms stay hidden while image loading is pending.

## Registrar

Access through client.registrar.

| Method | Behavior |
| --- | --- |
| getPricing(options), getPrice(labelLength) | Current ten-tier table / price in drops |
| isPaused(options) | Issuance pause flag |
| buy({label,tld,recipient?}) | Payment, returns pending receipt; defaults to quoted price |
| register({label,tld,recipient,paymentDestination?}) | Treasury-only administrative issuance; outgoing Payment must have another destination |
| buyAndClaim(args, waitOptions) | Buy, wait for restricted offer, request claim; returns purchase/claim/status |
| getRegistrationStatus(domain, options) | available/pending/awaitingClaim/claimed/refundPending/recoveryRequired |
| waitForOffer(domain, options), waitForClaimed(domain, options) | Bounded polling with timeoutMs/intervalMs/signal |
| claim(domain), claimIncoming(domain) | Recipient signs native zero-price buy; verifies final ownership |
| getTokenId(domain, options) | Canonical mapped ID; never derive from current base |
| getTokenURI(domain, options) | Actual immutable native URI |
| getMetadata(domain, options) | Optional fetched token metadata/image; not identity authority |
| createTransferOffer(domain, recipient) | Restricted zero-price native offer |
| cancelTransferOffer(domain) | Cancel own outgoing offer |
| acceptTransfer(domain) | Validate recipient offer then native buy |
| burn(domain) | Owner native burn with expected cleanup trace |
| reconcile(domain) | Strong Invoke reconciling lifecycle state against native custody/existence |
| getURIBase(options), setURIBase(base) | Current base / treasury-only update for future mints |
| setPricing(prices) | Treasury-only array of ten uint64 bigint values |

A successful purchase is not a completed registration. buyAndClaim requires the current signer to be the recipient; it cannot silently claim for another wallet. A user declining the second signature can claim later. Native transfer acceptance clears all profile data.

## Resolver reads and writes

Access through client.resolver. Identity/profile aliases above are also available here.

| Method | Arguments/semantics |
| --- | --- |
| exists(domain), getRoot(domain), getOwner(domain) | Low-level root reads; getOwner needs verifyOwner:true for native identity |
| getAddr(domain,coinType) | Binary record or null |
| addr(domain,coinType) | Same record; empty Buffer if unset |
| resolveAddress(domain,coinType=21337) | Codec-decoded explicit receiving address, owner verified; null if unset |
| getText(domain,key) | Strict UTF-8 string or null |
| text(domain,key) | Empty string if unset |
| getRecordKeys(domain) | Addresses, named texts and unnamed legacy state keys |
| setAddress({label,tld,coinType,address}) | Validates human address and encodes bytes |
| setAddr({label,tld,coinType,addr}) | Advanced binary write;1..128 bytes |
| clearAddr({label,tld,coinType}) | Remove address and descriptor |
| setText({label,tld,key,value}) | Generic bounded UTF-8 text write |
| clearText({label,tld,key}) | Remove text/name-slot/descriptor |
| setProfile({label,tld,set?,clear?}) | Atomic Global Keys batch; null if unchanged |
| setPrimary({label,tld,flag}) | Set/unset configured primary candidate |
| reset({label,tld}) | Owner or treasury clears records/primary, keeps token |
| lock(args) | Retired; throws UNSUPPORTED_OPERATION without signing |
| setContentURI({label,tld,uri}) | Canonical ipfs://CID under text key contenthash |
| clearContentURI({label,tld}) | Clear contenthash text |
| getContentURI(domain) | Validated canonical IPFS URI or null |
| getContentHash(domain) | ENSIP-7 IPFS byte representation or null |

setProfile set/clear use ten Global Keys in profile-v2 order: avatar, description, display, email, keywords, mail, notice, location, phone, url. Typed validation includes display casing, E.164 phone, basic email and supported media/website URIs. Generic setText intentionally does not enforce those field meanings. Profile, services and custom texts share fifteen slots. Service/custom writes use setText; they are not silently included in the Global batch.

## Administration and utilities

client.controller exposes addTld(tld), removeTld(tld), pause(), unpause(), isTldEnabled(tld), listTlds(extraKnown), hasRole(role,address). listTlds returns configured/known names, not an authoritative enumeration of all state entries. hasRole recognizes only treasury admin; client.treasury.setRole always throws unsupported.

Utilities include normalizeDomainInput, domainFields, profilePatchFields, diffProfile, parameters, encodeAddress, decodeAddress, canonicalAddressBytes, normalizeContentURI, encodeContentHash, decodeContentHash, mediaURL, fetchMetadata, getDomainDisplayName, createWalletKitSigner and waitValidated. Inspect TypeScript declarations for complete option shapes. Raw parameter builders are advanced APIs and do not replace typed semantic validation.

Supported human codecs: BTC (0), ETH (60), XRP (144), TRX (195), SOL (501), XAH (21337). Other bounded coin IDs use raw bytes/hex. Legacy535/345 are not aliases. High-bit EVM IDs are rejected by the current uint16 index.

## Receipts and errors

TxResult includes txHash, engineResult, hookReturnCode, hookReturnString, status, hookExecutions and rawMeta. Issuance status is pending until claim. Success requires validated tesSUCCESS plus the expected treasury/handler hash and operation acknowledgement. Wrong network, no signer, unsupported operations, malformed state/codecs, rejection and ambiguous confirmation are separate errors. Keep any returned transaction hash and check ledger/wallet history before retrying; the SDK does not automatically repay an ambiguous purchase.

## Error presentation

explainError(error) returns an English title/message, failure stage, code, actual handler/hash, requested handler, txHash, engineResult and a recovery category. It does not authorize automatic retry. Receipt failures preserve the actual failing hook from the installed hash map, even when another handler was requested. Missing validated:true is rejected.

A weak claim/burn failure can coexist with validated tesSUCCESS: the native token operation is already final. The helper explicitly directs operator recovery rather than claiming it rolled back. Keep raw errors and HookExecutions in technical Activity. See [the error review](review/ERROR-UX.md).

## Lifecycle reconciliation

`await client.registrar.reconcile("alice.xah")` submits one explicit strong Invoke with opcode17. It never resends a buy, transfer claim or burn. The hook resolves the native owner/existence and resumes its journal. This requires a deployment supporting Invoke17; the reviewed testnet deployment installed on 2026-10-23 includes it. Inspect `getRegistrationStatus` and the validated receipt before any retry. Journals quarantine owner/profile resolution even when root/native owner happen to match. Pending/refund/mint/offer tracking prevents a root being called claimed. Failed refund settlement and pre-journal lost identity evidence still require operator recovery.

`createWalletKitSigner` prepares missing Fee with the supplied Xahau client.autofill before prompting the wallet, then checks maxFeeDrops and pins the exact fee in the request/receipt intent. Request-only transports must supply Fee explicitly. Missing, malformed or excessive fees fail before signing. Wallet providers must honor the supplied transaction; post-validation intent comparison detects substitution but cannot undo a provider-signed transaction. Diagnostics refer to the configured network rather than assuming Testnet.
