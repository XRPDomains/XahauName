# XNIP-0005: Avatar and token metadata display

- Status: Draft
- Version: 0.1.0
- Created: 2026-10-23
- Category: Media / SDK
- Depends on: XNIP-0000, XNIP-0001, XNIP-0002

## Resolution

The avatar Global Key MAY contain a supported direct HTTPS or IPFS image URI. A typed writer MUST validate its allowed scheme; a reader MUST treat malformed/unsupported records as unavailable. getAvatar pins a validated identity lookup before resolving the record. This is the direct-image subset of [ENSIP-12](https://docs.ens.domains/ensip/12/), not full NFT avatar or data-URI support.

The caller MAY explicitly enable fallbackToMetadata. If no supported avatar is available, the SDK then reads the recognized native token URI and fetches its metadata image. Return source MUST distinguish avatar from token-metadata. NFT metadata artwork is not the same thing as a user-selected avatar.

## Safety and display

External media is untrusted and can disappear/change. Fetchers SHOULD bound response/time and validate fields; browsers MUST use safe schemes and avoid rendering arbitrary returned HTML. Server-side deployments SHOULD apply outbound request policy appropriate to their environment. Gateway choice is an application dependency, not ledger ownership proof.

UI SHOULD render artwork in a square container, preserve aspect ratio and expose a fallback for missing images. URIBase changes affect future mints, not existing immutable URIs. The hook stores identity and pointers, not fetched image bytes.

## Compatibility and tests

Transfer, burn and reset clear avatar with other text records. Existing metadata URIs remain independent. Tests cover allowed/forbidden schemes, direct-avatar priority, explicit metadata fallback, missing records and square artwork. Adding NFT ownership proofs, IPNS or data URIs requires a new version and corresponding tests.
