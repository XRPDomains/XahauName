# Changelog

## 0.3.1 — 2026-10-28

- Require SDK ^0.3.1 for synchronized deployment identity and lifecycle validation.
- Harden ledger replay, bootstrap and checkpoint recovery; preserve lifecycle evidence when projecting ownership and pending registrations.
- Retain cleanup and reconciliation evidence across transfer, burn and refund recovery.
- Improve incremental projection reads and validate lifecycle behavior against native-ledger fixtures.

## 0.3.0

- Introduce validated-ledger replay, SQLite projections and a persistent event outbox.
- Provide ownership/profile queries and an example HTTP/SSE server.
