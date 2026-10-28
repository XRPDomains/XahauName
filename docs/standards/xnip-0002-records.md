# XNIP-0002: Text, custom records and website content

- Status: Draft
- Version: 0.2.0
- Created: 2026-10-23
- Category: Records
- Depends on: XNIP-0000, XNIP-0001

## Storage and semantics

Keys MUST normalize to lowercase ASCII letters/digits/dot/underscore/hyphen, length 1..40. Typed text values MUST be valid UTF-8, length 1..128 bytes. Fifteen text slots are shared by Globals, services and custom keys. Writers MUST persist custom key names in the records index/name slots. Readers MUST expose textKeysComplete=false for legacy unnamed slots rather than invent names.

Global Key names follow [ENSIP-5](https://docs.ens.domains/ensip/5/): avatar, description, display, email, keywords, mail, notice, location, phone, url. XahauName defines display as an optional free-text profile name (up to 128 UTF-8 bytes), including Unicode, spaces and mixed case. This differs from the ENSIP-5 display convention. The canonical domain remains the identity used for resolution and authorization; display never changes it. Typed profile writers validate E.164 phone, basic email and supported avatar/website URI formats. Applications MAY enforce stricter product rules. Generic setText does not enforce field semantics, so typed readers MUST validate before use.

Service keys use reversed namespaces, for example com.github and org.telegram. Custom namespaces MUST NOT claim ownership, primary or admin authority. Unknown keys remain opaque strings, escaped as text in UI.

## Atomic profile

Profile-v2 maps the ten Globals in the order above to mask bits 0..9. Set/clear masks are disjoint; p0..p9 carry only set values. All updates MUST succeed atomically with one Invoke. An unchanged SDK patch MUST avoid requesting a signature. Legacy profile-v1 meanings remain fixed; clients MUST NOT reinterpret its bits as Globals.

## Website content

The contenthash text record MUST contain a canonical `ipfs://CID` root URI for this version. SDK normalizes to CIDv1 base32 and rejects paths, query, fragment, invalid CID and unsupported protocols. Empty/unset is represented by deletion, not an empty on-chain value.

encodeContentHash/decodeContentHash provide the IPFS subset of [ENSIP-7](https://docs.ens.domains/ensip/7/) (multicodec prefix e301 plus CIDv1). This is an adapter: the actual ledger record remains text. No separate binary contenthash field/opcode, Swarm, IPNS or DNS binding is implemented. A future Web2 gateway MAY resolve this record; it must define host ownership/TLS/cache policies separately.

## Cleanup, errors and security

Transfer, burn and reset MUST clear all texts and custom-key names including contenthash. Hook writers enforce atomic state bounds, not JSON/CID/URL parsing. Invalid UTF-8 fails typed reads; invalid content record fails the typed content reader. Missing getText/getContentURI returns null; text facade returns empty string.

External content may be malicious or unavailable. UI MUST escape text and treat links/images as external resources. Legacy custom display/mail/phone descriptor collisions require explicit migration before upgrading their new standard tags.

## Evidence

Hook profile/index/capacity/rollback probes, typed SDK UTF-8/content tests including the ENSIP-7 example, and live one-signature Globals/custom/content/cleanup checks. See [release validation](../review/releases/0.3.0.md).
