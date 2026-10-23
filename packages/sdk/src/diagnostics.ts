export type FailureStage = 'connection' | 'validation' | 'wallet' | 'ledger' | 'mint' | 'offer' | 'claim' | 'burn' | 'refund' | 'confirmation' | 'unknown';
export interface ErrorExplanation {
    title: string;
    message: string;
    stage: FailureStage;
    code?: string | number;
    handler?: string;
    requestedHandler?: string;
    hookHash?: string;
    txHash?: string;
    engineResult?: string;
    recovery: 'reconnect' | 'correct-input' | 'check-status' | 'operator' | 'none';
}
/** Presentation only: raw errors/receipts remain available for debugging. Never authorizes a retry. */
export function explainError(error: unknown): ErrorExplanation {
    const e = (error && typeof error === 'object' ? error : {message: String(error)}) as any;
    const details = e.details ?? e.data ?? {};
    const failure = details.failure ?? {};
    const engine = details.engineResult ?? details.tx?.engineResult ?? details.engine_result ?? e.data?.engine_result;
    const code = e.code ?? engine ?? details.error;
    const txHash = e.txHash ?? details.txHash ?? details.tx?.txHash ?? details.hash ?? details.providerHash;
    const text = String(failure.returnString ?? e.message ?? '');
    const result: ErrorExplanation = {
        title: 'Action not completed',
        message: txHash ? 'We could not confirm this action. Check its transaction status before trying again.'
            : 'We could not complete this action. Open Activity for details. If you already approved a payment, check its status before trying again.',
        stage: 'unknown', code, handler: failure.handler, requestedHandler: failure.expectedHandler, hookHash: failure.hookHash,
        txHash, engineResult: engine, recovery: 'check-status',
    };
    const set = (title: string, message: string, stage: FailureStage, recovery: ErrorExplanation['recovery']) =>
        Object.assign(result, {title, message, stage, recovery});
    if (code === 'REGISTRATION_FAILED') {
        if (details.stage === 'refundPending')
            return set('Refund pending', 'A refund is being processed. Refresh registration status; do not send another purchase payment.', 'refund', 'check-status');
        return set('Registration needs recovery', 'Registration could not finish normally. Do not pay again; contact the operator with the domain and any transaction hash.', 'confirmation', 'operator');
    }
    if (details.validated === true && engine === 'tesSUCCESS' && ['claim', 'burn'].includes(failure.handler))
        return set('Domain needs recovery', 'The native token transaction is confirmed, but domain-state processing failed. Do not repeat the claim or burn; contact the operator with the transaction hash.', failure.handler, 'operator');
    if (code === 'RPC_CONNECTION_FAILED' || /You need to be connected to a ledger|connect\(\) timed out after \d+ ms/i.test(text) || ['ConnectionError', 'NotConnectedError', 'DisconnectedError'].includes(e.name)) {
        if (txHash || details.outcomeUnknown === true || details.providerRequestId)
            return set('Connection lost — check transaction status', 'The ledger connection is unavailable. Reconnect, then check this transaction before trying the action again. Do not send another purchase payment.', 'confirmation', 'check-status');
        return set('Unable to connect to Xahau', 'Could not load on-chain data. Please try again.', 'connection', 'reconnect');
    }
    if (['NOT_VALIDATED', 'TIMEOUT', 'ABORTED'].includes(String(code)) || /confirmation.*(unknown|still)|check the hash/i.test(text))
        return set('Confirmation pending', 'Confirmation is still unknown. Refresh the transaction or domain status; do not send another purchase payment.', 'confirmation', 'check-status');
    if (code === 'SIGN_FAILED') {
        if(txHash || details.outcomeUnknown === true || details.providerRequestId)
            return set('Wallet result needs checking', 'The wallet result could not be verified. Check the transaction or wallet request status before trying again. Do not send another purchase payment.', 'wallet', 'check-status');
        if(/Xahau verification failed: Signed fields changed: LastLedgerSequence$/.test(text))
            return set('Wallet changed the transaction expiry', 'The wallet changed the transaction expiry. Refresh the domain status before trying again.', 'wallet', 'check-status');
        return set('Wallet verification failed', 'The wallet could not sign or verify this transaction. Check your wallet and the action status before trying again.', 'wallet', 'check-status');
    }
    if (String(code) === '4001' || ['ACTION_REJECTED','SIGN_REJECTED','CONNECTION_REJECTED'].includes(String(code)) || /user (rejected|declined|cancelled)|request (rejected|declined) by/i.test(text))
        return set('Wallet request declined', 'The wallet request was declined. If purchase was already confirmed, use Claim domain later; do not buy again.', 'wallet', 'none');
    if (['tecUNFUNDED_PAYMENT', 'tecUNFUNDED', 'tecINSUFFICIENT_FUNDS', 'terINSUF_FEE_B', 'tecINSUFF_FEE', 'tecINSUFFICIENT_RESERVE', 'tecINSUF_RESERVE_OFFER', 'tecINSUF_RESERVE'].includes(String(code)))
        return set('Not enough available XAH', 'Your wallet needs enough XAH for this action, network fees and the ledger reserve. Add XAH on the selected network, then refresh the action status before trying again.', 'ledger', 'correct-input');
    if (code === 'actNotFound')
        return set('Wallet is not funded', 'Fund this wallet on the selected Xahau network, then refresh its balance.', 'ledger', 'correct-input');
    if (['NO_SIGNER', 'NOT_CONNECTED', 'WRONG_NETWORK', 'NETWORK_MISMATCH', 'NETWORK_NOT_SUPPORTED'].includes(String(code)) || /switch your wallet|incorrect NetworkID|account has changed|incorrect signing account/i.test(text))
        return set('Check your wallet', 'Connect the intended wallet on the configured Xahau network before continuing.', 'wallet', 'correct-input');
    if (/fee exceeds|fee.*configured limit/i.test(text))
        return set('Network fee exceeds limit', 'The requested network fee exceeds the configured safety limit. Refresh the fee estimate before signing.', 'wallet', 'correct-input');
    if (typeof code === 'number') {
        const messages: Record<number, [string, string]> = {
            3: ['Invalid request', 'Some required fields are missing or malformed. Refresh the form and check your inputs.'],
            4: ['Unsupported action', 'This action is not supported by the installed name service. Refresh the application.'],
            10: ['Invalid domain name', 'Use 1–57 letters or digits, with hyphens only inside the name. Reserved names and special characters are not allowed.'],
            11: ['Domain not found', 'This domain is not registered. Refresh its status before continuing.'],
            12: ['Owner permission required', 'The connected wallet does not own this domain. Switch wallets or refresh the domain owner.'],
            31: ['Domain is unavailable', 'This domain is already registered or reserved. Refresh its status and choose another name.'],
            33: ['TLD is unavailable', 'Registration for this TLD is disabled. Choose an enabled TLD.'],
            34: ['Whitespace is not allowed', 'Remove spaces, tabs and line breaks from the domain name.'],
            36: ['Invalid TLD', 'Use an enabled TLD containing 2–8 letters or digits.'],
            40: ['Administrator permission required', 'Only the name-service treasury can perform this action.'],
            41: ['Invalid configuration', 'Check the configuration values before submitting again.'],
            50: ['Price has changed or payment is too low', 'Refresh the current domain price. This is a price check, not a wallet-balance error.'],
            51: ['Pricing is not configured', 'Registration is not ready. The service operator must configure pricing.'],
            52: ['Registration is paused', 'New registrations are temporarily paused. Try again after the operator resumes registration.'],
            53: ['Native XAH required', 'Pay the domain price in native XAH, not an issued token.'],
            54: ['Partial payments are not supported', 'Use the standard domain purchase action without PartialPayment.'],
            55: ['Registration is already pending', 'A registration is already in progress. Refresh its status; do not pay again.'],
            62: ['Record limit reached', 'A domain supports up to 15 addresses and 15 total text records. Remove a record or include a clear action in the profile patch.'],
            63: ['Metadata base is not configured', 'Registration is not ready. The service operator must configure URIBase.'],
            64: ['Custom mint URI is not supported', 'The service constructs token metadata URIs from its configured base and your domain.'],
            65: ['Use a domain transfer offer', 'Transfer this domain using a restricted sell offer and recipient claim. Remit is not supported.'],
        };
        if (code === 20 || code === 60 || code === 61) {
            const stage: FailureStage = /refund/i.test(text) ? 'refund' : /offer/i.test(text) ? 'offer' : code === 60 ? 'mint' : code === 61 ? 'confirmation' : 'ledger';
            return set(code === 20 ? 'Domain state could not be updated' : 'Registration needs attention',
                'Check the transaction and domain status before continuing. Do not pay again; an operator may need to inspect the hook trace or pending refund.', stage, 'operator');
        }
        if (messages[code]) {
            const [title, message] = messages[code];
            return set(title, message, 'ledger', [51, 63].includes(code) ? 'operator' : [31, 55].includes(code) ? 'check-status' : 'correct-input');
        }
    }
    if (['CLAIM_NOT_FINALIZED', 'OWNERSHIP_MISMATCH'].includes(String(code)))
        return set('Domain needs recovery', 'Native token ownership and domain state could not be reconciled. Do not pay again; contact the operator with the transaction hash.', 'claim', 'operator');
    if (['HOOK_NOT_EXECUTED', 'BAD_METADATA', 'BAD_STATE', 'WRONG_HOOK'].includes(String(code)))
        return set('Domain state could not be verified', 'The application could not verify the expected domain state or hook result. Refresh status and contact the operator if it persists.', 'confirmation', 'check-status');
    if (['INVALID_ARGUMENT', 'INVALID_CONTENT_URI', 'INVALID_CONTENT_HASH', 'BAD_ADDRESS', 'NOT_RECIPIENT', 'NOT_CLAIMABLE', 'UNSUPPORTED_OPERATION'].includes(String(code)) || /^(Invalid |Enter |Use |The confirmation |Only |Signer required|No profile)/.test(text))
        return set('Check the form', text, 'validation', 'correct-input');
    if (['tecNO_ENTRY', 'tecEXPIRED', 'tecNO_PERMISSION'].includes(String(code)))
        return set('Offer is no longer available', 'The offer or permission may have changed. Refresh the domain and incoming offers before continuing.', 'ledger', 'check-status');
    return result;
}
