// Generated from protocol/state-layouts.json. Run node scripts/sync-protocol.mjs --write.
export const STATE_LAYOUTS = {
  "schemaVersion": 1,
  "namespaceSeed": "XAHAU_NAME_V1",
  "byteOrder": "BE",
  "root": {
    "length": 32,
    "owner": 0,
    "flags": 20,
    "mintedAt": 21,
    "reserved": 29,
    "primaryFlag": 1,
    "legacyLockedFlag": 2,
    "timeEpoch": "ripple-2000"
  },
  "pending": {
    "length": 32,
    "destination": 0,
    "amountDrops": 20,
    "flags": 28
  },
  "pricing": {
    "length": 81,
    "version": 1,
    "prices": 1,
    "tiers": 10,
    "priceBytes": 8
  },
  "records": {
    "length": 124,
    "version": 1,
    "addressCount": 1,
    "textCount": 3,
    "addresses": 4,
    "addressBytes": 2,
    "texts": 34,
    "textBytes": 6,
    "maxAddresses": 15,
    "maxTexts": 15
  },
  "customTextSlot": {
    "stateKeyBytes": 32,
    "maxNameBytes": 40,
    "legacyLength": 32
  },
  "recovery": {
    "version": 1,
    "versionOffset": 0,
    "hadRoot": 1,
    "tokenId": 2,
    "originalRoot": 34,
    "nameLength": 66,
    "name": 67,
    "maxNameBytes": 66
  },
  "prefixes": {
    "labelOf": "lof:",
    "uri": "uri:",
    "pending": "pending:",
    "mint": "mnt:",
    "offer": "ofr:",
    "refund": "rfd:",
    "recovery": "rcv:"
  },
  "abiOwners": {
    "root": "claim",
    "token": "issuance",
    "labelOf": "issuance",
    "uri": "claim",
    "pending": "issuance",
    "mint": "issuance",
    "offer": "issuance",
    "refund": "issuance",
    "recovery": "claim",
    "primary": "control",
    "records": "profile",
    "customTextSlot": "set-text",
    "text": "set-text",
    "address": "set-address",
    "pricing": "admin",
    "uriBase": "admin",
    "paused": "admin",
    "tld": "admin"
  }
} as const;
