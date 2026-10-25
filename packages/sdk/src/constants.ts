/**
 * @xahauname/sdk — Constants
 */

/** SLIP-0044 coin types for multi-chain addr records */
export const COIN_TYPES = {
    BTC: 0,
    ETH: 60,
    ATOM: 118,
    XRP: 144,
    BCH: 145,
    XLM: 148,
    TRX: 195,
    SOL: 501,       // SLIP-0044. Historical app records at 345 are not migrated.
    XAH: 21337,     // SLIP-0044; independent of mainnet/testnet NetworkID.
    BNB: 714,
} as const;

/** Historical app assignments, NOT SLIP-0044 aliases. Never migrate implicitly. */
export const LEGACY_COIN_TYPES = { XAH_LOCAL:535, SOL_LOCAL:345 } as const;

/** ENS-convention text keys supported by sweep + indexed cleanup */
export const TEXT_KEYS = {
    DISPLAY: 'display',
    MAIL: 'mail',
    PHONE: 'phone',
    AVATAR: 'avatar',
    DESCRIPTION: 'description',
    URL: 'url',
    EMAIL: 'email',
    NOTICE: 'notice',
    KEYWORDS: 'keywords',
    TWITTER: 'com.twitter',
    GITHUB: 'com.github',
    DISCORD: 'com.discord',
    REDDIT: 'com.reddit',
    LINKEDIN: 'com.linkedin',
    TELEGRAM: 'org.telegram',
    NAME: 'name',
    LOCATION: 'location',
    CONTENTHASH: 'contenthash',
} as const;

export {STANDARD_TEXT_KEYS as SWEEP_TEXT_KEYS} from "./protocol.generated";

/** Hook return codes; see docs/SPEC.md */
export enum ReturnCode {
    OK = 0,
    WRONG_TX_TYPE = 1,
    NO_MEMO = 2,
    BAD_MEMO = 3,
    UNKNOWN_OP = 4,
    LABEL_INVALID = 10,
    DOMAIN_NOT_REG = 11,
    NOT_OWNER = 12,
    FROZEN = 13, // Reserved legacy code; owner profile locking is disabled.
    UNSUPPORTED_TRANSFER = 65,
    STATE_ERR = 20,
    ALREADY_REG = 31,
    TLD_DISABLED = 33,
    HAS_WHITESPACE = 34,
    TLD_INVALID = 36,
    NOT_ADMIN = 40,
    BAD_ADMIN_ARG = 41,
    UNDERPAYMENT = 50,
    PRICING_NOT_SET = 51,
    PAUSED = 52,
    IOU_REJECTED = 53,
    PARTIAL_PAYMENT = 54,
    ALREADY_PENDING = 55,
    PRICE_OVERFLOW = 57,
    PRICE_WRONG_COUNT = 58,
    HEX_MALFORMED = 59,
    EMIT_FAIL = 60,
    CBAK_UNKNOWN = 61,
    INDEX_FULL = 62,
    URI_BASE_NOT_SET = 63,
    CUSTOM_URI_FORBIDDEN = 64,
}

/** Reverse map of ReturnCode → name */
export const RC_NAMES: Record<number, string> = Object.fromEntries(
    Object.entries(ReturnCode)
        .filter(([k]) => isNaN(Number(k)))
        .map(([k, v]) => [v as number, 'RC_' + k])
);

/** Memo + namespace constants */
export const NAMESPACE_SEED = 'XAHAU_NAME_V1';
export const MEMO_TYPE_STR = 'xahau_name:op:v1';
export const MEMO_FORMAT_STR = 'application/json';

/** Payment flags */
export const TF_PARTIAL_PAYMENT = 0x00020000;

/** Hook state layout constants */
import {STATE_LAYOUTS} from './state-layouts.generated';
export {STATE_LAYOUTS};
export const ROOT_LEN = STATE_LAYOUTS.root.length;
export const ROOT_FLAG_PRIMARY = STATE_LAYOUTS.root.primaryFlag;
export const ROOT_FLAG_LOCKED = STATE_LAYOUTS.root.legacyLockedFlag;
export const PRICING_LEN = STATE_LAYOUTS.pricing.length;
export const PRICING_VERSION = STATE_LAYOUTS.pricing.version;

/** URIToken formula prefix (XLS-45) */
export const URITOKEN_PREFIX = Buffer.from([0x00, 0x55]);
