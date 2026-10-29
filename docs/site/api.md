# Indexer & API

Direct SDK reads query Xahau. The optional indexer builds a local projection from validated ledger data for faster lists, history and application events. **The ledger remains authoritative.**

## When to use it

Use the SDK alone for a small integration. Add an indexer when you need searchable profiles, large portfolios or event-driven updates without repeated full discovery.

The indexer does not sign transactions. Applications still use the SDK and a wallet for writes, then verify important state on-chain.

## Example HTTP endpoints

These are routes exposed by the repository's server example, not a hosted public API:

| Route | Purpose |
| --- | --- |
| `GET /status` | Network identity, checkpoint and synchronization status |
| `GET /profile?domain=alice.xah` | Indexed domain profile |
| `GET /owned?address=r...` | Indexed owned domains |
| `GET /incoming?address=r...` | Incoming offers |
| `GET /primary?address=r...` | Indexed primary candidate |
| `GET /events?after=0&limit=100` | Cursor-based event replay |
| `GET /stream?after=0` | Server-sent events |

## Events and historical data

Native ownership changes and finalized domain changes are distinct events. Consumers should deduplicate by event ID and preserve delivery cursors. SSE reconnects can replay events after the last acknowledged cursor.

Bootstrap captures current on-chain state; it does not recreate earlier event history. Complete past events require a suitable starting snapshot and archival ledger coverage. Check checkpoint age, sync errors and observed head rather than assuming a responding API is current.

## Operate your own service

Use the same network/deployment configuration as the SDK. Keep separate databases for different network identities. Expose the example service through HTTPS with appropriate access controls and rate limits.

See the [indexer package](https://github.com/XRPDomains/XahauName/tree/main/packages/indexer) and [API reference](https://github.com/XRPDomains/XahauName/blob/main/docs/INDEXER.md) for setup and event schemas.
