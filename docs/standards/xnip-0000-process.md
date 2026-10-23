# XNIP-0000: Standard process and compatibility

- Status: Draft
- Version: 0.1.0
- Created: 2026-10-23
- Category: Process
- Scope: XahauName project

## Purpose

Allow independently versioned name, record, resolution and wallet conventions to evolve
without adding a hook opcode for every profile field.

## Terminology

MUST, MUST NOT, SHOULD and MAY express requirements of the named standard/version.
A Draft requirement is a proposed requirement, not proof the installed hook enforces it.

## Lifecycle

Draft -> Review -> Final. Proposals may instead become Stagnant or Withdrawn. A replaced
Final specification becomes Superseded and links its replacement. IDs MUST NOT be reused.
Final status requires explicit maintainer acceptance, a stable specification, applicable
positive/negative tests and documented implementation/deployment evidence. SDK-only
conventions need SDK evidence; on-chain claims need exact-artifact and testnet evidence.
No draft in this initial registry has received Final status.

## Versioning

Each document MUST identify its status, semantic version, category, dependencies, data
format, validation, unset/error behavior, security, compatibility and conformance tests.
A breaking interpretation MUST use a major version or a new explicitly superseding XNIP.
A clarification MUST NOT silently change old bytes, key meanings, field masks or opcodes.
A record format that cannot be distinguished safely MUST use an explicit version/key or
migration; SDK version numbers alone do not version ledger data.

## Responsibility boundary

Hook: authorization, state consistency, byte/count bounds, atomic writes and cleanup.
SDK: address/content/media codecs, conventions, resolution and read-time validation.
UI: understandable controls and feedback; it MUST NOT be the only authorization boundary.
A client bypassing the SDK can write convention-invalid data, so conforming readers MUST
validate records rather than assume all on-chain values follow a convention.

## Conformance declarations

Name the XNIP/version and component: storage, SDK writer, SDK reader or UI. Record
network, treasury/namespace and installed hashes when making deployment claims.
An index containing a proposal does not mean it is shipped. Accepting a URI string does
not mean a resolver supports its scheme. SDK-only policies do not remove native authority.

## Adding a standard

Copy TEMPLATE.md, choose an unused ID through the registry, state dependencies, include
examples and rejection cases, and identify the minimal hook changes, if any. Review the
proposal and tests before updating status. Do not require the whole system to implement
unrelated optional XNIPs. Maintain a compatibility/deployment matrix in release notes.
