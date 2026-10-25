// Generated from protocol/schema.json. Run node scripts/sync-protocol.mjs --write.
export const OPERATIONS = {"noop":0,"register":1,"buy":2,"setPrimary":3,"setAddr":4,"clearAddr":5,"setText":6,"clearText":7,"lock":8,"reset":9,"setPricing":10,"addTld":11,"removeTld":12,"pause":13,"unpause":14,"setURIBase":16,"reconcile":17} as const;
export const STANDARD_TEXT_KEYS = ["avatar","description","url","email","notice","keywords","com.twitter","com.github","com.discord","com.reddit","com.linkedin","org.telegram","name","location","contenthash","display","mail","phone"] as const;
export const LEGACY_PROFILE_TEXT_KEYS = ["name","description","avatar","url","email","location","com.twitter","com.github","org.telegram","com.discord"] as const;
export const PROFILE_TEXT_KEYS = ["avatar","description","display","email","keywords","mail","notice","location","phone","url"] as const;
