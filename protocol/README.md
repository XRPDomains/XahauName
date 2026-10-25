# Wire registry

[schema.json](schema.json) defines deployed operation IDs, standard text tags and the two atomic-profile key orders. The C handlers and SDK must preserve these wire assignments across refactors. Locked/retired operation 8 and reserved gap 15 are not reusable IDs.

[state-layouts.json](state-layouts.json) records binary state offsets, sizes, BE integer encoding, Ripple epoch and logical ABI ownership. Synchronization generates SDK constants and verifies the matching C macros without rewriting hook source. SDK/indexer decoding and the [explorer generator](../explorer/README.md) share this layout registry.

After an intentional schema edit, regenerate and inspect the diff:

```sh
node scripts/sync-protocol.mjs --write
node scripts/sync-protocol.mjs
```

Run from the repository root. The generator updates SDK constants and the existing C string/length/packed-word/profile-bitmap tables; it does not add a runtime parser or change state encoding. CI verifies that checked-in outputs match. Any C source change requires rebuilding and checking all affected artifacts. Profile-v1 and profile-v2 probes protect their existing bitmap meanings. Normative behavior remains in the [protocol specification](../docs/SPEC.md) and [standards registry](../docs/standards/README.md).
