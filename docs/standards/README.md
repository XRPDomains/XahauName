# XahauName Improvement Proposals (XNIPs)

Project interoperability specifications. All entries below are Draft, implemented in release 0.3.0 within their documented subsets, and subject to maintainer review. They are not official Xahau network standards or ENS ABI implementations.

| ID | Topic | Version | Component |
| --- | --- | --- | --- |
| [0000](xnip-0000-process.md) | Proposal process |0.1.0 | governance |
| [0001](xnip-0001-names.md) | Names and token identity |0.1.0 | hook + SDK |
| [0002](xnip-0002-records.md) | Text, custom and website content |0.2.0 | storage + SDK |
| [0003](xnip-0003-addresses.md) | Multichain receiving addresses |0.1.0 | storage + SDK codecs |
| [0004](xnip-0004-primary.md) | Native primary and forward confirmation |0.2.0 | hook candidate + verified reader |
| [0005](xnip-0005-avatar.md) | Avatar and metadata display |0.1.0 | SDK + UI |

Use [the template](TEMPLATE.md) for new proposals. IDs are permanent. Implementing an optional reader does not mean every protocol, URI scheme or coin is supported. [Release evidence](../review/releases/0.3.0.md) identifies tested deployment and scope.

Authority, bounded storage and upgrade constraints remain in [the protocol](../SPEC.md). Rich field validation lives in SDK/UI; hook authorization and atomic cleanup remain mandatory.
