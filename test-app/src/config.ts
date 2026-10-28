import {resolveNetworkConfig, XAHAU_NETWORKS, type NetworkName, type NetworkOptions} from '../../packages/sdk/src/networks';
const network = (import.meta.env?.VITE_NETWORK ?? 'testnet') as NetworkName;
const deployment = import.meta.env?.VITE_DEPLOYMENT_JSON
    ? JSON.parse(import.meta.env.VITE_DEPLOYMENT_JSON) as NetworkOptions['deployment'] : undefined;
export const DEPLOYMENT = resolveNetworkConfig({network, deployment, wss: import.meta.env?.VITE_WSS || undefined});
export const CHAIN = XAHAU_NETWORKS[network];
export const HOOK_EXPLORER_URL = `https://${network === 'testnet' ? 'testnet.' : ''}xahauwin.com/account/${DEPLOYMENT.treasury}`;
// Public OAuth client identifier, not a wallet seed or signing secret.
export const XAMAN_CLIENT_ID = import.meta.env?.VITE_XAMAN_CLIENT_ID?.trim()
    || '1c7dfba7-aadd-4b03-bafb-ca5c8f84bb4f';
