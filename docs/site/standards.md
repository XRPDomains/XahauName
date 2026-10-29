# Standards & limits

XNIPs define XahauName's naming, records and identity conventions. They are **project specifications in Draft status**, not official Xahau network standards or a claim of full ENS compatibility.

## Current conventions

| XNIP | Defines |
| --- | --- |
| 0001 | Canonical names and domain–token identity |
| 0002 | Text, custom keys and website content |
| 0003 | Multichain receiving addresses |
| 0004 | Primary selection and forward confirmation |
| 0005 | Avatar and metadata presentation |

Read the [versioned XNIP registry](https://github.com/XRPDomains/XahauName/blob/main/docs/standards/README.md) for exact formats.

## Names

Canonical names use `label.tld`. Labels contain 1–57 lowercase ASCII letters, digits or internal hyphens, with alphanumeric endpoints. TLDs have 2–8 lowercase ASCII letters/digits and must be enabled. Reserved labels include `xahau`, `treasury`, `admin`, `root` and `www`.

The interface may remove whitespace, lowercase input and append `.xah`; integrations must still validate against protocol rules. This release has no subdomains, Unicode names, expiry or renewals.

## Profiles and custom keys

The ten Global Key names are `avatar`, `description`, `display`, `email`, `keywords`, `mail`, `notice`, `location`, `phone`, `url`. XahauName uses `display` as free-text presentation, including spaces and Unicode; it never replaces the canonical domain identity.

Text keys normalize to lowercase ASCII letters/digits plus `.`, `_`, `-`, with 1–40 characters. Values allow 1–128 UTF-8 bytes. Global, service and custom keys share **15 text slots per domain**. Keep secrets and sensitive personal data out of public records.

## Addresses and primary

Address values use chain-specific binary codecs, not interchangeable address strings. The current index supports coin types 0–65535, up to 15 address records per domain and 1–128 bytes per address. XAH uses coin type 21337; XRP uses 144.

A verified primary must belong to the wallet and resolve through its native-XAH receiving record back to that wallet. A selected name alone is not a verified reverse identity.

## Content and media

Website content uses an IPFS reference stored through the text-record convention. Avatar and token metadata URIs point to presentation resources. URI bytes are on-chain; the referenced files are not HookState. See [on-chain model](on-chain.md).
