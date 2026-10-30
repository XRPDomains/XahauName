# XahauName Improvement Proposals

XNIPs define shared conventions for applications, wallets, resolvers and tooling. They give names, records and identity presentation a versioned vocabulary that can evolve alongside the hook and SDK.

The protocol provides bounded on-chain storage and authorization. XNIPs describe how SDKs and applications interpret that data, including optional formats that do not require a new hook operation.

## Registry

| ID | Topic | Version | Status | Implementation area |
| --- | --- | --- | --- | --- |
| [0000](xnip-0000-process.md) | Proposal process and compatibility | 0.1.0 | Draft | Project governance |
| [0001](xnip-0001-names.md) | Names and token identity | 0.1.0 | Draft | Hook and SDK |
| [0002](xnip-0002-records.md) | Text, custom and website content | 0.2.0 | Draft | Records and SDK conventions |
| [0003](xnip-0003-addresses.md) | Multichain receiving addresses | 0.1.0 | Draft | Storage and codecs |
| [0004](xnip-0004-primary.md) | Primary and verified ownership | 0.3.0 | Draft | Selection and verified resolution |
| [0005](xnip-0005-avatar.md) | Avatar and metadata presentation | 0.1.0 | Draft | SDK and UI |

## Implement a convention

Read the proposal's scope and formats, then use the [SDK API](../API.md) or inspect the [source guide](../ARCHITECTURE.md#sdk). The [protocol](../SPEC.md) remains authoritative for operation encoding, permissions, bounds and cleanup.

These are XahauName project specifications. Draft status does not imply an official Xahau network standard or compatibility with every ENS interface.

## Propose an extension

Start from the [template](TEMPLATE.md) and follow [XNIP-0000](xnip-0000-process.md). IDs are permanent; proposals record version, scope, compatibility and implementation requirements. Validation records belong in [review documentation](../review/README.md).
