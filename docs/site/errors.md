# Errors & reliability

Separate a rejected action from an **unknown outcome**. Losing a connection after signing does not prove that nothing happened.

## Handle SDK errors

```ts
import {explainError} from '@xahauname/sdk';

try {
  await writer.resolver.setText({
    label: 'alice', tld: 'xah', key: 'description', value: 'Hello',
  });
} catch (error) {
  const info = explainError(error);
  console.log(info.stage, info.code, info.txHash, info.recovery);
  // Persist any hash. Choose the next action; do not blindly resubmit.
}
```

`explainError()` formats guidance. It does not repair state or authorize a retry.

## Stages and next actions

| Stage | Check |
| --- | --- |
| `connection` | Endpoint/network and connectivity; bounded read retry is appropriate |
| `validation` | Input, name, recipient, limits and required fields; no signature may have been requested |
| `wallet` | Account, network, cancellation, fee cap and any provider request/hash |
| `ledger` | Validated engine result and hook trace, not only the preliminary submit response |
| `mint`, `offer`, `claim` | Registration progress and native token ownership |
| `burn`, `refund` | Validated native result and remaining cleanup/settlement state |
| `confirmation`, `unknown` | Receipt and domain status before any new write |

Recovery values are `reconnect`, `correct-input`, `check-status`, `operator` or `none`. Keep the original error/receipt for diagnostics.

## Common SDK codes

| Code | Meaning / response |
| --- | --- |
| `RPC_CONNECTION_FAILED` | Reconnect for reads; if signing/submission might have happened, check status first |
| `TIMEOUT`, `NOT_VALIDATED`, `ABORTED` | Consumer wait ended or confirmation is unknown; do not infer transaction failure |
| `INVALID_ARGUMENT`, `BAD_ADDRESS` | Correct the supplied input |
| `WRONG_NETWORK`, `NO_SIGNER` | Select the intended network/account and recreate the signer |
| `SIGN_FAILED` | Inspect wallet/request status; do not automatically sign another payment |
| `OWNERSHIP_MISMATCH`, `CLAIM_NOT_FINALIZED` | Stop ordinary writes and investigate ledger/root consistency |
| `HOOK_NOT_EXECUTED`, `WRONG_HOOK`, `BAD_STATE` | Expected execution/state could not be verified; inspect configuration and receipt |
| `REGISTRATION_FAILED` | Inspect the registration stage and refund evidence; do not buy again |

Insufficient balance/reserve and `tecHOOK_REJECTED` are ledger outcomes, not generic connectivity failures. Hook return codes and engine codes are separate; the [SPEC return-code table](../SPEC.md#9-return-codes) explains numeric hook codes.

## Pending, refund and recovery

Use `client.read.getDomain({name})`. `awaitingClaim` means the intended recipient can claim; `pending` means mint/offer processing has not finalized.

`refundPending` is unresolved tracking, not proof a refund is still running. `registrar.getRefundStatus(name)` reports `notTracked`, `unknown`, `unvalidated`, `failed` or `paid`. Even `paid` does not prove callback cleanup completed. There is no public refund retry operation in this release.

`recoveryRequired` means native custody and domain finalization need reconciliation. Opcode 17 can resume eligible journaled lifecycle cleanup; it cannot settle failed refunds or reconstruct missing historical evidence. Operators should inspect the native token, pending data and journal before preparing it. Never repeat the original purchase, claim or burn to repair cleanup.

## RPC usage

Public presets are `wss://xahau-test.net` and `wss://xahau.network`. Select network/deployment together; the [deployment page](deployment.md) shows the configured endpoint. Public endpoints have no latency or availability promise here; do not assume a fixed provider rate limit.

Reuse one client, pin related reads with `read.snapshot()`, and request only needed records. For transient read failures, use a small retry budget with exponential backoff and jitter, for example delays around 0.5, 1 and 2 seconds. Stop on malformed data, ownership mismatch or wrong network. Never put signing/submission in the read-retry loop.

The read facade defaults to a 15-second deadline; client concurrency defaults to six reads. An unavailable historical ledger needs an archival endpoint or a new snapshot, not repeated requests for pruned data.
