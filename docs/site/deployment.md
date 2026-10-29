# Network & deployment

The following public values come from the selected app network and deployment configuration. Inspect the treasury on the explorer to compare the current installed chain. This page is a configuration reference, not a live RPC status check.

## Selected deployment

{{deployment}}

## Hook hashes

{{hooks}}

## Change network deliberately

`resolveNetworkConfig({network: 'testnet'})` selects the bundled testnet deployment. `network: 'mainnet'` requires an explicit mainnet treasury, namespace and hook hashes; testnet identities are not mainnet defaults.

The app's `VITE_NETWORK`, `VITE_WSS` and optional `VITE_DEPLOYMENT_JSON` are build-time public settings. Rebuild for changed settings. The SDK checks network and configured hook identity before normal use.

Source: [deployment manifests](https://github.com/XRPDomains/XahauName/tree/main/deployments) and [network configuration](https://github.com/XRPDomains/XahauName/blob/main/docs/NETWORKS.md).
