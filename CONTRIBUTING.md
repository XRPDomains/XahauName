# Contributing

Use focused changes with matching protocol/SDK documentation. Source paths and commands are in [README](README.md).

Run SDK/application tests and typechecks for client changes. Hook changes require affected production artifacts to pass the unchanged native checker and model probes. A shared-header change requires rebuilding the complete chain. CI never deploys.

Keep generated builds, private environment files, signing material and local reports out of Git. Environment examples contain placeholders only. Do not silently migrate custom-key descriptors or rewrite user state. Preserve third-party attribution and license notices.

Interoperability changes should include a versioned XNIP. Draft standards are not network standards; promotion to Final requires maintainer approval and compatibility evidence.

A release includes source, package locks, deployment identity and a compact validation summary, without compiled artifact history. Package publication and Git commits are explicit release operations.
