# Assurance and review

[Workspace migration verification](WORKSPACES.md) covers the `packages/` layout, shared lock and isolated npm tarball consumer.

Latest [full source Open Code Review report](OPEN-CODE-REVIEW.md): two high and two medium open findings with deterministic reproductions.

Current [indexer implementation evidence and open gates](INDEXER.md) complement the original event/indexing proposal.

Review material is kept here; normative protocol and API documents remain in docs/, standards in docs/standards/, and operational quickstarts next to their components.

| Document | Purpose |
| --- | --- |
| [Test matrix](TEST-MATRIX.md) | Automated coverage, missing gates and manual exceptions |
| [Findings](FINDINGS.md) | Current correctness/reliability findings with disposition |
| [Error UX](ERROR-UX.md) | User messages versus ledger/hook diagnostics |
| [Events and indexing](EVENTS-AND-INDEXING.md) | Verified transport capabilities and proposed indexer design |
| [Release 0.3.0](releases/0.3.0.md) | Deployment identity and original live evidence |

Large generated logs, screenshots, WASM and probe JSON stay under ignored hook/build/current/. Obsolete build/research trees and superseded reports have already been removed from the active repository. Do not add informal progress notes beside source. Keep one current finding register; retain a release report only when it preserves deployment/test evidence.

Status labels: verified unit/model, verified live, proposed, and open release gate. A passing model is not a claim of native fault-injection coverage. New checks in this review run without changing or redeploying hook C.
