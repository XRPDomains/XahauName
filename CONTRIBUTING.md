# Contributing

Use focused changes with matching protocol/SDK documentation. Source paths and commands are in [README](README.md).

During development, run focused tests for the behavior changed and typecheck affected client code. Do not rerun the full SDK/application suites for spacing, color or copy-only edits. Do not add tests that only mirror markup or duplicate existing coverage. CI runs the full automated suites. Hook changes require affected production artifacts to pass the unchanged native checker and model probes. A shared-header change requires rebuilding the complete chain. CI never deploys.

Browser, responsive-layout and screenshot checks are manual, on explicit request; do not run them as routine verification. Screenshots require the separate `--screenshots` opt-in even when a browser check is launched. Use the Vite development server while iterating; create a frontend production build only when requested or preparing an explicitly requested release.

Keep generated builds, private environment files, signing material and local reports out of Git. Environment examples contain placeholders only. Do not silently migrate custom-key descriptors or rewrite user state. Preserve third-party attribution and license notices.

Interoperability changes should include a versioned XNIP. Draft standards are not network standards; promotion to Final requires maintainer approval and compatibility evidence.

A release includes source, package locks, deployment identity and a compact validation summary, without compiled artifact history. Package publication and Git commits are explicit release operations.
